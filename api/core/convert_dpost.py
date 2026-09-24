import os
import re
import glob
import hashlib
import pandas as pd
from pypdf import PdfReader, PdfWriter
import requests
import io
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128, qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4, portrait, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

current_dir = os.path.dirname(os.path.abspath(__file__))
font_dir = os.path.join(os.path.dirname(current_dir), "fonts")
tahoma_path = os.path.join(font_dir, "tahoma.ttf")
tahomabd_path = os.path.join(font_dir, "tahomabd.ttf")

if not os.path.exists(tahoma_path):
    tahoma_path = 'C:/Windows/Fonts/tahoma.ttf'
if not os.path.exists(tahomabd_path):
    tahomabd_path = 'C:/Windows/Fonts/tahomabd.ttf'

try:
    pdfmetrics.registerFont(TTFont('Tahoma', tahoma_path))
    pdfmetrics.registerFont(TTFont('Tahoma-Bold', tahomabd_path))
    FONT_REGISTERED = True
except Exception as e:
    print(f"Error registering fonts: {e}")
    FONT_REGISTERED = False

__version__ = "2026.0924.2055"

# Thailand Post API Credentials
API_KEY = "V9JN25IFH5hdZYc1k8NNRVgnLYXyQLzc"
SHOP_ID = "18488"
API_USERNAME = "noteratcha"
API_PASSWORD = "092149506"
POSTONE_API_URL = "https://postone.thailandpost.com/api/bc.php"

def calculate_check_digit(serial_str):
    """
    Calculate Check Digit using Modulus 11 for Thailand Post Barcode.
    Weights: 8, 6, 4, 2, 3, 5, 9, 7
    """
    if len(serial_str) != 8:
        return "0"
    
    weights = [8, 6, 4, 2, 3, 5, 9, 7]
    total = sum(int(digit) * weight for digit, weight in zip(serial_str, weights))
    remainder = total % 11
    
    if remainder == 0:
        return "5"
    elif remainder == 1:
        return "0"
    else:
        return str(11 - remainder)

def fetch_registered_barcodes(cnt, typ=2):
    """
    Fetch `cnt` barcodes of type `typ` from Thailand Post API.
    Returns a list of 13-character barcode strings.
    """
    import base64
    if cnt <= 0:
        return []
        
    auth_str = f"{SHOP_ID}:{API_KEY}"
    encoded_auth = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Basic {encoded_auth}"
    }
    
    try:
        response = requests.get(
            f"{POSTONE_API_URL}?typ={typ}&cnt={cnt}",
            headers=headers,
            timeout=10
        )
        # Remove UTF-8 BOM if present
        text = response.text
        if text.startswith('\ufeff'):
            text = text[len('\ufeff'):]
            
        import json
        data = json.loads(text)
        
        if data.get("STATUS") == "SUCCESS":
            prefix = data.get("PRE", "")
            begin = int(data.get("BEGIN", 0))
            end = int(data.get("END", 0))
            
            if begin > end:
                print("Error: BEGIN is greater than END")
                return []
            
            barcodes = []
            for serial in range(begin, end + 1):
                serial_str = str(serial).zfill(8)
                check_digit = calculate_check_digit(serial_str)
                # Depending on how PRE is formatted by the API. If PRE is "RETH", this puts "RE" at front and "TH" at back.
                # If PRE is just "RE", we append "TH".
                if len(prefix) >= 4:
                    full_barcode = f"{prefix[:2]}{serial_str}{check_digit}{prefix[2:4]}"
                else:
                    full_barcode = f"{prefix[:2]}{serial_str}{check_digit}TH"
                barcodes.append(full_barcode)
                
            return barcodes
        else:
            print(f"API Error: {data.get('STATUS')}")
            return []
    except Exception as e:
        print(f"Failed to fetch barcodes: {e}")
        return []

# Mapping of Thai digits to Arabic digits
THAI_TO_ARABIC = str.maketrans('๐๑๒๓๔๕๖๗๘๙', '0123456789')

def clean_thai_digits(text):
    if not text:
        return ""
    return text.translate(THAI_TO_ARABIC)

def apply_thai_pua(text):
    """
    Since Tahoma does not have MacThai PUA glyphs, tone marks placed over
    upper vowels or tall consonants will overlap in ReportLab. 
    This function injects ReportLab's Paragraph XML tags <super> 
    to manually lift the tone marks so they are visible.
    """
    if not isinstance(text, str):
        return text
        
    upper_vowels = "\u0e31\u0e34\u0e35\u0e36\u0e37\u0e4d" # ั, ิ, ี, ึ, ื, ํ
    tall_consonants = "\u0e1b\u0e1d\u0e1f\u0e2c" # ป, ฝ, ฟ, ฬ
    tone_marks = "\u0e48\u0e49\u0e4a\u0e4b\u0e4c" # ่, ้, ๊, ๋, ์
    
    res = []
    for i, char in enumerate(text):
        if char in tone_marks and i > 0 and (text[i-1] in upper_vowels or text[i-1] in tall_consonants):
            # Lift the tone mark using <super> so it sits above the upper vowel/tall consonant
            res.append(f'<super>{char}</super>')
        else:
            res.append(char)
            
    return "".join(res)

def xml_escape(value):
    """Escape characters that ReportLab Paragraph interprets as XML markup."""
    if not isinstance(value, str):
        value = str(value or "")
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def extract_tel(text):
    """Extract telephone number from text and convert to Arabic digits."""
    if not text:
        return ""
    # Find patterns like โทร. 08-xxxx-xxxx or โทร. ๐๘ xxxx xxxx
    match = re.search(r'โทร\s*\.?\s*([๐-๙0-9\-\s\.,]+)', text)
    if match:
        tel = match.group(1).strip()
        # Clean digits and remove non-numeric chars except hyphen
        tel_clean = clean_thai_digits(tel)
        tel_digits = re.sub(r'[^0-9]', '', tel_clean)
        return tel_digits
    return ""

def normalize_pdf_text(text):
    """Normalize decomposed Thai vowels and spacing from PDF text stream."""
    if not text:
        return ""
    # Normalize consonant + space + ำ (U+0E33) -> consonant + ำ
    text = re.sub(r'([ก-ฮ])\s+ำ', r'\1ำ', text)
    # Normalize decomposed Sara Am (U+0E33): consonant + space + า -> consonant + ำ
    text = re.sub(r'([ก-ฮ])\s+า', r'\1ำ', text)
    # Normalize font-specific corruptions where า was misencoded as ำ or separated
    text = text.replace('สำนักงำน', 'สำนักงาน') \
               .replace('สำขำ', 'สาขา') \
               .replace('ชำระค่ำ', 'ชำระค่า') \
               .replace('ค่ำฝำกส่ง', 'ค่าฝากส่ง') \
               .replace('ฝำกส่ง', 'ฝากส่ง') \
               .replace('รำยเดือน', 'รายเดือน') \
               .replace('ใบอนุญำต', 'ใบอนุญาต') \
               .replace('ส านักงาน', 'สำนักงาน') \
               .replace('ต าบล', 'ตำบล') \
               .replace('อ าเภอ', 'อำเภอ') \
               .replace('ช าระ', 'ชำระ') \
               .replace('ด าเนินการ', 'ดำเนินการ') \
               .replace('จ านวน', 'จำนวน') \
               .replace('ค าขอ', 'คำขอ') \
               .replace('ล าดับ', 'ลำดับ') \
               .replace('บัตรประจ าตัว', 'บัตรประจำตัว') \
               .replace('น าส่ง', 'นำส่ง')
    return text

def parse_address_components(address_text):
    """
    Parse Tambon, Amphur, Province and Zipcode from address text.
    Standard patterns:
    ตำบล/แขวง ... -> ต. ...
    อำเภอ/เขต ... -> อ. ...
    จังหวัด ... -> จ. ...
    """
    # Clean thai digits and normalize spaces
    address_text = clean_thai_digits(address_text or "")
    address_text = re.sub(r'\s+', ' ', address_text)
    
    # Extract zipcode (5 digits)
    zip_match = re.search(r'(\b[0-9]{5}\b)', address_text)
    zipcode = zip_match.group(1) if zip_match else ""
    
    # Extract Amphur (supports Thai vowels including leading vowels เ, แ, โ, ใ, ไ)
    amphur_match = re.search(r'(?:อำเภอ/เขต|อำเภอ|อ\.)\s*([\u0e00-\u0e7f]+)', address_text)
    amphur = amphur_match.group(1).strip() if amphur_match else ""
    
    # Extract Province
    province_match = re.search(r'(?:จังหวัด|จ\.)\s*([\u0e00-\u0e7f]+)', address_text)
    province = province_match.group(1).strip() if province_match else ""
    
    # Fallback for Province: if not found, look for the word immediately preceding the zipcode
    if not province and zipcode:
        prov_match = re.search(r'([\u0e00-\u0e7f]{2,})\s+' + zipcode, address_text)
        if prov_match:
            province = prov_match.group(1).strip()
            
    return amphur, province, zipcode

def parse_receiver_label(text):
    """
    Parse the receiver label block:
    เรียน <Name>
    <Address lines>
    <5-digit zipcode>
    """
    text = normalize_pdf_text(text)
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    receiver_name = ""
    address_lines = []
    zipcode = ""
    
    # Look for the index of the line starting with "เรียน"
    start_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("เรียน"):
            start_idx = i
            break
            
    if start_idx == -1:
        return None
        
    receiver_name = re.sub(r'^เรียน\s*', '', lines[start_idx]).strip()
    if not receiver_name and start_idx + 1 < len(lines):
        next_line = lines[start_idx + 1].strip()
        if not any(k in next_line for k in ['โฉนด', 'ที่ดิน', 'หน้าสำรวจ', 'ระวาง', 'คำขอ', 'ตำบล', 'อำเภอ', 'จังหวัด', 'หมู่ที่']):
            receiver_name = next_line
            start_idx += 1
    
    # Collect subsequent lines until a zipcode is found
    # IMPORTANT: Ignore lines mentioning land title deed/survey numbers (e.g. โฉนดที่ดินเลขที่ 19583)
    zip_pattern = re.compile(r'^[๐-๙0-9]{5}$')
    end_idx = -1
    
    for i in range(start_idx + 1, len(lines)):
        if any(k in lines[i] for k in ['โฉนด', 'ที่ดิน', 'หน้าสำรวจ', 'ระวาง', 'คำขอ']):
            continue
        line_clean = clean_thai_digits(lines[i])
        if zip_pattern.match(line_clean):
            zipcode = line_clean
            end_idx = i
            break
            
    if end_idx == -1:
        # If no strict 5-digit line, check if the last line contains a zipcode
        for i in range(start_idx + 1, len(lines)):
            if any(k in lines[i] for k in ['โฉนด', 'ที่ดิน', 'หน้าสำรวจ', 'ระวาง', 'คำขอ']):
                continue
            line_clean = clean_thai_digits(lines[i])
            zip_match = re.search(r'([0-9]{5})', line_clean)
            if zip_match:
                zipcode = zip_match.group(1)
                end_idx = i
                break
                
    if end_idx == -1:
        return None # Could not find valid zipcode boundary
        
    # Address lines are between start_idx+1 and end_idx (inclusive if zip was at the end of a line)
    raw_address_lines = lines[start_idx + 1 : end_idx]
    # If the end line had text before zip, append the text part
    end_line_clean = lines[end_idx]
    if len(clean_thai_digits(end_line_clean)) > 5:
        # Remove zipcode from the line
        text_before_zip = re.sub(r'[๐-๙0-9]{5}\s*$', '', end_line_clean).strip()
        if text_before_zip:
            raw_address_lines.append(text_before_zip)
            
    # Clean address lines (e.g. replace ตำบล/แขวง with ต. , อำเภอ/เขต with อ.)
    cleaned_address_lines = []
    amphur = ""
    province = ""
    
    for line in raw_address_lines:
        line_conv = clean_thai_digits(line)
        
        # Check for tambon
        t_match = re.search(r'^(?:ตำบล/แขวง|ตำบล|ต\.)\s*(.+)$', line_conv)
        if t_match:
            cleaned_address_lines.append(f"ต.{t_match.group(1).strip()}")
            continue
            
        # Check for amphur
        a_match = re.search(r'^(?:อำเภอ/เขต|อำเภอ|อ\.)\s*([\u0e00-\u0e7f]+)', line_conv)
        if a_match:
            amphur = a_match.group(1).strip()
            continue
            
        # Check for province
        p_match = re.search(r'^(?:จังหวัด|จ\.)\s*([\u0e00-\u0e7f]+)', line_conv)
        if p_match:
            province = p_match.group(1).strip()
            continue
            
        cleaned_address_lines.append(line)
        
    # Reconstruct address (excluding zipcode to cut it from receiver_address)
    receiver_address = " ".join(cleaned_address_lines)
    
    # Try to extract amphur and province if not found yet
    if not amphur or not province:
        raw_joined = " ".join(raw_address_lines) + " " + zipcode
        ext_amphur, ext_province, _ = parse_address_components(raw_joined)
        if not amphur:
            amphur = ext_amphur
        if not province:
            province = ext_province
            
    # Post-processing cleanup: Remove amphur, province, and zipcode from receiver_address if present
    if amphur:
        receiver_address = re.sub(r'(?:อำเภอ/เขต|อำเภอ|อ\.)\s*' + re.escape(amphur), '', receiver_address)
        receiver_address = re.sub(r'(?<!ต\.)(?<!ต\.\s)(?<!ตำบล\s)(?<!ตำบล)\b' + re.escape(amphur) + r'\b', '', receiver_address)
    if province:
        receiver_address = re.sub(r'(?:จังหวัด|จ\.)\s*' + re.escape(province), '', receiver_address)
        receiver_address = re.sub(r'(?<!ต\.)(?<!ต\.\s)(?<!ตำบล\s)(?<!ตำบล)\b' + re.escape(province) + r'\b', '', receiver_address)
    if zipcode:
        receiver_address = receiver_address.replace(zipcode, "")
        
    # Clean up spacing around abbreviations
    receiver_address = re.sub(r'ต\.\s+', 'ต.', receiver_address)
    receiver_address = re.sub(r'\s+', ' ', receiver_address).strip()
            
    return {
        'RECEIVER': receiver_name,
        'RECEIVER ADDRESS': receiver_address,
        'RECEIVER AMPHUR': amphur,
        'RECEIVER PROVINCE': province,
        'RECEIVER ZIPCODE': zipcode
    }

def parse_envelope_label(text):
    """
    Parse envelope pages that do not use the 'เรียน <Name>' structure,
    e.g. envelopes with 'ผู้รับ' and postage permit block.
    """
    text = normalize_pdf_text(text)
    raw_lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    has_postage = any(k in text for k in ['ชำระค่าฝากส่ง', 'ใบอนุญาตเลขที่', 'ปณ.', 'ไปรษณีย์อนุญาต', 'ค่าฝากส่งเป็น'])
    has_phu_rap = bool(re.search(r'(?:^|\n)\s*ผู้รับ|ที่[^\n]+ผู้รับ', text))
    clean_t = clean_thai_digits(text)
    has_zip = bool(re.search(r'\b[0-9]{5}\b', clean_t))
    is_envelope = has_postage or (has_phu_rap and has_zip)
    if not is_envelope:
        return None
        
    ref_no = ""
    ref_match = re.search(r'ที่\s*([ก-ฮa-zA-Z\.]+\s*[๐-๙0-9\.\/]+)', text)
    if ref_match:
        ref_raw = clean_thai_digits(ref_match.group(1)).replace(" ", "")
        ref_no = re.sub(r'ผู้รับ.*$', '', ref_raw)
        
    shipper_name = ""
    shipper_addr = ""
    for i, line in enumerate(raw_lines):
        if "สำนักงานที่ดิน" in line:
            shipper_name = line[line.find("สำนักงานที่ดิน"):]
            if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', shipper_name):
                shipper_name = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', shipper_name)[0].strip()
            if i + 1 < len(raw_lines):
                next_l = raw_lines[i+1]
                if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', next_l):
                    next_l = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', next_l)[0].strip()
                if any(c.isdigit() for c in clean_thai_digits(next_l)) and any(k in next_l for k in ['หมู่', 'ตำบล', 'ต.', 'อำเภอ', 'อ.']):
                    shipper_addr = next_l
            break

    receiver_name = ""
    amphur = ""
    province = ""
    zipcode = ""
    receiver_addr_parts = []
    
    ignored_patterns = [
        r'ชำระค่าฝากส่ง',
        r'ใบอนุญาตเลขที่',
        r'ปณ\.',
        r'ไปรษณีย์',
        r'สำนักงานที่ดิน',
        r'ฝ่ายรังวัด',
        r'ฝ่ายทะเบียน',
        r'เจ้าพนักงานที่ดิน',
        r'ช่างรังวัด',
        r'นักวิชาการที่ดิน',
        r'พนักงานเจ้าหน้าที่',
        r'หนังสือมอบเรื่อง',
        r'SMARTLANDS',
        r'คำขอของท่าน',
        r'รับเงินมัดจำ',
        r'เลขลงทะเบียน:'
    ]
    
    candidate_lines = []
    for line in raw_lines:
        if any(re.search(pat, line) for pat in ignored_patterns):
            continue
        if shipper_addr and line == shipper_addr:
            continue
        if line.startswith("ที่") and "ผู้รับ" not in line:
            continue
        candidate_lines.append(line)
        
    for line in candidate_lines:
        if line.startswith("ผู้รับ"):
            rem = re.sub(r'^ผู้รับ\s*', '', line).strip()
            if rem and not re.match(r'^[0-9\.\/]+', rem):
                receiver_name = rem
                break
                
    # 2. Search for common Thai title prefixes (including น.ส., ด.ช., ด.ญ., ยศตำรวจ/ทหาร, etc.)
    prefix_pat = r'^(?:นาย|นางสาว|นาง|น\.ส\.|น\.ส|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นายก|ว่าที่\s*(?:ร\.ต\.|ร้อยตรี)?|พันตำรวจ|ร้อยตำรวจ|พลฯ|ผู้ใหญ่บ้าน|กำนัน|ด\.ต\.|จ\.ส\.ต\.|จ\.ส\.อ\.|ร\.ต\.|ร\.ท\.|ร\.อ\.|พ\.ต\.|พ\.ท\.|พ\.อ\.|พล\.ต\.|พล\.ท\.|พล\.อ\.|นพ\.|พญ\.|ทพ\.|ทพญ\.|ผศ\.|รศ\.|ศ\.|ดร\.|พระ|พระครู|พระมหา|ม\.ร\.ว\.|ม\.ล\.)\s*[\u0e00-\u0e7f]'
    if not receiver_name:
        for line in candidate_lines:
            if re.match(prefix_pat, line):
                if not line.startswith("("):
                    receiver_name = line.strip()
                    break

    # 3. Fallback: line that looks like Thai Firstname Lastname (no numbers, no address keywords)
    if not receiver_name:
        for line in candidate_lines:
            if line.startswith("ที่") or "ผู้รับ" in line:
                continue
            clean_l = clean_thai_digits(line)
            if any(c.isdigit() for c in clean_l):
                continue
            if any(k in line for k in ['จังหวัด', 'อำเภอ', 'ตำบล', 'หมู่', 'ถนน', 'ซอย', 'จ.', 'อ.', 'ต.', 'ปณ.', 'สาขา']):
                continue
            words = line.split()
            if 1 <= len(words) <= 4 and len(line) >= 4:
                receiver_name = line.strip()
                break

    for line in candidate_lines:
        clean_l = clean_thai_digits(line)
        if re.match(r'^[0-9]{5}$', clean_l) and not zipcode:
            zipcode = clean_l
            continue
        a_m = re.search(r'(?:อำเภอ/เขต|อำเภอ|อ\.)\s*([\u0e00-\u0e7f]+)', line)
        if a_m and not amphur:
            amphur = a_m.group(1).strip()
            continue
        p_m = re.search(r'(?:จังหวัด|จ\.)\s*([\u0e00-\u0e7f]+)', line)
        if p_m and not province:
            province = p_m.group(1).strip()
            continue
        if receiver_name and (receiver_name in line or line in receiver_name):
            continue
        if "ผู้รับ" in line and ("ที่" in line or any(c.isdigit() for c in clean_l)):
            continue
        if any(k in line for k in ['หมู่', 'ตำบล', 'ต.', 'บ้าน']) or \
           re.match(r'^[0-9]+(?:\/[0-9]+)?\s+', clean_l) or \
           'ที่ทำการ' in line:
            receiver_addr_parts.append(line)

    raw_addr = " ".join(receiver_addr_parts)
    addr_clean = clean_thai_digits(raw_addr)
    addr_clean = re.sub(r'ตำบล/แขวง|ตำบล', 'ต.', addr_clean)
    if amphur:
        addr_clean = re.sub(r'(?:อำเภอ/เขต|อำเภอ|อ\.)\s*' + re.escape(amphur), '', addr_clean)
        addr_clean = re.sub(r'(?<!ต\.)(?<!ต\.\s)(?<!ตำบล\s)(?<!ตำบล)\b' + re.escape(amphur) + r'\b', '', addr_clean)
    if province:
        addr_clean = re.sub(r'(?:จังหวัด|จ\.)\s*' + re.escape(province), '', addr_clean)
        addr_clean = re.sub(r'(?<!ต\.)(?<!ต\.\s)(?<!ตำบล\s)(?<!ตำบล)\b' + re.escape(province) + r'\b', '', addr_clean)
    if zipcode:
        addr_clean = addr_clean.replace(zipcode, '')
    addr_clean = re.sub(r'ต\.\s+', 'ต.', addr_clean)
    addr_clean = re.sub(r'\s+', ' ', addr_clean).strip()
    
    if not receiver_name and not addr_clean and not zipcode:
        return None
        
    return {
        'REF NO': ref_no,
        'RECEIVER': receiver_name,
        'RECEIVER ADDRESS': addr_clean,
        'RECEIVER AMPHUR': amphur,
        'RECEIVER PROVINCE': province,
        'RECEIVER ZIPCODE': zipcode,
        'SHIPPER NAME': shipper_name,
        'SHIPPER ADDRESS': shipper_addr
    }

def parse_shipper_label(text):
    """
    Parse raw shipper info from mailing label block:
    ฝ่ายรังวัด สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร
    อำเภอเรณูนคร นครพนม ๔๘๑๗๐
    ที่ นพ๐๐๒๐.๐๕/๘๘๙
    """
    text = normalize_pdf_text(text)
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    shipper_name = ""
    shipper_address = ""
    ref_no = ""
    
    # Find the shipper line
    shipper_idx = -1
    for i, line in enumerate(lines):
        if "ฝ่ายรังวัด สำนักงานที่ดิน" in line or "สำนักงานที่ดิน" in line:
            shipper_idx = i
            break
            
    if shipper_idx != -1:
        raw_name = lines[shipper_idx]
        
        # Clean up shipper_name by dropping preceding garbage (like "Kที่ นพ...")
        if "ฝ่ายรังวัด สำนักงานที่ดิน" in raw_name:
            shipper_name = raw_name[raw_name.find("ฝ่ายรังวัด สำนักงานที่ดิน"):]
        elif "สำนักงานที่ดิน" in raw_name:
            shipper_name = raw_name[raw_name.find("สำนักงานที่ดิน"):]
        else:
            shipper_name = raw_name
            
        # Clean up right-aligned postage permit block if present in 2D layout
        if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', shipper_name):
            shipper_name = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', shipper_name)[0].strip()
            
        # Attempt to extract ref_no if it was merged into the shipper_name line
        ref_match = re.search(r'ที่\s*([ก-ฮa-zA-Z\.]+\s*[๐-๙0-9\.\/]+)', raw_name)
        if ref_match:
            ref_raw = clean_thai_digits(ref_match.group(1)).replace(" ", "")
            ref_no = re.sub(r'ผู้รับ.*$', '', ref_raw)
            
        # Collect subsequent lines as address parts until we hit reference number or other block
        addr_parts = []
        for j in range(shipper_idx + 1, min(shipper_idx + 6, len(lines))):
            line = lines[j]
            # Clean up right-aligned postage permit block if present
            if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', line):
                line = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', line)[0].strip()
            # Stop if we hit reference number, receiver, or non-address narrative block
            if (line.startswith("ที่") or line.startswith("เรียน") or line.startswith("วันที่") or 
                "ผู้ขอรังวัด" in line or "นายช่างรังวัด" in line or "ฝ่ายรังวัด" in line or "ท.ด." in line or
                "เจ้าพนักงาน" in line or line.startswith("ณ ") or "บัดนี้" in line or "จึงขอให้" in line or 
                "พนักงานเจ้าหน้าที่" in line or "ชำระค่าฝากส่ง" in line or "ใบอนุญาต" in line):
                break
            if any(k in line for k in ['โฉนด', 'ระวาง', 'หน้าสำรวจ', 'คำขอ']):
                break
            addr_parts.append(line)
            
        if addr_parts:
            raw_addr = " ".join(addr_parts)
            # Clean address
            addr_conv = clean_thai_digits(raw_addr)
            # Ensure correct formatting (e.g. อ.เรณูนคร จ.นครพนม)
            addr_conv = re.sub(r'อำเภอ/เขต|อำเภอ|อ\.', 'อ.', addr_conv)
            addr_conv = re.sub(r'จังหวัด|จ\.', 'จ.', addr_conv)
            if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', addr_conv):
                addr_conv = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', addr_conv)[0].strip()
            shipper_address = addr_conv

        # If shipper_address is empty or doesn't have a 5-digit postal code, scan lines for an address line with postal code
        clean_sa = clean_thai_digits(shipper_address)
        if not re.search(r'\b[0-9]{5}\b', clean_sa):
            for line in lines:
                if any(k in line for k in ['โฉนด', 'ระวาง', 'หน้าสำรวจ', 'คำขอ', 'ผู้รับ', 'บัดนี้', 'ในวันที่', 'พนักงานเจ้าหน้าที่', 'เจ้าพนักงาน']):
                    continue
                clean_l = clean_thai_digits(line)
                if re.search(r'\b[0-9]{5}\b', clean_l) and any(k in line for k in ['หมู่', 'ตำบล', 'ต.', 'โพนทอง', 'ถนน', 'ถ.']):
                    shipper_address = line
                    break
                
        # Look for reference number "ที่ ..." if not already found in raw_name
        if not ref_no:
            for line in lines[shipper_idx:]:
                if line.startswith("ที่"):
                    ref_m = re.search(r'ที่\s*([ก-ฮa-zA-Z\.]+\s*[๐-๙0-9\.\/]+)', line)
                    if ref_m:
                        ref_raw = clean_thai_digits(ref_m.group(1)).replace(" ", "")
                        ref_no = re.sub(r'ผู้รับ.*$', '', ref_raw)
                    else:
                        ref_no = clean_thai_digits(line.replace("ที่", "").strip())
                    break
                
    # If ref_no still empty, search entire text for "ที่ <Prov><Digits>/<Digits>"
    if not ref_no:
        ref_m = re.search(r'ที่\s*([ก-ฮa-zA-Z\.]+\s*[๐-๙0-9\.\/]+)', text)
        if ref_m:
            ref_raw = clean_thai_digits(ref_m.group(1)).replace(" ", "")
            ref_no = re.sub(r'ผู้รับ.*$', '', ref_raw)

    return {
        'SHIPPER NAME': shipper_name,
        'SHIPPER ADDRESS': shipper_address,
        'REF NO': ref_no
    }

def extract_page_text_robust(page):
    """
    Extracts both standard and layout-preserved text streams from a PDF page,
    normalizing decomposed Thai vowels and spacing.
    """
    raw_text = page.extract_text() or ""
    text = normalize_pdf_text(raw_text)
    layout_text = ""
    try:
        raw_layout = page.extract_text(extraction_mode="layout") or ""
        layout_text = normalize_pdf_text(raw_layout)
    except Exception:
        pass
    return text, layout_text

def process_pdf(pdf_path):
    print(f"กำลังประมวลผลไฟล์: {os.path.basename(pdf_path)}...") if __name__ == "__main__" else None
    reader = PdfReader(pdf_path)
    records = []
    
    # 1. Scan all pages to extract the best/most complete shipper info
    best_shipper_name = ""
    best_shipper_address = ""
    best_shipper_tel = ""
    product_in_box = ""
    
    def score_shipper_addr(a):
        if not a: return 0
        s = len(a)
        clean_a = clean_thai_digits(a)
        if re.search(r'\b[0-9]{5}\b', clean_a):
            s += 1000
        if any(k in a for k in ['หมู่', 'ตำบล', 'ต.', 'ถนน', 'ถ.', 'โพนทอง']):
            s += 500
        if any(k in a for k in ['บัดนี้', 'ในวันที่', 'พนักงานเจ้าหน้าที่', 'เจ้าพนักงาน', 'ยกเลิก']):
            s -= 2000
        return s

    for page in reader.pages:
        text, layout_text = extract_page_text_robust(page)
        for t in [text, layout_text]:
            if not t: continue
            shipper_info = parse_shipper_label(t)
            if shipper_info:
                name = shipper_info.get('SHIPPER NAME', '')
                addr = shipper_info.get('SHIPPER ADDRESS', '')
                if len(name) > len(best_shipper_name):
                    best_shipper_name = name
                if score_shipper_addr(addr) > score_shipper_addr(best_shipper_address):
                    best_shipper_address = addr
                    
            # Also check envelope shipper info if available
            env_info = parse_envelope_label(t)
            if env_info:
                env_name = env_info.get('SHIPPER NAME', '')
                env_addr = env_info.get('SHIPPER ADDRESS', '')
                if env_name and len(env_name) > len(best_shipper_name):
                    best_shipper_name = env_name
                if env_addr and score_shipper_addr(env_addr) > score_shipper_addr(best_shipper_address):
                    best_shipper_address = env_addr
                    
            tel = extract_tel(t)
            if len(tel) > len(best_shipper_tel):
                best_shipper_tel = tel
                
            # Extract form type (e.g. (ท.ด. ๓๘) -> ท.ด. 38, (ท.ด. ๓๘ ค.) -> ท.ด. 38 ค.) if not found yet
            if not product_in_box:
                form_match = re.search(r'\(\s*(ท\s*\.\s*ด\s*\.\s*[๐-๙0-9]+(?:\s*[ก-ฮ]\.?)?)\s*\)', t)
                if form_match:
                    extracted = form_match.group(1).strip()
                    # Convert Thai numbers to Arabic
                    extracted = extracted.translate(THAI_TO_ARABIC)
                    # Clean up spaces
                    product_in_box = re.sub(r'\s+', ' ', extracted)
                else:
                    # Fallback to extract from "เรื่อง ..." or specific document titles
                    # Use negative lookbehind (?<!รับ) to prevent matching "รับเรื่อง"
                    subject_match = re.search(r'(?<!รับ)เรื่อง\s+([^\n]+)', t)
                    if "หนังสือมอบเรื่องการระวังชี้แนวเขตและลงชื่อรับรองเขตที่ดิน" in t or "เรื่อง การระวังชี้แนวเขตและลงชื่อรับรองเขตที่ดิน" in t:
                        product_in_box = "-"
                    elif "แจ้งการปักหลักเขตที่ดิน" in t or "ท.ด. 38 ค" in t or "ท.ด. ๓๘ ค" in t:
                        product_in_box = "ท.ด. 38 ค."
                    elif subject_match:
                        product_in_box = subject_match.group(1).strip()
                    elif "ออกโฉนดที่ดิน" in t:
                        product_in_box = "ออกโฉนดที่ดิน"
            
    # Clean product in box prefix if present
    if product_in_box:
        product_in_box = product_in_box.replace("ขอให้ไปดำเนินการเรื่อง", "").strip()

    # 2. Post-process the shipper info based on the rules:
    if "ฝ่ายรังวัด สำนักงานที่ดิน" in best_shipper_name:
        best_shipper_name = best_shipper_name[best_shipper_name.find("ฝ่ายรังวัด สำนักงานที่ดิน"):]
    elif "สำนักงานที่ดิน" in best_shipper_name:
        best_shipper_name = best_shipper_name[best_shipper_name.find("สำนักงานที่ดิน"):]
    if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', best_shipper_name):
        best_shipper_name = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', best_shipper_name)[0].strip()
    if re.search(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', best_shipper_address):
        best_shipper_address = re.split(r'\s{3,}(?:ชำระ|ใบอนุญาต|ไปรษณีย์|ปณ\.)', best_shipper_address)[0].strip()

    # Rule 2: "ถ้าข้อมูลที่คอลัมน์ G (SHIPPER ADDRESS) ว่าง ให้ไปเอาข้อมูลวรรคสุดท้ายของ F (SHIPPER NAME) มาใส่ และลบข้อความนั้นออกจากคอลัมน์ F"
    if not best_shipper_address and best_shipper_name:
        parts = [p.strip() for p in best_shipper_name.split() if p.strip()]
        if len(parts) > 1:
            last_part = parts[-1]
            best_shipper_address = last_part
            best_shipper_name = " ".join(parts[:-1])
            
    # Extract components from shipper address
    shipper_amphur = ""
    shipper_province = ""
    shipper_zipcode = ""
    
    if best_shipper_address:
        shipper_amphur, shipper_province, shipper_zipcode = parse_address_components(best_shipper_address)
        
    # Fallback to parse Amphur and Province from SHIPPER NAME if still missing
    # E.g. "สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร"
    if (not shipper_amphur or len(shipper_amphur) <= 1) and best_shipper_name:
        branch_match = re.search(r'สาขา\s*([\u0e00-\u0e7f]+)', best_shipper_name)
        if branch_match:
            shipper_amphur = branch_match.group(1).strip()
            
    if (not shipper_province or len(shipper_province) <= 3) and best_shipper_name:
        prov_match = re.search(r'สำนักงานที่ดินจังหวัด\s*([\u0e00-\u0e7f]+)', best_shipper_name)
        if prov_match:
            shipper_province = prov_match.group(1).strip()

    # Fallback for shipper_zipcode if still empty: search pages for post office / branch zip code
    if not shipper_zipcode:
        for page in reader.pages:
            t = normalize_pdf_text(page.extract_text() or "")
            for line in t.split('\n'):
                if any(k in line for k in ['โฉนด', 'ระวาง', 'หน้าสำรวจ', 'คำขอ', 'ผู้รับ']):
                    continue
                cl = clean_thai_digits(line)
                zm = re.search(r'\b([0-9]{5})\b', cl)
                if zm and any(k in line for k in ['หมู่', 'ตำบล', 'ต.', 'ปณ.', 'โพนทอง']):
                    shipper_zipcode = zm.group(1)
                    break
            if shipper_zipcode:
                break
            
    # Rule 1: "ถ้าเอาข้อมูลบางส่วนมาระบุที่คอลัมน์ H,I,J,K (AMPHUR, PROVINCE, ZIPCODE, TEL) แล้วให้ลบข้อความนั้นออกจากคอลัมน์ G (SHIPPER ADDRESS)"
    if best_shipper_address:
        if shipper_amphur:
            best_shipper_address = re.sub(r'(?:อำเภอ/เขต|อำเภอ|อ\.)\s*' + re.escape(shipper_amphur), '', best_shipper_address)
            best_shipper_address = re.sub(r'\b' + re.escape(shipper_amphur) + r'\b', '', best_shipper_address)
        if shipper_province:
            best_shipper_address = re.sub(r'(?:จังหวัด|จ\.)\s*' + re.escape(shipper_province), '', best_shipper_address)
            best_shipper_address = re.sub(r'\b' + re.escape(shipper_province) + r'\b', '', best_shipper_address)
        if shipper_zipcode:
            best_shipper_address = best_shipper_address.replace(str(shipper_zipcode), "")
        if best_shipper_tel:
            best_shipper_address = best_shipper_address.replace(str(best_shipper_tel), "")
            
        # Clean up spaces
        best_shipper_address = re.sub(r'\s+', ' ', best_shipper_address).strip()
        
        # User requested to keep only the first word (วรรคแรก) for the address to remove document text garbage
        if best_shipper_address:
            best_shipper_address = best_shipper_address.split()[0]
        if not best_shipper_address or clean_thai_digits(best_shipper_address) == str(shipper_zipcode):
            best_shipper_address = "-"
        
    # Prepare the structured shipper dict
    final_shipper_info = {
        'SHIPPER NAME': best_shipper_name,
        'SHIPPER ADDRESS': best_shipper_address,
        'SHIPPER AMPHUR': shipper_amphur,
        'SHIPPER PROVINCE': shipper_province,
        'SHIPPER ZIPCODE': shipper_zipcode,
        'SHIPPER TEL': best_shipper_tel,
        'PRODUCT IN BOX': product_in_box
    }

    def _same_pdf_parcel(a, b):
        """True when two parsed pages refer to the SAME parcel (letter body vs envelope)."""
        a_ref = (a.get('REF NO') or '').strip()
        b_ref = (b.get('REF NO') or '').strip()
        if a_ref and b_ref:
            return a_ref == b_ref
        return (not a_ref and not b_ref) and a.get('RECEIVER') == b.get('RECEIVER')

    # 3. Process each page to associate receiver details with the best shipper info
    for i in range(len(reader.pages)):
        page = reader.pages[i]
        text, layout_text = extract_page_text_robust(page)
        
        receiver_info = None
        ref_no = ""
        
        # 1. Check standard receiver block with "เรียน" on text
        if "เรียน" in text and any(char.isdigit() or char in "๐๑๒๓๔๕๖๗๘๙" for char in text):
            receiver_info = parse_receiver_label(text)
            if receiver_info:
                page_shipper = parse_shipper_label(text)
                ref_no = page_shipper.get('REF NO', '')
                if not ref_no and i > 0:
                    prev_text = normalize_pdf_text(reader.pages[i - 1].extract_text() or "")
                    prev_shipper = parse_shipper_label(prev_text)
                    ref_no = prev_shipper.get('REF NO', '')

        # 2. Check standard receiver block on layout_text if not found or incomplete
        if (not receiver_info or not receiver_info.get('RECEIVER') or not receiver_info.get('RECEIVER ZIPCODE')) and layout_text:
            if "เรียน" in layout_text and any(char.isdigit() or char in "๐๑๒๓๔๕๖๗๘๙" for char in layout_text):
                l_rec = parse_receiver_label(layout_text)
                if l_rec and l_rec.get('RECEIVER') and l_rec.get('RECEIVER ZIPCODE'):
                    receiver_info = l_rec
                    page_shipper = parse_shipper_label(layout_text)
                    if not ref_no:
                        ref_no = page_shipper.get('REF NO', '')
                    if not ref_no and i > 0:
                        prev_text = normalize_pdf_text(reader.pages[i - 1].extract_text(extraction_mode="layout") or "")
                        prev_shipper = parse_shipper_label(prev_text)
                        ref_no = prev_shipper.get('REF NO', '')

        # 3. Check envelope label (covers envelopes with "ผู้รับ" or inverted layout)
        if not receiver_info:
            for t_candidate in [text, layout_text]:
                if not t_candidate: continue
                env_info = parse_envelope_label(t_candidate)
                if env_info and env_info.get('RECEIVER'):
                    receiver_info = {
                        'RECEIVER': env_info['RECEIVER'],
                        'RECEIVER ADDRESS': env_info['RECEIVER ADDRESS'],
                        'RECEIVER AMPHUR': env_info['RECEIVER AMPHUR'],
                        'RECEIVER PROVINCE': env_info['RECEIVER PROVINCE'],
                        'RECEIVER ZIPCODE': env_info['RECEIVER ZIPCODE']
                    }
                    if not ref_no:
                        ref_no = env_info.get('REF NO', '')
                    if not ref_no and i > 0:
                        prev_text = normalize_pdf_text(reader.pages[i - 1].extract_text() or "")
                        prev_shipper = parse_shipper_label(prev_text)
                        ref_no = prev_shipper.get('REF NO', '')
                    break

        if receiver_info and receiver_info.get('RECEIVER'):
            record = {
                **final_shipper_info,
                **receiver_info,
                'REF NO': ref_no,
                'SOURCE_FILE': pdf_path
            }
            
            # Duplicate check: combined PDFs print the SAME parcel several times (e.g. "S รวม 3 รายการ")
            # with identical page text -> each copy must become its OWN record.
            # Merge ONLY when this page is the letter/envelope counterpart of the immediately
            # previous page: adjacent pages (i-1), different text, same REF NO / receiver.
            src_sig = hashlib.md5((text or '').encode('utf-8', 'ignore')).hexdigest()
            record['_src_idx'] = i
            record['_src_sig'] = src_sig

            is_duplicate = False
            if records:
                prev = records[-1]
                if (isinstance(prev.get('_src_idx'), int)
                        and prev.get('_src_idx') == i - 1
                        and prev.get('_src_sig') != src_sig
                        and _same_pdf_parcel(prev, record)):
                    records[-1] = record  # envelope page carries the cleaner complete address
                    is_duplicate = True

            if not is_duplicate:
                records.append(record)
                
    return records

def records_to_dataframe(all_records, barcodes=None):
    num_records = len(all_records)
    if barcodes is None:
        barcodes = []
            
    # Define exact columns matching the DPost template
    columns = [
        'NO', 'COMP_ORDER_ID', 'INV_NO', 'BARCODE_NO', 'PRODUCT_IN_BOX', 
        'SHIPPER_NAME', 'SHIPPER_ADDRESS', 'SHIPPER_AMPHUR', 'SHIPPER_PROVINCE', 'SHIPPER_ZIPCODE',
        'SHIPPER_TEL', 'SHIPPER_EMAIL', 'RECEIVER', 'RECEIVER_ADDRESS', 'RECEIVER_AMPHUR',
        'RECEIVER_PROVINCE', 'RECEIVER_ZIPCODE', 'RECEIVER_TEL', 'RECEIVER_EMAIL',
        'WEIGHT', 'PRICE', 'INSURE', 'INSURE_PRICE', 'COD_DETAIL_NAME', 'COD_DETAIL_SIZE',
        'COD_DETAIL_VOLUME', 'COD_DETAIL_QTY', 'COD_DETAIL_COLOR', 'COD_DETAIL_QTY_AMOUNT',
        'PROVE_OF_PAYMENT', 'IS_CONSENT', 'SOURCE_FILE'
    ]
    
    rows = []
    for idx, rec in enumerate(all_records, 1):
        row_data = {col: "" for col in columns}
        row_data['NO'] = idx
        inv_no = rec.get('INV_NO') or rec.get('REF NO', '')
        row_data['INV_NO'] = inv_no
        
        # Extract the part after "/" for COMP_ORDER_ID
        comp_order_id = rec.get('COMP_ORDER_ID', '')
        if not comp_order_id and "/" in inv_no:
            comp_order_id = inv_no.split("/")[-1].strip()
        row_data['COMP_ORDER_ID'] = comp_order_id
        
        # Assign barcode if available
        if rec.get('BARCODE_NO'):
            row_data['BARCODE_NO'] = rec.get('BARCODE_NO')
        elif idx - 1 < len(barcodes):
            row_data['BARCODE_NO'] = barcodes[idx - 1]
        else:
            row_data['BARCODE_NO'] = ""
            
        product_in_box = str(rec.get('PRODUCT_IN_BOX') or rec.get('PRODUCT IN BOX', '')).strip()
        row_data['PRODUCT_IN_BOX'] = product_in_box if product_in_box else "-"
        
        row_data['SHIPPER_NAME'] = rec.get('SHIPPER_NAME') or rec.get('SHIPPER NAME', '')
        shipper_address = str(rec.get('SHIPPER_ADDRESS') or rec.get('SHIPPER ADDRESS', '')).strip()
        row_data['SHIPPER_ADDRESS'] = shipper_address if shipper_address else "-"
        row_data['SHIPPER_AMPHUR'] = rec.get('SHIPPER_AMPHUR') or rec.get('SHIPPER AMPHUR', '')
        row_data['SHIPPER_PROVINCE'] = rec.get('SHIPPER_PROVINCE') or rec.get('SHIPPER PROVINCE', '')
        row_data['SHIPPER_ZIPCODE'] = rec.get('SHIPPER_ZIPCODE') or rec.get('SHIPPER ZIPCODE', '')
        shipper_tel = str(rec.get('SHIPPER_TEL') or rec.get('SHIPPER TEL', '')).strip()
        row_data['SHIPPER_TEL'] = shipper_tel if shipper_tel else "-"
        row_data['SHIPPER_EMAIL'] = rec.get('SHIPPER_EMAIL', '')
        
        row_data['RECEIVER'] = rec.get('RECEIVER', '')
        row_data['RECEIVER_ADDRESS'] = rec.get('RECEIVER_ADDRESS') or rec.get('RECEIVER ADDRESS', '')
        row_data['RECEIVER_AMPHUR'] = rec.get('RECEIVER_AMPHUR') or rec.get('RECEIVER AMPHUR', '')
        row_data['RECEIVER_PROVINCE'] = rec.get('RECEIVER_PROVINCE') or rec.get('RECEIVER PROVINCE', '')
        row_data['RECEIVER_ZIPCODE'] = rec.get('RECEIVER_ZIPCODE') or rec.get('RECEIVER ZIPCODE', '')
        row_data['RECEIVER_TEL'] = rec.get('RECEIVER_TEL') or rec.get('RECEIVER TEL') or "0000000000"
        row_data['RECEIVER_EMAIL'] = rec.get('RECEIVER_EMAIL', '')
        
        row_data['WEIGHT'] = rec.get('WEIGHT', "10")
        row_data['PRICE'] = rec.get('PRICE', "0")
        row_data['INSURE'] = rec.get('INSURE', "N")
        row_data['INSURE_PRICE'] = rec.get('INSURE_PRICE', "0")
        row_data['COD_DETAIL_NAME'] = rec.get('COD_DETAIL_NAME', "")
        row_data['COD_DETAIL_SIZE'] = rec.get('COD_DETAIL_SIZE', "")
        row_data['COD_DETAIL_VOLUME'] = rec.get('COD_DETAIL_VOLUME', "")
        row_data['COD_DETAIL_QTY'] = rec.get('COD_DETAIL_QTY', "")
        row_data['COD_DETAIL_COLOR'] = rec.get('COD_DETAIL_COLOR', "")
        row_data['COD_DETAIL_QTY_AMOUNT'] = rec.get('COD_DETAIL_QTY_AMOUNT', "")
        row_data['PROVE_OF_PAYMENT'] = rec.get('PROVE_OF_PAYMENT', "")
        row_data['IS_CONSENT'] = rec.get('IS_CONSENT', "")
        row_data['SOURCE_FILE'] = rec.get('SOURCE_FILE', '')
        rows.append(row_data)
        
    return pd.DataFrame(rows, columns=columns)

def generate_combined_pdf(dataframe, output_pdf_path, envelope_only=False):
    writer = PdfWriter()
    
    processed_files = set()
    
    for idx, row in dataframe.iterrows():
        source_file = row.get('SOURCE_FILE', '')
        if not source_file or not os.path.exists(source_file) or source_file in processed_files:
            continue
            
        processed_files.add(source_file)
        
        # Get all records for this file in original order
        file_records = dataframe[dataframe['SOURCE_FILE'] == source_file].to_dict('records')
        
        reader = PdfReader(source_file)
        if not reader.pages:
            continue
            
        current_record_idx = 0
                
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            clean_text = text.replace(" ", "")
            
            is_envelope = "ชำระค่าฝากส่งเป็นรายเดือน" in clean_text or "ใบอนุญาตเลขที่" in clean_text
            is_last_page = (i == len(reader.pages) - 1)
            
            has_overlay = False
            if (is_envelope or is_last_page) and current_record_idx < len(file_records):
                barcode_no = file_records[current_record_idx].get('BARCODE_NO', '')
                
                width = float(page.mediabox.width)
                height = float(page.mediabox.height)
                
                # Find X and Y coordinate of "เรียน" and sender address block
                y_coord_rian = None
                x_coord_rian = None
                sender_y_list = []
                sender_x_list = []
                
                def visitor_body(text_content, cm, tm, font_dict, font_size):
                    nonlocal y_coord_rian, x_coord_rian
                    t = text_content.strip()
                    x, y = tm[4], tm[5]
                    if not t or x < 0 or y < 0:
                        return
                    # Find the first occurrence of "เรียน"
                    if "เรียน" in t and y_coord_rian is None and x > 0 and y > 0:
                        x_coord_rian = x
                        y_coord_rian = y
                    # Detect sender block lines (left column x < width * 0.40, upper portion)
                    if x < width * 0.40 and y > height * 0.35:
                        if any(k in t for k in ['สำนักงาน', 'ส านักงาน', 'ฝ่าย', 'กลุ่มงาน', 'ที่ดิน', 'ที่ นพ', 'ที่ กค', 'ที่ ']):
                            sender_y_list.append(y)
                            sender_x_list.append(x)
                        elif any(k in t for k in ['หมู่ที่', 'ต าบล', 'ตำบล', 'อำเภอ', 'อ าเภอ', 'จังหวัด', 'นพ', '48170', '๔๘๑๗๐', '116', '๑๑๖']) and len(t) < 80:
                            sender_y_list.append(y)
                            sender_x_list.append(x)
                page.extract_text(visitor_text=visitor_body)
                
                if barcode_no and str(barcode_no).strip() != "":
                    packet = io.BytesIO()
                    c = canvas.Canvas(packet, pagesize=(width, height))
                
                    # Scale factor to make overlay smaller
                    scale = 0.8
                    sender_bottom = min(sender_y_list) if sender_y_list else None
                    sender_left = min(sender_x_list) if sender_x_list else None

                    if y_coord_rian is not None and x_coord_rian is not None:
                        # Position dynamically relative to "เรียน"
                        # Align the bottom edge of the e-AR box with the baseline of the "เรียน" text
                        # The e-AR box bottom is at base_y + (155 * scale)
                        # So base_y = y_coord_rian - (155 * scale)
                        base_y = y_coord_rian - (155 * scale)
                    
                        # Position horizontally to the left of "เรียน" making it closer (5pt gap)
                        # Right edge of barcode is base_x + (164.7 * scale)
                        base_x = x_coord_rian - 5 - (164.7 * scale)
                    
                        # Prevent going off-screen to the left or bottom
                        base_x = max(10, base_x)
                        base_y = max(10, base_y)
                    elif sender_bottom is not None:
                        # Position under sender's address (ใต้ที่อยู่ผู้ฝากส่ง)
                        # Box top is at base_y + (210 * scale)
                        # Gap of 18pt below the sender bottom line
                        base_y = sender_bottom - 18 - (210 * scale)
                        base_x = max(18, sender_left if sender_left is not None else 20)
                        base_y = max(10, base_y)
                    else:
                        # Fallback to old default if neither "เรียน" nor sender address is found
                        base_x = width * 0.05
                        base_y = 40
                
                    # Draw Barcode (Code128)
                    barcode128 = code128.Code128(str(barcode_no), barHeight=20.625 * scale, barWidth=0.825 * scale)
                    barcode128.drawOn(c, base_x, base_y + (40 * scale))
                
                    # Get actual width for perfect centering
                    barcode_width = getattr(barcode128, 'width', 164.7 * scale)
                    center_x = base_x + (barcode_width / 2.0)
                
                    # Draw text centered under barcode
                    c.setFont("Helvetica-Bold", 14 * scale)
                    c.drawCentredString(center_x, base_y + (20 * scale), str(barcode_no))
                
                    # Draw QR Code centered above barcode
                    qr_code = qr.QrCodeWidget(str(barcode_no))
                    bounds = qr_code.getBounds()
                    qr_width = bounds[2] - bounds[0]
                    qr_height = bounds[3] - bounds[1]
                
                    # Scale QR code
                    qr_size = 75.0 * scale
                    scale_w = qr_size / qr_width
                    scale_h = qr_size / qr_height
                    d = Drawing(qr_size, qr_size, transform=[scale_w, 0, 0, scale_h, 0, 0])
                    d.add(qr_code)
                    # Centered, Y: above barcode
                    renderPDF.draw(d, c, center_x - (qr_size / 2.0), base_y + (65 * scale))
                
                    # --- Draw E-AR Box above QR Code ---
                    box_w = 120 * scale
                    box_h = 55 * scale
                    box_x = center_x - (box_w / 2.0)
                    box_y = base_y + (155 * scale)
                
                    c.setStrokeColorRGB(0, 0, 0) # Black border
                    c.setLineWidth(1)
                    c.setFillColorRGB(1, 1, 1) # White fill
                    c.rect(box_x, box_y, box_w, box_h, fill=1, stroke=1)
                
                    c.setFillColorRGB(0, 0, 0)
                    if FONT_REGISTERED:
                        c.setFont('Tahoma-Bold', 24 * scale)
                    else:
                        c.setFont('Helvetica-Bold', 24 * scale)
                    c.drawCentredString(center_x, box_y + (31 * scale), "e-AR")
                
                    if FONT_REGISTERED:
                        c.setFont('Tahoma', max(7.5, 9 * scale))
                    else:
                        c.setFont('Helvetica', max(7.5, 9 * scale))
                    c.drawCentredString(center_x, box_y + (19 * scale), "ลงทะเบียนตอบรับ")
                    c.drawCentredString(center_x, box_y + (9 * scale), "ทางอิเล็กทรอนิกส์")
                    # -----------------------------------
                
                    c.save()
                    packet.seek(0)
                
                    overlay_pdf = PdfReader(packet)
                    page.merge_page(overlay_pdf.pages[0])
                
                    has_overlay = True
                    current_record_idx += 1
                
            if envelope_only:
                if has_overlay:
                    ref_y = y_coord_rian if y_coord_rian is not None else (sender_bottom - 30 if sender_bottom is not None else None)
                    if ref_y is not None:
                        dl_width = 220 * mm
                        dl_height = 110 * mm
                        orig_width = float(page.mediabox.width)
                        orig_height = float(page.mediabox.height)
                        
                        # Center horizontally
                        left = (orig_width - dl_width) / 2.0
                        right = left + dl_width
                        
                        # Center vertically around ref_y
                        top = ref_y + (dl_height / 2.0)
                        if top > orig_height:
                            top = orig_height
                        bottom = top - dl_height
                        
                        page.mediabox.left = left
                        page.mediabox.right = right
                        page.mediabox.top = top
                        page.mediabox.bottom = max(0, bottom)
                        
                        page.cropbox.left = page.mediabox.left
                        page.cropbox.right = page.mediabox.right
                        page.cropbox.top = page.mediabox.top
                        page.cropbox.bottom = page.mediabox.bottom
                    writer.add_page(page)
            else:
                writer.add_page(page)
        
    if len(writer.pages) == 0:
        raise ValueError("ไม่พบไฟล์เอกสาร PDF ต้นฉบับ หรือไม่พบหน้าเอกสารสำหรับรวมไฟล์ กรุณาตรวจสอบว่ามีไฟล์ PDF ต้นฉบับแนบมาด้วย")

    with open(output_pdf_path, "wb") as f_out:
        writer.write(f_out)

def generate_delivery_note_pdf(dataframe, output_pdf_path):
    if dataframe.empty:
        return
        
    doc = SimpleDocTemplate(output_pdf_path, pagesize=portrait(A4),
                            rightMargin=1.5*cm, leftMargin=1.5*cm,
                            topMargin=1.5*cm, bottomMargin=1.5*cm)
    elements = []
    
    styles = getSampleStyleSheet()
    font_name = 'Tahoma' if FONT_REGISTERED else 'Helvetica'
    font_bold = 'Tahoma-Bold' if FONT_REGISTERED else 'Helvetica-Bold'
    
    style_normal = ParagraphStyle('ThaiNormal', parent=styles['Normal'], fontName=font_name, fontSize=10, leading=14)
    style_bold_center = ParagraphStyle('ThaiBoldCenter', parent=styles['Normal'], fontName=font_bold, fontSize=16, alignment=TA_CENTER)
    style_right = ParagraphStyle('ThaiRight', parent=styles['Normal'], fontName=font_name, fontSize=10, alignment=TA_RIGHT, leading=24)
    style_table_header = ParagraphStyle('ThaiTableHeader', parent=styles['Normal'], fontName=font_bold, fontSize=10, alignment=TA_CENTER)
    style_table_cell_left = ParagraphStyle('ThaiTableCellL', parent=styles['Normal'], fontName=font_name, fontSize=9, leading=12)
    style_table_cell_center = ParagraphStyle('ThaiTableCellC', parent=styles['Normal'], fontName=font_name, fontSize=9, leading=12, alignment=TA_CENTER)
    style_footer_center = ParagraphStyle('ThaiFooterCenter', parent=styles['Normal'], fontName=font_name, fontSize=10, leading=24, alignment=TA_CENTER)
    
    # Get shipper info from the first row
    first_row = dataframe.iloc[0]
    shipper_name = apply_thai_pua(xml_escape(first_row.get('SHIPPER_NAME', '')))
    shipper_addr = apply_thai_pua(xml_escape(first_row.get('SHIPPER_ADDRESS', '')))
    shipper_amphur = apply_thai_pua(xml_escape(first_row.get('SHIPPER_AMPHUR', '')))
    shipper_prov = apply_thai_pua(xml_escape(first_row.get('SHIPPER_PROVINCE', '')))
    shipper_zip = str(first_row.get('SHIPPER_ZIPCODE', ''))
    shipper_tel = str(first_row.get('SHIPPER_TEL', ''))
    
    shipper_full_address = f"{shipper_addr} {shipper_amphur} {shipper_prov} {shipper_zip}".strip()
    shipper_text = f"<b>{apply_thai_pua('ผู้ส่ง:')}</b> {shipper_name}<br/><b>{apply_thai_pua('ที่อยู่:')}</b> {shipper_full_address}<br/><b>{apply_thai_pua('โทร:')}</b> {shipper_tel}"
    
    p_shipper = Paragraph(shipper_text, style_normal)
    p_title = Paragraph(apply_thai_pua('ใบนำส่ง'), style_bold_center)
    p_license = Paragraph(apply_thai_pua('ใบอนุญาตเลขที่............................................<br/>ปณ./ปจ. ............................................'), style_right)
    
    # Shipper and License row (2 columns)
    header_data = [[p_shipper, p_license]]
    header_table = Table(header_data, colWidths=[9*cm, 9*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (0,0), 'LEFT'),
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
    ]))
    
    # Table Data (wrapping header inside to repeat on every page)
    main_table_data = []
    
    # Row 0: Title on top (spans all columns)
    main_table_data.append([p_title, '', '', '', '', ''])
    
    # Row 1: Header table (spans all columns)
    main_table_data.append([header_table, '', '', '', '', ''])
    
    # Row 2: Spacer row
    main_table_data.append(['', '', '', '', '', ''])
    
    # Row 3: Column Headers
    main_table_data.append([
        Paragraph(apply_thai_pua('ลำดับ'), style_table_header),
        Paragraph(apply_thai_pua('หมายเลข'), style_table_header),
        Paragraph(apply_thai_pua('ผู้รับ'), style_table_header),
        Paragraph(apply_thai_pua('ที่อยู่'), style_table_header),
        Paragraph(apply_thai_pua('น้ำหนัก'), style_table_header),
        Paragraph(apply_thai_pua('ค่าบริการ'), style_table_header)
    ])
    
    for idx, row in dataframe.iterrows():
        no = str(row.get('NO', idx + 1))
        barcode = str(row.get('BARCODE_NO', ''))
        receiver = apply_thai_pua(xml_escape(row.get('RECEIVER', '')))
        r_addr = apply_thai_pua(xml_escape(row.get('RECEIVER_ADDRESS', '')))
        r_amphur = apply_thai_pua(xml_escape(row.get('RECEIVER_AMPHUR', '')))
        r_prov = apply_thai_pua(xml_escape(row.get('RECEIVER_PROVINCE', '')))
        r_zip = str(row.get('RECEIVER_ZIPCODE', ''))
        
        # Use <br/> to break line before Amphur
        addr_line1 = r_addr.strip()
        addr_line2 = f"{r_amphur} {r_prov} {r_zip}".strip()
        full_r_addr = f"{addr_line1}<br/>{addr_line2}" if addr_line1 and addr_line2 else f"{addr_line1}{addr_line2}"
        
        weight = str(row.get('WEIGHT', ''))
        
        main_table_data.append([
            Paragraph(no, style_table_cell_center),
            Paragraph(barcode, style_table_cell_center),
            Paragraph(receiver, style_table_cell_left),
            Paragraph(full_r_addr, style_table_cell_left),
            Paragraph(weight, style_table_cell_center),
            Paragraph('', style_table_cell_center) # Empty for service fee
        ])
        
    # Adjusted column widths to prevent header text wrapping
    # [ลำดับ 1.5, หมายเลข 3.0, ผู้รับ 4.0, ที่อยู่ 5.8, น้ำหนัก 1.7, ค่าบริการ 2.0] = Total 18.0cm
    t = Table(main_table_data, colWidths=[1.5*cm, 3.0*cm, 4.0*cm, 5.8*cm, 1.7*cm, 2.0*cm], repeatRows=4)
    t.setStyle(TableStyle([
        # Header spans
        ('SPAN', (0,0), (-1,0)),
        ('SPAN', (0,1), (-1,1)),
        ('SPAN', (0,2), (-1,2)),
        
        ('LEFTPADDING', (0,0), (-1,2), 0),
        ('RIGHTPADDING', (0,0), (-1,2), 0),
        ('BOTTOMPADDING', (0,0), (-1,0), 15), # Space under title
        ('BOTTOMPADDING', (0,1), (-1,1), 10), # Space after header table
        
        # Grid and Background only for data rows and col headers
        ('BACKGROUND', (0,3), (-1,3), colors.lightgrey),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.black),
        ('ALIGN', (0,3), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,3), (-1,-1), 0.5, colors.black),
        ('BOTTOMPADDING', (0,3), (-1,-1), 4),
        ('TOPPADDING', (0,3), (-1,-1), 4),
        ('LEFTPADDING', (0,3), (-1,-1), 2),  # Reduce left padding in cells
        ('RIGHTPADDING', (0,3), (-1,-1), 2), # Reduce right padding in cells
    ]))
    
    elements.append(t)
    elements.append(Spacer(1, 1*cm))
    
    # Footer
    footer_text_left = apply_thai_pua('<br/><br/>ลงชื่อผู้ส่ง ..............................................................<br/>( .............................................................. )<br/>วันที่.............................................')
    footer_text_right = apply_thai_pua('<br/><br/>ลงชื่อผู้รับ ..............................................................<br/>( .............................................................. )<br/>วันที่.............................................')
    
    p_footer_l = Paragraph(footer_text_left, style_footer_center)
    p_footer_r = Paragraph(footer_text_right, style_footer_center)
    
    footer_data = [[p_footer_l, p_footer_r]]
    footer_table = Table(footer_data, colWidths=[9*cm, 9*cm])
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (0,0), 'CENTER'),
        ('ALIGN', (1,0), (1,0), 'CENTER'),
    ]))
    
    elements.append(footer_table)
    
    def draw_page_number(canvas, doc):
        canvas.saveState()
        if FONT_REGISTERED:
            canvas.setFont('Tahoma', 9)
        else:
            canvas.setFont('Helvetica', 9)
        canvas.drawRightString(19.5*cm, 28.5*cm, apply_thai_pua(f"หน้า {doc.page}"))
        canvas.restoreState()
        
    doc.build(elements, onFirstPage=draw_page_number, onLaterPages=draw_page_number)

def generate_custom_envelopes_pdf(dataframe, output_pdf_path):
    if dataframe.empty:
        return
        
    writer = PdfWriter()
    
    # DL Size is 220x110 mm
    
    for idx, row in dataframe.iterrows():
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(220*mm, 110*mm))
        
        font_normal = 'Tahoma' if FONT_REGISTERED else 'Helvetica'
        font_bold = 'Tahoma-Bold' if FONT_REGISTERED else 'Helvetica-Bold'
        
        c.setFont(font_normal, 10)
        base_y_sender = 90 * mm
        
        # --- Top Left (Sender) ---
        shipper_name = str(row.get('SHIPPER_NAME', '')).replace('None', '')
        shipper_address = str(row.get('SHIPPER_ADDRESS', '')).replace('None', '')
        shipper_amphur = str(row.get('SHIPPER_AMPHUR', '')).replace('None', '')
        shipper_province = str(row.get('SHIPPER_PROVINCE', '')).replace('None', '')
        shipper_zipcode = str(row.get('SHIPPER_ZIPCODE', '')).replace('None', '')
        ref_no = str(row.get('INV_NO', '')).replace('None', '')
        
        c.drawString(30 * mm, base_y_sender, shipper_name)
        c.drawString(30 * mm, base_y_sender - 5*mm, f"อำเภอ{shipper_amphur} {shipper_province} {shipper_zipcode}".strip())
        if ref_no:
            c.drawString(30 * mm, base_y_sender - 10*mm, f"ที่ {ref_no}")
        
        # --- Top Right ---
        c.drawString(160 * mm, base_y_sender, "ชำระค่าฝากส่งเป็นรายเดือน")
        c.drawString(160 * mm, base_y_sender - 5*mm, "ใบอนุญาตเลขที่")
        if shipper_amphur:
            c.drawString(160 * mm, base_y_sender - 10*mm, f"ไปรษณีย์{shipper_amphur}")
        
        # --- Center (Receiver) ---
        c.setFont(font_normal, 12)
        base_x_receiver = 80 * mm
        base_y_receiver = 60 * mm
        
        receiver = str(row.get('RECEIVER', '')).replace('None', '')
        receiver_address = str(row.get('RECEIVER_ADDRESS', '')).replace('None', '')
        receiver_amphur = str(row.get('RECEIVER_AMPHUR', '')).replace('None', '')
        receiver_province = str(row.get('RECEIVER_PROVINCE', '')).replace('None', '')
        receiver_zipcode = str(row.get('RECEIVER_ZIPCODE', '')).replace('None', '')
        
        c.drawString(base_x_receiver - 10*mm, base_y_receiver, "เรียน")
        c.drawString(base_x_receiver, base_y_receiver, receiver)
        
        # Draw address lines
        current_y = base_y_receiver - 6*mm
        if receiver_address:
            # Try to split long address into 2 lines if possible
            if len(receiver_address) > 40:
                parts = receiver_address.split(' ต.')
                if len(parts) > 1:
                    c.drawString(base_x_receiver, current_y, parts[0])
                    current_y -= 6*mm
                    c.drawString(base_x_receiver, current_y, f"ต.{parts[1]}")
                else:
                    c.drawString(base_x_receiver, current_y, receiver_address)
            else:
                c.drawString(base_x_receiver, current_y, receiver_address)
            current_y -= 6*mm
            
        if receiver_amphur:
            c.drawString(base_x_receiver, current_y, f"อำเภอ/เขต {receiver_amphur}")
            current_y -= 6*mm
            
        if receiver_province:
            c.drawString(base_x_receiver, current_y, f"จังหวัด {receiver_province}")
            current_y -= 6*mm
            
        if receiver_zipcode:
            c.drawString(base_x_receiver, current_y, receiver_zipcode)
            
        # --- Overlay (Barcode & QR) ---
        barcode_no = str(row.get('BARCODE_NO', '')).replace('None', '').strip()
        if barcode_no:
            scale = 0.8
            # Position it to the left of "เรียน"
            x_coord_rian = base_x_receiver - 10*mm
            y_coord_rian = base_y_receiver
            
            base_y = y_coord_rian - (155 * scale)
            base_x = x_coord_rian - 5 - (164.7 * scale)
            
            barcode128 = code128.Code128(barcode_no, barHeight=20.625 * scale, barWidth=0.825 * scale)
            barcode128.drawOn(c, base_x, base_y + (40 * scale))
            
            barcode_width = getattr(barcode128, 'width', 164.7 * scale)
            center_x = base_x + (barcode_width / 2.0)
            
            c.setFont(font_bold, 14 * scale)
            c.drawCentredString(center_x, base_y + (20 * scale), barcode_no)
            
            qr_code = qr.QrCodeWidget(barcode_no)
            bounds = qr_code.getBounds()
            qr_size = 75.0 * scale
            scale_w = qr_size / (bounds[2] - bounds[0])
            scale_h = qr_size / (bounds[3] - bounds[1])
            d = Drawing(qr_size, qr_size, transform=[scale_w, 0, 0, scale_h, 0, 0])
            d.add(qr_code)
            renderPDF.draw(d, c, center_x - (qr_size / 2.0), base_y + (65 * scale))
            
            box_w = 120 * scale
            box_h = 55 * scale
            box_x = center_x - (box_w / 2.0)
            box_y = base_y + (155 * scale)
            
            c.setStrokeColorRGB(0, 0, 0)
            c.setLineWidth(1)
            c.setFillColorRGB(1, 1, 1)
            c.rect(box_x, box_y, box_w, box_h, fill=1, stroke=1)
            
            c.setFillColorRGB(0, 0, 0)
            c.setFont(font_bold, 24 * scale)
            c.drawCentredString(center_x, box_y + (31 * scale), "e-AR")
            c.setFont(font_normal, max(7.5, 9 * scale))
            c.drawCentredString(center_x, box_y + (19 * scale), "ลงทะเบียนตอบรับ")
            c.drawCentredString(center_x, box_y + (9 * scale), "ทางอิเล็กทรอนิกส์")
            
        c.save()
        packet.seek(0)
        
        new_page_pdf = PdfReader(packet)
        writer.add_page(new_page_pdf.pages[0])
        
    with open(output_pdf_path, "wb") as f_out:
        writer.write(f_out)

MAIL_CENTERS_ZIP = {
    "หาดใหญ่": "90110",
    "นครพนม": "48000",
    "ขอนแก่น": "40000",
    "นครราชสีมา": "30000",
    "โคราช": "30000",
    "อุดรธานี": "41000",
    "อุบลราชธานี": "34000",
    "นครสวรรค์": "60000",
    "พิษณุโลก": "65000",
    "เด่นชัย": "54110",
    "ลำพูน": "51000",
    "เชียงใหม่": "50000",
    "สุราษฎร์ธานี": "84000",
    "ทุ่งสง": "80110",
    "ชุมพร": "86000",
    "ภูเก็ต": "83000",
    "ศรีราชา": "20110",
    "กบินทร์บุรี": "25110",
    "อยุธยา": "13000",
    "พระนครศรีอยุธยา": "13000",
    "ราชบุรี": "70000",
    "สุวรรณภูมิ": "10540",
    "กรุงเทพ": "10210",
    "หลักสี่": "10210",
    "ด่วนพิเศษ": "10210",
    "ems": "10210",
}

KNOWN_DISTRICT_ZIP = {
    "เรณูนคร": "48170",
    "นาแก": "48130",
    "ปลาปาก": "48160",
    "ธาตุพนม": "48110",
    "ท่าอุเทน": "48120",
    "ศรีสงคราม": "48150",
    "บ้านแพง": "48140",
    "นาหว้า": "48180",
    "โพนสวรรค์": "48190",
    "นาทม": "48140",
    "วังยาง": "48130",
    "เมืองนครพนม": "48000",
    "นครพนม": "48000",
    "เมืองมุกดาหาร": "49000",
    "มุกดาหาร": "49000",
    "นิคมคำสร้อย": "49130",
    "ดอนตาล": "49120",
    "ดงหลวง": "49140",
    "คำชะอี": "49110",
    "หว้านใหญ่": "49150",
    "หนองสูง": "49160",
    "เมืองสกลนคร": "47000",
    "สกลนคร": "47000",
    "กุสุมาลย์": "47210",
    "กุดบาก": "47180",
    "พรรณานิคม": "47130",
    "พังโคน": "47160",
    "วาริชภูมิ": "47150",
    "อากาศอำนวย": "47170",
    "สว่างแดนดิน": "47110",
    "คำตากล้า": "47250",
    "บ้านม่วง": "47140",
    "โพนนาแก้ว": "47230",
    "ภูพาน": "47180",
    "เต่างอย": "47260",
    "โคกศรีสุพรรณ": "47280",
    "เจริญศิลป์": "47290",
    "บัวใหญ่": "30120",
    "ปากช่อง": "30130",
    "วารินชำราบ": "34190",
    "ชุมแพ": "40130",
    "บ้านไผ่": "40110",
    "บางพลี": "10540",
    "คลองจั่น": "10240",
    "จตุจักร": "10900",
    "ลาดพร้าว": "10230",
    "มีนบุรี": "10510",
    "บางซื่อ": "10800",
    "นนทบุรี": "11000",
    "ปากเกร็ด": "11120",
}

def format_station_with_zipcode(station, record=None):
    if not station or str(station).strip() in ("", "-"):
        return "-"
    st = str(station).strip()
    if re.search(r'\b\d{5}\b', st):
        return st

    clean = re.sub(r'^(ศปฝ\.|ศป\.|ปณศ\.|ปณร\.|ปณ\.|ที่ทำการไปรษณีย์)\s*', '', st).strip().lower()
    is_mail_center = any(p in st for p in ["ศป.", "ศปฝ.", "ศูนย์ไปรษณีย์"])

    for mc_name, zcode in MAIL_CENTERS_ZIP.items():
        mc_lower = mc_name.lower()
        if mc_lower in st.lower() or clean == mc_lower:
            if is_mail_center or mc_name in ["หาดใหญ่", "เด่นชัย", "ทุ่งสง", "กบินทร์บุรี", "ศรีราชา", "สุวรรณภูมิ", "หลักสี่", "ด่วนพิเศษ", "ems"]:
                return f"{st} {zcode}"
            elif clean == mc_lower and is_mail_center:
                return f"{st} {zcode}"

    shipper_zc = (record.get("shipper_zipcode") if record else "") or "48170"
    received_po = (record.get("received_postoffice") if record else "") or ""
    if "เรณูนคร" in st:
        return f"{st} 48170"
    if received_po:
        clean_po = re.sub(r'^(ศปฝ\.|ศป\.|ปณศ\.|ปณร\.|ปณ\.|ที่ทำการไปรษณีย์)\s*', '', str(received_po)).strip().lower()
        if clean == clean_po:
            return f"{st} {shipper_zc}"

    if record:
        rcv_zc = str(record.get("receiver_zipcode") or "").strip()
        rcv_amp = str(record.get("receiver_amphur") or "").strip().lower()
        rcv_prov = str(record.get("receiver_province") or "").strip().lower()
        rcv_addr = str(record.get("receiver_address") or "").strip().lower()
        if len(rcv_zc) == 5:
            if clean and (clean in rcv_amp or clean in rcv_addr or (clean in rcv_prov and not is_mail_center)):
                return f"{st} {rcv_zc}"
            status_desc = str(record.get("status_description") or record.get("status_label") or "")
            raw_desc = str(record.get("status_description_raw") or "")
            combined_desc = f"{status_desc} {raw_desc}"
            delivery_keywords = ["นำจ่าย", "สำเร็จ", "ผู้รับได้รับ", "บ้านปิด", "ออกใบแจ้ง", "รอจ่าย"]
            if not is_mail_center and any(kw in combined_desc for kw in delivery_keywords):
                return f"{st} {rcv_zc}"

    for d_name, zcode in KNOWN_DISTRICT_ZIP.items():
        if clean == d_name or d_name in clean:
            return f"{st} {zcode}"

    for mc_name, zcode in MAIL_CENTERS_ZIP.items():
        if clean == mc_name.lower():
            return f"{st} {zcode}"

    return st

def generate_deposit_report_excel(records, summary, meta, output_excel_path):
    """
    Generates styled Excel report for Thailand Post deposit reconciliation using openpyxl.
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Deposit_Report"

    HEADER_FILL = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
    HEADER_FONT = Font(name="Tahoma", size=10, bold=True, color="FFFFFF")
    TITLE_FONT = Font(name="Tahoma", size=14, bold=True, color="0F172A")
    SUBTITLE_FONT = Font(name="Tahoma", size=9, bold=False, color="475569")
    TOTAL_FONT = Font(name="Tahoma", size=10, bold=True, color="0F172A")
    DATA_FONT = Font(name="Tahoma", size=9)
    BOLD_DATA_FONT = Font(name="Tahoma", size=9, bold=True)
    
    THIN_BORDER = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    TOTAL_BORDER = Border(
        top=Side(style='thin', color='0F172A'),
        bottom=Side(style='double', color='0F172A')
    )

    org_name = meta.get("organization") or "สำนักงานที่ดิน"
    report_date = meta.get("date") or datetime.now().strftime("%d/%m/%Y")
    total_items = summary.get("total_items", len(records))
    total_weight = summary.get("total_weight", 0.0)
    total_fee = summary.get("total_fee", 0.0)
    received_count = summary.get("received_count", len(records))

    # Title & Metadata
    ws.merge_cells("A1:J1")
    ws["A1"] = f"รายงานสรุปรายการรับฝากไปรษณีย์ (e-Parcel Deposit Report) — {org_name}"
    ws["A1"].font = TITLE_FONT
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 28

    delivered_count = summary.get("delivered_count", 0)
    in_transit_count = summary.get("in_transit_count", len(records))
    returned_count = summary.get("returned_count", 0)

    ws.merge_cells("A2:J2")
    ws["A2"] = f"ประจำวันที่: {report_date}  |  รายการทั้งหมด: {total_items} ฉบับ  |  นำจ่ายสำเร็จ: {delivered_count} ฉบับ  |  อยู่ระหว่างการนำจ่าย: {in_transit_count} ฉบับ  |  ส่งคืน: {returned_count} ฉบับ  |  น้ำหนักรวม: {total_weight:,.1f} กรัม  |  ยอดค่าบริการรวม: {total_fee:,.2f}"
    ws["A2"].font = SUBTITLE_FONT
    ws["A2"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 20

    # Headers
    headers = [
        "ลำดับ", "หมายเลข Barcode", "เลขที่คำขอ", "ชื่อผู้รับ",
        "ที่อยู่ปลายทาง", "น้ำหนัก (g)", "ค่าบริการ", "วัน-เวลาล่าสุด",
        "ปณ./สถานที่ล่าสุด", "สถานะ"
    ]
    header_row = 4
    ws.row_dimensions[header_row].height = 24
    for col_idx, h_text in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=h_text)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = THIN_BORDER

    # Data rows
    start_data_row = 5
    for i, r in enumerate(records):
        cur_row = start_data_row + i
        ws.row_dimensions[cur_row].height = 20
        
        full_addr = f"{r.get('receiver_address', '')} {r.get('receiver_amphur', '')} {r.get('receiver_province', '')} {r.get('receiver_zipcode', '')}".strip()
        weight = float(r.get("weight") or 0.0)
        fee = float(r.get("fee") or 0.0)
        latest_d = r.get("latest_date") or r.get("received_date") or ""
        latest_s = format_station_with_zipcode(r.get("latest_station") or r.get("received_postoffice") or "", r)

        # Status formatting: If raw description gives more detail than the label, include it in parentheses
        status_lbl = r.get("status_label") or r.get("status_description") or "รับฝากเข้าระบบแล้ว"
        status_key = r.get("status_key") or ""
        sig = (r.get("signature") or "").strip()
        has_sig = bool(sig and sig != "-" and sig not in ("ไม่มี", "ไม่พบ", "null", "undefined"))

        if status_key == "delivered" or "นำจ่ายสำเร็จ" in status_lbl:
            if has_sig:
                full_status_display = f"นำจ่ายสำเร็จ ✍️ (ผู้รับ: {sig})"
            else:
                full_status_display = "นำจ่ายสำเร็จ"
        else:
            raw_desc = (r.get("status_description_raw") or "").strip()
            if raw_desc and raw_desc != status_lbl and raw_desc not in status_lbl:
                full_status_display = f"{status_lbl} ({raw_desc})"
            else:
                full_status_display = status_lbl

        row_values = [
            i + 1,
            r.get("barcode", ""),
            r.get("inv_no", ""),
            r.get("receiver_name", ""),
            full_addr,
            weight,
            fee,
            latest_d,
            latest_s,
            full_status_display
        ]
        
        for col_idx, val in enumerate(row_values, start=1):
            cell = ws.cell(row=cur_row, column=col_idx, value=val)
            cell.font = DATA_FONT
            cell.border = THIN_BORDER
            
            if col_idx == 1:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in (2, 3):
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = BOLD_DATA_FONT
            elif col_idx in (8, 9, 10):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 6:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.0'
            elif col_idx == 7:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    # Summary Row
    end_data_row = start_data_row + len(records) - 1 if records else start_data_row
    total_row_idx = end_data_row + 1 if records else start_data_row + 1
    ws.row_dimensions[total_row_idx].height = 24
    
    ws.merge_cells(start_row=total_row_idx, start_column=1, end_row=total_row_idx, end_column=5)
    tot_label = ws.cell(row=total_row_idx, column=1, value=f"รวมทั้งสิ้น ({len(records)} รายการ)")
    tot_label.font = TOTAL_FONT
    tot_label.alignment = Alignment(horizontal="right", vertical="center")
    
    for c in range(1, 6):
        ws.cell(row=total_row_idx, column=c).border = TOTAL_BORDER

    w_cell = ws.cell(row=total_row_idx, column=6)
    if records:
        w_cell.value = f"=SUM(F{start_data_row}:F{end_data_row})"
    else:
        w_cell.value = 0.0
    w_cell.font = TOTAL_FONT
    w_cell.alignment = Alignment(horizontal="right", vertical="center")
    w_cell.number_format = '#,##0.0'
    w_cell.border = TOTAL_BORDER

    f_cell = ws.cell(row=total_row_idx, column=7)
    if records:
        f_cell.value = f"=SUM(G{start_data_row}:G{end_data_row})"
    else:
        f_cell.value = 0.0
    f_cell.font = TOTAL_FONT
    f_cell.alignment = Alignment(horizontal="right", vertical="center")
    f_cell.number_format = '#,##0.00'
    f_cell.border = TOTAL_BORDER

    for c in range(8, 11):
        ws.cell(row=total_row_idx, column=c, value="").border = TOTAL_BORDER

    # Column Auto-fit
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            if cell.row in (1, 2):
                continue
            v = str(cell.value or '')
            if len(v) > max_len:
                max_len = len(v)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 11)
        
    ws.column_dimensions['E'].width = 30

    wb.save(output_excel_path)

def generate_deposit_report_pdf(records, summary, meta, output_pdf_path):
    """
    Generates official government-format PDF report for deposit reconciliation.
    """
    doc = SimpleDocTemplate(output_pdf_path, pagesize=landscape(A4),
                            rightMargin=1.2*cm, leftMargin=1.2*cm,
                            topMargin=1.2*cm, bottomMargin=1.2*cm)
    elements = []
    styles = getSampleStyleSheet()
    font_name = 'Tahoma' if FONT_REGISTERED else 'Helvetica'
    font_bold = 'Tahoma-Bold' if FONT_REGISTERED else 'Helvetica-Bold'

    style_title = ParagraphStyle('ReportTitle', parent=styles['Normal'], fontName=font_bold, fontSize=16, leading=22, alignment=TA_CENTER)
    style_subtitle = ParagraphStyle('ReportSubTitle', parent=styles['Normal'], fontName=font_name, fontSize=10, leading=16, alignment=TA_CENTER)
    style_th = ParagraphStyle('ReportTH', parent=styles['Normal'], fontName=font_bold, fontSize=9, leading=12, alignment=TA_CENTER, textColor=colors.white)
    style_td_c = ParagraphStyle('ReportTDC', parent=styles['Normal'], fontName=font_name, fontSize=8.5, leading=11, alignment=TA_CENTER)
    style_td_l = ParagraphStyle('ReportTDL', parent=styles['Normal'], fontName=font_name, fontSize=8.5, leading=11, alignment=TA_LEFT)
    style_td_r = ParagraphStyle('ReportTDR', parent=styles['Normal'], fontName=font_name, fontSize=8.5, leading=11, alignment=TA_RIGHT)
    style_td_bold_r = ParagraphStyle('ReportTDBoldR', parent=styles['Normal'], fontName=font_bold, fontSize=8.5, leading=11, alignment=TA_RIGHT)
    style_sig = ParagraphStyle('ReportSig', parent=styles['Normal'], fontName=font_name, fontSize=9.5, leading=18, alignment=TA_CENTER)

    org_name = meta.get("organization") or "สำนักงานที่ดิน"
    report_date = meta.get("date") or datetime.now().strftime("%d/%m/%Y")
    total_items = summary.get("total_items", len(records))
    total_weight = summary.get("total_weight", 0.0)
    total_fee = summary.get("total_fee", 0.0)
    received_count = summary.get("received_count", len(records))
    delivered_count = summary.get("delivered_count", 0)
    in_transit_count = summary.get("in_transit_count", len(records))
    returned_count = summary.get("returned_count", 0)

    elements.append(Paragraph(apply_thai_pua(f"รายงานสรุปการรับฝากเอกสารส่งทางไปรษณีย์ (e-Parcel Deposit Report)"), style_title))
    elements.append(Spacer(1, 0.2*cm))
    subtitle_text = f"<b>หน่วยงาน:</b> {xml_escape(org_name)}  |  <b>วันที่นำส่ง:</b> {report_date}  |  <b>ยอดรวม:</b> {total_items} ฉบับ (นำจ่ายสำเร็จ {delivered_count} ฉบับ, อยู่ระหว่างการนำจ่าย {in_transit_count} ฉบับ, ส่งคืน {returned_count} ฉบับ)"
    if total_weight > 0:
        subtitle_text += f"  |  <b>น้ำหนักรวม:</b> {total_weight:,.1f} กรัม"
    subtitle_text += f"  |  <b>ยอดค่าบริการ:</b> {total_fee:,.2f}"
    elements.append(Paragraph(apply_thai_pua(subtitle_text), style_subtitle))
    elements.append(Spacer(1, 0.4*cm))

    # Table Header
    th_headers = ["ลำดับ", "หมายเลข Barcode", "เลขที่คำขอ", "ชื่อผู้รับ", "ที่อยู่ปลายทาง", "น้ำหนัก (g)", "ค่าบริการ", "วัน-เวลาล่าสุด", "ปณ./สถานที่ล่าสุด", "สถานะ"]
    col_widths = [0.8*cm, 3.2*cm, 2.5*cm, 3.4*cm, 5.0*cm, 1.7*cm, 1.8*cm, 3.0*cm, 2.4*cm, 3.5*cm]

    table_data = [[Paragraph(apply_thai_pua(h), style_th) for h in th_headers]]

    for i, r in enumerate(records):
        full_addr = xml_escape(f"{r.get('receiver_address', '')} {r.get('receiver_amphur', '')} {r.get('receiver_province', '')} {r.get('receiver_zipcode', '')}".strip())
        weight = float(r.get("weight") or 0.0)
        fee = float(r.get("fee") or 0.0)
        latest_d = r.get("latest_date") or r.get("received_date") or "-"
        latest_s = xml_escape(format_station_with_zipcode(r.get("latest_station") or r.get("received_postoffice") or "-", r))
        
        status_lbl = xml_escape(r.get("status_label") or r.get("status_description") or "รับฝากเข้าระบบแล้ว")
        status_key = r.get("status_key") or ""
        sig = (r.get("signature") or "").strip()
        has_sig = bool(sig and sig != "-" and sig not in ("ไม่มี", "ไม่พบ", "null", "undefined"))

        if status_key == "delivered" or "นำจ่ายสำเร็จ" in status_lbl:
            if has_sig:
                status_p = Paragraph(apply_thai_pua(f"<b>นำจ่ายสำเร็จ</b><br/><font size=6 color='#059669'>(ผู้ลงนาม: {xml_escape(sig)})</font>"), style_td_c)
            else:
                status_p = Paragraph(apply_thai_pua(f"<b>นำจ่ายสำเร็จ</b><br/><font size=6 color='#64748b'>(ไม่มีลายเซ็น)</font>"), style_td_c)
        else:
            raw_desc = (xml_escape(r.get("status_description_raw") or "")).strip()
            if raw_desc and raw_desc != status_lbl and raw_desc not in status_lbl:
                is_exc = any(k in raw_desc for k in ["บ้านปิด", "ออกใบแจ้ง", "ไม่ชัดเจน", "ไม่มีเลขบ้าน", "ไม่มีเลขที่", "ไม่ยอมรับ", "ไม่มีผู้รับ", "ไม่มารับตามกำหนด", "รอจ่าย", "รอนำจ่าย", "เก็บรอ", "ติดต่อ", "โทรศัพท์", "ย้าย", "ส่งคืน", "คืนต้นทาง", "คืนผู้ฝาก", "ตีกลับ", "ตกค้าง", "ระงับ", "อายัด", "เหตุขัดข้อง", "นำจ่ายคืน"])
                color_hex = "#e11d48" if any(k in raw_desc for k in ["ส่งคืน", "คืนต้นทาง", "ตีกลับ", "คืนผู้ฝาก"]) else ("#c2410c" if is_exc else "#475569")
                status_p = Paragraph(apply_thai_pua(f"<b>{status_lbl}</b><br/><font size=6 color='{color_hex}'>{raw_desc}</font>"), style_td_c)
            else:
                status_p = Paragraph(apply_thai_pua(f"<b>{status_lbl}</b>"), style_td_c)

        row = [
            Paragraph(str(i + 1), style_td_c),
            Paragraph(f"<b>{xml_escape(r.get('barcode', ''))}</b>", style_td_c),
            Paragraph(xml_escape(r.get("inv_no", "-")), style_td_c),
            Paragraph(apply_thai_pua(xml_escape(r.get("receiver_name", ""))), style_td_l),
            Paragraph(apply_thai_pua(full_addr), style_td_l),
            Paragraph(f"{weight:,.1f}", style_td_r),
            Paragraph(f"{fee:,.2f}", style_td_r),
            Paragraph(latest_d, style_td_c),
            Paragraph(apply_thai_pua(latest_s), style_td_c),
            status_p
        ]
        table_data.append(row)

    # Summary Row
    summary_row = [
        Paragraph(apply_thai_pua(f"<b>รวมทั้งสิ้น ({len(records)} รายการ)</b>"), style_td_bold_r),
        "", "", "", "",
        Paragraph(f"<b>{total_weight:,.1f}</b>", style_td_bold_r),
        Paragraph(f"<b>{total_fee:,.2f}</b>", style_td_bold_r),
        "", "", ""
    ]
    table_data.append(summary_row)

    report_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    t_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#059669')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('SPAN', (0, len(table_data) - 1), (4, len(table_data) - 1)),
        ('BACKGROUND', (0, len(table_data) - 1), (-1, len(table_data) - 1), colors.HexColor('#F1F5F9'))
    ]
    
    for r_idx in range(1, len(records) + 1):
        if r_idx % 2 == 0:
            t_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), colors.HexColor('#F8FAFC')))
            
    report_table.setStyle(TableStyle(t_style))
    elements.append(report_table)
    elements.append(Spacer(1, 0.8*cm))

    # Signature Block
    sig_land = (
        "ลงชื่อ .............................................................. ผู้ส่งมอบเอกสาร<br/>"
        "( .............................................................. )<br/>"
        f"เจ้าหน้าที่ {apply_thai_pua(xml_escape(org_name))}<br/>"
        "วันที่ ............. / ............. / ............."
    )
    sig_post = (
        "ลงชื่อ .............................................................. ผู้รับฝากไปรษณีย์<br/>"
        "( .............................................................. )<br/>"
        "เจ้าหน้าที่ รับฝากไปรษณีย์ไทย<br/>"
        "วันที่ ............. / ............. / ............."
    )
    
    sig_data = [
        [Paragraph(apply_thai_pua(sig_land), style_sig), Paragraph(apply_thai_pua(sig_post), style_sig)]
    ]
    sig_table = Table(sig_data, colWidths=[13.6*cm, 13.6*cm])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    elements.append(sig_table)

    doc.build(elements)

def main():
    print(f"C2DPost (Version {__version__})")
    # Find all PDFs in the current directory
    pdf_files = glob.glob("*.pdf")
    if not pdf_files:
        print("ไม่พบไฟล์ PDF ในโฟลเดอร์นี้ กรุณาใส่ไฟล์ PDF ที่ต้องการแปลงข้อมูล")
        return
        
    all_records = []
    for pdf_file in pdf_files:
        records = process_pdf(pdf_file)
        all_records.extend(records)
        
    if not all_records:
        print("ไม่สามารถสกัดข้อมูลจากไฟล์ PDF ได้")
        return
        
    # Create DataFrame using extracted function
    df = records_to_dataframe(all_records)
        
    # Output file path with current datetime suffix (YYYYMMDDHHMM)
    suffix = datetime.now().strftime("%Y%m%d%H%M")
    output_filename = f"dpost_import_{suffix}.xlsx"
    
    # Save with sheet_name="New Order Data"
    df.to_excel(output_filename, sheet_name="New Order Data", index=False)
    print(f"\nบันทึกข้อมูลเรียบร้อยแล้วลงไฟล์ Excel: {output_filename}")
    print(f"รวมข้อมูลทั้งหมด {len(df)} รายการ")

if __name__ == "__main__":
    main()
