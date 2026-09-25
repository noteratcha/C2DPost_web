import os

# 1. Update PROJECT_DOCUMENTATION.md
p_doc = 'PROJECT_DOCUMENTATION.md'
txt_doc = open(p_doc, 'r', encoding='utf-8').read()
sec_doc = """
---

## 60. รองรับการดึงข้อมูลที่อยู่ผู้รับที่ไม่มีรหัสไปรษณีย์ และระบบค้นหารหัสไปรษณีย์ไทยอัตโนมัติ (v2026.0925.0145)

### 60.1 ปัญหาในไฟล์ตัวอย่างราชการ "9.pdf" (สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร)
1. **ลักษณะของเอกสาร**: ไฟล์ `9.pdf` เป็นหนังสือแจ้งเรื่องขอรังวัดที่ดินของฝ่ายรังวัด สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร
2. **รูปแบบจ่าหน้าผู้รับในเอกสาร**:
   ```
   เรียน นางอรนุมา  สีสุวงค์ และผู้ถือกรรมสิทธิ์รวม
   126  หมู่ที่ 10
   ตำบล/แขวง เรณู
   อำเภอ/เขต เรณูนคร
   จังหวัด นครพนม
   ```
3. **สาเหตุรากเหง้า (Root Cause)**:
   - ฟังก์ชัน `parse_receiver_label` ใน `convert_dpost.py` เดิมกำหนดเงื่อนไขว่าข้อความที่อยู่ผู้รับจะต้องสิ้นสุดด้วยบรรทัดตัวเลขรหัสไปรษณีย์ 5 หลัก (`^[๐-๙0-9]{5}$`) หรือมีรหัสไปรษณีย์ 5 หลักต่อท้ายบรรทัด จึงจะตั้งค่า `end_idx` ของช่วงข้อความที่อยู่ได้
   - เนื่องจากในหนังสือราชการฉบับนี้ เจ้าหน้าที่พิมพ์ที่อยู่สิ้นสุดที่บรรทัด `จังหวัด นครพนม` โดยไม่ได้ระบุรหัสไปรษณีย์ 5 หลักไว้ ส่งผลให้ `end_idx` มีค่าเป็น `-1` ตลอด และคืนค่า `None`
   - ใน `process_pdf` จึงไม่สามารถดึงข้อมูลรายการผู้รับได้ ทำให้ไฟล์แปลงผลลัพธ์ได้ 0 รายการ

### 60.2 การแก้ไขและพัฒนาระบบ Auto-Zipcode Resolution
1. **การตรวจจับขอบเขตที่อยู่แบบยืดหยุ่น (Fallback Boundary Detection)**:
   - หากไม่พบบรรทัดรหัสไปรษณีย์ 5 หลัก ระบบจะสแกนหาบรรทัดที่ขึ้นต้นด้วย `จังหวัด` หรือ `จ.` ทันทีเพื่อใช้เป็นบรรทัดสิ้นสุด (`end_idx`)
   - รองรับกรณีไม่มีบรรทัดจังหวัด โดยสแกนหาบรรทัดอำเภอ/เขต และนำบรรทัดดังกล่าวเข้ามาเป็นส่วนหนึ่งของที่อยู่โดยอัตโนมัติ
2. **ฐานข้อมูลรหัสไปรษณีย์มาตรฐานประเทศไทย (`thai_postcodes.json`)**:
   - เพิ่มฐานข้อมูลรหัสไปรษณีย์มาตรฐานครอบคลุม 7,498 ตำบล/แขวง และ 928 อำเภอ/เขต ทั่วประเทศไทย ไว้ที่ `api/core/thai_postcodes.json` และ `C2DPost_Python/thai_postcodes.json`
   - เพิ่มฟังก์ชัน `lookup_thai_zipcode(province, amphur, tambon)` ค้นหารหัสไปรษณีย์แบบ Hierarchical:
     - ขั้นที่ 1: ค้นหาแบบตรงตัว `จังหวัด|อำเภอ|ตำบล` (เช่น `นครพนม|เรณูนคร|เรณู` -> `48170`)
     - ขั้นที่ 2: ค้นหาด้วย `จังหวัด|อำเภอ`
     - ขั้นที่ 3: ค้นหาด้วยชื่อ `อำเภอ`
3. **Shipper Zipcode Fallback**:
   - หากผู้รับอยู่ในอำเภอและจังหวัดเดียวกับหน่วยงานต้นทางผู้ส่ง และไม่มีรหัสไปรษณีย์ ให้ดึงรหัสไปรษณีย์ของผู้ส่งมาเติมให้อัตโนมัติ
4. **ผลการทดสอบ**:
   - ไฟล์ `9.pdf` สามารถดึงข้อมูลได้สำเร็จ 100%: ผู้รับ `นางอรนุมา สีสุวงค์ และผู้ถือกรรมสิทธิ์รวม`, ที่อยู่ `126 หมู่ที่ 10 ต.เรณู`, อำเภอ `เรณูนคร`, จังหวัด `นครพนม`, รหัสไปรษณีย์ `48170`, เลขที่หนังสือ `นพ0020.05/6307`
   - ทดสอบ Regression Test กับไฟล์ตัวอย่าง PDF ทั้ง 21 ไฟล์ในโฟลเดอร์ `ไฟล์ตัวอย่าง` ผ่านครบถ้วน 100%
"""
if "## 60." not in txt_doc:
    txt_doc = txt_doc.strip() + "\n" + sec_doc + "\n"
    open(p_doc, 'w', encoding='utf-8', newline='').write(txt_doc)
    print("PROJECT_DOCUMENTATION.md updated")

# 2. Update ROADMAP_REPORT_FEATURE.md
p_roadmap = 'ROADMAP_REPORT_FEATURE.md'
txt_roadmap = open(p_roadmap, 'r', encoding='utf-8').read()
item_roadmap = """- [x] **4.78 รองรับการดึงข้อมูลที่อยู่ผู้รับที่ไม่มีรหัสไปรษณีย์ และระบบค้นหารหัสไปรษณีย์ไทยอัตโนมัติ (v2026.0925.0145)**
  - **รากเหง้าของปัญหา (Root Cause)**: ในไฟล์ `9.pdf` (หนังสือแจ้งรังวัดที่ดินของ สนง.ที่ดินนครพนม สาขาเรณูนคร) จ่าหน้าผู้รับสิ้นสุดที่บรรทัด "จังหวัด นครพนม" โดยไม่ได้พิมพ์รหัสไปรษณีย์ 5 หลักไว้ ฟังก์ชัน `parse_receiver_label` เดิมจึงหาจุดสิ้นสุด (`end_idx`) ของที่อยู่ไม่พบและส่งค่า `None` กลับมา ทำให้ดึงข้อมูลได้ 0 รายการ
  - **การปรับปรุงตัวแยกข้อความ (`api/core/convert_dpost.py` & `C2DPost_Python/convert_dpost.py`)**:
    - เพิ่ม Fallback Boundary Detection สแกนหาบรรทัดที่ขึ้นต้นด้วย "จังหวัด" หรือ "อำเภอ" เมื่อไม่พบบรรทัดรหัสไปรษณีย์ 5 หลัก
    - รวมบรรทัดสุดท้ายเข้าเป็นส่วนหนึ่งของที่อยู่โดยไม่ทำลายโครงสร้าง
  - **ระบบฐานข้อมูลรหัสไปรษณีย์ไทยอัตโนมัติ (`thai_postcodes.json`)**:
    - ติดตั้งฐานข้อมูลรหัสไปรษณีย์ไทยมาตรฐานครอบคลุม 7,498 ตำบล และ 928 อำเภอ ทั่วทั้ง 77 จังหวัด
    - สร้างฟังก์ชัน `lookup_thai_zipcode(province, amphur, tambon)` เพื่อเติมรหัสไปรษณีย์ 5 หลักให้ถูกต้องโดยอัตโนมัติ (เช่น นครพนม, เรณูนคร, เรณู -> 48170)
    - เสริม Fallback กรณีผู้รับอยู่ในอำเภอ/จังหวัดเดียวกับหน่วยงานผู้ส่ง ให้ดึงรหัสไปรษณีย์ของผู้ส่งมาใช้ทันที
  - **ผลการทดสอบ**: ไฟล์ `9.pdf` สกัดข้อมูลผู้รับและที่อยู่ได้ครบถ้วนสมบูรณ์ พร้อมรหัสไปรษณีย์ 48170 และผ่านการทดสอบ Regression Test กับไฟล์ตัวอย่างทั้ง 21 ไฟล์ 100%
"""
if "4.78" not in txt_roadmap:
    txt_roadmap = txt_roadmap.strip() + "\n\n" + item_roadmap + "\n"
    open(p_roadmap, 'w', encoding='utf-8', newline='').write(txt_roadmap)
    print("ROADMAP_REPORT_FEATURE.md updated")

# 3. Update BUGFIX_REPORT.md
p_bug = 'BUGFIX_REPORT.md'
txt_bug = open(p_bug, 'r', encoding='utf-8').read()
section_bug = """
---

## 23. ไฟล์ PDF ตัวอย่าง "9.pdf" ดึงข้อมูลไม่ได้เนื่องจากไม่มีรหัสไปรษณีย์ในข้อความจ่าหน้าผู้รับ (v2026.0925.0145)

### 📌 ปัญหาที่พบ
- ผู้ใช้งานแจ้ง: **"มีไฟล์ใหม่เพิ่มมาที่ไม่สามารถดึงข้อมูลได้ "9.pdf" (อยู่ในโฟเดอร์ "รอบ6") ช่วยตรวจสอบให้หน่อยว่าทำไมดึงข้อมูลไม่ได้"**
- ไฟล์ดังกล่าว (`C2DPost_Python/ไฟล์ตัวอย่าง/รอบ6/9.pdf`) เป็นหนังสือราชการของฝ่ายรังวัด สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร เมื่อนำเข้าสู่ระบบ C2DPost ไม่สามารถสกัดข้อมูลรายการผู้รับได้ (0 รายการ)

### 🔍 สาเหตุรากเหง้า (Root Cause)
- ข้อความจ่าหน้าผู้รับในไฟล์ `9.pdf` มีโครงสร้างดังนี้:
  ```
  เรียน นางอรนุมา  สีสุวงค์ และผู้ถือกรรมสิทธิ์รวม
  126  หมู่ที่ 10
  ตำบล/แขวง เรณู
  อำเภอ/เขต เรณูนคร
  จังหวัด นครพนม
  ```
- ในฟังก์ชัน `parse_receiver_label` ของ `convert_dpost.py` ใช้เงื่อนไขค้นหาดัชนีบรรทัดสุดท้าย (`end_idx`) จากบรรทัดที่มีรหัสไปรษณีย์ 5 หลัก (`^[๐-๙0-9]{5}$`) หรือมีรหัสไปรษณีย์ต่อท้ายเท่านั้น
- เมื่อเอกสารราชการฉบับนี้ไม่ได้พิมพ์รหัสไปรษณีย์ 5 หลักไว้ และจ่าหน้าจบลงที่ `จังหวัด นครพนม` ทำให้ตัวแปร `end_idx` ยังคงเป็น `-1` ฟังก์ชันจึงส่งค่า `return None` ส่งผลให้ระบบมองว่าไม่พบข้อมูลผู้รับ

### 🛠️ การแก้ไขที่ดำเนินการ
1. **Fallback Address Boundary Detection**:
   - หากตรวจไม่พบบรรทัดรหัสไปรษณีย์ 5 หลัก ระบบจะตรวจจับบรรทัดที่ขึ้นต้นด้วย `จังหวัด` หรือ `จ.` เป็นบรรทัดสิ้นสุดของที่อยู่
   - หากยังไม่พบอีก จะสแกนค้นหาบรรทัด `อำเภอ/เขต` ภายใน 6 บรรทัดถัดจากชื่อผู้รับ เพื่อกำหนดขอบเขตที่อยู่อย่างปลอดภัย
   - นำบรรทัดปิดท้ายดังกล่าวมาต่อเข้าเป็นส่วนหนึ่งของที่อยู่ผู้รับ
2. **ระบบค้นหารหัสไปรษณีย์อัตโนมัติ (`thai_postcodes.json` & `lookup_thai_zipcode`)**:
   - เพิ่มไฟล์ฐานข้อมูล `thai_postcodes.json` (525 KB) ครอบคลุม 7,498 ตำบล และ 928 อำเภอ ทั่วประเทศไทย
   - เพิ่มฟังก์ชัน `lookup_thai_zipcode` เพื่อค้นหารหัสไปรษณีย์จากตำบล อำเภอ และจังหวัดโดยอัตโนมัติ (เช่น เรณู + เรณูนคร + นครพนม ได้รหัส `48170`)
   - เพิ่ม Fallback ใน `process_pdf` หากผู้รับอยู่ในอำเภอและจังหวัดเดียวกับหน่วยงานผู้ส่ง ให้ดึงรหัสไปรษณีย์ของผู้ส่งมาใช้
3. **ผลการทดสอบยืนยัน**:
   - สกัดข้อมูล `9.pdf` สำเร็จครบถ้วน 1 รายการ พร้อมรหัสไปรษณีย์ `48170` ถูกต้องแม่นยำ
   - ผ่านการทดสอบกับไฟล์ตัวอย่าง PDF ทั้ง 21 ไฟล์ในโฟลเดอร์ตัวอย่างโดยไม่มีข้อผิดพลาด (Zero Regression)
"""
if "## 23." not in txt_bug:
    txt_bug = txt_bug.strip() + "\n" + section_bug + "\n"
    open(p_bug, 'w', encoding='utf-8', newline='').write(txt_bug)
    print("BUGFIX_REPORT.md updated")

# 4. Update SKILL.md
p_skill = '../.agents/skills/c2dpost-web-workflow/SKILL.md'
if not os.path.exists(p_skill):
    p_skill = '.agents/skills/c2dpost-web-workflow/SKILL.md'
txt_skill = open(p_skill, 'r', encoding='utf-8').read()
section_skill = """
---

## 98. Resilient Receiver Address Parser with Auto Postal Code Database Lookup (`v2026.0925.0145`)

### 1. The Core Postal Extraction Problem
- Thai government land notices often omit the 5-digit postal code at the bottom of the receiver address block (e.g. `9.pdf` from Renunakhon Land Office, ending at `จังหวัด นครพนม`).
- Previously, `parse_receiver_label` relied strictly on a 5-digit regex (`^[๐-๙0-9]{5}$`) to locate the terminal line (`end_idx`). Without a postal code, `end_idx` remained `-1`, and the parser discarded the entire recipient block (`return None`), yielding 0 records.

### 2. Multi-Tier Boundary Fallback Detection
- **Fallback 1**: If no 5-digit zipcode line is matched, scan sequentially for `^(?:จังหวัด|จ\.)\s*[\u0e00-\u0e7f]+`.
- **Fallback 2**: If no province prefix is found, scan up to 6 lines following the recipient name for amphur/district tokens (`อำเภอ/เขต`, `อำเภอ`, `อ.`).
- **Terminal Line Handling**: When terminating on a province or amphur line (instead of a standalone zipcode line), append the line text to `raw_address_lines` to preserve full administrative jurisdiction.

### 3. Integrated Standard Thai Postal Code Database (`thai_postcodes.json`)
- Installed official mapping table of 7,498 sub-districts and 928 districts: `api/core/thai_postcodes.json`.
- Implemented `lookup_thai_zipcode(province, amphur, tambon)`:
  1. Priority 1: Exact `province|amphoe|district` match.
  2. Priority 2: `province|amphoe` match.
  3. Priority 3: `amphoe` match.
- Fallback in `process_pdf`: If receiver province & amphur match sender province & amphur, adopt `SHIPPER ZIPCODE`.
"""
if "## 98." not in txt_skill:
    txt_skill = txt_skill.strip() + "\n" + section_skill + "\n"
    open(p_skill, 'w', encoding='utf-8', newline='').write(txt_skill)
    print("SKILL.md updated")
