import os
import sys
import io
import json
import base64
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

class DashboardRequest(BaseModel):
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

class BatchEarPdfRequest(BaseModel):
    barcodes: List[str]
    format: Optional[str] = "pdf" # "pdf" (merged single document) or "zip" (archive of individual files)
    client_blobs: Optional[List[dict]] = [] # [{barcode, receiver, inv_no, base64}]
    downloaded_at: Optional[str] = "" # Timestamp string e.g. "18/09/2569 07:08:15 น."

class EarWithTrackingPdfRequest(BaseModel):
    barcode: str
    client_pdf_base64: Optional[str] = None
    receiver_name: Optional[str] = ""
    inv_no: Optional[str] = ""
    relationship: Optional[str] = ""
    delivery_officer: Optional[str] = ""
    signature_image: Optional[str] = ""
    latest_datetime: Optional[str] = ""
    latest_location: Optional[str] = ""
    events: Optional[List[dict]] = []
    downloaded_at: Optional[str] = ""


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

    # 1. Returned / ส่งคืน / คืนต้นทาง (Must check before delivered to avoid false-positive on "นำจ่ายคืน...")
    if (
        any(k in desc_norm for k in [
            "ส่งคืน", "คืนต้นทาง", "ส่งคืนผู้ส่ง", "ตีกลับ", "คืนผู้ฝาก", "คืนสู่ผู้ฝาก",
            "ไม่สามารถส่งมอบ", "ไม่สามารถนำจ่าย", "ส่งมอบคืน", "นำจ่ายคืน"
        ])
        or code in ["502", "503", "401", "402", "returned"]
    ):
        return "returned", "ส่งคืน"

    # 2. Delivered / นำจ่ายสำเร็จ
    # Official Thailand Post e-Parcel statuses: "นำจ่ายถึงผู้รับแล้ว" (code 4), "นำจ่ายสำเร็จ" (code 501), "ถึงผู้รับแล้ว"
    if (
        any(k in desc_norm for k in [
            "นำจ่ายถึงผู้รับแล้ว", "ถึงผู้รับแล้ว", "นำจ่ายสำเร็จ", "ผู้รับได้รับเรียบร้อย",
            "ผู้รับได้รับ", "จัดส่งสำเร็จ", "ส่งมอบเรียบร้อย", "ส่งถึงผู้รับแล้ว", "นำจ่ายเรียบร้อย"
        ])
        or code in ["4", "501", "delivered"]
    ):
        return "delivered", "นำจ่ายสำเร็จ"

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

    ev_moved = {
        "seq": 4,
        "status": "301",
        "status_key": "in_transit",
        "status_label": "นำจ่ายไม่สำเร็จ",
        "status_description": "ย้าย / ไม่ทราบที่อยู่ใหม่",
        "datetime": f"{clean_date} 19:49:15",
        "location": "ปณ.เรณูนคร",
        "signature": ""
    }

    ev_dest_ret = {
        "seq": 5,
        "status": "502",
        "status_key": "returned",
        "status_label": "ส่งคืน",
        "status_description": "ปณ.ปลายทางส่งคืน",
        "datetime": f"{clean_date} 16:07:59",
        "location": "ปณ.เรณูนคร",
        "signature": ""
    }

    ev_ret_origin = {
        "seq": 6,
        "status": "502",
        "status_key": "returned",
        "status_label": "ส่งคืน",
        "status_description": "นำจ่ายไม่สำเร็จ (ปณ.ต้นทางส่งคืนบริษัท)",
        "datetime": f"{clean_date} 11:44:29",
        "location": "ปณ.เรณูนคร",
        "signature": ""
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

    # Customer 4 (ends in 3): Returned with true exception cause before ปณ.ปลายทางส่งคืน
    return [ev1, ev2, ev3, ev_moved, ev_dest_ret, ev_ret_origin]

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
            
        return JSONResponse(
            status_code=response.status_code,
            content={"status_code": response.status_code, "data": resp_data}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status_code": 500, "error": str(e)}
        )

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
    """Fetches daily or date-range deposit report from Thailand Post e-Parcel API (getAllOrderReceived)."""
    return _fetch_received_report_payload(req.date, req.end_date, req.username, req.password)


def _fetch_received_report_payload(req_date, req_end_date, req_username, req_password):
    """
    Fetches daily or date-range deposit report from Thailand Post e-Parcel API (getAllOrderReceived).
    Returns the normalized payload dict (or JSONResponse for unauthorized).
    """
    import re
    from datetime import datetime, timedelta
    from concurrent.futures import ThreadPoolExecutor
    import requests
    from requests.auth import HTTPBasicAuth
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    clean_date = (req_date or "").strip()
    if not re.match(r'^\d{2}/\d{2}/\d{4}$', clean_date):
        raise HTTPException(
            status_code=400, 
            detail="รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้วันที่ในรูปแบบ DD/MM/YYYY เช่น 14/09/2026"
        )

    clean_end_date = (req_end_date or "").strip()
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
        
    username = (req_username or "").strip()
    password = (req_password or "").strip()

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
                                err_detail = str(resp_json[0].get("errorDetail") or "")
                                if re.search(r"no\s*receive\s*product|no\s*data", err_detail, re.IGNORECASE):
                                    return {"items": []}
                                return {"items": [], "notice": err_detail}
                            return {"items": resp_json}
                        elif isinstance(resp_json, dict) and "data" in resp_json and isinstance(resp_json["data"], list):
                            return {"items": resp_json["data"]}
                        elif isinstance(resp_json, dict) and resp_json.get("errorCode"):
                            err_detail = str(resp_json.get("errorDetail") or "")
                            if re.search(r"no\s*receive\s*product|no\s*data", err_detail, re.IGNORECASE):
                                return {"items": []}
                            return {"items": [], "notice": err_detail}
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
                notice = str(res["notice"])
                if not re.search(r"no\s*receive\s*product|no\s*data", notice, re.IGNORECASE):
                    api_error = notice
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
                    "name": "นายจักรพงษ์ บัวสาย", "addr": "38 หมู่ที่ 4 ต.เรณู", "amphur": "เรณูนคร", "prov": "นครพนม", "zip": "48170", "wt": 10.0, "price": 21.0,
                    "status": "502", "status_desc": "ย้าย / ไม่ทราบที่อยู่ใหม่", "time_offset": "19:49:15", "station": "ปณ.เรณูนคร", "sig": "เจ้าหน้าที่ส่งคืน"
                },
                {
                    "name": "นายสมศักดิ์ วงศ์สวรรค์", "addr": "12 หมู่ที่ 2 ต.โพนทอง", "amphur": "เรณูนคร", "prov": "นครพนม", "zip": "48170", "wt": 10.0, "price": 21.0,
                    "status": "301", "status_desc": "นำจ่ายไม่สำเร็จ (บ้านปิด)", "time_offset": "17:10:00", "station": "ปณ.เรณูนคร", "sig": "เจ้าหน้าที่นำจ่าย"
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
                        if latest.get("signature"):
                            rec["signature"] = latest["signature"]

                        # If parcel is returned or has failure, extract true cause before 'ปณ.ปลายทางส่งคืน'
                        if latest.get("status_key") == "returned" or any("ส่งคืน" in str(ev.get("status_description") or "") for ev in events):
                            fail_reason = _extract_failure_reason_from_events(events)
                            if fail_reason:
                                rec["status_description_raw"] = fail_reason
                                rec["failure_reason"] = fail_reason
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
        "api_notice": (api_error if not is_demo_user else None) if (api_error and not re.search(r"no\s*receive\s*product|no\s*data", str(api_error), re.IGNORECASE)) else None,
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


def _normalize_failure_reason(raw_text):
    """
    Normalizes Thai failure descriptions into standard recognizable labels.
    Preserves exact Thailand Post operational categories:
    'ย้าย / ไม่ทราบที่อยู่ใหม่', 'บ้านปิด', 'ออกใบแจ้ง', 'ผู้รับไม่อยู่', etc.
    """
    if not raw_text:
        return "อื่น ๆ (ไม่ระบุสาเหตุ)"
    
    t = str(raw_text).strip()
    
    # Strip wrapping parentheses e.g. "นำจ่ายไม่สำเร็จ (ย้าย / ไม่ทราบที่อยู่ใหม่)"
    m = re.search(r'\(([^)]+)\)', t)
    if m:
        inner = m.group(1).strip()
        if inner and not any(k in inner for k in ["ปณ.", "บริษัท", "ต้นทางส่งคืน", "ปลายทางส่งคืน"]):
            t = inner

    norm = t.lower()
    
    # Specific Thailand Post failure reasons
    if "ย้าย" in norm or "ไม่ทราบที่อยู่" in norm:
        return "ย้าย / ไม่ทราบที่อยู่ใหม่"
    if "บ้านปิด" in norm or "ปิดบ้าน" in norm:
        return "บ้านปิด"
    if "ออกใบแจ้ง" in norm or "หยอดใบแจ้ง" in norm:
        return "ออกใบแจ้ง"
    if "ผู้รับไม่อยู่" in norm or "ไม่อยู่บ้าน" in norm:
        return "ผู้รับไม่อยู่"
    if "ติดต่อผู้รับไม่ได้" in norm or "ติดต่อไม่ได้" in norm or "โทรไม่ติด" in norm:
        return "ติดต่อผู้รับไม่ได้"
    if "ไม่มีผู้รับ" in norm or "ไม่พบผู้รับ" in norm:
        return "ไม่มีผู้รับตามจ่าหน้า"
    if "จ่าหน้าไม่ชัดเจน" in norm or "ที่อยู่ไม่ครบ" in norm or "ไม่พบที่อยู่" in norm or "ไม่มีเลขที่" in norm:
        return "จ่าหน้าไม่ชัดเจน / ที่อยู่ไม่ครบ"
    if "ปฏิเสธ" in norm or "ไม่ยอมรับ" in norm:
        return "ปฏิเสธการรับ"
    if "ไม่มารับ" in norm or "รอจ่าย" in norm or "เกินกำหนด" in norm:
        return "ไม่มารับตามกำหนด / รอจ่าย"
    if "ชำรุด" in norm or "เสียหาย" in norm:
        return "พัสดุเสียหาย / ชำรุด"

    # Avoid returning transport steps as reason
    if any(k in norm for k in ["ปณ.ต้นทางส่งคืน", "ปณ.ปลายทางส่งคืน", "ส่งคืนต้นทาง", "ส่งมอบคืน"]):
        return "อื่น ๆ (ส่งคืนต้นทาง)"

    return t


def _extract_failure_reason_from_events(events):
    """
    Extracts the true failure reason from tracking timeline events.
    Per Thailand Post workflow:
    When a delivery attempt fails at destination, an exception step is recorded
    (e.g., 'ย้าย / ไม่ทราบที่อยู่ใหม่', 'บ้านปิด', 'ออกใบแจ้ง', 'ผู้รับไม่อยู่').
    The destination office subsequently registers 'ปณ.ปลายทางส่งคืน'.
    Therefore, the event IMMEDIATELY BEFORE 'ปณ.ปลายทางส่งคืน' contains the actual cause of return.
    """
    if not events:
        return ""

    def _get_desc(ev):
        return str(ev.get("status_description") or ev.get("status_label") or "").strip()

    # 1. Look for 'ปณ.ปลายทางส่งคืน' or 'ปลายทางส่งคืน'
    dest_return_idx = -1
    for i, ev in enumerate(events):
        d = _get_desc(ev)
        if "ปลายทางส่งคืน" in d:
            dest_return_idx = i
            break

    if dest_return_idx > 0:
        prev_desc = _get_desc(events[dest_return_idx - 1])
        if prev_desc and not any(k in prev_desc for k in ["รับฝาก", "ศป.", "ศูนย์คัดแยก"]):
            return _normalize_failure_reason(prev_desc)

    # 2. Look for first return step ('ส่งคืน', 'คืนต้นทาง', 'ตีกลับ')
    first_return_idx = -1
    for i, ev in enumerate(events):
        d = _get_desc(ev)
        if any(k in d for k in ["ส่งคืน", "คืนต้นทาง", "ตีกลับ"]) and not any(k in d for k in ["รับฝาก"]):
            first_return_idx = i
            break

    if first_return_idx > 0:
        prev_desc = _get_desc(events[first_return_idx - 1])
        if prev_desc and not any(k in prev_desc for k in ["รับฝาก", "ศป.", "ศูนย์คัดแยก", "เตรียมการนำจ่าย", "เตรียมนำจ่าย"]):
            return _normalize_failure_reason(prev_desc)

    # 3. Look in reverse for any event with known failure keywords
    failure_keywords = [
        "ย้าย", "ไม่ทราบที่อยู่", "บ้านปิด", "ออกใบแจ้ง", "ผู้รับไม่อยู่", "ติดต่อไม่ได้",
        "ไม่มีผู้รับ", "จ่าหน้าไม่ชัดเจน", "ปฏิเสธ", "ไม่ยอมรับ", "ไม่มารับ", "เสียหาย", "ชำรุด"
    ]
    for ev in reversed(events):
        d = _get_desc(ev)
        if any(kw in d for kw in failure_keywords):
            return _normalize_failure_reason(d)

    # 4. Fallback to latest event description if not pure generic return
    if events:
        latest = _get_desc(events[-1])
        if latest and not any(k in latest for k in ["ส่งคืน", "ปณ.ต้นทางส่งคืนบริษัท"]):
            return _normalize_failure_reason(latest)

    return "อื่น ๆ (ไม่ระบุสาเหตุ)"


def _classify_failure_reason(raw_desc):
    """
    Classifies the reason a parcel was not successfully delivered (returned)
    into standard recognizable Thailand Post failure buckets.
    """
    return _normalize_failure_reason(raw_desc)


@app.post("/api/reports/dashboard")
def get_dashboard_report(req: DashboardRequest):
    """
    Aggregated delivery statistics dashboard:
    deposit totals, delivered/failed percentages, failure reasons, and per-province breakdown.
    """
    import requests
    from requests.auth import HTTPBasicAuth
    from concurrent.futures import ThreadPoolExecutor
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    payload = _fetch_received_report_payload(req.date, req.end_date, req.username, req.password)
    if isinstance(payload, JSONResponse):
        return payload

    records = payload.get("records") or []
    is_mock = bool(payload.get("is_mock"))
    api_notice = payload.get("api_notice") or None
    if api_notice and re.search(r"no\s*receive\s*product|no\s*data", str(api_notice), re.IGNORECASE):
        api_notice = None

    username = (req.username or "").strip()
    password = (req.password or "").strip()
    is_live = bool(username and password and username.lower() != "demo")

    # For large live datasets (more than 35) the received endpoint only enriches up to 35 records.
    # Refresh conclusion statuses for the rest via the batch endpoint (getOrderByBarcodes).
    unconcluded = [rec for rec in records if (rec.get("status_key") or "in_transit") not in ("delivered", "returned")]
    if is_live and len(records) > 35 and unconcluded:
        status_map = {}
        target = [rec.get("barcode") for rec in unconcluded if rec.get("barcode")]
        if target:
            _t = target[:400]
            if len(target) > 400:
                api_notice = api_notice or f"ข้อมูลเกิน 400 รายการต่อรอบ ตรวจสถานะนำจ่ายเฉพาะ 400 รายการแรก"
            try:
                url = "https://r_dservice.thailandpost.com/webservice/getOrderByBarcodes"
                headers = {"Content-Type": "application/json"}
                r = requests.post(url, json={"barcodes": _t}, headers=headers,
                                  auth=HTTPBasicAuth(username, password), timeout=30, verify=False)
                if r.status_code == 200:
                    try:
                        raw = r.json()
                    except Exception:
                        raw = r.text
                    for item in _normalize_payload_list(raw):
                        if not isinstance(item, dict):
                            continue
                        bc = str(item.get("barcode") or "").strip()
                        if not bc:
                            continue
                        status = str(item.get("status") or item.get("statusCode") or "").strip()
                        desc = str(item.get("statusDescription") or item.get("status_description") or "").strip()
                        sk, sl = classify_delivery_status(status, desc)
                        status_map[bc] = (sk, sl, desc)
            except Exception as e:
                api_notice = api_notice or f"การตรวจสถานะนำจ่ายบางรายการล้มเหลว: {str(e)[:120]}"

            missing = [b for b in _t if b not in status_map]
            if missing and len(missing) <= 50:
                def _hist_one(bcode):
                    try:
                        hurl = f"https://r_dservice.thailandpost.com/webservice/getHistoryStatus?barcode={bcode}"
                        hr = requests.get(hurl, headers={"Content-Type": "application/json"},
                                          auth=HTTPBasicAuth(username, password), timeout=10, verify=False)
                        if hr.status_code == 200:
                            try:
                                hraw = hr.json()
                            except Exception:
                                hraw = hr.text
                            evs = _parse_tracking_events(hraw, bcode)
                            latest = evs[-1] if evs else {}
                            sk = latest.get("status_key") or ""
                            sl = latest.get("status_label") or ""
                            return bcode, (sk, sl, latest.get("status_description") or "")
                    except Exception:
                        pass
                    return bcode, None

                with ThreadPoolExecutor(max_workers=10) as ex:
                    for bcode, result in ex.map(_hist_one, missing):
                        if result:
                            status_map[bcode] = result

            for rec in unconcluded:
                bcode = rec.get("barcode")
                upd = status_map.get(bcode) if bcode else None
                if upd:
                    sk, sl, desc = upd
                    if sk in ("delivered", "returned"):
                        rec["status_key"] = sk
                        rec["status_label"] = sl
                        rec["status_description"] = sl
                        rec["status_description_raw"] = desc
                    elif sk == "in_transit":
                        rec["status_key"] = "in_transit"
                        rec["status_label"] = sl or rec.get("status_label") or "อยู่ระหว่างนำจ่าย"

    # Enrich returned/failed records with the exact failure cause recorded BEFORE "ปณ.ปลายทางส่งคืน"
    returned_or_failed = [
        rec for rec in records
        if rec.get("status_key") == "returned"
        or str(rec.get("status") or "") in ["301", "302", "401", "402", "502", "503"]
        or any(k in str(rec.get("status_description_raw") or rec.get("status_label") or "")
               for k in ["ส่งคืน", "คืนต้นทาง", "ตีกลับ", "นำจ่ายไม่สำเร็จ", "ไม่สามารถนำจ่าย", "ไม่สามารถส่งมอบ", "บ้านปิด", "ออกใบแจ้ง", "ย้าย"])
    ]
    if is_live and returned_or_failed:
        def _fetch_failed_reason(rec):
            bcode = rec.get("barcode")
            if not bcode:
                return
            try:
                hurl = f"https://r_dservice.thailandpost.com/webservice/getHistoryStatus?barcode={bcode}"
                hr = requests.get(hurl, headers={"Content-Type": "application/json"},
                                  auth=HTTPBasicAuth(username, password), timeout=10, verify=False)
                if hr.status_code == 200:
                    try:
                        hraw = hr.json()
                    except Exception:
                        hraw = hr.text
                    evs = _parse_tracking_events(hraw, bcode)
                    if evs:
                        extracted_reason = _extract_failure_reason_from_events(evs)
                        if extracted_reason:
                            rec["status_description_raw"] = extracted_reason
                            rec["failure_reason"] = extracted_reason
            except Exception:
                pass

        max_fw = min(len(returned_or_failed), 10)
        with ThreadPoolExecutor(max_workers=max_fw) as ex:
            list(ex.map(_fetch_failed_reason, returned_or_failed))

    total = len(records)
    delivered = 0
    failed = 0
    received = 0
    in_transit = 0
    pending = 0
    unknown = 0
    reason_counts = {}
    province_map = {}
    parcels = []

    for idx, rec in enumerate(records):
        key = rec.get("status_key") or "in_transit"
        province = (rec.get("receiver_province") or "").strip()
        if not province:
            zipcode = (rec.get("receiver_zipcode") or "").strip()
            province = f"ZIP:{zipcode}" if zipcode else "(ไม่ระบุ)"
        desc_full = str(rec.get("status_description_raw") or rec.get("status_description") or rec.get("status_label") or "").strip()
        code_str = str(rec.get("status") or rec.get("statusCode") or "").strip()

        has_failure_or_return = (
            key == "returned"
            or code_str in ["301", "302", "401", "402", "502", "503"]
            or any(k in desc_full for k in ["ส่งคืน", "คืนต้นทาง", "ตีกลับ", "นำจ่ายไม่สำเร็จ", "ไม่สามารถนำจ่าย", "ไม่สามารถส่งมอบ", "บ้านปิด", "ออกใบแจ้ง", "ผู้รับไม่อยู่", "ติดต่อไม่ได้", "ไม่มารับตามกำหนด", "ย้าย"])
        )

        reason = ""
        if has_failure_or_return and key != "delivered":
            reason = rec.get("failure_reason") or _classify_failure_reason(desc_full)
            reason_counts[reason] = reason_counts.get(reason, 0) + 1

        is_failed_item = (key == "returned") or (has_failure_or_return and any(k in desc_full for k in ["ส่งคืน", "คืนต้นทาง", "ตีกลับ", "502", "503", "401", "402", "นำจ่ายไม่สำเร็จ", "บ้านปิด"]))

        if key == "delivered":
            delivered += 1
        elif is_failed_item:
            failed += 1
        elif key == "received":
            received += 1
            pending += 1
        elif key == "in_transit":
            in_transit += 1
            pending += 1
        else:
            unknown += 1

        st = province_map.setdefault(province, {"count": 0, "delivered": 0, "failed": 0, "pending": 0, "received": 0, "in_transit": 0})
        st["count"] += 1
        if key == "delivered":
            st["delivered"] += 1
        elif is_failed_item:
            st["failed"] += 1
        elif key == "received":
            st["received"] += 1
            st["pending"] += 1
        elif key == "in_transit":
            st["in_transit"] += 1
            st["pending"] += 1
        else:
            st["pending"] += 1

        parcels.append({
            "seq": idx + 1,
            "barcode": rec.get("barcode") or "",
            "receiver_name": rec.get("receiver_name") or "",
            "receiver_province": province,
            "receiver_zipcode": rec.get("receiver_zipcode") or "",
            "status_key": key,
            "status_label": rec.get("status_label") or "",
            "reason": reason,
            "latest_date": rec.get("latest_date") or "",
            "latest_station": rec.get("latest_station") or "",
        })

    concluded = delivered + failed
    parcels_truncated = len(parcels) > 300
    if parcels_truncated:
        parcels = parcels[:300]
    summary = {
        "total_items": total,
        "delivered_count": delivered,
        "failed_count": failed,
        "received_count": received,
        "in_transit_count": in_transit,
        "pending_count": pending,
        "unknown_count": unknown,
        "concluded_count": concluded,
        "delivered_pct_of_concluded": round(delivered * 100 / concluded, 2) if concluded else 0.0,
        "failed_pct_of_concluded": round(failed * 100 / concluded, 2) if concluded else 0.0,
        "delivered_pct_of_total": round(delivered * 100 / total, 2) if total else 0.0,
        "failed_pct_of_total": round(failed * 100 / total, 2) if total else 0.0,
        "received_pct_of_total": round(received * 100 / total, 2) if total else 0.0,
        "in_transit_pct_of_total": round(in_transit * 100 / total, 2) if total else 0.0,
        "pending_pct_of_total": round(pending * 100 / total, 2) if total else 0.0,
    }

    reasons = [
        {"reason": r, "count": c, "pct_of_failed": round(c * 100 / failed, 2) if failed else 0.0}
        for r, c in sorted(reason_counts.items(), key=lambda kv: -kv[1])
    ]

    provinces = []
    for prov, st in province_map.items():
        conc = st["delivered"] + st["failed"]
        provinces.append({
            "province": prov,
            "count": st["count"],
            "delivered": st["delivered"],
            "failed": st["failed"],
            "received": st["received"],
            "in_transit": st["in_transit"],
            "pending": st["pending"],
            "concluded": conc,
            "success_rate": round(st["delivered"] * 100 / conc, 2) if conc else None,
        })
    provinces.sort(key=lambda p: (-p["count"], p["province"]))

    return {
        "success": True,
        "date": payload.get("date"),
        "end_date": payload.get("end_date"),
        "date_display": payload.get("date_display"),
        "is_mock": is_mock,
        "api_notice": api_notice,
        "summary": summary,
        "reasons": reasons,
        "provinces": provinces,
        "parcels": parcels,
        "parcels_truncated": parcels_truncated,
    }


def _parse_ear_pdf_content(pdf_bytes: bytes) -> dict:
    """
    Robustly parses e-AR PDF bytes.
    Extracts recipient relationship, delivery officer, status, and signature image.
    Handles PDF smask alpha transparency and fonts with CMap.
    """
    data = {
        "status": "",
        "relationship": "",
        "delivery_officer": "",
        "signature_image": ""
    }
    if not pdf_bytes or len(pdf_bytes) < 300:
        return data

    import io
    import base64
    import re
    from PIL import Image

    # 1. Extract signature image using pypdf (handles PDF smask / transparency perfectly)
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        page = reader.pages[0]
        candidates = []
        for img in page.images:
            try:
                im = Image.open(io.BytesIO(img.data))
                w, h = im.size
                ratio = w / h if h > 0 else 0

                # Exclude wide banners (e.g. Thailand Post logo ratio 4.71)
                if ratio > 2.2 or (h / w > 3.5 if w > 0 else False):
                    continue
                # Exclude huge stamp composite images (> 700x700 or > 90KB)
                if (w > 700 and h > 700) or len(img.data) > 90000:
                    continue
                # Exclude tiny icons (< 60x60)
                if w < 60 or h < 60:
                    continue

                # Scoring candidate
                score = 0
                if im.mode == 'RGBA':
                    score += 100
                if h > w:
                    score += 50
                if len(img.data) < 40000:
                    score += 30
                if 120 <= w <= 650 and 180 <= h <= 700:
                    score += 50

                candidates.append((score, img, im))
            except Exception:
                continue

        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            best_score, best_img, best_im = candidates[0]
            # Handheld PDA saves signature in vertical orientation; rotate 90° to make it upright
            if best_im.height > best_im.width:
                best_im = best_im.rotate(90, expand=True)

            # Auto-trim transparent whitespace margins around pen strokes
            bbox = best_im.getbbox()
            if bbox:
                pad = 12
                bw, bh = best_im.size
                crop_box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(bw, bbox[2] + pad), min(bh, bbox[3] + pad))
                best_im = best_im.crop(crop_box)

            # Composite onto crisp white background
            bg = Image.new("RGBA", best_im.size, (255, 255, 255, 255))
            final_im = Image.alpha_composite(bg, best_im.convert("RGBA")).convert("RGB")
            buf = io.BytesIO()
            final_im.save(buf, format="PNG")
            b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
            data["signature_image"] = f"data:image/png;base64,{b64_str}"
    except Exception:
        pass

    # Fallback to PyMuPDF signature box clip if pypdf didn't get signature
    if not data["signature_image"]:
        try:
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page = doc[0]
            clip_rect = fitz.Rect(465, 92, 520, 142)
            pix = page.get_pixmap(clip=clip_rect, dpi=200)
            im = Image.open(io.BytesIO(pix.tobytes("png")))
            if im.height > im.width:
                im = im.rotate(90, expand=True)
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
            data["signature_image"] = f"data:image/png;base64,{b64_str}"
        except Exception:
            pass

    # 2. Extract text metadata using PyMuPDF (fitz)
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
    except Exception:
        pass

    # 3. Pure python CMap fallback for text if relationship missing
    if not data["relationship"]:
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            page = reader.pages[0]
            fonts = page.get("/Resources", {}).get("/Font", {})
            font_maps = {}
            for fkey, fval in fonts.items():
                fobj = fval.get_object()
                if "/ToUnicode" in fobj:
                    cmap_str = fobj["/ToUnicode"].get_object().get_data().decode("utf-8", errors="ignore")
                    m = {}
                    for item in re.finditer(r"<([0-9a-fA-F]{4})>\s+<([0-9a-fA-F]{4})>", cmap_str):
                        m[int(item.group(1), 16)] = chr(int(item.group(2), 16))
                    for item in re.finditer(r"<([0-9a-fA-F]{4})>\s+<([0-9a-fA-F]{4})>\s+<([0-9a-fA-F]{4})>", cmap_str):
                        s_s, s_e, d_s = int(item.group(1), 16), int(item.group(2), 16), int(item.group(3), 16)
                        for idx in range(s_e - s_s + 1):
                            m[s_s + idx] = chr(d_s + idx)
                    font_maps[fkey] = m
            content = page.get_contents().get_data().decode("latin1", errors="ignore")
            c_font = None
            lines, curr = [], []
            for part in re.split(r"(\/[Ff]\d+\s+[\d\.]+\s+T[fF]|<[0-9a-fA-F]+>|\[.*?\]|T\*|ET)", content):
                if not part:
                    continue
                mf = re.search(r"/(F\d+)", part)
                if mf:
                    c_font = "/" + mf.group(1)
                elif part.startswith("<") and part.endswith(">"):
                    cmap = font_maps.get(c_font, {})
                    hex_str = part[1:-1]
                    curr.append("".join(cmap.get(int(hex_str[i:i+4], 16), "") for i in range(0, len(hex_str), 4)))
                elif part.startswith("[") and part.endswith("]"):
                    cmap = font_maps.get(c_font, {})
                    for piece in re.findall(r"<([0-9a-fA-F]+)>", part):
                        curr.append("".join(cmap.get(int(piece[i:i+4], 16), "") for i in range(0, len(piece), 4)))
                elif part in ("T*", "ET"):
                    if curr:
                        lines.append("".join(curr))
                        curr = []
            if curr:
                lines.append("".join(curr))
            full_text = "\n".join(lines)
            rel_m = re.search(r"ความสัมพันธ์\s*:\s*([^\n\.]+)", full_text)
            officer_m = re.search(r"เจ้าหน้าที่นำจ่าย\s*:\s*([^\n\.]+)", full_text)
            status_m = re.search(r"สถานะ\s*:\s*([^\n\.]+)", full_text)
            if rel_m and not data["relationship"]:
                data["relationship"] = rel_m.group(1).strip()
            if officer_m and not data["delivery_officer"]:
                data["delivery_officer"] = officer_m.group(1).strip()
            if status_m and not data["status"]:
                data["status"] = status_m.group(1).strip()
        except Exception:
            pass

    return data


def _fetch_ear_details(barcode: str) -> dict:
    """
    Attempts to fetch official e-AR PDF from Thailand Post and parse recipient signature + relationship.
    Returns structured dict with signature image data URL and relationship info.
    """
    result = {
        "has_ear": False,
        "barcode": barcode,
        "relationship": "",
        "delivery_officer": "",
        "status": "",
        "signature_image": "",
        "pdf_url": f"/api/reports/ear-pdf?barcode={barcode}"
    }
    if not barcode:
        return result

    try:
        import requests

        url = "https://e-ar.thailandpost.com/ear-api/print/e-ar"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
            "Origin": "https://e-ar.thailandpost.com",
            "Referer": "https://e-ar.thailandpost.com/ear",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin"
        }
        r = requests.post(url, json=[barcode], headers=headers, timeout=8, verify=False)
        if r.status_code != 200 or "application/pdf" not in r.headers.get("Content-Type", ""):
            return result

        pdf_bytes = r.content
        result["has_ear"] = True

        parsed = _parse_ear_pdf_content(pdf_bytes)
        result["status"] = parsed.get("status", "")
        result["relationship"] = parsed.get("relationship", "")
        result["delivery_officer"] = parsed.get("delivery_officer", "")
        result["signature_image"] = parsed.get("signature_image", "")
    except Exception:
        pass

    return result


@app.get("/api/reports/ear-pdf")
def get_ear_pdf(barcode: str):
    """
    Proxies and serves the official e-AR PDF for a given barcode from Thailand Post.
    Returns the genuine e-AR document as-is (no fabricated tracking page is appended).
    """
    barcode = (barcode or "").strip().upper()
    if not barcode:
        raise HTTPException(status_code=400, detail="กรุณาระบุหมายเลขบาร์โค้ด")
    try:
        import requests
        url = "https://e-ar.thailandpost.com/ear-api/print/e-ar"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
            "Origin": "https://e-ar.thailandpost.com",
            "Referer": "https://e-ar.thailandpost.com/ear",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin"
        }
        r = requests.post(url, json=[barcode], headers=headers, timeout=12, verify=False)
        ear_bytes = None
        if r.status_code == 200 and "application/pdf" in r.headers.get("Content-Type", ""):
            ear_bytes = r.content

        if not ear_bytes or len(ear_bytes) < 300:
            raise HTTPException(
                status_code=404,
                detail=f"ไม่พบข้อมูลไฟล์ใบตอบรับ e-AR ฉบับจริงสำหรับพัสดุ {barcode} กรุณาตรวจสอบว่าเปิดใช้งานส่วนขยาย C2DPost Helper ใน Chrome แล้วรีเฟรชหน้าเว็บ"
            )

        return Response(
            content=ear_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="e-AR-{barcode}.pdf"',
                "Cache-Control": "public, max-age=3600"
            }
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"เกิดข้อผิดพลาดในการเชื่อมต่อ e-AR: {str(e)}"})


@app.post("/api/reports/ear-with-tracking-pdf")
def create_ear_with_tracking_pdf(req: EarWithTrackingPdfRequest):
    """
    Combines the official 1-page e-AR PDF (Page 1) with the detailed Tracking Timeline & Evidence Report (Page 2).
    Allows user to view/save the complete 2-page document containing both the signature certificate and checkpoint audit trail.
    """
    barcode = (req.barcode or "").strip().upper()
    if not barcode:
        raise HTTPException(status_code=400, detail="กรุณาระบุหมายเลขบาร์โค้ด")

    ear_bytes = None
    # 1. Use client provided base64 if available (bypasses IP geoblocking)
    if req.client_pdf_base64:
        try:
            clean_b64 = req.client_pdf_base64.split(",")[-1] if "," in req.client_pdf_base64 else req.client_pdf_base64
            ear_bytes = base64.b64decode(clean_b64)
        except Exception as e:
            print(f"[ear-with-tracking] Error decoding client base64 for {barcode}: {e}")

    # 2. Server fetch fallback
    if not ear_bytes or len(ear_bytes) < 300:
        try:
            import requests
            url = "https://e-ar.thailandpost.com/ear-api/print/e-ar"
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Origin": "https://e-ar.thailandpost.com",
                "Referer": "https://e-ar.thailandpost.com/ear"
            }
            r = requests.post(url, json=[barcode], headers=headers, timeout=10, verify=False)
            if r.status_code == 200 and "application/pdf" in r.headers.get("Content-Type", ""):
                ear_bytes = r.content
        except Exception as ex:
            print(f"[ear-with-tracking] Server fetch error for {barcode}: {ex}")

    # If still no ear_bytes, do not create a fake plain text placeholder. Raise 404.
    if not ear_bytes or len(ear_bytes) < 300:
        raise HTTPException(
            status_code=404,
            detail=f"ไม่พบข้อมูลไฟล์ใบตอบรับ e-AR ฉบับจริงสำหรับพัสดุ {barcode} กรุณาตรวจสอบว่าเปิดใช้งานส่วนขยาย C2DPost Helper ใน Chrome แล้วรีเฟรชหน้าเว็บ"
        )

    # Parse metadata from e-AR if missing in request
    if not req.signature_image or not req.relationship or not req.delivery_officer:
        try:
            ear_meta = _parse_ear_pdf_content(ear_bytes)
            if not req.relationship and ear_meta.get("relationship"):
                req.relationship = ear_meta["relationship"]
            if not req.delivery_officer and ear_meta.get("delivery_officer"):
                req.delivery_officer = ear_meta["delivery_officer"]
            if not req.signature_image and ear_meta.get("signature_image"):
                req.signature_image = ear_meta["signature_image"]
        except Exception:
            pass

    # If events missing or empty, try to fetch or build demo tracking
    events = req.events or []

    info = {
        "barcode": barcode,
        "receiver_name": req.receiver_name or "",
        "inv_no": req.inv_no or "",
        "relationship": req.relationship or "ผู้รับรับเอง",
        "delivery_officer": req.delivery_officer or "-",
        "signature_image": req.signature_image or "",
        "latest_datetime": req.latest_datetime or "",
        "latest_location": req.latest_location or "",
        "events": events,
        "downloaded_at": req.downloaded_at or ""
    }

    # Never fabricate a fake tracking timeline onto an official document.
    # Without real checkpoint data, return the genuine e-AR (Page 1) only.
    if not events:
        return Response(
            content=ear_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="e-AR_{barcode}.pdf"',
                "Cache-Control": "public, max-age=3600"
            }
        )

    try:
        combined_bytes = _combine_ear_and_tracking_pdf(ear_bytes, info)
        return Response(
            content=combined_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="e-AR_with_Tracking_{barcode}.pdf"',
                "Cache-Control": "public, max-age=3600"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาดในการสร้างเอกสาร e-AR 2 หน้า: {str(e)}")


def classify_step_for_pdf(ev, is_last):
    """Classifies a checkpoint into a detailed status label and color for the PDF table."""
    desc = str(ev.get("status_description") or "").strip().replace("\u0e4d\u0e32", "\u0e33")
    code = str(ev.get("status") or "").strip()
    status_key = str(ev.get("status_key") or "").strip()

    # 1. Delivered / นำจ่ายสำเร็จ
    if (
        any(k in desc for k in ["นำจ่ายถึงผู้รับแล้ว", "ถึงผู้รับแล้ว", "นำจ่ายสำเร็จ", "ผู้รับได้รับ", "จัดส่งสำเร็จ", "ส่งมอบเรียบร้อย", "นำจ่ายเรียบร้อย"])
        or code in ["4", "501", "delivered"] or status_key == "delivered"
    ):
        return "นำจ่ายสำเร็จ" + (" (ล่าสุด)" if is_last else ""), "#059669"

    # 2. Exception / ข้อยกเว้น
    if any(k in desc for k in ["บ้านปิด", "ออกใบแจ้ง", "ไม่ชัดเจน", "ไม่มีเลขบ้าน", "ไม่มีผู้รับ", "รอจ่าย", "ย้าย", "เสียหาย", "ระงับ"]):
        short = desc[:15] + "..." if len(desc) > 15 else desc
        return f"ข้อยกเว้น ({short})", "#dc2626"

    # 3. Returned / ส่งคืนต้นทาง
    if any(k in desc for k in ["ส่งคืน", "ตีกลับ", "คืนต้นทาง"]) or status_key == "returned":
        return "ส่งคืนต้นทาง", "#be123c"

    # 4. Received / รับฝากต้นทาง
    if code in ["1", "001", "101", "102", "103"] or any(k in desc for k in ["รับฝากเข้าระบบ", "รับฝากแล้ว", "รับฝาก", "ปณ.ต้นทางรับฝาก"]):
        return "รับฝากต้นทาง", "#0d9488"

    # 5. Prepare for delivery / เตรียมนำจ่าย (ตรวจก่อน "ถึงปลายทาง" เพื่อให้
    #    "ถึงปลายทาง (เตรียมนำจ่าย)" จำแนกเป็นสถานะการกระทำล่าสุดที่ถูกต้อง)
    if "เตรียมนำจ่าย" in desc or "เตรียมการนำจ่าย" in desc:
        return "เตรียมนำจ่าย", "#b45309"

    # 6. Destination Office / ถึง ปณ.ปลายทาง
    if any(k in desc for k in ["ถึงที่ทำการปลายทาง", "ถึง ปณ.ปลายทาง", "ปลายทาง"]):
        return "ถึง ปณ.ปลายทาง", "#7c3aed"

    # 7. Out for delivery / กำลังนำจ่าย
    if any(k in desc for k in ["ออกไปนำจ่าย", "กำลังนำจ่าย"]):
        return "เตรียมนำจ่าย", "#b45309"

    # 8. Dispatched / ส่งต่อระหว่างทาง
    if any(k in desc for k in ["ส่งออกจาก", "ส่งต่อ", "อยู่ระหว่างนำส่ง"]) or code in ["301", "302", "303"]:
        return "ส่งต่อระหว่างทาง", "#4f46e5"

    # 9. Sorting Center / คัดแยกสินค้า
    if any(k in desc for k in ["คัดแยก", "ศูนย์คัดแยก"]) or code in ["201", "202", "203", "204"]:
        return "คัดแยกสินค้า", "#0284c7"

    return ev.get("status_label") or "อัปเดตสถานะ", "#475569"


def _xml_escape(value):
    """Escape characters that ReportLab Paragraph interprets as XML markup."""
    return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _build_tracking_page2_pdf(info):
    """
    Generates Page 2 (Tracking Timeline & Delivery Evidence Report)
    matching the detailed stepper layout and e-AR evidence shown in UI (Image 3).
    """
    import io, base64
    from reportlab.lib.pagesizes import A4, portrait
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from core.convert_dpost import apply_thai_pua
    from PIL import Image as PILImage

    PAGE_WIDTH, PAGE_HEIGHT = portrait(A4)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=portrait(A4),
        leftMargin=1.3 * cm,
        rightMargin=1.3 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', fontName='Tahoma-Bold', fontSize=13, leading=17, textColor=colors.HexColor('#047857'))
    sub_style = ParagraphStyle('Sub', fontName='Tahoma', fontSize=8.5, leading=12, textColor=colors.HexColor('#64748b'))
    label_style = ParagraphStyle('Label', fontName='Tahoma-Bold', fontSize=8.5, leading=11, textColor=colors.HexColor('#334155'))
    val_style = ParagraphStyle('Val', fontName='Tahoma', fontSize=8.5, leading=11, textColor=colors.HexColor('#0f172a'))
    tbl_hdr = ParagraphStyle('THdr', fontName='Tahoma-Bold', fontSize=8.5, leading=11, textColor=colors.white, alignment=TA_CENTER)
    tbl_cell = ParagraphStyle('TCell', fontName='Tahoma', fontSize=8, leading=11, textColor=colors.HexColor('#1e293b'))
    tbl_cell_center = ParagraphStyle('TCellC', fontName='Tahoma', fontSize=8, leading=11, textColor=colors.HexColor('#1e293b'), alignment=TA_CENTER)
    tbl_cell_bold = ParagraphStyle('TCellB', fontName='Tahoma-Bold', fontSize=8, leading=11, textColor=colors.HexColor('#047857'))

    elements = []

    barcode = _xml_escape(str(info.get("barcode") or "-").strip().upper())
    receiver = _xml_escape(str(info.get("receiver_name") or "-").strip())
    inv_no = _xml_escape(str(info.get("inv_no") or "").strip())
    rel = _xml_escape(str(info.get("relationship") or "ผู้รับรับเอง").strip())
    officer = _xml_escape(str(info.get("delivery_officer") or "-").strip())
    latest_dt = _xml_escape(str(info.get("latest_datetime") or "").strip())
    latest_loc = _xml_escape(str(info.get("latest_location") or "").strip())
    events = info.get("events") or []

    if events and not latest_dt:
        latest_dt = _xml_escape(str(events[-1].get("datetime") or ""))
    if events and not latest_loc:
        latest_loc = _xml_escape(str(events[-1].get("location") or ""))

    # 1. Header Title
    t_text = apply_thai_pua("บันทึกประวัติสถานะและการนำส่งพัสดุ (e-Parcel Tracking & Delivery Report)")
    sub_text = apply_thai_pua("เอกสารแนบท้ายใบตอบรับอิเล็กทรอนิกส์ (e-AR Confirmation) • ระบบไปรษณีย์ไทย")
    elements.append(Paragraph(t_text, title_style))
    elements.append(Paragraph(sub_text, sub_style))
    elements.append(Spacer(1, 0.35 * cm))

    # 2. Summary Box Table
    summary_data = [
        [
            Paragraph(apply_thai_pua("<b>หมายเลขพัสดุ (Barcode):</b>"), label_style),
            Paragraph(f"<b>{barcode}</b>", ParagraphStyle('MonoB', fontName='Tahoma-Bold', fontSize=10.5, textColor=colors.HexColor('#0284c7'))),
            Paragraph(apply_thai_pua("<b>สถานะการนำส่ง:</b>"), label_style),
            Paragraph(apply_thai_pua("<font color='#059669'><b>● นำจ่ายสำเร็จ (Delivered)</b></font>"), label_style)
        ],
        [
            Paragraph(apply_thai_pua("<b>วันและเวลาที่นำส่ง:</b>"), label_style),
            Paragraph(latest_dt or "-", val_style),
            Paragraph(apply_thai_pua("<b>ที่ทำการปลายทาง:</b>"), label_style),
            Paragraph(apply_thai_pua(latest_loc or "-"), val_style)
        ],
        [
            Paragraph(apply_thai_pua("<b>ผู้รับตามจ่าหน้า:</b>"), label_style),
            Paragraph(apply_thai_pua(receiver + (f" ({inv_no})" if inv_no else "") if receiver != "-" else "-"), val_style),
            Paragraph(apply_thai_pua("<b>ผู้รับจริง / ความสัมพันธ์:</b>"), label_style),
            Paragraph(apply_thai_pua(f"<font color='#059669'><b>{rel}</b></font>"), val_style)
        ],
        [
            Paragraph(apply_thai_pua("<b>พนักงานนำจ่าย (จนท.):</b>"), label_style),
            Paragraph(apply_thai_pua(officer), val_style),
            Paragraph(apply_thai_pua("<b>จำนวนจุดเช็กพอยต์:</b>"), label_style),
            Paragraph(apply_thai_pua(f"{len(events)} เหตุการณ์"), val_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[3.7 * cm, 4.9 * cm, 3.7 * cm, 4.9 * cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.4 * cm))

    # 3. Stepper Timeline Table
    t_header = [
        Paragraph(apply_thai_pua("ลำดับ"), tbl_hdr),
        Paragraph(apply_thai_pua("วันและเวลา"), tbl_hdr),
        Paragraph(apply_thai_pua("สถานที่ / ที่ทำการ"), tbl_hdr),
        Paragraph(apply_thai_pua("ขั้นตอนและสถานะการนำส่ง"), tbl_hdr),
        Paragraph(apply_thai_pua("ป้ายขั้นตอน"), tbl_hdr)
    ]
    table_rows = [t_header]

    for idx, ev in enumerate(events):
        is_last = (idx == len(events) - 1)
        seq_label = f"{idx + 1} ✓" if is_last else str(idx + 1)
        dt = _xml_escape(str(ev.get("datetime") or "-").strip())
        loc = _xml_escape(str(ev.get("location") or "-").strip())
        desc = _xml_escape(str(ev.get("status_description") or "-").strip())

        badge_text, badge_color = classify_step_for_pdf(ev, is_last)

        r_style = tbl_cell_bold if is_last else tbl_cell
        badge_html = f"<font color='{badge_color}'><b>[{badge_text}]</b></font>"

        table_rows.append([
            Paragraph(seq_label, tbl_cell_center),
            Paragraph(dt, tbl_cell_center),
            Paragraph(apply_thai_pua(loc), tbl_cell),
            Paragraph(apply_thai_pua(desc), r_style),
            Paragraph(apply_thai_pua(badge_html), tbl_cell_center)
        ])

    timeline_table = Table(table_rows, colWidths=[1.3 * cm, 3.3 * cm, 3.6 * cm, 5.5 * cm, 3.5 * cm])
    timeline_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f766e')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#0f766e')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2 if len(table_rows) > 2 else -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ecfdf5')),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(timeline_table)
    elements.append(Spacer(1, 0.4 * cm))

    # 4. Proof of Delivery / e-AR Box
    sig_img_elem = None
    sig_b64 = info.get("signature_image") or ""
    if sig_b64 and len(sig_b64) > 100:
        try:
            clean_b64 = sig_b64.split(",")[-1] if "," in sig_b64 else sig_b64
            img_bytes = base64.b64decode(clean_b64)
            im = PILImage.open(io.BytesIO(img_bytes))
            im_buf = io.BytesIO()
            im.save(im_buf, format="PNG")
            im_buf.seek(0)
            sig_img_elem = RLImage(im_buf, width=4.5 * cm, height=2.2 * cm)
        except Exception:
            sig_img_elem = None

    if not sig_img_elem:
        sig_img_elem = Paragraph(apply_thai_pua("<font color='#059669'><b>[ มีการลงนามอิเล็กทรอนิกส์ในระบบ e-AR ]</b></font><br/><font color='#64748b' size='7'>บันทึกผ่านเครื่อง Handheld จนท.นำจ่าย</font>"), tbl_cell_center)

    ear_box_data = [
        [
            Paragraph(apply_thai_pua("<b>หลักฐานการลงนามรับพัสดุ (ระบบ e-AR)</b>"), ParagraphStyle('EarH', fontName='Tahoma-Bold', fontSize=9.5, textColor=colors.HexColor('#065f46'))),
            Paragraph(apply_thai_pua("<b>บันทึกจากระบบ e-AR ไปรษณีย์ไทย</b>"), ParagraphStyle('EarSub', fontName='Tahoma', fontSize=8, textColor=colors.HexColor('#64748b'), alignment=TA_RIGHT))
        ],
        [
            Paragraph(apply_thai_pua(f"""
            <b>ผู้รับจริง:</b> <font color='#047857'><b>{rel}</b></font><br/>
            <b>เจ้าหน้าที่นำจ่าย:</b> {officer}<br/>
            <b>วันและเวลาลงนาม:</b> {latest_dt or '-'}<br/>
            <b>ประเภทการนำส่ง:</b> ลงนามผ่านเครื่องพกพา (Handheld) เจ้าหน้าที่ไปรษณีย์
            """), ParagraphStyle('EarD', fontName='Tahoma', fontSize=8.5, leading=13.5, textColor=colors.HexColor('#1e293b'))),
            sig_img_elem
        ]
    ]
    ear_table = Table(ear_box_data, colWidths=[11.2 * cm, 6.0 * cm])
    ear_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdf4')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#10b981')),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#a7f3d0')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(ear_table)

    doc.build(elements)
    return buffer.getvalue()


def _combine_ear_and_tracking_pdf(ear_pdf_bytes, info):
    """
    Takes original 1-page e-AR PDF (Page 1) and merges with Page 2 (Tracking report).
    Stamps proper Thai footers on both pages.
    """
    import fitz

    merged_doc = fitz.open(stream=ear_pdf_bytes, filetype="pdf")
    page2_bytes = _build_tracking_page2_pdf(info)
    p2_doc = fitz.open(stream=page2_bytes, filetype="pdf")
    merged_doc.insert_pdf(p2_doc)

    font_path = os.path.join(os.path.dirname(__file__), "fonts", "tahoma.ttf")
    tahoma_font = None
    if os.path.exists(font_path):
        try:
            tahoma_font = fitz.Font(fontfile=font_path)
        except Exception:
            pass

    downloaded_str = (info.get("downloaded_at") or "").strip()
    if not downloaded_str:
        from datetime import timezone, timedelta
        tz_th = timezone(timedelta(hours=7))
        now_th = datetime.now(tz_th)
        year_be = now_th.year + 543
        downloaded_str = f"{now_th.day:02d}/{now_th.month:02d}/{year_be} {now_th.strftime('%H:%M:%S')} น."

    total_pages = len(merged_doc)
    for pno in range(total_pages):
        p = merged_doc[pno]
        pw = p.rect.width
        ph = p.rect.height
        y_pos = ph - 10 if ph > 100 else 832

        footer_left = f"ดาวน์โหลดเมื่อ: {downloaded_str}"
        footer_right = f"หน้า {pno + 1} จาก {total_pages}"
        if pno == 1:
            footer_right = f"หน้า 2 จาก 2 (ประวัติสถานะพัสดุแนบท้าย e-AR)"

        try:
            _render_thai_footer(p, (20, y_pos), footer_left, tahoma_font, fontsize=7.5, color=(0.42, 0.42, 0.42))
            _render_thai_footer(p, (pw - 200 if pno == 1 else pw - 85, y_pos), footer_right, tahoma_font, fontsize=7.5, color=(0.42, 0.42, 0.42))
        except Exception as ex:
            print(f"[combine-ear] Error stamping footer on page {pno + 1}: {ex}")

    return merged_doc.tobytes()


@app.post("/api/reports/parse-ear-pdf")
async def parse_ear_pdf(request: Request):
    """
    Parses e-AR PDF bytes provided by the client (bypassing foreign edge geoblocking).
    Extracts signature image, relationship, delivery officer, and delivery status.
    """
    try:
        pdf_bytes = await request.body()
        if not pdf_bytes or len(pdf_bytes) < 300:
            return JSONResponse(status_code=400, content={"success": False, "error": "Invalid PDF data"})

        data = _parse_ear_pdf_content(pdf_bytes)
        return {"success": True, "data": data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


def _render_thai_footer(page, pos, text, tahoma_font, fontsize=8.0, color=(0.42, 0.42, 0.42)):
    """
    Renders Thai text accurately with PyMuPDF TextWriter.
    Corrects vertical tone mark positioning (่ ้ ๊ ๋ ์) when following upper vowels
    (ิ ี ึ ื ั ํ) by lifting the tone mark to Level 3, preventing it from being
    submerged or obscured by the vowel glyph.
    Falls back to simple insert_text if custom font object is unavailable.
    """
    if not tahoma_font:
        try:
            page.insert_text(pos, text, fontname="helv", fontsize=fontsize, color=color)
        except Exception:
            pass
        return

    import unicodedata
    import fitz
    norm_text = unicodedata.normalize('NFC', text)
    UPPER_VOWELS = {'\u0e31', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e4d'}
    TONE_MARKS = {'\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c'}

    try:
        tw = fitz.TextWriter(page.rect)
        x0, y0 = pos
        curr_x = x0
        prev_char = ''
        lift_y = fontsize * 0.28

        for c in norm_text:
            if c in TONE_MARKS and prev_char in UPPER_VOWELS:
                tw.append((curr_x, y0 - lift_y), c, font=tahoma_font, fontsize=fontsize)
            else:
                tw.append((curr_x, y0), c, font=tahoma_font, fontsize=fontsize)
                lengths = tahoma_font.char_lengths(c, fontsize)
                w = lengths[0] if lengths else fontsize * 0.5
                curr_x += w
            prev_char = c

        tw.write_text(page, color=color)
    except Exception as e:
        print(f"[_render_thai_footer] error: {e}")
        try:
            page.insert_text(pos, text, fontname="helv", fontsize=fontsize, color=color)
        except Exception:
            pass


@app.post("/api/reports/batch-ear-pdf")
async def batch_ear_pdf(req: BatchEarPdfRequest):
    """
    Combines or archives official e-AR PDFs for multiple delivered parcels.
    Supports 'pdf' (Merged Multi-Page PDF) or 'zip' (Archive of individual PDFs).
    Accepts client_blobs to bypass foreign cloud edge geoblocking.
    """
    barcodes = [str(b).strip().upper() for b in req.barcodes if str(b).strip()]
    
    pdf_map = {}  # barcode -> {"bytes": bytes, "receiver": str, "inv_no": str}

    # 1. Process client-provided blobs (from domestic Thai browser / extension)
    for item in (req.client_blobs or []):
        bcode = str(item.get("barcode") or "").strip().upper()
        b64 = item.get("base64") or item.get("pdfBase64") or ""
        receiver = str(item.get("receiver") or "").strip()
        inv_no = str(item.get("inv_no") or "").strip()
        if bcode and b64:
            try:
                import base64
                pdf_bytes = base64.b64decode(b64)
                if len(pdf_bytes) > 500:
                    pdf_map[bcode] = {
                        "bytes": pdf_bytes,
                        "receiver": receiver,
                        "inv_no": inv_no
                    }
            except Exception as e:
                print(f"[batch-ear-pdf] Error decoding client blob for {bcode}: {e}")

    # 2. For remaining barcodes, attempt server-side fetch (fallback)
    remaining = [b for b in barcodes if b not in pdf_map]
    if remaining:
        import requests
        url = "https://e-ar.thailandpost.com/ear-api/print/e-ar"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Origin": "https://e-ar.thailandpost.com",
            "Referer": "https://e-ar.thailandpost.com/ear"
        }
        fetch_errors = []
        for b in remaining:
            try:
                r = requests.post(url, json=[b], headers=headers, timeout=10, verify=False)
                if r.status_code == 200 and len(r.content) > 500 and "application/pdf" in r.headers.get("Content-Type", ""):
                    pdf_map[b] = {
                        "bytes": r.content,
                        "receiver": "",
                        "inv_no": ""
                    }
                else:
                    fetch_errors.append(f"{b}: status {r.status_code}, len {len(r.content)}, ct {r.headers.get('Content-Type')}, text: {r.text[:100]}")
            except Exception as ex:
                fetch_errors.append(f"{b}: ex {ex}")

    if not pdf_map:
        err_msg = "ไม่พบข้อมูลใบตอบรับ e-AR จากไปรษณีย์ไทยสำหรับรายการที่เลือก"
        if fetch_errors:
            err_msg += f" (Debug: {'; '.join(fetch_errors[:3])})"
        raise HTTPException(
            status_code=404,
            detail=err_msg
        )

    # Ordered list of barcodes to include
    ordered_barcodes = [b for b in barcodes if b in pdf_map]
    if not ordered_barcodes:
        ordered_barcodes = list(pdf_map.keys())

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Format A: Combined Multi-Page PDF (Up to 3 items per A4 page layout)
    if (req.format or "pdf").lower() == "pdf":
        import fitz
        merged_doc = fitz.open()

        PAGE_WIDTH = 595.28
        PAGE_HEIGHT = 841.89
        SLOT_HEIGHT = PAGE_HEIGHT / 3.0  # ~280.63 pt

        valid_sub_docs = []
        for bcode in ordered_barcodes:
            item = pdf_map.get(bcode)
            if item and item.get("bytes"):
                try:
                    sub_doc = fitz.open(stream=item["bytes"], filetype="pdf")
                    if len(sub_doc) > 0:
                        valid_sub_docs.append((bcode, sub_doc))
                except Exception as ex:
                    print(f"[batch-ear-pdf] Error opening PDF for {bcode}: {ex}")

        target_page = None
        for idx, (bcode, sub_doc) in enumerate(valid_sub_docs):
            slot = idx % 3
            if slot == 0:
                target_page = merged_doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)

            try:
                src_page = sub_doc[0]
                src_slot_h = src_page.rect.height / 3.0
                clip_box = fitz.Rect(0, 0, src_page.rect.width, src_slot_h)
                slot_rect = fitz.Rect(0, slot * SLOT_HEIGHT, PAGE_WIDTH, (slot + 1) * SLOT_HEIGHT)

                target_page.show_pdf_page(slot_rect, sub_doc, 0, clip=clip_box)
            except Exception as ex:
                print(f"[batch-ear-pdf] Error placing PDF page for {bcode}: {ex}")

            # Draw subtle dashed cutting guide line between slots
            if slot > 0 and target_page:
                y = slot * SLOT_HEIGHT
                p1 = fitz.Point(15, y)
                p2 = fitz.Point(PAGE_WIDTH - 15, y)
                target_page.draw_line(p1, p2, color=(0.78, 0.78, 0.78), dashes="[3 5] 0", width=0.75)

        # Fallback if none placed yet
        if len(merged_doc) == 0:
            for bcode, item in pdf_map.items():
                try:
                    sub_doc = fitz.open(stream=item["bytes"], filetype="pdf")
                    merged_doc.insert_pdf(sub_doc)
                except Exception:
                    pass

        # Add footer to every page: Download Date/Time and Page number
        downloaded_str = (req.downloaded_at or "").strip()
        if not downloaded_str:
            from datetime import timezone, timedelta
            tz_th = timezone(timedelta(hours=7))
            now_th = datetime.now(tz_th)
            year_be = now_th.year + 543
            downloaded_str = f"{now_th.day:02d}/{now_th.month:02d}/{year_be} {now_th.strftime('%H:%M:%S')} น."

        font_path = os.path.join(os.path.dirname(__file__), "fonts", "tahoma.ttf")
        tahoma_font = None
        if os.path.exists(font_path):
            try:
                tahoma_font = fitz.Font(fontfile=font_path)
            except Exception as fe:
                print(f"[batch-ear-pdf] Error loading tahoma font: {fe}")

        total_pages = len(merged_doc)

        for pno in range(total_pages):
            p = merged_doc[pno]
            footer_left = f"ดาวน์โหลดเมื่อ: {downloaded_str}"
            footer_right = f"หน้า {pno + 1} จาก {total_pages}"

            try:
                _render_thai_footer(p, (20, 832), footer_left, tahoma_font, fontsize=8.0, color=(0.42, 0.42, 0.42))
                _render_thai_footer(p, (PAGE_WIDTH - 85, 832), footer_right, tahoma_font, fontsize=8.0, color=(0.42, 0.42, 0.42))
            except Exception as ex:
                print(f"[batch-ear-pdf] Error inserting footer on page {pno + 1}: {ex}")

        out_bytes = merged_doc.tobytes()
        filename = f"e-AR_Delivered_Combined_{timestamp}.pdf"
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Total-Count": str(len(valid_sub_docs or ordered_barcodes))
            }
        )

    # Format B: ZIP Archive containing individual PDF files
    import zipfile
    downloaded_str = (req.downloaded_at or "").strip()
    if not downloaded_str:
        from datetime import timezone, timedelta
        tz_th = timezone(timedelta(hours=7))
        now_th = datetime.now(tz_th)
        year_be = now_th.year + 543
        downloaded_str = f"{now_th.day:02d}/{now_th.month:02d}/{year_be} {now_th.strftime('%H:%M:%S')} น."

    font_path = os.path.join(os.path.dirname(__file__), "fonts", "tahoma.ttf")
    tahoma_font = None
    if os.path.exists(font_path):
        try:
            tahoma_font = fitz.Font(fontfile=font_path)
        except Exception as fe:
            print(f"[batch-ear-pdf] Error loading tahoma font for ZIP: {fe}")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, bcode in enumerate(ordered_barcodes, 1):
            item = pdf_map.get(bcode)
            if not item:
                continue

            raw_pdf_bytes = item["bytes"]
            try:
                import fitz
                ind_doc = fitz.open(stream=raw_pdf_bytes, filetype="pdf")
                if len(ind_doc) > 0:
                    p = ind_doc[0]
                    pw = p.rect.width
                    ph = p.rect.height
                    y_pos = ph - 10 if ph > 100 else 832
                    _render_thai_footer(p, (20, y_pos), f"ดาวน์โหลดเมื่อ: {downloaded_str}", tahoma_font, fontsize=8.0, color=(0.42, 0.42, 0.42))
                    _render_thai_footer(p, (pw - 85, y_pos), "หน้า 1 จาก 1", tahoma_font, fontsize=8.0, color=(0.42, 0.42, 0.42))
                    raw_pdf_bytes = ind_doc.tobytes()
            except Exception as ex:
                print(f"[batch-ear-pdf] Error stamping footer on ZIP item {bcode}: {ex}")

            rec_clean = "".join(c for c in item.get("receiver", "") if c.isalnum() or c in (" ", "-", "_")).strip()
            if rec_clean:
                fname = f"{idx:02d}_e-AR_{bcode}_{rec_clean[:25]}.pdf"
            else:
                fname = f"{idx:02d}_e-AR_{bcode}.pdf"
            zf.writestr(fname, raw_pdf_bytes)

    zip_bytes = zip_buffer.getvalue()
    filename = f"e-AR_Delivered_Archive_{timestamp}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Total-Count": str(len(ordered_barcodes))
        }
    )


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
        "api_notice": (api_error if not is_demo_user else None) if (api_error and not re.search(r"no\s*receive\s*product|no\s*data", str(api_error), re.IGNORECASE)) else None,
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
                            "status_description_raw": latest.get("status_description", ""),
                            "signature": latest.get("signature", "")
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
                "status_description_raw": latest.get("status_description", ""),
                "signature": latest.get("signature", "")
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
                        latest = events[-1] if events else {}
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
        "api_notice": (api_error if not is_demo_user else None) if (api_error and not re.search(r"no\s*receive\s*product|no\s*data", str(api_error), re.IGNORECASE)) else None,
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
        if r.status_code in (200, 201, 202):
            return {"success": True, "valid": True, "message": "ตรวจสอบ Username และ Password ถูกต้อง"}
        elif r.status_code == 401:
            return {"success": True, "valid": False, "message": "Username หรือ Password ไม่ถูกต้อง"}
        elif r.status_code == 403:
            return {"success": False, "valid": False, "message": "ระบบไปรษณีย์ปฏิเสธการเชื่อมต่อ (403) กรุณาตรวจสอบสิทธิ์การใช้งาน API"}
        else:
            return {"success": False, "valid": False, "message": f"ไม่สามารถตรวจสอบได้ ระบบไปรษณีย์ตอบสถานะ {r.status_code}: {r.text[:200]}"}
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

@app.post("/api/admin/export-users-excel")
async def export_users_excel(request: Request):
    """
    Exports all system users into a beautifully formatted Excel (.xlsx) file with openpyxl.
    """
    try:
        body = await request.json()
        users = body.get("users", [])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {str(e)}")

    if not users:
        raise HTTPException(status_code=400, detail="No user records provided")

    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "C2DPost_Users"

    # Header definitions: (label, width, alignment)
    columns = [
        ("ลำดับ", 8, "center"),
        ("ชื่อผู้ใช้ (UserName)", 22, "center"),
        ("รหัสผ่าน (Password)", 18, "center"),
        ("อีเมล (Email)", 28, "left"),
        ("คำนำหน้ารหัส (Prefix)", 16, "center"),
        ("หน่วยงาน (Organization)", 38, "left"),
        ("ไปรษณีย์รับผิดชอบ", 26, "left"),
        ("รหัสไปรษณีย์", 14, "center"),
        ("วันที่เปิดใช้งาน", 18, "center"),
        ("ผู้ประสานงาน 1", 24, "left"),
        ("เบอร์โทรศัพท์ 1", 18, "center"),
        ("ผู้ประสานงาน 2", 24, "left"),
        ("เบอร์โทรศัพท์ 2", 18, "center"),
        ("ผู้ประสานงาน 3", 24, "left"),
        ("เบอร์โทรศัพท์ 3", 18, "center"),
        ("สถานะ (Status)", 14, "center"),
        ("ประเภทบาร์โค้ด", 16, "center"),
    ]

    header_fill = PatternFill(start_color="064E3B", end_color="064E3B", fill_type="solid")
    header_font = Font(name="Sarabun", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Sarabun", size=10)
    thin_border_side = Side(style='thin', color="CBD5E1")
    cell_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    # Title row in Row 1
    ws.merge_cells("A1:Q1")
    title_cell = ws["A1"]
    title_cell.value = f"รายชื่อบัญชีผู้ใช้งานระบบ C2DPost Web Edition — ส่วน ทข.ปข.10 (ส่งออก ณ วันที่ {datetime.now().strftime('%d/%m/%Y %H:%M:%S')})"
    title_cell.font = Font(name="Sarabun", size=13, bold=True, color="064E3B")
    title_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 28

    # Blank row 2
    ws.row_dimensions[2].height = 6

    # Table Headers in Row 3
    for col_idx, (header_text, _, _) in enumerate(columns, 1):
        cell = ws.cell(row=3, column=col_idx, value=header_text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = cell_border
    ws.row_dimensions[3].height = 26

    # Data Rows starting from Row 4
    for row_idx, user in enumerate(users, 4):
        seq_no = user.get("NO") or (row_idx - 3)
        row_values = [
            seq_no,
            str(user.get("UserName", "") or "").strip(),
            str(user.get("Password", "") or "").strip(),
            str(user.get("Email", "") or "").strip(),
            str(user.get("Prefix", "") or "").strip(),
            str(user.get("Organization", "") or "").strip(),
            str(user.get("ResponsiblePostoffice", "") or "").strip(),
            str(user.get("ResponsibleZipcode", "") or "").strip(),
            str(user.get("ActivationDate", "") or "").strip(),
            str(user.get("ContactPerson1", "") or "").strip(),
            str(user.get("TelContactPerson1", "") or "").strip(),
            str(user.get("ContactPerson2", "") or "").strip(),
            str(user.get("TelContactPerson2", "") or "").strip(),
            str(user.get("ContactPerson3", "") or "").strip(),
            str(user.get("TelContactPerson3", "") or "").strip(),
            str(user.get("Status", "") or "").strip(),
            str(user.get("TypeBarcode", "") or "").strip(),
        ]
        is_even = (row_idx % 2 == 0)
        for col_idx, val in enumerate(row_values, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = cell_border
            align_mode = columns[col_idx - 1][2]
            cell.alignment = Alignment(horizontal=align_mode, vertical="center")
            # Preserve leading zero numbers as text format
            if col_idx in (2, 3, 5, 8, 11, 13, 15):
                cell.number_format = '@'
            if is_even:
                cell.fill = alt_fill
        ws.row_dimensions[row_idx].height = 22

    # Auto Column Widths
    for col_idx, (_, width, _) in enumerate(columns, 1):
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"C2DPost_Users_{timestamp}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

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
        for idx, uploaded_file in enumerate(files):
            original_name = uploaded_file.filename or "upload.pdf"
            safe_name = os.path.basename(original_name.replace("\\", "/"))
            if not safe_name.lower().endswith(".pdf"):
                continue

            temp_file_path = os.path.join(temp_dir, f"up_{idx}_{safe_name}")
            try:
                content = await uploaded_file.read()
                with open(temp_file_path, "wb") as f:
                    f.write(content)
                    
                records = process_pdf(temp_file_path)
                for rec in records:
                    rec["SOURCE_FILE"] = original_name
                all_records.extend(records)
            except Exception as e:
                error_files.append({"filename": original_name, "error": str(e)})
                
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
