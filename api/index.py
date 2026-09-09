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
