import os

# 1. Update ROADMAP_REPORT_FEATURE.md
p_roadmap = 'ROADMAP_REPORT_FEATURE.md'
txt_roadmap = open(p_roadmap, 'r', encoding='utf-8').read()
item_roadmap = """- [x] **4.75 ปรับการจัดกลุ่มสถานะ "บ้านปิด" (รหัส 301) ให้อยู่ในกลุ่ม "อยู่ระหว่างการนำจ่าย" (v2026.0924.2045)**
  - **หลักการทางไปรษณีย์ (Postal Operational Logic)**: สถานะ "บ้านปิด" (รหัส 301 / "นำจ่ายไม่สำเร็จ (บ้านปิด)") คือเหตุการณ์ข้อยกเว้นชั่วคราวขณะออกไปนำจ่าย โดยพัสดุยังคงเก็บรออยู่ที่ที่ทำการไปรษณีย์ปลายทางเพื่อรอนำจ่ายซ้ำหรือให้ผู้รับมารับ ไม่ใช่พัสดุตีกลับ/ส่งคืนต้นทาง พัสดุจะถือว่าส่งคืนก็ต่อเมื่อมีเหตุการณ์ส่งคืนชัดเจน (เช่น `ปณ.ปลายทางส่งคืน` หรือรหัส 502/503)
  - **การแก้ไขใน Backend (`api/index.py`)**:
    - ใน `classify_delivery_status`: เพิ่มเงื่อนไขตรวจสอบสถานะ "บ้านปิด" / รหัส 301 ล่วงหน้า หากยังไม่มีขั้นตอนการส่งคืนต้นทางชัดเจน ให้จัดประเภทเป็น `("in_transit", "อยู่ระหว่างการนำจ่าย")` เสมอ
    - ใน `get_dashboard_report`: แยกการตรวจสอบ `is_actual_return` ออกจากข้อยกเว้น "บ้านปิด" โดยบังคับให้พัสดุ "บ้านปิด" ที่ยังไม่ตีกลับคงสถานะเป็น `key: "in_transit"` นับรวมใน `in_transit_count` และ `st["in_transit"]` ของจังหวัดปลายทาง ไม่ถูกนับรวมใน `failed_count` / `st["failed"]` อีกต่อไป
    - คำนวณสัดส่วนเปอร์เซ็นต์ในรายการสาเหตุ (`pct_of_failed`) อย่างปลอดภัยด้วย `total_reasons` ป้องกันปัญหาแสดงผลเป็น 0.00% เมื่อไม่มีพัสดุตีกลับจริง
  - **การซิงก์ใน Frontend (`DepositReportView.jsx`, `DepositReportModal.jsx`, `TrackingInquiryView.jsx`)**: เพิ่มเกราะป้องกันใน `getDeliveryStatusInfo` และ `getCardStatusInfo` ให้พัสดุ "บ้านปิด" แสดงผลในกลุ่ม "อยู่ระหว่างการนำจ่าย" พร้อม Badge ข้อยกเว้นสีเหลืองอำพันสวยงาม
"""
if "4.75" not in txt_roadmap:
    txt_roadmap = txt_roadmap.strip() + "\n\n" + item_roadmap + "\n"
    open(p_roadmap, 'w', encoding='utf-8', newline='').write(txt_roadmap)
    print("ROADMAP_REPORT_FEATURE.md updated")

# 2. Update BUGFIX_REPORT.md
p_bug = 'BUGFIX_REPORT.md'
txt_bug = open(p_bug, 'r', encoding='utf-8').read()
section_bug = """
---

## 20. การจัดกลุ่มสถานะ "บ้านปิด" (รหัส 301) ให้อยู่ในกลุ่ม "อยู่ระหว่างการนำจ่าย" (v2026.0924.2045)

### 📌 ปัญหาที่พบ
- ในหน้าจอแดชบอร์ดสถิติ ("สถิติ") และตารางจัดอันดับจังหวัด พัสดุที่มีสถานะล่าสุดเป็น "บ้านปิด" (รหัส 301 / "นำจ่ายไม่สำเร็จ (บ้านปิด)") ถูกนำไปนับรวมในยอด "ส่งคืน" (`failed_count`) และคอลัมน์ "ส่งคืน" ของจังหวัด (เช่น จังหวัดนครพนม พัสดุ 11 ฉบับกลายเป็นส่งคืน 11 และอยู่ระหว่างการนำจ่ายกลายเป็น 0)
- ผู้ใช้งานแจ้งความต้องการ: **"สถานะ บ้านปิด จะต้องอยู่ในค่าของ อยู่ระหว่างการนำจ่าย"**

### 🔍 สาเหตุรากเหง้า (Root Cause)
1. ใน `api/index.py` ลูปนับพัสดุของ `get_dashboard_report`: ตัวแปร `is_failed_item` มีการตรวจสอบคำว่า `"นำจ่ายไม่สำเร็จ"` และ `"บ้านปิด"` ในข้อความสถานะ ส่งผลให้เงื่อนไข `elif is_failed_item:` ทำงานก่อนและเพิ่มยอด `failed += 1` และ `st["failed"] += 1` ข้ามหมวด `in_transit` ไป
2. ใน `classify_delivery_status` และ `getDeliveryStatusInfo`: มีการตรวจสอบคำว่า `"ไม่สามารถนำจ่าย"` ในกลุ่มสถานะส่งคืน ทำให้หากมีข้อความที่คล้ายกันอาจถูกปัดเข้ากลุ่มส่งคืน

### 🛠️ การแก้ไขที่ดำเนินการ
1. **`api/index.py` (`classify_delivery_status`)**:
   - เพิ่ม Guard ตรวจสอบ `if ("บ้านปิด" in desc_norm or code == "301") and not is_explicit_return:` ให้ส่งกลับ `("in_transit", "อยู่ระหว่างการนำจ่าย")` ทันที
2. **`api/index.py` (`get_dashboard_report`)**:
   - แยก `is_actual_return` เฉพาะรายการที่มีรหัสหรือคำสั่งส่งคืนจริง (`"ส่งคืน"`, `"คืนต้นทาง"`, `"ตีกลับ"`, `"502"`, `"503"`)
   - สำหรับพัสดุ "บ้านปิด" (รหัส 301): บังคับกำหนด `key = "in_transit"`, `rec["status_key"] = "in_transit"`, `rec["status_label"] = "อยู่ระหว่างการนำจ่าย"` และนับเข้า `in_transit_count` และ `st["in_transit"]` ของจังหวัด
   - คำนวณ `pct_of_failed` โดยใช้ `total_reasons` รองรับกรณีที่ไม่มีพัสดุตีกลับจริง ทำให้แสดงเปอร์เซ็นต์ได้ถูกต้อง
3. **Frontend (`DepositReportView.jsx`, `TrackingInquiryView.jsx`)**:
   - เพิ่มเงื่อนไขักใน `getDeliveryStatusInfo` และ `getCardStatusInfo` จัดหมวด "บ้านปิด" เข้ากลุ่ม `in_transit` ทันที
"""
if "## 20." not in txt_bug:
    txt_bug = txt_bug.strip() + "\n" + section_bug + "\n"
    open(p_bug, 'w', encoding='utf-8', newline='').write(txt_bug)
    print("BUGFIX_REPORT.md updated")

# 3. Update SKILL.md
p_skill = '.agents/skills/c2dpost-web-workflow/SKILL.md'
txt_skill = open(p_skill, 'r', encoding='utf-8').read()
section_skill = """
## 98. Classification of "บ้านปิด" (Code 301) Under "อยู่ระหว่างการนำจ่าย" (In Transit) (v2026.0924.2045)

- **Domain Rule**:
  - In Thailand Post operations, status code 301 (`นำจ่ายไม่สำเร็จ (บ้านปิด)`) represents a temporary delivery attempt milestone where the recipient's house was closed.
  - The parcel is held at the destination post office awaiting customer pickup or re-delivery. It is **NOT** a returned item (`ส่งคืน`).
  - An item is only marked as returned when the destination office registers a formal return dispatch (e.g. `ปณ.ปลายทางส่งคืน`, code 502/503).
- **Backend Rules (`api/index.py`)**:
  - `classify_delivery_status(status_code, status_desc)`: If status text contains "บ้านปิด" or code is "301" without explicit return keywords/codes, always return `("in_transit", "อยู่ระหว่างการนำจ่าย")`.
  - `get_dashboard_report`: Explicitly classify "บ้านปิด" records under `key: "in_transit"`, incrementing `in_transit_count` and province `st["in_transit"]`. Do NOT increment `failed` or `st["failed"]`.
- **Frontend Rules (`DepositReportView.jsx`, `TrackingInquiryView.jsx`)**:
  - `getDeliveryStatusInfo`: Intercept `/บ้านปิด/i` and code 301, returning `{ key: 'in_transit', label: 'อยู่ระหว่างการนำจ่าย', smartLabel: 'นำจ่ายไม่สำเร็จ (บ้านปิด)', className: 'exception' }`.
"""
if "## 98." not in txt_skill:
    txt_skill = txt_skill.strip() + "\n" + section_skill + "\n"
    open(p_skill, 'w', encoding='utf-8', newline='').write(txt_skill)
    print("SKILL.md updated")
