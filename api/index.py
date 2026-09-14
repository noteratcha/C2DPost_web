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
from fastapi.responses import StreamingResponse, JSONResponse
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
    date: str  # Format: "DD/MM/YYYY"
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
        dt = str(ev_dict.get("createdDate") or ev_dict.get("created_date")
                 or ev_dict.get("date") or ev_dict.get("datetime") or ev_dict.get("eventDate") or "").strip()
        loc = str(ev_dict.get("postcodeName") or ev_dict.get("location") or ev_dict.get("officeName")
                  or ev_dict.get("postoffice") or "").strip()
        sig = str(ev_dict.get("signature") or ev_dict.get("employee") or "").strip()

        events.append({
            "seq": i + 1,
            "status": status,
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

def _build_demo_tracking(barcode, clean_date="14/09/2026"):
    return [
        {
            "seq": 1,
            "status": "001",
            "status_description": "รับฝากเข้าระบบแล้ว",
            "datetime": f"{clean_date} 11:24:50",
            "location": "ปณ.เรณูนคร",
            "signature": "เจ้าหน้าที่รับฝาก"
        },
        {
            "seq": 2,
            "status": "002",
            "status_description": "อยู่ระหว่างนำส่งไปยังปลายทาง",
            "datetime": f"{clean_date} 13:05:12",
            "location": "ศูนย์คัดแยกนครพนม",
            "signature": "ระบบอัตโนมัติ"
        },
        {
            "seq": 3,
            "status": "003",
            "status_description": "ถึงที่ทำการไปรษณีย์ปลายทาง",
            "datetime": f"{clean_date} 15:40:33",
            "location": "ปณ.เมืองนครพนม",
            "signature": "ระบบอัตโนมัติ"
        }
    ]

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

@app.post("/api/reports/received")
def get_received_report(req: ReceivedReportRequest):
    """
    Fetches daily deposit report from Thailand Post e-Parcel API (getAllOrderReceived).
    Accepts date in DD/MM/YYYY format and user credentials.
    """
    import re
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
        
    username = (req.username or "").strip()
    password = (req.password or "").strip()

    # Check for demo mode / mock fallback
    is_demo_user = username.lower() in ("admin", "renu_officer", "demo", "usertest", "")
    
    raw_data = None
    api_error = None
    
    if username and password and not is_demo_user:
        try:
            url = f"https://r_dservice.thailandpost.com/webservice/getAllOrderReceived?date={clean_date}"
            headers = {"Content-Type": "application/json"}
            response = requests.get(
                url,
                headers=headers,
                auth=HTTPBasicAuth(username, password),
                timeout=25,
                verify=False
            )
            
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
                    resp_json = response.json()
                    if isinstance(resp_json, list):
                        raw_data = resp_json
                    elif isinstance(resp_json, dict) and "data" in resp_json and isinstance(resp_json["data"], list):
                        raw_data = resp_json["data"]
                    else:
                        raw_data = []
                except Exception:
                    raw_data = []
            else:
                api_error = f"API ตอบกลับสถานะ {response.status_code}: {response.text[:200]}"
        except Exception as e:
            api_error = f"การเชื่อมต่อไปยังระบบ e-Parcel ล้มเหลว: {str(e)}"

    # If live API wasn't called or failed for demo account, generate realistic demo data
    if raw_data is None:
        if is_demo_user or api_error:
            raw_data = [
                {
                    "barcode": "EF193867005TH",
                    "invNo": "นพ0020.05/889",
                    "customerName": "นายสมชาย มั่งคั่ง",
                    "customerAddress": "123 หมู่ 4 ต.เรณู",
                    "customerAmphur": "เรณูนคร",
                    "customerProvince": "นครพนม",
                    "customerZipcode": "48170",
                    "productWeight": 85.0,
                    "emsPrice": 42.0,
                    "servicePrice": 0.0,
                    "insurancePrice": 0.0,
                    "status": "1",
                    "statusDescription": "รับฝากเข้าระบบแล้ว",
                    "createdDate": f"{clean_date} 09:30:15",
                    "receivedDate": f"{clean_date} 11:24:50",
                    "postcodeName": "ปณ.เรณูนคร",
                    "signature": "เจ้าหน้าที่รับฝาก"
                },
                {
                    "barcode": "EF193867014TH",
                    "invNo": "นพ0020.05/890",
                    "customerName": "นางสมศรี ศรีมงคล",
                    "customerAddress": "45/1 หมู่ 2 ต.โพนทอง",
                    "customerAmphur": "เรณูนคร",
                    "customerProvince": "นครพนม",
                    "customerZipcode": "48170",
                    "productWeight": 120.0,
                    "emsPrice": 52.0,
                    "servicePrice": 0.0,
                    "insurancePrice": 0.0,
                    "status": "1",
                    "statusDescription": "รับฝากเข้าระบบแล้ว",
                    "createdDate": f"{clean_date} 09:32:00",
                    "receivedDate": f"{clean_date} 11:25:12",
                    "postcodeName": "ปณ.เรณูนคร",
                    "signature": "เจ้าหน้าที่รับฝาก"
                },
                {
                    "barcode": "EF193867028TH",
                    "invNo": "นพ0020.05/891",
                    "customerName": "นายประเสริฐ ชัยชนะ",
                    "customerAddress": "88 หมู่ 6 ต.ท่าลาด",
                    "customerAmphur": "เรณูนคร",
                    "customerProvince": "นครพนม",
                    "customerZipcode": "48170",
                    "productWeight": 95.0,
                    "emsPrice": 42.0,
                    "servicePrice": 0.0,
                    "insurancePrice": 0.0,
                    "status": "1",
                    "statusDescription": "รับฝากเข้าระบบแล้ว",
                    "createdDate": f"{clean_date} 09:35:40",
                    "receivedDate": f"{clean_date} 11:26:05",
                    "postcodeName": "ปณ.เรณูนคร",
                    "signature": "เจ้าหน้าที่รับฝาก"
                }
            ]
        else:
            raw_data = []

    # Data Normalization
    normalized_records = []
    total_weight = 0.0
    total_fee = 0.0

    for i, item in enumerate(raw_data):
        weight = float(item.get("productWeight") or item.get("weight") or 0.0)
        ems_price = float(item.get("emsPrice") or item.get("ems_price") or 0.0)
        svc_price = float(item.get("servicePrice") or item.get("service_price") or 0.0)
        ins_price = float(item.get("insurancePrice") or item.get("insurance_price") or 0.0)
        fee = ems_price + svc_price + ins_price
        
        total_weight += weight
        total_fee += fee

        norm_item = {
            "seq": i + 1,
            "barcode": (item.get("barcode") or "").strip(),
            "inv_no": (item.get("invNo") or item.get("inv_no") or "").strip(),
            "receiver_name": (item.get("customerName") or item.get("receiver_name") or "").strip(),
            "receiver_address": (item.get("customerAddress") or item.get("receiver_address") or "").strip(),
            "receiver_amphur": (item.get("customerAmphur") or item.get("receiver_amphur") or "").strip(),
            "receiver_province": (item.get("customerProvince") or item.get("receiver_province") or "").strip(),
            "receiver_zipcode": (item.get("customerZipcode") or item.get("receiver_zipcode") or "").strip(),
            "status": str(item.get("status") or "1").strip(),
            "status_description": (item.get("statusDescription") or item.get("status_description") or "รับฝากเข้าระบบแล้ว").strip(),
            "created_date": (item.get("createdDate") or item.get("created_date") or "").strip(),
            "received_date": (item.get("receivedDate") or item.get("received_date") or "").strip(),
            "received_postoffice": (item.get("postcodeName") or item.get("received_postoffice") or "ที่ทำการไปรษณีย์").strip(),
            "weight": round(weight, 2),
            "fee": round(fee, 2),
            "signature": (item.get("signature") or "").strip()
        }
        normalized_records.append(norm_item)

    return {
        "success": True,
        "date": clean_date,
        "is_mock": is_demo_user or bool(api_error),
        "api_notice": api_error if (api_error and not is_demo_user) else None,
        "summary": {
            "total_items": len(normalized_records),
            "total_weight": round(total_weight, 2),
            "total_fee": round(total_fee, 2),
            "received_count": len(normalized_records),
            "pending_count": 0
        },
        "records": normalized_records
    }

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
    is_demo_user = username.lower() in ("admin", "renu_officer", "demo", "usertest", "")

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
            else:
                api_error = f"API ตอบกลับสถานะ {response.status_code}: {response.text[:200]}"
        except Exception as e:
            api_error = f"การเชื่อมต่อไปยังระบบ e-Parcel ล้มเหลว: {str(e)}"

    if events is None:
        if is_demo_user and not api_error:
            events = _build_demo_tracking(barcode)
        elif api_error and not username:
            events = []
        else:
            events = [] if api_error else []

    return {
        "success": True,
        "barcode": barcode,
        "is_mock": bool(is_demo_user or api_error and not is_demo_user),
        "api_notice": api_error if (api_error and not is_demo_user) else None,
        "events": events
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
    is_demo_user = username.lower() in ("admin", "renu_officer", "demo", "usertest", "")

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
        "is_mock": bool(is_demo_user or api_error and not is_demo_user),
        "api_notice": api_error if (api_error and not is_demo_user) else None,
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
                
            clean_date_file = (req.date or timestamp).replace("/", "-")
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
                
            clean_date_file = (req.date or timestamp).replace("/", "-")
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
