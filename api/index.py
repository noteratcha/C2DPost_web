import os
import sys
import io
import json
import tempfile
import zipfile
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
from pydantic import BaseModel

# Ensure api directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.convert_dpost import (
    process_pdf,
    records_to_dataframe,
    generate_combined_pdf,
    generate_delivery_note_pdf,
    generate_custom_envelopes_pdf,
    generate_deposit_report_excel,
    generate_deposit_report_pdf,
    __version__
)

app = FastAPI(title="C2DPost Web API", version=__version__)

# Enable CORS for local dev and Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExportRequest(BaseModel):
    records: List[dict]
    pdf_type: Optional[str] = "combined" # "combined", "delivery_note", "envelopes"

class VerifyUserRequest(BaseModel):
    username: str
    password: str

class RegisterUserRequest(BaseModel):
    username: str
    password: str
    email: str
    organization: str
    zipcode: str
    postoffice: str
    contact1: str
    tel1: str
    contact2: Optional[str] = ""
    tel2: Optional[str] = ""
    contact3: Optional[str] = ""
    tel3: Optional[str] = ""
    pdpa: Optional[str] = "Yes"

class SendEparcelRequest(BaseModel):
    username: str
    password: str
    items: List[dict]

class ReceivedReportRequest(BaseModel):
    date: str  # Format: "DD/MM/YYYY" (Start date)
    end_date: Optional[str] = None  # Format: "DD/MM/YYYY" (End date, optional)
    username: Optional[str] = ""
    password: Optional[str] = ""

class DepositExportRequest(BaseModel):
    records: List[dict]
    summary: Optional[dict] = {}
    date: Optional[str] = ""
    organization: Optional[str] = "สำนักงานที่ดิน"

class TrackingRequest(BaseModel):
    barcode: str
    username: Optional[str] = ""
    password: Optional[str] = ""

class ReconcileRequest(BaseModel):
    barcodes: List[str]
    username: Optional[str] = ""
    password: Optional[str] = ""

class BatchTrackingRequest(BaseModel):
    barcodes: List[str]
    username: Optional[str] = ""
    password: Optional[str] = ""

class LogBarcodesRequest(BaseModel):
    username: Optional[str] = "Unknown"
    items: List[dict]

class UpdateEparcelStatusRequest(BaseModel):
    barcodes: List[str]
    status: Optional[str] = "yes"

def _normalize_payload_list(raw):
    """Defensively extract a list from various e-Parcel API response shapes."""
    if isinstance(raw, dict):
        for key in ("data", "items", "result", "orders", "Response", "response"):
            if isinstance(raw.get(key), list):
                return raw[key]
        return []
    if isinstance(raw, list):
        return raw
    return []

def _parse_tracking_events(raw, barcode):
    """Normalize getHistoryStatus response into a chronological timeline of events."""
    items = _normalize_payload_list(raw)
    events = []
    for i, ev in enumerate(items):
        ev_dict = {}
        if isinstance(ev, dict):
            ev_dict = ev
        elif isinstance(ev, str):
            ev_dict = {"status_description": ev.strip()}
        else:
            continue

        status = str(ev_dict.get("status") or ev_dict.get("statusCode") or ev_dict.get("status_code") or "").strip()
        desc = str(ev_dict.get("statusDescription") or ev_dict.get("status_description")
                   or ev_dict.get("statusName") or ev_dict.get("description") or "").strip()
        
        # Comprehensive date & time extraction across all Thailand Post API variations (statusDate, createdDate, etc.)
        dt = str(
            ev_dict.get("statusDate")
            or ev_dict.get("status_date")
            or ev_dict.get("createdDate")
            or ev_dict.get("created_date")
            or ev_dict.get("receivedDate")
            or ev_dict.get("received_date")
            or ev_dict.get("datetime")
            or ev_dict.get("dateTime")
            or ev_dict.get("eventDate")
            or ev_dict.get("orderDate")
            or ev_dict.get("processDate")
            or ev_dict.get("date")
            or ""
        ).strip()
        t = str(ev_dict.get("statusTime") or ev_dict.get("status_time") or ev_dict.get("time") or "").strip()
        if t and t not in dt:
            dt = f"{dt} {t}".strip() if dt else t

        # Location / Post Office / Station extraction (Thailand Post returns 'station')
        loc = str(
            ev_dict.get("station")
            or ev_dict.get("stationName")
            or ev_dict.get("postcodeName")
            or ev_dict.get("postCodeName")
            or ev_dict.get("location")
            or ev_dict.get("officeName")
            or ev_dict.get("postoffice")
            or ""
        ).strip()
        sig = str(
            ev_dict.get("signature")
            or ev_dict.get("signatureName")
            or ev_dict.get("receiverName")
            or ev_dict.get("customerName")
            or ev_dict.get("employee")
            or ev_dict.get("officer")
            or ""
        ).strip()

        status_key, status_label = classify_delivery_status(status, desc)

        events.append({
            "seq": i + 1,
            "status": status,
            "status_key": status_key,
            "status_label": status_label,
            "status_description": desc or status or "อัปเดตสถานะ",
            "datetime": dt,
            "location": loc,
            "signature": sig
        })
    return events

def _is_received_text(text):
    """Heuristic: does a status string indicate the item was received at the post office?"""
    text = (text or "").lower()
    if "รับฝาก" in text or "รับฝากเข้าระบบ" in text:
        return True
    return False

def _is_received_status_code(code):
    code = str(code or "").strip().lower()
    return code in ("1", "001", "p001", "received", "success")

def _is_received_event(ev):
    if _is_received_text(ev.get("status_description")):
        return True
    if _is_received_status_code(ev.get("status")):
        return True
    return False

def classify_delivery_status(status_code, status_desc):
    """
    Classifies raw status from Thailand Post into one of 4 canonical categories:
    1. 'delivered'  -> 'นำจ่ายสำเร็จ'
    2. 'returned'   -> 'ส่งคืน'
    3. 'received'   -> 'รับฝากแล้ว' (Initial deposit at post office, status 1/001)
    4. 'in_transit' -> 'อยู่ระหว่างการนำจ่าย' (All other intermediate statuses)
    """
    desc = str(status_desc or "").strip()
    code = str(status_code or "").strip()

    # Normalize decomposed Thai vowels (e.g. น + ำ vs อำ)
    desc_norm = desc.replace("\u0e4d\u0e32", "\u0e33")

    # 1. Delivered / นำจ่ายสำเร็จ
    # Official Thailand Post e-Parcel statuses: "นำจ่ายถึงผู้รับแล้ว" (code 4), "นำจ่ายสำเร็จ" (code 501), "ถึงผู้รับแล้ว"
    if (
        any(k in desc_norm for k in [
            "นำจ่ายถึงผู้รับแล้ว", "ถึงผู้รับแล้ว", "นำจ่ายสำเร็จ", "ผู้รับได้รับเรียบร้อย",
            "ผู้รับได้รับ", "จัดส่งสำเร็จ", "ส่งมอบเรียบร้อย", "ส่งถึงผู้รับแล้ว", "นำจ่ายเรียบร้อย"
        ])
        or code in ["4", "501", "delivered"]
    ):
        return "delivered", "นำจ่ายสำเร็จ"

    # 2. Returned / ส่งคืน
    if (
        any(k in desc_norm for k in ["ส่งคืน", "คืนต้นทาง", "ส่งคืนผู้ส่ง", "ตีกลับ", "ไม่สามารถส่งมอบ", "ไม่สามารถนำจ่าย", "คืนสู่ผู้ฝาก"])
        or code in ["502", "503", "401", "402", "returned"]
    ):
        return "returned", "ส่งคืน"

    # 3. Received / รับฝากแล้ว (initial deposit checkpoint - status code 1 or 001)
    if code in ["1", "001", "received"] or any(k in desc_norm for k in ["รับฝากเข้าระบบ", "รับฝากแล้ว", "รับฝาก"]):
        return "received", "รับฝากแล้ว"

    # 4. All other statuses -> อยู่ระหว่างการนำจ่าย
    return "in_transit", "อยู่ระหว่างการนำจ่าย"

def _build_demo_tracking(barcode, clean_date="14/09/2026"):
    b_clean = str(barcode or "").strip()
    last_char = b_clean[-3] if len(b_clean) >= 3 and b_clean[-3].isdigit() else "1"
    digit = int(last_char) if last_char.isdigit() else 1

    ev1 = {
        "seq": 1,
        "status": "1",
        "status_key": "received",
        "status_label": "รับฝากแล้ว",
        "status_description": "รับฝากเข้าระบบแล้ว",
        "datetime": f"{clean_date} 11:24:50",
        "location": "ปณ.เรณูนคร",
        "signature": "เจ้าหน้าที่รับฝาก"
    }

    ev2 = {
        "seq": 2,
        "status": "002",
        "status_key": "in_transit",
        "status_label": "อยู่ระหว่างการนำจ่าย",
        "status_description": "อยู่ระหว่างนำส่งไปยังศูนย์คัดแยก",
        "datetime": f"{clean_date} 14:35:10",
        "location": "ศป.นครพนม",
        "signature": "ระบบคัดแยกอัตโนมัติ"
    }

    ev3 = {
        "seq": 3,
        "status": "003",
        "status_key": "in_transit",
        "status_label": "อยู่ระหว่างการนำจ่าย",
        "status_description": "ถึงที่ทำการไปรษณีย์ปลายทาง (เตรียมการนำจ่าย)",
        "datetime": f"{clean_date} 15:42:18",
        "location": "ปณ.เมืองนครพนม",
        "signature": "เจ้าหน้าที่ส่งต่อ"
    }

    ev_deliv = {
        "seq": 4,
        "status": "501",
        "status_key": "delivered",
        "status_label": "นำจ่ายสำเร็จ",
        "status_description": "นำจ่ายสำเร็จ (ผู้รับได้รับเรียบร้อย)",
        "datetime": f"{clean_date} 16:20:45",
        "location": "ปณ.สุไหงโก-ลก",
        "signature": "สมศรี (ผู้รับ)"
    }

    ev_ret = {
        "seq": 4,
        "status": "502",
        "status_key": "returned",
        "status_label": "ส่งคืน",
        "status_description": "ส่งคืน (ติดต่อผู้รับไม่ได้)",
        "datetime": f"{clean_date} 16:55:00",
        "location": "ศป.นครพนม",
        "signature": "เจ้าหน้าที่ส่งคืน"
    }

    # Customer 0 (ends in 9): Received only
    if "979" in b_clean or digit in (0, 5):
        return [ev1]

    # Customer 1 (ends in 0): In transit
    if "980" in b_clean or digit in (1, 6):
        return [ev1, ev2]

    # Customer 2 (ends in 1): In transit (Arrived at dest)
    if "981" in b_clean or digit in (2, 7):
        return [ev1, ev2, ev3]

    # Customer 3 (ends in 2): Delivered
    if "982" in b_clean or digit in (3, 8):
        return [ev1, ev2, ev3, ev_deliv]

    # Customer 4 (ends in 3): Returned
    return [ev1, ev2, ev_ret]

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "version": __version__,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/check_status")
def check_status():
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    gen_status = False
    try:
        r1 = requests.get("https://postone.thailandpost.com", timeout=5, verify=False)
        gen_status = (r1.status_code < 500)
    except Exception:
        gen_status = False
        
    preload_status = False
    try:
        r2 = requests.get("https://r_dservice.thailandpost.com", timeout=5, verify=False)
        preload_status = (r2.status_code < 500)
    except Exception:
        preload_status = False
        
    return {
        "gen_barcode": gen_status,
        "preload_eparcel": preload_status
    }

@app.post("/api/send_eparcel")
def send_eparcel(req: SendEparcelRequest):
    import requests
    from requests.auth import HTTPBasicAuth
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    url = "https://r_dservice.thailandpost.com/webservice/addItems"
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(
            url,
            json=req.items,
            headers=headers,
            auth=HTTPBasicAuth(req.username.strip(), req.password.strip()),
            timeout=30,
            verify=False
        )
        
        try:
            resp_data = response.json()
        except Exception:
            resp_data = response.text
            
        return {
            "status_code": response.status_code,
            "data": resp_data
        }
    except Exception as e:
        return {
            "status_code": 500,
            "error": str(e)
        }

@app.post("/api/log-barcodes")
def log_barcodes_endpoint(req: LogBarcodesRequest):
    """
    Logs fetched barcodes to Google Sheet (UseBarcode) with identical structure to desktop Python:
    Columns: Timestamp, UserName, Barcode, Details
    Also records summary counts and user action logs in background.
    """
    import threading
    import requests
    import urllib.parse
    
    USE_BARCODE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyyuEJ3pLdXUidsyYoHv84uspMDf8G93U8Mw1ZYCB9ELpFAPjmpwUxsuarxnklnnQ/exec"
    COUNT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyElrFXMUEN4pqhpNWD7lxQ_z1l1pCIOny1Ipk9yOEwuWTnASplduekZxzZWFRGSdHh/exec"
    USER_LOG_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzNEBcaLUc7UWSXtLuf3VnaTR4pP_4Xfxwaq8zKOQHGolyQL9UT2RAGKaT8jtBCzko/exec"

    from datetime import timezone, timedelta
    tz_thai = timezone(timedelta(hours=7))
    now_str = datetime.now(tz_thai).strftime("%Y-%m-%d %H:%M:%S")
    barcode_logs = []
    
    for item in req.items:
        barcode = str(item.get("barcode") or item.get("BARCODE_NO") or "").strip()
        if not barcode:
            continue
            
        details = str(item.get("details") or "").strip()
        if not details:
            receiver = str(item.get("RECEIVER") or item.get("receiver") or "").strip()
            addr = str(item.get("RECEIVER_ADDRESS") or item.get("address") or "").strip()
            amphur = str(item.get("RECEIVER_AMPHUR") or item.get("amphur") or "").strip()
            prov = str(item.get("RECEIVER_PROVINCE") or item.get("province") or "").strip()
            zipcode = str(item.get("RECEIVER_ZIPCODE") or item.get("zipcode") or "").strip()
            details = " ".join([p for p in [receiver, addr, amphur, prov, zipcode] if p])
            
        barcode_logs.append({
            "timestamp": item.get("timestamp") or now_str,
            "username": item.get("username") or req.username or "Unknown",
            "barcode": barcode,
            "details": details
        })

    if not barcode_logs:
        return {"success": True, "logged_count": 0, "message": "No valid barcodes to log"}

    # 1. Main detailed log to UseBarcode sheet
    use_barcode_success = False
    use_barcode_msg = ""
    try:
        r = requests.post(
            USE_BARCODE_SCRIPT_URL,
            json={"action": "log_detailed_barcodes", "data": barcode_logs},
            timeout=10,
            allow_redirects=False
        )
        if r.status_code in (200, 301, 302, 303, 307):
            use_barcode_success = True
            use_barcode_msg = "Success"
        else:
            use_barcode_msg = f"HTTP {r.status_code}"
    except Exception as e:
        use_barcode_success = False
        use_barcode_msg = str(e)
        print(f"Failed to log detailed barcodes to UseBarcode: {e}")

    # 2. Secondary logs (Count & User Action) in background
    def _send_secondary_logs():
        try:
            ems_count = sum(1 for b in barcode_logs if str(b["barcode"]).upper().startswith(('E', 'J')))
            r_count = sum(1 for b in barcode_logs if str(b["barcode"]).upper().startswith(('R', 'B')))
            eco_count = sum(1 for b in barcode_logs if str(b["barcode"]).upper().startswith('O'))
            
            params = urllib.parse.urlencode({'action': 'log_barcode', 'ems': ems_count, 'r': r_count, 'eco': eco_count})
            requests.get(f"{COUNT_SCRIPT_URL}?{params}", timeout=5, allow_redirects=False)
        except Exception as e:
            print(f"Failed to log barcode count: {e}")

        try:
            bcode_sample = ", ".join([b["barcode"] for b in barcode_logs])
            if len(bcode_sample) > 100:
                bcode_sample = bcode_sample[:97] + "..."
            user_data = {
                "timestamp": now_str,
                "username": req.username or "Unknown",
                "status": f"Fetch Barcodes ({len(barcode_logs)} items) - C2DPost Web (เลข: {bcode_sample})"
            }
            requests.post(USER_LOG_SCRIPT_URL, json=user_data, timeout=5, allow_redirects=False)
        except Exception as e:
            print(f"Failed to log user action: {e}")

    threading.Thread(target=_send_secondary_logs, daemon=True).start()

    return {
        "success": use_barcode_success,
        "logged_count": len(barcode_logs),
        "response": use_barcode_msg
    }

@app.post("/api/update-eparcel-status")
def update_eparcel_status_endpoint(req: UpdateEparcelStatusRequest):
    """
    Updates Column E 'ส่งข้อมูล e-Parcel' to 'yes' for matching barcodes in UseBarcode Google Sheet.
    """
    import requests
    USE_BARCODE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyyuEJ3pLdXUidsyYoHv84uspMDf8G93U8Mw1ZYCB9ELpFAPjmpwUxsuarxnklnnQ/exec"
    
    if not req.barcodes:
        return {"success": True, "count": 0}
        
    try:
        r = requests.post(
            USE_BARCODE_SCRIPT_URL,
            json={"action": "update_eparcel_status", "barcodes": req.barcodes, "status": req.status or "yes"},
            timeout=10,
            allow_redirects=False
        )
        return {
            "success": r.status_code in (200, 301, 302, 303, 307),
            "count": len(req.barcodes),
            "status_code": r.status_code
        }
    except Exception as e:
        print(f"Update e-Parcel status failed: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/reports/received")
def get_received_report(req: ReceivedReportRequest):
    """
    Fetches daily or date-range deposit report from Thailand Post e-Parcel API (getAllOrderReceived).
    Accepts start date in 'date' and optional 'end_date' in DD/MM/YYYY format and user credentials.
    """
    import re
    from datetime import datetime, timedelta
    from concurrent.futures import ThreadPoolExecutor
    import requests
    from requests.auth import HTTPBasicAuth
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    clean_date = req.date.strip()
    if not re.match(r'^\d{2}/\d{2}/\d{4}$', clean_date):
        raise HTTPException(
            status_code=400, 
            detail="รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้วันที่ในรูปแบบ DD/MM/YYYY เช่น 14/09/2026"
        )

    clean_end_date = (req.end_date or "").strip()
    if clean_end_date:
        if not re.match(r'^\d{2}/\d{2}/\d{4}$', clean_end_date):
            raise HTTPException(
                status_code=400, 
                detail="รูปแบบวันที่สิ้นสุดไม่ถูกต้อง กรุณาใช้วันที่ในรูปแบบ DD/MM/YYYY เช่น 14/09/2026"
            )
    else:
        clean_end_date = clean_date

    try:
        start_dt = datetime.strptime(clean_date, "%d/%m/%Y")
        end_dt = datetime.strptime(clean_end_date, "%d/%m/%Y")
    except Exception:
        raise HTTPException(status_code=400, detail="วันที่ไม่ถูกต้องตามปฏิทิน")

    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt
        clean_date, clean_end_date = clean_end_date, clean_date

    days_diff = (end_dt - start_dt).days + 1
    if days_diff > 31:
        raise HTTPException(status_code=400, detail="กรุณาเลือกช่วงเวลาไม่เกิน 31 วัน เพื่อป้องกันระบบตอบสนองช้า")

    target_dates = [(start_dt + timedelta(days=i)).strftime("%d/%m/%Y") for i in range(days_diff)]
        
    username = (req.username or "").strip()
    password = (req.password or "").strip()

    # Check for demo mode / mock fallback (only if credentials are missing or explicitly demo)
    is_demo_user = not username or not password or username.lower() == "demo"
    
    raw_data = None
    api_error = None
    
    if username and password and not is_demo_user:
        def fetch_date(d_str):
            try:
                url = f"https://r_dservice.thailandpost.com/webservice/getAllOrderReceived?date={d_str}"
                response = requests.get(
                    url,
                    headers={"Content-Type": "application/json"},
                    auth=HTTPBasicAuth(username, password),
                    timeout=20,
                    verify=False
                )
                if response.status_code == 401:
                    return {"unauthorized": True}
                if response.status_code == 200:
                    try:
                        resp_json = response.json()
                        if isinstance(resp_json, list):
                            if len(resp_json) > 0 and isinstance(resp_json[0], dict) and resp_json[0].get("errorCode"):
                                return {"items": [], "notice": resp_json[0].get("errorDetail")}
                            return {"items": resp_json}
                        elif isinstance(resp_json, dict) and "data" in resp_json and isinstance(resp_json["data"], list):
                            return {"items": resp_json["data"]}
                        elif isinstance(resp_json, dict) and resp_json.get("errorCode"):
                            return {"items": [], "notice": resp_json.get("errorDetail")}
                        return {"items": []}
                    except Exception:
                        return {"items": []}
                return {"items": [], "error": f"API ตอบกลับสถานะ {response.status_code}"}
            except Exception as e:
                return {"items": [], "error": f"การเชื่อมต่อ e-Parcel ล้มเหลว ({d_str}): {str(e)}"}

        workers = min(len(target_dates), 5)
        with ThreadPoolExecutor(max_workers=workers) as executor:
            batch_results = list(executor.map(fetch_date, target_dates))

        aggregated_items = []
        for res in batch_results:
            if res.get("unauthorized"):
                return JSONResponse(
                    status_code=401,
                    content={
                        "success": False,
                        "error": "unauthorized",
                        "message": "ชื่อผู้ใช้หรือรหัสผ่านสำหรับระบบไปรษณีย์ e-Parcel ไม่ถูกต้อง"
                    }
                )
            if res.get("items"):
                aggregated_items.extend(res["items"])
            elif res.get("notice") and not api_error:
                api_error = res["notice"]
            elif res.get("error") and not api_error:
                api_error = res["error"]

        raw_data = aggregated_items

    # If live API wasn't called or failed, only use demo data for explicit demo user
    if raw_data is None:
        if is_demo_user:
            demo_items = []
            base_customers = [
                {
                    "name": "นางชัญญา ศรีสงคราม", "addr": "28 หมู่ที่ 7 ต.ท่าลาด", "amphur": "เรณูนคร", "prov": "นครพนม", "zip": "48170", "wt": 10.0, "price": 21.0,
                    "status": "1", "status_desc": "รับฝากเข้าระบบแล้ว", "time_offset": "11:24:50", "station": "ปณ.เรณูนคร", "sig": "เจ้าหน้าที่รับฝาก"
                },
                {
                    "name": "น.ส.ละอองทอง ศรีชะวงษ์", "addr": "4 หมู่ที่ 1 ต.พระซอง", "amphur": "นาแก", "prov": "นครพนม", "zip": "48130", "wt": 10.0, "price": 21.0,
                    "status": "002", "status_desc": "อยู่ระหว่างการนำจ่าย", "time_offset": "14:35:10", "station": "ศป.นครพนม", "sig": "ระบบคัดแยกอัตโนมัติ"
                },
                {
                    "name": "นายขรรถสิทธิ์ นาสงคา", "addr": "108 หมู่ที่ 7 ต.ท่าลาด", "amphur": "เรณูนคร", "prov": "นครพนม", "zip": "48170", "wt": 10.0, "price": 21.0,
                    "status": "003", "status_desc": "อยู่ระหว่างการนำจ่าย", "time_offset": "15:42:18", "station": "ปณ.เมืองนครพนม", "sig": "เจ้าหน้าที่ส่งต่อ"
                },
                {
                    "name": "นางสำราญ การปลูก", "addr": "147/52 หมู่ที่ 5 ต.ปาเสมัส", "amphur": "สุไหงโก-ลก", "prov": "นราธิวาส", "zip": "96120", "wt": 10.0, "price": 21.0,
                    "status": "501", "status_desc": "นำจ่ายสำเร็จ (ผู้รับได้รับเรียบร้อย)", "time_offset": "16:20:45", "station": "ปณ.สุไหงโก-ลก", "sig": "สมศรี (ผู้รับ)"
                },
                {
                    "name": "นายไชยญา พ่อป้องขวา", "addr": "47 หมู่ที่ 6 ต.ท่าลาด", "amphur": "เรณูนคร", "prov": "นครพนม", "zip": "48170", "wt": 10.0, "price": 21.0,
                    "status": "502", "status_desc": "ส่งคืน (ติดต่อผู้รับไม่ได้)", "time_offset": "16:55:00", "station": "ศป.นครพนม", "sig": "เจ้าหน้าที่ส่งคืน"
                }
            ]
            for day_idx, d_str in enumerate(target_dates):
                for c_idx, cust in enumerate(base_customers):
                    b_num = 414110979 + (day_idx * 10) + c_idx
                    inv_num = 6109 + (day_idx * 5) + c_idx
                    demo_items.append({
                        "barcode": f"BC{b_num}TH",
                        "invNo": f"นพ0020.05/{inv_num}",
                        "customerName": cust["name"],
                        "customerAddress": cust["addr"],
                        "customerAmphur": cust["amphur"],
                        "customerProvince": cust["prov"],
                        "customerZipcode": cust["zip"],
                        "productWeight": cust["wt"],
                        "emsPrice": cust["price"],
                        "servicePrice": 0.0,
                        "insurancePrice": 0.0,
                        "status": cust["status"],
                        "statusDescription": cust["status_desc"],
                        "createdDate": f"{d_str} 11:24:50",
                        "receivedDate": f"{d_str} 11:24:50",
                        "statusDate": f"{d_str} {cust['time_offset']}",
                        "postcodeName": "เรณูนคร",
                        "station": cust["station"],
                        "signature": cust["sig"]
                    })
            raw_data = demo_items
        else:
            raw_data = []

    # Deduplicate by barcode if present
    seen_barcodes = set()
    deduped_raw = []
    for item in raw_data:
        b = (item.get("barcode") or "").strip()
        if b:
            if b in seen_barcodes:
                continue
            seen_barcodes.add(b)
        deduped_raw.append(item)

    # Data Normalization
    normalized_records = []
    total_weight = 0.0
    total_fee = 0.0

    def _to_float(val):
        if val is None:
            return 0.0
        s = str(val).replace("฿", "").replace("g", "").replace("กก.", "").replace(",", "").strip()
        try:
            return float(s)
        except Exception:
            return 0.0

    for i, item in enumerate(deduped_raw):
        weight = _to_float(item.get("productWeight") or item.get("weight"))
        ems_price = _to_float(item.get("emsPrice") or item.get("ems_price"))
        svc_price = _to_float(item.get("servicePrice") or item.get("service_price"))
        ins_price = _to_float(item.get("insurancePrice") or item.get("insurance_price"))
        fee = ems_price + svc_price + ins_price
        
        total_weight += weight
        total_fee += fee

        raw_desc = (item.get("statusDescription") or item.get("status_description") or "รับฝากเข้าระบบแล้ว").strip()
        raw_code = str(item.get("status") or item.get("statusCode") or "1").strip()
        status_key, status_label = classify_delivery_status(raw_code, raw_desc)

        # Extract latest checkpoint timestamp and location
        latest_date = str(
            item.get("statusDate")
            or item.get("status_date")
            or item.get("dateTime")
            or item.get("datetime")
            or item.get("eventDate")
            or item.get("receivedDate")
            or item.get("received_date")
            or item.get("createdDate")
            or item.get("created_date")
            or ""
        ).strip()
        status_time = str(item.get("statusTime") or item.get("status_time") or item.get("time") or "").strip()
        if status_time and status_time not in latest_date:
            latest_date = f"{latest_date} {status_time}".strip()

        latest_station = str(
            item.get("station")
            or item.get("stationName")
            or item.get("location")
            or item.get("officeName")
            or item.get("postcodeName")
            or item.get("postCodeName")
            or item.get("received_postoffice")
            or "ที่ทำการไปรษณีย์"
        ).strip()

        norm_item = {
            "seq": i + 1,
            "barcode": (item.get("barcode") or "").strip(),
            "inv_no": (item.get("invNo") or item.get("inv_no") or "").strip(),
            "receiver_name": (item.get("customerName") or item.get("receiver_name") or "").strip(),
            "receiver_address": (item.get("customerAddress") or item.get("receiver_address") or "").strip(),
            "receiver_amphur": (item.get("customerAmphur") or item.get("receiver_amphur") or "").strip(),
            "receiver_province": (item.get("customerProvince") or item.get("receiver_province") or "").strip(),
            "receiver_zipcode": (item.get("customerZipcode") or item.get("receiver_zipcode") or "").strip(),
            "status": raw_code,
            "status_key": status_key,
            "status_label": status_label,
            "status_description": status_label,
            "status_description_raw": raw_desc,
            "created_date": (item.get("createdDate") or item.get("created_date") or "").strip(),
            "received_date": (item.get("receivedDate") or item.get("received_date") or "").strip(),
            "received_postoffice": (item.get("postcodeName") or item.get("received_postoffice") or "ที่ทำการไปรษณีย์").strip(),
            "latest_date": latest_date or (item.get("receivedDate") or item.get("received_date") or "").strip(),
            "latest_station": latest_station,
            "weight": round(weight, 2),
            "fee": round(fee, 2),
            "signature": (item.get("signature") or "").strip()
        }
        normalized_records.append(norm_item)

    # Auto-enrich with real-time checkpoints from getHistoryStatus
    # when live credentials exist and count is between 1 and 35
    if not is_demo_user and username and password and 0 < len(normalized_records) <= 35:
        def _fetch_realtime_tracking(rec):
            bcode = rec.get("barcode", "").strip()
            if not bcode:
                return rec
            try:
                hurl = f"https://r_dservice.thailandpost.com/webservice/getHistoryStatus?barcode={bcode}"
                hresp = requests.get(
                    hurl,
                    headers={"Content-Type": "application/json"},
                    auth=HTTPBasicAuth(username, password),
                    timeout=5,
                    verify=False
                )
                if hresp.status_code == 200:
                    try:
                        hraw = hresp.json()
                    except Exception:
                        hraw = hresp.text
                    events = _parse_tracking_events(hraw, bcode)
                    if events:
                        latest = events[-1]
                        if latest.get("datetime"):
                            rec["latest_date"] = latest["datetime"]
                        if latest.get("location"):
                            rec["latest_station"] = latest["location"]
                        if latest.get("status_key"):
                            rec["status_key"] = latest["status_key"]
                        if latest.get("status_label"):
                            rec["status_label"] = latest["status_label"]
                            rec["status_description"] = latest["status_label"]
                        if latest.get("status_description"):
                            rec["status_description_raw"] = latest["status_description"]
            except Exception:
                pass
            return rec

        max_w = max(1, min(len(normalized_records), 10))
        with ThreadPoolExecutor(max_workers=max_w) as executor:
            normalized_records = list(executor.map(_fetch_realtime_tracking, normalized_records))

    date_display = clean_date if clean_date == clean_end_date else f"{clean_date} - {clean_end_date}"

    delivered_count = sum(1 for r in normalized_records if r["status_key"] == "delivered")
    in_transit_count = sum(1 for r in normalized_records if r["status_key"] == "in_transit")
    returned_count = sum(1 for r in normalized_records if r["status_key"] == "returned")
    received_count = sum(1 for r in normalized_records if r["status_key"] == "received")

    return {
        "success": True,
        "date": clean_date,
        "end_date": clean_end_date,
        "date_display": date_display,
        "is_mock": bool(is_demo_user),
        "api_notice": api_error if not is_demo_user else None,
        "summary": {
            "total_items": len(normalized_records),
            "total_weight": round(total_weight, 2),
            "total_fee": round(total_fee, 2),
            "received_count": received_count,
            "delivered_count": delivered_count,
            "in_transit_count": in_transit_count,
            "returned_count": returned_count,
            "pending_count": 0
        },
        "records": normalized_records
    }


def _fetch_ear_details(barcode: str) -> dict:
    """
    Fetches the official e-AR (Electronic Acknowledgement Receipt) PDF from Thailand Post e-AR API:
    POST https://e-ar.thailandpost.com/ear-api/print/e-ar with body [barcode].
    Extracts:
    - has_ear: bool
    - relationship: string (e.g. เจ้าหน้าที่เวรรับส่ง, ผู้รับรับเอง, คนในบ้าน)
    - delivery_officer: string (e.g. นายธนพนธ์ พรมพันธ์)
    - status: string (e.g. นำจ่ายถึงผู้รับแล้ว)
    - signature_image: base64 Data URL (upright PNG)
    - pdf_url: relative URL for client PDF viewing
    """
    result = {
        "has_ear": False,
        "relationship": "",
        "delivery_officer": "",
        "status": "",
        "signature_image": "",
        "pdf_url": f"/api/reports/ear-pdf?barcode={barcode}" if barcode else ""
    }
    if not barcode:
        return result

    try:
        import requests
        import io
        import base64
        from PIL import Image

        url = "https://e-ar.thailandpost.com/ear-api/print/e-ar"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }
        r = requests.post(url, json=[barcode], headers=headers, timeout=8, verify=False)
        if r.status_code != 200 or "application/pdf" not in r.headers.get("Content-Type", ""):
            return result

        pdf_bytes = r.content
        result["has_ear"] = True

        # Try PyMuPDF (fitz) first
        try:
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page = doc[0]
            rawdict = page.get_text("rawdict")
            for block in rawdict.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        chars = span.get("chars", [])
                        text = "".join(c.get("c", "") for c in chars).strip()
                        origin = span.get("origin", (0, 0))
                        if 140 <= origin[1] <= 147 and origin[0] > 470 and not text.startswith(".."):
                            result["status"] = text
                        elif 155 <= origin[1] <= 162 and origin[0] > 470 and not text.startswith(".."):
                            result["relationship"] = text
                        elif 170 <= origin[1] <= 177 and origin[0] > 470 and not text.startswith(".."):
                            if not result["delivery_officer"]:
                                result["delivery_officer"] = text
                            else:
                                result["delivery_officer"] += f" {text}"

            for img_info in page.get_images():
                xref = img_info[0]
                rects = page.get_image_rects(xref)
                w, h = img_info[2], img_info[3]
                if any(rect.y0 < 150 and rect.x0 > 400 for rect in rects) or (w < 400 and h > 400):
                    base_img = doc.extract_image(xref)
                    im = Image.open(io.BytesIO(base_img["image"]))
                    if im.height > im.width:
                        im = im.rotate(90, expand=True)
                    buf = io.BytesIO()
                    im.save(buf, format="PNG")
                    result["signature_image"] = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                    break
        except Exception:
            pass

        # Fallback to pypdf + Pillow if signature_image still missing
        if not result["signature_image"]:
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
                page = reader.pages[0]
                for name, img_file in page.images.items():
                    im = Image.open(io.BytesIO(img_file.data))
                    if (im.width < 600 and im.height > 250) or (im.width > 250 and im.height < 600 and len(img_file.data) < 30000):
                        if im.height > im.width:
                            im = im.rotate(90, expand=True)
                        buf = io.BytesIO()
                        im.save(buf, format="PNG")
                        result["signature_image"] = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                        break
            except Exception:
                pass
    except Exception:
        pass

    return result


@app.get("/api/reports/ear-pdf")
def get_ear_pdf(barcode: str):
    """
    Proxies and serves the official e-AR PDF for a given barcode from Thailand Post.
    Allows users to view or print the original PDF in browser without CORS/POST restrictions.
    """
    barcode = (barcode or "").strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="กรุณาระบุหมายเลขบาร์โค้ด")
    try:
        import requests
        url = "https://e-ar.thailandpost.com/ear-api/print/e-ar"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }
        r = requests.post(url, json=[barcode], headers=headers, timeout=12, verify=False)
        if r.status_code == 200 and "application/pdf" in r.headers.get("Content-Type", ""):
            return Response(
                content=r.content,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"inline; filename=e-AR-{barcode}.pdf",
                    "Cache-Control": "public, max-age=3600"
                }
            )
        return JSONResponse(
            status_code=404, 
            content={
                "error": "ไม่พบข้อมูลใบตอบรับ e-AR สำหรับพัสดุนี้",
                "upstream_status": r.status_code,
                "upstream_content_type": r.headers.get("Content-Type", ""),
                "upstream_text": r.text[:300]
            }
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"เกิดข้อผิดพลาดในการเชื่อมต่อ e-AR: {str(e)}"})


@app.post("/api/reports/parse-ear-pdf")
async def parse_ear_pdf(request: Request):
    """
    Parses e-AR PDF bytes provided by the client (bypassing foreign edge geoblocking).
    Extracts signature image, relationship, delivery officer, and delivery status.
    """
    try:
        import io
        import base64
        from PIL import Image

        pdf_bytes = await request.body()
        if not pdf_bytes or len(pdf_bytes) < 300:
            return JSONResponse(status_code=400, content={"success": False, "error": "Invalid PDF data"})

        data = {
            "relationship": "",
            "delivery_officer": "",
            "status": "",
            "signature_image": ""
        }

        # 1. Try PyMuPDF (fitz)
        try:
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page = doc[0]
            rawdict = page.get_text("rawdict")
            for block in rawdict.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        chars = span.get("chars", [])
                        text = "".join(c.get("c", "") for c in chars).strip()
                        origin = span.get("origin", (0, 0))
                        if 140 <= origin[1] <= 147 and origin[0] > 470 and not text.startswith(".."):
                            data["status"] = text
                        elif 155 <= origin[1] <= 162 and origin[0] > 470 and not text.startswith(".."):
                            data["relationship"] = text
                        elif 170 <= origin[1] <= 177 and origin[0] > 470 and not text.startswith(".."):
                            if not data["delivery_officer"]:
                                data["delivery_officer"] = text
                            else:
                                data["delivery_officer"] += f" {text}"

            for img_info in page.get_images():
                xref = img_info[0]
                rects = page.get_image_rects(xref)
                w, h = img_info[2], img_info[3]
                if any(rect.y0 < 150 and rect.x0 > 400 for rect in rects) or (w < 400 and h > 400):
                    base_img = doc.extract_image(xref)
                    im = Image.open(io.BytesIO(base_img["image"]))
                    if im.height > im.width:
                        im = im.rotate(90, expand=True)
                    buf = io.BytesIO()
                    im.save(buf, format="PNG")
                    data["signature_image"] = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                    break
        except Exception:
            pass

        # 2. Fallback to pypdf + Pillow if signature_image missing
        if not data["signature_image"]:
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
                page = reader.pages[0]
                for name, img_file in page.images.items():
                    im = Image.open(io.BytesIO(img_file.data))
                    if (im.width < 600 and im.height > 250) or (im.width > 250 and im.height < 600 and len(img_file.data) < 30000):
                        if im.height > im.width:
                            im = im.rotate(90, expand=True)
                        buf = io.BytesIO()
                        im.save(buf, format="PNG")
                        data["signature_image"] = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                        break
            except Exception:
                pass

        return {"success": True, "data": data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/reports/tracking")
def get_tracking(req: TrackingRequest):
    """
    Fetches the delivery timeline for a single barcode via getHistoryStatus.
    Normalizes into a chronological stepper-friendly list of events.
    """
    import requests
    from requests.auth import HTTPBasicAuth
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    barcode = (req.barcode or "").strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="กรุณาระบุหมายเลขบาร์โค้ด")

    username = (req.username or "").strip()
    password = (req.password or "").strip()
    is_demo_user = not username or not password or username.lower() == "demo"

    events = None
    api_error = None

    if username and password and not is_demo_user:
        try:
            url = f"https://r_dservice.thailandpost.com/webservice/getHistoryStatus?barcode={barcode}"
            headers = {"Content-Type": "application/json"}
            response = requests.get(url, headers=headers, auth=HTTPBasicAuth(username, password), timeout=25, verify=False)

            if response.status_code == 401:
                return JSONResponse(
                    status_code=401,
                    content={
                        "success": False,
                        "error": "unauthorized",
                        "message": "ชื่อผู้ใช้หรือรหัสผ่านสำหรับระบบไปรษณีย์ e-Parcel ไม่ถูกต้อง"
                    }
                )

            if response.status_code == 200:
                try:
                    raw = response.json()
                except Exception:
                    raw = response.text
                events = _parse_tracking_events(raw, barcode) or []

                # Also query getOrderByBarcode to retrieve official metadata including 'signature' and 'customerName'
                order_signature = ""
                order_customer = ""
                try:
                    order_url = f"https://r_dservice.thailandpost.com/webservice/getOrderByBarcode?barcode={barcode}"
                    order_resp = requests.get(order_url, headers=headers, auth=HTTPBasicAuth(username, password), timeout=8, verify=False)
                    if order_resp.status_code == 200:
                        try:
                            odata = order_resp.json()
                            if isinstance(odata, dict):
                                order_signature = str(odata.get("signature") or "").strip()
                                order_customer = str(odata.get("customerName") or "").strip()
                                for ev in events:
                                    if ev.get("status_key") == "delivered":
                                        if order_signature:
                                            ev["signature"] = order_signature
                                        if order_customer and not ev.get("receiver_name"):
                                            ev["receiver_name"] = order_customer
                        except Exception:
                            pass
                except Exception:
                    pass
                # Query e-AR details if parcel is delivered
                has_delivered = any(ev.get("status_key") == "delivered" for ev in events)
                if has_delivered:
                    try:
                        ear_data = _fetch_ear_details(barcode)
                        if ear_data.get("has_ear"):
                            for ev in events:
                                if ev.get("status_key") == "delivered":
                                    ev["ear_info"] = ear_data
                                    if ear_data.get("signature_image"):
                                        ev["signature_image"] = ear_data["signature_image"]
                                    if ear_data.get("relationship"):
                                        ev["relationship"] = ear_data["relationship"]
                                    if ear_data.get("delivery_officer"):
                                        ev["delivery_officer"] = ear_data["delivery_officer"]
                    except Exception:
                        pass
            else:
                api_error = f"API ตอบกลับสถานะ {response.status_code}: {response.text[:200]}"
        except Exception as e:
            api_error = f"การเชื่อมต่อไปยังระบบ e-Parcel ล้มเหลว: {str(e)}"

    if events is None:
        if is_demo_user and not api_error:
            events = _build_demo_tracking(barcode)
        else:
            events = []

    latest_event = events[-1] if events else None
    latest_status_key = latest_event.get("status_key", "in_transit") if latest_event else "in_transit"
    latest_status_label = latest_event.get("status_label", "อยู่ระหว่างการนำจ่าย") if latest_event else "อยู่ระหว่างการนำจ่าย"
    latest_datetime = latest_event.get("datetime", "") if latest_event else ""
    latest_location = latest_event.get("location", "") if latest_event else ""
    final_signature = ""
    ear_info_res = None
    for ev in events:
        if ev.get("signature"):
            final_signature = ev["signature"]
        if ev.get("ear_info") and not ear_info_res:
            ear_info_res = ev["ear_info"]

    return {
        "success": True,
        "barcode": barcode,
        "is_mock": bool(is_demo_user),
        "api_notice": api_error if not is_demo_user else None,
        "events": events,
        "signature": final_signature,
        "ear_info": ear_info_res,
        "latest_status_key": latest_status_key,
        "latest_status_label": latest_status_label,
        "latest_datetime": latest_datetime,
        "latest_location": latest_location
    }

@app.post("/api/reports/batch-tracking")
def batch_tracking(req: BatchTrackingRequest):
    """
    Fetches real-time latest tracking status in parallel for a list of barcodes via getHistoryStatus.
    """
    import requests
    from requests.auth import HTTPBasicAuth
    from concurrent.futures import ThreadPoolExecutor
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    barcodes = [str(b).strip() for b in (req.barcodes or []) if str(b).strip()]
    if not barcodes:
        return {"success": True, "results": {}}

    username = (req.username or "").strip()
    password = (req.password or "").strip()
    is_demo_user = not username or not password or username.lower() == "demo"

    results = {}

    if not is_demo_user and username and password:
        def _fetch_single(bcode):
            try:
                hurl = f"https://r_dservice.thailandpost.com/webservice/getHistoryStatus?barcode={bcode}"
                hresp = requests.get(
                    hurl,
                    headers={"Content-Type": "application/json"},
                    auth=HTTPBasicAuth(username, password),
                    timeout=5,
                    verify=False
                )
                if hresp.status_code == 200:
                    try:
                        hraw = hresp.json()
                    except Exception:
                        hraw = hresp.text
                    events = _parse_tracking_events(hraw, bcode)
                    if events:
                        latest = events[-1]
                        return bcode, {
                            "latest_date": latest.get("datetime", ""),
                            "latest_station": latest.get("location", ""),
                            "status_key": latest.get("status_key", "in_transit"),
                            "status_label": latest.get("status_label", "อยู่ระหว่างการนำจ่าย"),
                            "status_description_raw": latest.get("status_description", "")
                        }
            except Exception:
                pass
            return bcode, None

        max_w = min(len(barcodes), 10)
        with ThreadPoolExecutor(max_workers=max_w) as executor:
            for bcode, data in executor.map(_fetch_single, barcodes):
                if data:
                    results[bcode] = data
    else:
        # Demo mode simulation
        for bcode in barcodes:
            evs = _build_demo_tracking(bcode)
            latest = evs[-1] if evs else {}
            results[bcode] = {
                "latest_date": latest.get("datetime", ""),
                "latest_station": latest.get("location", ""),
                "status_key": latest.get("status_key", "in_transit"),
                "status_label": latest.get("status_label", "อยู่ระหว่างการนำจ่าย"),
                "status_description_raw": latest.get("status_description", "")
            }

    return {
        "success": True,
        "is_mock": bool(is_demo_user),
        "results": results
    }

@app.post("/api/reports/reconcile")
def reconcile_received(req: ReconcileRequest):
    """
    Auto-reconcile: checks a batch of barcodes against Thailand Post e-Parcel
    to determine which items have already been received at the post office.
    """
    import requests
    from requests.auth import HTTPBasicAuth
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    barcodes = []
    seen = set()
    for b in (req.barcodes or []):
        clean = str(b or "").strip()
        if clean and clean not in seen:
            seen.add(clean)
            barcodes.append(clean)

    if not barcodes:
        raise HTTPException(status_code=400, detail="ไม่มีหมายเลขบาร์โค้ดให้ตรวจสอบ")

    username = (req.username or "").strip()
    password = (req.password or "").strip()
    is_demo_user = not username or not password or username.lower() == "demo"

    order_map = {}
    api_error = None

    if username and password and not is_demo_user:
        try:
            url = "https://r_dservice.thailandpost.com/webservice/getOrderByBarcodes"
            headers = {"Content-Type": "application/json"}
            payload = {"barcodes": barcodes}
            response = requests.post(url, json=payload, headers=headers,
                                     auth=HTTPBasicAuth(username, password), timeout=30, verify=False)

            if response.status_code == 401:
                return JSONResponse(
                    status_code=401,
                    content={
                        "success": False,
                        "error": "unauthorized",
                        "message": "ชื่อผู้ใช้หรือรหัสผ่านสำหรับระบบไปรษณีย์ e-Parcel ไม่ถูกต้อง"
                    }
                )

            if response.status_code == 200:
                try:
                    raw = response.json()
                except Exception:
                    raw = response.text

                items = _normalize_payload_list(raw)
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    bcode = str(item.get("barcode") or "").strip()
                    if not bcode:
                        continue
                    status = str(item.get("status") or item.get("statusCode") or item.get("status_code") or "").strip()
                    desc = str(item.get("statusDescription") or item.get("status_description")
                               or item.get("statusName") or "").strip()
                    received_date = str(item.get("receivedDate") or item.get("received_date")
                                        or item.get("createdDate") or item.get("created_date") or "").strip()
                    po = str(item.get("postcodeName") or item.get("received_postoffice") or "").strip()
                    received = _is_received_text(desc) or _is_received_status_code(status)
                    order_map[bcode] = {
                        "barcode": bcode,
                        "received": received,
                        "status": status,
                        "status_description": desc,
                        "received_date": received_date,
                        "received_postoffice": po
                    }
            else:
                api_error = f"API ตอบกลับสถานะ {response.status_code}: {response.text[:200]}"
        except Exception as e:
            api_error = f"การเชื่อมต่อไปยังระบบ e-Parcel ล้มเหลว: {str(e)}"

        # Fallback: per-barcode getHistoryStatus when the batch endpoint returned nothing usable
        if not order_map and not api_error:
            for barcode in barcodes:
                try:
                    hurl = f"https://r_dservice.thailandpost.com/webservice/getHistoryStatus?barcode={barcode}"
                    hresp = requests.get(hurl, headers={"Content-Type": "application/json"},
                                         auth=HTTPBasicAuth(username, password), timeout=25, verify=False)
                    if hresp.status_code == 200:
                        try:
                            hraw = hresp.json()
                        except Exception:
                            hraw = hresp.text
                        events = _parse_tracking_events(hraw, barcode)
                        received_events = [ev for ev in events if _is_received_event(ev)]
                        latest = events[0] if events else {}
                        received = len(received_events) > 0
                        order_map[barcode] = {
                            "barcode": barcode,
                            "received": received,
                            "status": latest.get("status", ""),
                            "status_description": latest.get("status_description", ""),
                            "received_date": received_events[0].get("datetime", "") if received_events else latest.get("datetime", ""),
                            "received_postoffice": latest.get("location", "")
                        }
                except Exception:
                    order_map[barcode] = {
                        "barcode": barcode,
                        "received": False,
                        "status": "",
                        "status_description": "",
                        "received_date": "",
                        "received_postoffice": ""
                    }

    # Demo mode: simulate realistic receiving pattern per barcode
    if is_demo_user and not order_map:
        for i, barcode in enumerate(barcodes):
            received = (sum(ord(c) for c in barcode) % 3) != 0
            order_map[barcode] = {
                "barcode": barcode,
                "received": received,
                "status": "1" if received else "",
                "status_description": "รับฝากเข้าระบบแล้ว" if received else "ยังไม่มีการรับฝากเข้าระบบ",
                "received_date": "14/09/2026 11:24:50" if received else "",
                "received_postoffice": "ปณ.เรณูนคร" if received else ""
            }

    # Fill any barcodes still missing (live API returned nothing at all)
    for barcode in barcodes:
        if barcode not in order_map:
            order_map[barcode] = {
                "barcode": barcode,
                "received": False,
                "status": "",
                "status_description": "ไม่พบข้อมูล / ยังไม่ตรวจสอบ",
                "received_date": "",
                "received_postoffice": ""
            }

    results = [order_map[b] for b in barcodes]

    return {
        "success": True,
        "is_mock": bool(is_demo_user),
        "api_notice": api_error if not is_demo_user else None,
        "total_checked": len(results),
        "received_count": sum(1 for r in results if r["received"]),
        "results": results
    }

@app.post("/api/reports/export-excel")
async def export_deposit_report_excel_endpoint(req: DepositExportRequest):
    """
    Exports deposit report items as a beautifully styled Excel (.xlsx) file.
    """
    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided for deposit report")
        
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            tmp_excel_path = os.path.join(temp_dir, f"Deposit_Report_{timestamp}.xlsx")
            
            meta = {
                "organization": req.organization or "สำนักงานที่ดิน",
                "date": req.date or datetime.now().strftime("%d/%m/%Y")
            }
            
            generate_deposit_report_excel(req.records, req.summary or {}, meta, tmp_excel_path)
            
            with open(tmp_excel_path, "rb") as f:
                excel_bytes = io.BytesIO(f.read())
                
            clean_date_file = (req.date or timestamp).replace("/", "-").replace(" - ", "_to_").replace(" ", "_")
            filename = f"Deposit_Report_{clean_date_file}.xlsx"
            
            return StreamingResponse(
                excel_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Deposit Report Excel: {str(e)}")

@app.post("/api/reports/export-pdf")
async def export_deposit_report_pdf_endpoint(req: DepositExportRequest):
    """
    Exports deposit report items as an official government-style Landscape A4 PDF.
    """
    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided for deposit report")
        
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            tmp_pdf_path = os.path.join(temp_dir, f"Deposit_Report_{timestamp}.pdf")
            
            meta = {
                "organization": req.organization or "สำนักงานที่ดิน",
                "date": req.date or datetime.now().strftime("%d/%m/%Y")
            }
            
            generate_deposit_report_pdf(req.records, req.summary or {}, meta, tmp_pdf_path)
            
            with open(tmp_pdf_path, "rb") as f:
                pdf_bytes = io.BytesIO(f.read())
                
            clean_date_file = (req.date or timestamp).replace("/", "-").replace(" - ", "_to_").replace(" ", "_")
            filename = f"Deposit_Report_{clean_date_file}.pdf"
            
            return StreamingResponse(
                pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Deposit Report PDF: {str(e)}")

@app.post("/api/verify_user")
def verify_user(req: VerifyUserRequest):
    import requests
    from requests.auth import HTTPBasicAuth
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    url = "https://r_dservice.thailandpost.com/webservice/addItems"
    headers = {"Content-Type": "application/json"}
    try:
        r = requests.post(
            url, 
            json=[], 
            headers=headers, 
            auth=HTTPBasicAuth(req.username.strip(), req.password.strip()), 
            timeout=15, 
            verify=False
        )
        if r.status_code != 401:
            return {"success": True, "valid": True, "message": "ตรวจสอบ Username และ Password ถูกต้อง"}
        else:
            return {"success": True, "valid": False, "message": "Username หรือ Password ไม่ถูกต้อง"}
    except Exception as e:
        return {"success": False, "valid": False, "message": f"เชื่อมต่อ API ล้มเหลว: {str(e)}"}

@app.post("/api/register_user")
def register_user(req: RegisterUserRequest):
    import requests
    url = "https://script.google.com/macros/s/AKfycbwulS3437Gqf8tM_5pjYQhPfcSqcUNwM-PoKxjzw4cWL5FRCszE7VFDUKFuHEGYQg/exec"
    form_data = {
        "username": req.username.strip(),
        "password": req.password.strip(),
        "email": req.email.strip(),
        "organization": req.organization.strip(),
        "zipcode": req.zipcode.strip(),
        "postoffice": req.postoffice.strip(),
        "contact1": req.contact1.strip(),
        "tel1": req.tel1.strip(),
        "contact2": (req.contact2 or "").strip(),
        "tel2": (req.tel2 or "").strip(),
        "contact3": (req.contact3 or "").strip(),
        "tel3": (req.tel3 or "").strip(),
        "pdpa": req.pdpa or "Yes"
    }
    try:
        r = requests.post(url, data=form_data, timeout=15, allow_redirects=False)
        if r.status_code in (301, 302, 303, 307):
            redirect_url = r.headers.get("Location", "")
            if redirect_url:
                r = requests.get(redirect_url, timeout=15)
        result = r.text.strip()
        if result == "SUCCESS":
            return {"success": True, "result": "SUCCESS"}
        elif result.startswith("<!DOCTYPE html>") or "<html" in result.lower():
            return {
                "success": False,
                "error": "server_rejected",
                "message": "เซิร์ฟเวอร์ Google Apps Script ปฏิเสธการทำงาน (โปรดตรวจสอบการกำหนดสิทธิ์ Web App)"
            }
        elif "มีคนใช้แล้ว" in result or "Username นี้" in result:
            return {
                "success": False,
                "error": "duplicate_username",
                "message": "❌ Username นี้ มีการลงทะเบียนแล้ว"
            }
        else:
            return {
                "success": False,
                "error": "unknown",
                "message": f"ระบบตอบกลับ: {result}"
            }
    except Exception as e:
        return {
            "success": False,
            "error": "exception",
            "message": f"การเชื่อมต่อล้มเหลว: {str(e)}"
        }

@app.post("/api/admin/update_user")
async def admin_update_user(request: Request):
    """
    Proxies user management update requests to Google Apps Script
    to avoid browser CORS restrictions.
    """
    import requests
    SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwxNG-AHRfeR8FiY9AYQ-uqQeCjwerT2rRIcXFfAy5JIrEHzfYb8CERcLl9vukKf6ch/exec"
    try:
        data = await request.json()
        if "action" not in data:
            data["action"] = "update_user"

        r = requests.post(SCRIPT_URL, json=data, timeout=20, allow_redirects=False)
        if r.status_code in (301, 302, 303, 307):
            loc = r.headers.get("Location")
            if loc:
                r = requests.get(loc, timeout=20)
        try:
            return r.json()
        except:
            text = r.text.strip()
            if "success" in text.lower():
                return {"status": "success", "message": "บันทึกข้อมูลเรียบร้อยแล้ว"}
            return {"status": "error", "message": text or f"Response code: {r.status_code}"}
    except Exception as e:
        return {"status": "error", "message": f"การเชื่อมต่อล้มเหลว: {str(e)}"}

@app.get("/api/admin/check_services")
def check_services():
    """
    Checks Thailand Post external API endpoints health and latency matching Python GUI.
    """
    import requests
    import time
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    results = {
        "postone": {"name": "Gen barcode (PostOne)", "online": False, "latency": None},
        "eparcel": {"name": "Preload e-Parcel", "online": False, "latency": None}
    }
    
    try:
        t0 = time.time()
        requests.get("https://postone.thailandpost.com", timeout=5, verify=False)
        results["postone"]["online"] = True
        results["postone"]["latency"] = round(time.time() - t0, 2)
    except Exception:
        results["postone"]["online"] = False
        
    try:
        t0 = time.time()
        requests.get("https://r_dservice.thailandpost.com", timeout=5, verify=False)
        results["eparcel"]["online"] = True
        results["eparcel"]["latency"] = round(time.time() - t0, 2)
    except Exception:
        results["eparcel"]["online"] = False
        
    return {"success": True, "services": results}

@app.post("/api/convert")
async def convert_pdfs(files: List[UploadFile] = File(...)):
    """
    Accepts uploaded PDF files, processes each using process_pdf(),
    and returns parsed records as JSON.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
        
    all_records = []
    error_files = []
    
    with tempfile.TemporaryDirectory() as temp_dir:
        for uploaded_file in files:
            if not uploaded_file.filename.lower().endswith(".pdf"):
                continue
                
            temp_file_path = os.path.join(temp_dir, uploaded_file.filename)
            try:
                content = await uploaded_file.read()
                with open(temp_file_path, "wb") as f:
                    f.write(content)
                    
                records = process_pdf(temp_file_path)
                for rec in records:
                    rec["SOURCE_FILE"] = uploaded_file.filename
                all_records.extend(records)
            except Exception as e:
                error_files.append({"filename": uploaded_file.filename, "error": str(e)})
                
    if all_records:
        df = records_to_dataframe(all_records)
        formatted_records = df.fillna("").to_dict('records')
    else:
        formatted_records = []
        
    return {
        "success": True,
        "total_records": len(formatted_records),
        "records": formatted_records,
        "error_files": error_files
    }

@app.post("/api/export-excel")
async def export_excel(payload: ExportRequest):
    """
    Takes records and generates an Excel (.xlsx) file matching the DPost template.
    """
    if not payload.records:
        raise HTTPException(status_code=400, detail="No records provided")
        
    try:
        df = records_to_dataframe(payload.records)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="DPost_Import")
        output.seek(0)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"DPost_Export_{timestamp}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Excel: {str(e)}")

async def parse_export_payload(request: Request):
    content_type = request.headers.get("content-type", "")
    records = []
    pdf_type = "combined"
    uploaded_files = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        records_raw = form.get("records")
        if records_raw:
            records = json.loads(records_raw)
        pdf_type = form.get("pdf_type", "combined")
        uploaded_files = form.getlist("files")
    else:
        body = await request.json()
        records = body.get("records", [])
        pdf_type = body.get("pdf_type", "combined")

    return records, pdf_type, uploaded_files

@app.post("/api/export-pdf")
async def export_pdf(request: Request):
    """
    Generates PDF: 'combined' (labels with original PDF overlay), 'delivery_note' (ใบนำส่ง), or 'envelopes'.
    Supports both multipart/form-data (with uploaded files) and JSON payloads.
    """
    try:
        records, pdf_type, uploaded_files = await parse_export_payload(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request payload: {str(e)}")

    if not records:
        raise HTTPException(status_code=400, detail="No records provided")
        
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Save any uploaded PDF files into temp_dir
        file_map = {}
        for uf in uploaded_files:
            if uf and hasattr(uf, 'filename') and uf.filename:
                safe_name = os.path.basename(uf.filename)
                target_path = os.path.join(temp_dir, safe_name)
                content = await uf.read()
                with open(target_path, "wb") as f:
                    f.write(content)
                file_map[safe_name] = target_path
                file_map[uf.filename] = target_path

        # If files were uploaded, update SOURCE_FILE in records to point to temp file paths
        if file_map:
            for rec in records:
                src = rec.get("SOURCE_FILE") or rec.get("source_file") or ""
                src_base = os.path.basename(src) if src else ""
                if src in file_map:
                    rec["SOURCE_FILE"] = file_map[src]
                elif src_base in file_map:
                    rec["SOURCE_FILE"] = file_map[src_base]
                elif len(file_map) == 1:
                    rec["SOURCE_FILE"] = list(file_map.values())[0]

        df = records_to_dataframe(records)
        tmp_path = os.path.join(temp_dir, f"output_{timestamp}.pdf")
        
        try:
            if pdf_type == "delivery_note":
                generate_delivery_note_pdf(df, tmp_path)
                filename = f"DeliveryNote_{timestamp}.pdf"
            elif pdf_type == "envelopes":
                generate_custom_envelopes_pdf(df, tmp_path)
                filename = f"Envelopes_{timestamp}.pdf"
            else:
                generate_combined_pdf(df, tmp_path)
                filename = f"DPost_Combined_{timestamp}.pdf"
                
            with open(tmp_path, "rb") as f:
                pdf_bytes = io.BytesIO(f.read())
                
            return StreamingResponse(
                pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")

@app.post("/api/export-zip")
async def export_zip(request: Request):
    """
    Generates Excel + Delivery Note PDF + Combined PDF and returns a .zip file.
    """
    try:
        records, _, uploaded_files = await parse_export_payload(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request payload: {str(e)}")

    if not records:
        raise HTTPException(status_code=400, detail="No records provided")
        
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        file_map = {}
        for uf in uploaded_files:
            if uf and hasattr(uf, 'filename') and uf.filename:
                safe_name = os.path.basename(uf.filename)
                target_path = os.path.join(temp_dir, safe_name)
                content = await uf.read()
                with open(target_path, "wb") as f:
                    f.write(content)
                file_map[safe_name] = target_path
                file_map[uf.filename] = target_path

        if file_map:
            for rec in records:
                src = rec.get("SOURCE_FILE") or rec.get("source_file") or ""
                src_base = os.path.basename(src) if src else ""
                if src in file_map:
                    rec["SOURCE_FILE"] = file_map[src]
                elif src_base in file_map:
                    rec["SOURCE_FILE"] = file_map[src_base]
                elif len(file_map) == 1:
                    rec["SOURCE_FILE"] = list(file_map.values())[0]

        df = records_to_dataframe(records)
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Excel
            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name="DPost_Import")
            excel_buffer.seek(0)
            zip_file.writestr(f"DPost_Export_{timestamp}.xlsx", excel_buffer.read())
            
            # 2. Combined PDF
            tmp_comb_path = os.path.join(temp_dir, f"comb_{timestamp}.pdf")
            try:
                generate_combined_pdf(df, tmp_comb_path)
                with open(tmp_comb_path, "rb") as f:
                    zip_file.writestr(f"DPost_Combined_{timestamp}.pdf", f.read())
            except Exception as e:
                print(f"Error generating combined PDF for zip: {e}")
                    
            # 3. Delivery Note PDF
            tmp_deliv_path = os.path.join(temp_dir, f"deliv_{timestamp}.pdf")
            try:
                generate_delivery_note_pdf(df, tmp_deliv_path)
                with open(tmp_deliv_path, "rb") as f:
                    zip_file.writestr(f"DeliveryNote_{timestamp}.pdf", f.read())
            except Exception as e:
                print(f"Error generating delivery note for zip: {e}")
                    
        zip_buffer.seek(0)
        filename = f"C2DPost_Bundle_{timestamp}.zip"
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

# For Vercel Serverless Function handler
import pandas as pd
try:
    from mangum import Mangum
    handler = Mangum(app)
except ImportError:
    pass
