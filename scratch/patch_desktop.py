import re

py_path = r'E:\My Drive\ส่วน ทข.ปข.10\เว็บ\Convert PDF To Excel\C2DPost_Python\convert_dpost.py'
content = open(py_path, encoding='utf-8').read()

lookup_code = '''_THAI_POSTCODES_CACHE = None

def lookup_thai_zipcode(province="", amphur="", tambon=""):
    """
    Look up Thai postal code from (province, amphur, tambon) using standard database.
    """
    global _THAI_POSTCODES_CACHE
    if _THAI_POSTCODES_CACHE is None:
        try:
            curr_dir = os.path.dirname(os.path.abspath(__file__))
            p_file = os.path.join(curr_dir, "thai_postcodes.json")
            if os.path.exists(p_file):
                import json
                with open(p_file, "r", encoding="utf-8") as f:
                    _THAI_POSTCODES_CACHE = json.load(f)
            else:
                _THAI_POSTCODES_CACHE = {}
        except Exception:
            _THAI_POSTCODES_CACHE = {}

    clean_p = re.sub(r'^(?:จังหวัด|จ\.)\s*', '', province or "").strip()
    clean_a = re.sub(r'^(?:อำเภอ/เขต|อำเภอ|อ\.)\s*', '', amphur or "").strip()
    clean_t = re.sub(r'^(?:ตำบล/แขวง|ตำบล|ต\.)\s*', '', tambon or "").strip()

    if clean_p and clean_a and clean_t:
        key = f"{clean_p}|{clean_a}|{clean_t}"
        if key in _THAI_POSTCODES_CACHE:
            return _THAI_POSTCODES_CACHE[key]

    if clean_p and clean_a:
        key = f"{clean_p}|{clean_a}"
        if key in _THAI_POSTCODES_CACHE:
            return _THAI_POSTCODES_CACHE[key]

    if clean_a and clean_a in _THAI_POSTCODES_CACHE:
        return _THAI_POSTCODES_CACHE[clean_a]

    return ""

'''

if '_THAI_POSTCODES_CACHE' not in content:
    content = content.replace('def parse_receiver_label(text):', lookup_code + 'def parse_receiver_label(text):')

old_block = '''    if end_idx == -1:
        return None # Could not find valid zipcode boundary'''

new_block = '''    # Fallback: If no 5-digit zipcode line was found, look for line ending with province or district
    if end_idx == -1:
        for i in range(start_idx + 1, len(lines)):
            if any(k in lines[i] for k in ['โฉนด', 'ที่ดิน', 'หน้าสำรวจ', 'ระวาง', 'คำขอ']):
                continue
            line_conv = clean_thai_digits(lines[i])
            if re.search(r'^(?:จังหวัด|จ\.)\s*[\u0e00-\u0e7f]+', line_conv):
                end_idx = i
                break

    # Second Fallback: Scan up to 6 lines after start_idx for amphur/district lines
    if end_idx == -1:
        for i in range(start_idx + 1, min(start_idx + 7, len(lines))):
            line_conv = clean_thai_digits(lines[i])
            if any(k in line_conv for k in ['ที่', 'เรื่อง', 'เรียน', 'วันที่', 'ผู้ขอรังวัด', 'โฉนด', 'คำขอ']):
                break
            if re.search(r'(?:อำเภอ/เขต|อำเภอ|อ\.|จังหวัด|จ\.)\s*[\u0e00-\u0e7f]+', line_conv):
                end_idx = i
                
    if end_idx == -1:
        return None # Could not find valid address boundary'''

content = content.replace(old_block, new_block)

old_addr_collect = '''    if len(clean_thai_digits(end_line_clean)) > 5:
        # Remove zipcode from the line
        text_before_zip = re.sub(r'[๐-๙0-9]{5}\s*$', '', end_line_clean).strip()
        if text_before_zip:
            raw_address_lines.append(text_before_zip)'''

new_addr_collect = '''    if len(clean_thai_digits(end_line_clean)) > 5 and zipcode:
        # Remove zipcode from the line
        text_before_zip = re.sub(r'[๐-๙0-9]{5}\s*$', '', end_line_clean).strip()
        if text_before_zip:
            raw_address_lines.append(text_before_zip)
    elif not zipcode and end_line_clean:
        # If no zipcode, the end line itself is part of address (e.g. "จังหวัด นครพนม")
        raw_address_lines.append(end_line_clean)'''

content = content.replace(old_addr_collect, new_addr_collect)

old_clean_lines = '''    cleaned_address_lines = []
    amphur = ""
    province = ""
    
    for line in raw_address_lines:
        line_conv = clean_thai_digits(line)
        
        # Check for tambon
        t_match = re.search(r'^(?:ตำบล/แขวง|ตำบล|ต\.)\s*(.+)$', line_conv)
        if t_match:
            cleaned_address_lines.append(f"ต.{t_match.group(1).strip()}")
            continue'''

new_clean_lines = '''    cleaned_address_lines = []
    amphur = ""
    province = ""
    tambon = ""
    
    for line in raw_address_lines:
        line_conv = clean_thai_digits(line)
        
        # Check for tambon
        t_match = re.search(r'^(?:ตำบล/แขวง|ตำบล|ต\.)\s*(.+)$', line_conv)
        if t_match:
            tambon = t_match.group(1).strip()
            cleaned_address_lines.append(f"ต.{tambon}")
            continue'''

content = content.replace(old_clean_lines, new_clean_lines)

old_post_cleanup = '''    # Post-processing cleanup: Remove amphur, province, and zipcode from receiver_address if present'''
new_post_cleanup = '''    # Auto-resolve missing zipcode from Thai postal code database
    if not zipcode and (province or amphur):
        zipcode = lookup_thai_zipcode(province, amphur, tambon)

    # Post-processing cleanup: Remove amphur, province, and zipcode from receiver_address if present'''

content = content.replace(old_post_cleanup, new_post_cleanup)

old_proc_rec = '''        if receiver_info and receiver_info.get('RECEIVER'):
            record = {'''

new_proc_rec = '''        if receiver_info and receiver_info.get('RECEIVER'):
            if not receiver_info.get('RECEIVER ZIPCODE'):
                if (receiver_info.get('RECEIVER PROVINCE') == final_shipper_info.get('SHIPPER PROVINCE')
                        and receiver_info.get('RECEIVER AMPHUR') == final_shipper_info.get('SHIPPER AMPHUR')
                        and final_shipper_info.get('SHIPPER ZIPCODE')):
                    receiver_info['RECEIVER ZIPCODE'] = final_shipper_info['SHIPPER ZIPCODE']
                elif receiver_info.get('RECEIVER PROVINCE') or receiver_info.get('RECEIVER AMPHUR'):
                    receiver_info['RECEIVER ZIPCODE'] = lookup_thai_zipcode(
                        receiver_info.get('RECEIVER PROVINCE', ''),
                        receiver_info.get('RECEIVER AMPHUR', '')
                    )
            record = {'''

content = content.replace(old_proc_rec, new_proc_rec)

open(py_path, 'w', encoding='utf-8').write(content)
print('Successfully patched C2DPost_Python/convert_dpost.py')
