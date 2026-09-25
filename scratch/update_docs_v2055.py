import os

# 1. Update PROJECT_DOCUMENTATION.md
p_doc = 'PROJECT_DOCUMENTATION.md'
txt_doc = open(p_doc, 'r', encoding='utf-8').read()
txt_doc = txt_doc.replace('v2026.0924.2045', 'v2026.0924.2055')
open(p_doc, 'w', encoding='utf-8', newline='').write(txt_doc)
print('PROJECT_DOCUMENTATION.md updated')

# 2. Update ROADMAP_REPORT_FEATURE.md
p_roadmap = 'ROADMAP_REPORT_FEATURE.md'
txt_roadmap = open(p_roadmap, 'r', encoding='utf-8').read()
item_roadmap = """- [x] **4.76 ดึงสถานะก่อน "ส่งคืนต้นทาง" มาแสดงเป็นสาเหตุการส่งคืน/นำจ่ายไม่สำเร็จ (v2026.0924.2055)**
  - **รากเหง้าของปัญหา (Root Cause)**: ในระบบ Backend API ขาด `import re` ที่ระดับโมดูล ทำให้เมื่อฟังก์ชัน `_extract_failure_reason_from_events` เรียกใช้ `_normalize_failure_reason` จึงเกิด `NameError` และถูกกลืนด้วยบล็อก try-except ทำให้ข้อมูลสาเหตุที่แท้จริงไม่ถูกบันทึก และปัดกลับไปใช้ข้อความสถานะล่าสุดซึ่งเป็นขั้นตอนขนส่ง เช่น "ปณ.ต้นทางส่งคืนบริษัท" หรือ "ส่งคืนต้นทาง"
  - **การปรับปรุงการสกัดสาเหตุที่แท้จริง (`api/index.py`)**:
    - เพิ่ม `import re` ที่หัวไฟล์ `api/index.py`
    - ปรับปรุงฟังก์ชัน `_extract_failure_reason_from_events` ให้ตรวจจับทุกขั้นตอนส่งคืน (`ส่งคืนต้นทาง`, `ปณ.ปลายทางส่งคืน`, `ปณ.ต้นทางส่งคืนบริษัท`, `ตีกลับ`, `502`, `503`) แล้วสแกนย้อนกลับไปยังสถานะก่อนหน้าทันที เพื่อดึงเอาสถานะข้อยกเว้นที่แท้จริง (เช่น `ย้าย / ไม่ทราบที่อยู่ใหม่`, `บ้านปิด`, `ผู้รับไม่อยู่`, `ออกใบแจ้ง`) มาเป็นสาเหตุ
    - ปรับ `_normalize_failure_reason` และการคำนวณแดชบอร์ดให้ป้องกันไม่ให้ข้อความขั้นตอนส่งคืน ("ส่งคืนต้นทาง", "ปณ.ปลายทางส่งคืน") กลายมาเป็นชื่อสาเหตุเด็ดขาด
  - **ปรับแต่งการแสดงผลในหน้าต่างไทม์ไลน์ (`TrackingTimelineModal.jsx`)**:
    - แก้ไขเงื่อนไข `isException` ให้ไม่ครอบคลุมคำว่า "คืน" ในขั้นตอนส่งคืน (`ส่งคืน`, `ปลายทางส่งคืน`, `ต้นทางส่งคืน`) ป้องกันการแสดง Badge เตือนซ้ำซ้อน "ข้อยกเว้น: ปณ.ปลายทางส่งคืน" ให้คงไว้เฉพาะขั้นตอนข้อยกเว้นจริง เช่น "ข้อยกเว้น: ย้าย / ไม่ทราบที่อยู่ใหม่"
"""
if "4.76" not in txt_roadmap:
    txt_roadmap = txt_roadmap.strip() + "\n\n" + item_roadmap + "\n"
    open(p_roadmap, 'w', encoding='utf-8', newline='').write(txt_roadmap)
    print("ROADMAP_REPORT_FEATURE.md updated")

# 3. Update BUGFIX_REPORT.md
p_bug = 'BUGFIX_REPORT.md'
txt_bug = open(p_bug, 'r', encoding='utf-8').read()
section_bug = """
---

## 21. ดึงสถานะก่อน "ส่งคืนต้นทาง" มาแสดงเป็นข้อมูลสาเหตุการส่งคืน / นำจ่ายไม่สำเร็จ (v2026.0924.2055)

### 📌 ปัญหาที่พบ
- ผู้ใช้งานพบว่าในประวัติสถานะพัสดุ (เช่น บาร์โค้ด `BC414488655TH`) มีขั้นตอน "ส่งคืนต้นทาง" / "ปณ.ปลายทางส่งคืน" / "ปณ.ต้นทางส่งคืนบริษัท" เกิดขึ้น แต่ในช่องข้อมูลสาเหตุของระบบกลับแสดงเป็น "ส่งคืนต้นทาง" หรือ "อื่น ๆ (ส่งคืนต้นทาง)" แทนที่จะแสดงสถานะข้อยกเว้นที่เกิดขึ้นก่อนหน้านั้น
- ผู้ใช้งานแจ้งความต้องการ: **"เห็นข้อมูลไหมว่ามีสถานะ ส่งคืนต้นทาง เกิดขึ้น ต้องการให้เอาสถานะก่อนมาแสดงเป็นข้อมูล สาเหตุการส่งคืน / นำจ่ายไม่สำเร็จ"**
- ในหน้าต่างไทม์ไลน์ (`TrackingTimelineModal`) ขั้นตอนส่งคืนถูกติด Badge เตือนซ้ำซ้อนเป็น `[ข้อยกเว้น: ปณ.ปลายทางส่งคืน] [ส่งคืนต้นทาง]`

### 🔍 สาเหตุรากเหง้า (Root Cause)
1. ใน `api/index.py` ขาดการ `import re` ในระดับโมดูล ทำให้เมื่อฟังก์ชัน `_normalize_failure_reason` พยายามเรียก `re.search` เกิดข้อผิดพลาด `NameError: name 're' is not defined` และถูกครอบด้วย `except Exception: pass` ทำให้ระบบไม่สามารถสกัดสาเหตุที่แท้จริงจากไทม์ไลน์ได้ และตกกลับไปใช้ข้อความสถานะล่าสุด ("ปณ.ต้นทางส่งคืนบริษัท")
2. ใน `TrackingTimelineModal.jsx` ตัวแปร `isException` มีคำว่า `|คืน` อยู่ใน Regex ทำให้ข้อความ "ปณ.ปลายทางส่งคืน" ติดทั้งแท็กข้อยกเว้นและแท็กส่งคืนพร้อมกัน

### 🛠️ การแก้ไขที่ดำเนินการ
1. **`api/index.py`**:
   - เพิ่ม `import re` ที่ระดับบนสุดของโมดูล
   - ออกแบบฟังก์ชัน `_extract_failure_reason_from_events` ใหม่ ให้ค้นหาขั้นตอนส่งคืนแรก (`_is_return_step`) แล้วสแกนย้อนกลับเพื่อดึงสถานะข้อยกเว้นก่อนหน้า (เช่น `ย้าย / ไม่ทราบที่อยู่ใหม่`) มาเป็นสาเหตุทันที
   - กรองและป้องกันไม่ให้ข้อความขั้นตอนขนส่งส่งคืนถูกบันทึกเป็นชื่อสาเหตุในแดชบอร์ด
2. **`TrackingTimelineModal.jsx`**:
   - ปรับ Regex ของ `isException` ให้คัดกรองคำว่าส่งคืนออก เพื่อให้แท็กข้อยกเว้นแสดงเฉพาะขั้นตอนข้อยกเว้นจริง (เช่น `ข้อยกเว้น: ย้าย / ไม่ทราบที่อยู่ใหม่`) และขั้นตอนส่งคืนแสดงเฉพาะแท็ก `ส่งคืนต้นทาง` สีแดง
3. **`DepositReportView.jsx`**:
   - ปรับ Smart Badge ของพัสดุส่งคืน ให้แสดงชื่อสาเหตุจริงที่ตรวจพบ เช่น `ส่งคืน (ย้าย / ไม่ทราบที่อยู่ใหม่)`
"""
if "## 21." not in txt_bug:
    txt_bug = txt_bug.strip() + "\n" + section_bug + "\n"
    open(p_bug, 'w', encoding='utf-8', newline='').write(txt_bug)
    print("BUGFIX_REPORT.md updated")

# 4. Update SKILL.md
p_skill = '.agents/skills/c2dpost-web-workflow/SKILL.md'
txt_skill = open(p_skill, 'r', encoding='utf-8').read()
section_skill = """
## 99. True Return Cause Extraction Prior to Return Steps (v2026.0924.2055)

- **Domain Rule**:
  - In Thailand Post tracking, parcels marked with return steps (e.g. `ปณ.ปลายทางส่งคืน`, `ส่งคืนต้นทาง`, `ปณ.ต้นทางส่งคืนบริษัท`) have their actual failure reason recorded in the delivery attempt milestone IMMEDIATELY PRECEDING the return step (e.g. `ย้าย / ไม่ทราบที่อยู่ใหม่`, `บ้านปิด`, `ผู้รับไม่อยู่`, `ออกใบแจ้ง`, `ปฏิเสธการรับ`).
  - The return step itself is NEVER the cause of failure; it is merely the transport action.
- **Backend Rules (`api/index.py`)**:
  - Must ensure `re` is imported at top level so regex normalization never raises `NameError`.
  - `_extract_failure_reason_from_events(events)`: Locate the first return milestone, scan backward skipping transit milestones, and return the normalized preceding delivery exception.
  - Dashboard reason aggregation: Ensure reasons containing return transport phrases are sanitized so they never appear in the "สาเหตุการส่งคืน / นำจ่ายไม่สำเร็จ" card.
- **Frontend Rules (`TrackingTimelineModal.jsx`, `DepositReportView.jsx`)**:
  - `TrackingTimelineModal.jsx`: Exclude return words from `isException` so return steps only receive the danger `ส่งคืนต้นทาง` badge, not `ข้อยกเว้น: ปณ.ปลายทางส่งคืน`.
  - `DepositReportView.jsx`: Badge shows `ส่งคืน ({failureReason})` when available.
"""
if "## 99." not in txt_skill:
    txt_skill = txt_skill.strip() + "\n" + section_skill + "\n"
    open(p_skill, 'w', encoding='utf-8', newline='').write(txt_skill)
    print("SKILL.md updated")
