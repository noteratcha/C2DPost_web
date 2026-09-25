import os

# 1. Update PROJECT_DOCUMENTATION.md
doc_path = 'PROJECT_DOCUMENTATION.md'
doc_content = open(doc_path, 'r', encoding='utf-8').read()

section_64 = """

## 64. การตรวจสอบและปรับปรุงความคมชัดของข้อความในโหมดมืดทั่วทั้งระบบ (Dark Mode Typography & Contrast Overhaul) (v2026.0925.0705)

### 64.1 ปัญหาและความต้องการของผู้ใช้งาน
- ผู้ใช้งานแจ้ง: **"เมื่อปรับโหมดเป็นมืด ปรากฎว่ามีข้อความบางอันสีเป็นโทนมืดเหมือนโหมด ต้องการให้ตรวจสอบทั้งหมดและปรับสีข้อความให้ดูง่ายขึ้นเมื่อปรับเป็นโหมดมืด"**
- ปัญหาที่ตรวจพบ:
  1. ในหน้าสถิติแดชบอร์ด (`DashboardView`): ป้ายกำกับการ์ดสถิติ (`.stat-label`), ชื่อหัวข้อส่วนวิเคราะห์ (`.dash-section-title`), ชื่อจังหวัดในการ์ดรายละเอียด (`.dash-pd-name`), และชื่อรายการสาเหตุ (`.dash-reason-name`, `.dash-reason-count`) แสดงสีเทาเข้มเกือบดำ (`#0f172a`, `#334155`) กลืนกับพื้นหลังสีเข้มของ Dark Mode ทำให้อ่านยากมาก
  2. ในหน้ารายงานสถานะการฝากส่ง (`DepositReportView` / `DepositReportModal`): ข้อความระบุชื่อผู้รับ, ที่อยู่, วัน-เวลาล่าสุด, คำอธิบายสถานะ, ตัวเลขสรุปสถิติ, คำบรรยายในเมนู e-AR และกล่องช่วยเหลือ e-AR ปรากฏเป็นสีทึบ
  3. ในหน้าตรวจสอบพัสดุและไทม์ไลน์ (`TrackingInquiryView` / `TrackingTimelineModal`): ป้ายกำกับชื่อผู้รับตามจ่าหน้า, ผู้ลงนาม, คำแนะนำ e-AR และจุดบอกสถานะ (Stepper Dots) แสดงสีตัวอักษรไม่ชัดเจน
  4. ในหน้าจอแปลงไฟล์และอื่นๆ (`PreviewGrid`, `Navbar`, `SupportedDocsModal`, `RegistrationModal`, `AdminManagementView`): ป้ายสรุปสถิติเอกสาร, ป้ายข้อความคำแนะนำ และสถานะอินพุตที่ถูกปิดการใช้งานกลืนกับพื้นหลัง

### 64.2 สาเหตุรากเหง้า (Root Cause)
1. **การขาดตัวแปรแม่แบบใน `src/index.css`**:
   - ในไฟล์ `src/index.css` มีการกำหนดตัวแปร `--color-text` และ `--color-text-muted` ไว้ แต่ในส่วนของคอมโพเนนต์ย่อยต่างๆ มีการเรียกใช้ตัวแปร CSS ที่ชื่อ `--text-main`, `--text-muted`, `--text-primary`, `--text-secondary`, `--bg-card`, `--border-color`
   - เมื่อไม่มีการประกาศตัวแปรเหล่านี้ไว้ใน `:root[data-theme="dark"]` เบราว์เซอร์จึงหันไปใช้ค่า Fallback ที่กำหนดไว้ เช่น `color: var(--text-main, #0f172a)` หรือ `color: var(--text-muted, #64748b)` ซึ่งเป็นสีโทนเข้มสำหรับ Light Mode เสมอ
2. **Hardcoded Micro-Contrast ในปุ่ม Active และ Badge**:
   - ปุ่มเปลี่ยนหน้า Pagination ที่ถูกเลือก (`.btn-pagination-page.active`) และจุดสเต็ปนำจ่ายสำเร็จ มีการใส่ค่าสีตัวอักษร `#042f2e` (เขียวเข้มเกือบดำ) ซึ่งเมื่ออยู่ในโหมดมืดจะดูเหมือนตัวหนังสือมืดบนจุดสีมืด

### 64.3 การแก้ไขที่ดำเนินการ (Implementation Details)
1. **การยกเครื่องตัวแปรแม่แบบ CSS Tokens (`src/index.css`)**:
   - ประกาศตัวแปรอย่างเป็นทางการใน `:root, :root[data-theme="light"]`:
     - `--text-main: #0f172a`, `--text-primary: #0f172a`, `--text-muted: #64748b`, `--text-secondary: #475569`
     - `--bg-card: #ffffff`, `--bg-card-sub: #f8fafc`, `--bg-hover: #f1f5f9`, `--bg-input: #ffffff`, `--border-color: rgba(0, 0, 0, 0.08)`
   - ประกาศตัวแปรความสว่างสูงใน `:root[data-theme="dark"]`:
     - `--text-main: #f8fafc`, `--text-primary: #f8fafc`, `--text-muted: #94a3b8`, `--text-secondary: #cbd5e1`
     - `--bg-card: #1e293b`, `--bg-card-sub: #0f172a`, `--bg-hover: rgba(255, 255, 255, 0.06)`, `--bg-input: #0f172a`, `--border-color: rgba(255, 255, 255, 0.08)`
2. **การเสริมกฎ Explicit Dark Mode Overrides ในทุกคอมโพเนนต์**:
   - **`DashboardView.css`**: ปรับ `.stat-label` (`#94a3b8`), `.stat-value` (`#f8fafc`), `.dash-section-title` (`#f8fafc`), `.dash-pd-name` (`#f8fafc`), `.dash-reason-name` (`#f8fafc`), `.dash-reason-count` (`#f8fafc`), `.dash-pd-rate-pill.muted` (`#94a3b8`)
   - **`DepositReportView.css`**: ปรับ `.deposit-page-title` (`#f8fafc`), `.deposit-page-subtitle` (`#94a3b8`), `.cell-receiver-name` (`#f8fafc`), `.cell-address` (`#cbd5e1`), `.timestamp-badge` (`#94a3b8`), `.ear-menu-item .menu-item-title` (`#f8fafc`), `.ear-menu-item .menu-item-desc` (`#94a3b8`), `.ear-help-icon-title h3` (`#f8fafc`), `.ear-help-alert-box p` (`#cbd5e1`), `.btn-quick-date.active` (`#ffffff`), `.btn-pagination-page.active` (`#ffffff`)
   - **`TrackingInquiryView.css`**: ปรับ `.tracking-page-title` (`#f8fafc`), `.quick-barcodes-label` (`#94a3b8`), `.result-label` (`#94a3b8`), `.stepper-meta-row` (`#94a3b8`), `.stepper-dot.dot-success` (`#ffffff`)
   - **`DepositReportModal.css` & `TrackingTimelineModal.css`**: ปรับ `.stat-card-unit` (`#94a3b8`), `.deposit-loading-cell p` (`#94a3b8`), `.empty-desc` (`#94a3b8`), จุดสเต็ปนำจ่ายสำเร็จ/รับฝากแล้ว/มีเหตุขัดข้องเป็นสีขาวสดใส
   - **`PreviewGrid.css`**: ปรับ `.stat-label-item` (`#cbd5e1`), `.python-parity-table td` (`#cbd5e1`), `.empty-table-state h4` (`#f8fafc`), `.chk-box-badge` (`#94a3b8`)
   - **`SupportedDocsModal.css`, `Navbar.css`, `ThailandMap.css`, `AdminManagementView.css`, `RegistrationModal.css`, `LoginModal.css`, `App.css`**: ปรับข้อความตัวอักษร ป้ายเมนู คำอธิบาย และข้อความตัวอย่างทั้งหมดให้มี Contrast สูง อ่านง่าย สบายตา
"""

if "v2026.0925.0705" not in doc_content:
    with open(doc_path, 'a', encoding='utf-8') as f:
        f.write(section_64)
    print("Updated PROJECT_DOCUMENTATION.md")
else:
    print("PROJECT_DOCUMENTATION.md already contains v2026.0925.0705")

# 2. Update ROADMAP_REPORT_FEATURE.md
roadmap_path = 'ROADMAP_REPORT_FEATURE.md'
road_content = open(roadmap_path, 'r', encoding='utf-8').read()

item_482 = """
- [x] **4.82 ปรับปรุงสีข้อความและ Contrast ในโหมดมืด (Dark Mode) ทั่วทั้งระบบ (v2026.0925.0705)**
  - **ยกเครื่องตัวแปร Global Typography Tokens (`src/index.css`)**:
    - นิยาม `--text-main`, `--text-primary`, `--text-muted`, `--text-secondary`, `--bg-card`, `--border-color` ใน `:root[data-theme="dark"]` อย่างสมบูรณ์ ขจัดปัญหา Fallback ไปใช้สีเข้มของโหมดสว่าง
  - **ตรวจสอบและปรับจูนความคมชัด 12 โมดูล CSS ครบทุกมุมมอง**:
    - `DashboardView.css`: ตัวเลขสถิติ, ชื่อการ์ดวิเคราะห์, ชื่อจังหวัด, รายการสาเหตุส่งคืนและนำจ่ายไม่สำเร็จ
    - `DepositReportView.css` & `DepositReportModal.css`: ชื่อผู้รับ, ที่อยู่, วันที่, ข้อความเมนูและกล่องช่วยเหลือ e-AR
    - `TrackingInquiryView.css` & `TrackingTimelineModal.css`: ป้ายกำกับไทม์ไลน์, ป้ายผู้ลงนาม, จุด Stepper Dots ไอคอนขาวบริสุทธิ์
    - `PreviewGrid.css`, `Navbar.css`, `ThailandMap.css`, `SupportedDocsModal.css`, `RegistrationModal.css`, `LoginModal.css`, `AdminManagementView.css`, `App.css`
  - **ปรับ Micro-Contrast ของปุ่ม Active และ Badge**: เปลี่ยนสีข้อความ/ไอคอนปุ่มแอคทีฟจาก `#042f2e` เป็น `#ffffff` ชัดเจนทุกสายตา
"""

if "v2026.0925.0705" not in road_content:
    with open(roadmap_path, 'a', encoding='utf-8') as f:
        f.write(item_482)
    print("Updated ROADMAP_REPORT_FEATURE.md")
else:
    print("ROADMAP_REPORT_FEATURE.md already contains v2026.0925.0705")

# 3. Update BUGFIX_REPORT.md
bugfix_path = 'BUGFIX_REPORT.md'
bug_content = open(bugfix_path, 'r', encoding='utf-8').read()

section_27 = """

---

## 27. ข้อความในโหมดมืด (Dark Mode) กลืนไปกับพื้นหลังทำให้อ่านยาก (v2026.0925.0705)

### 📌 ปัญหาและความต้องการของผู้ใช้
- ผู้ใช้งานแจ้ง: **"เมื่อปรับโหมดเป็นมืด ปรากฎว่ามีข้อความบางอันสีเป็นโทนมืดเหมือนโหมด ต้องการให้ตรวจสอบทั้งหมดและปรับสีข้อความให้ดูง่ายขึ้นเมื่อปรับเป็นโหมดมืด"**
- ปัญหา: ข้อความบางส่วนในหน้า Dashboard (เช่น ป้ายกำกับสถิติ, หัวข้อส่วน, ชื่อจังหวัด, รายการสาเหตุ) รวมถึงข้อความในตารางรายงานสถานะ, ป้ายเมนู e-AR, ไทม์ไลน์ติดตามพัสดุ และโมดอลต่างๆ แสดงเป็นสีเทาเข้มเกือบดำ (`#0f172a`, `#334155`, `#64748b`) ซึ่งตัดกับพื้นหลังสีเข้มของ Dark Mode ได้ไม่ดี ทำให้ผู้ใช้งานอ่านข้อมูลได้ลำบาก

### 🔍 สาเหตุรากเหง้า (Root Cause)
1. **ตัวแปร Global Token ไม่สมบูรณ์ใน `src/index.css`**:
   - คอมโพเนนต์ต่างๆ เรียกใช้ตัวแปร `var(--text-main, #0f172a)` และ `var(--text-muted, #64748b)`
   - แต่ใน `:root[data-theme="dark"]` มีการประกาศเฉพาะ `--color-text` เท่านั้น ไม่ได้ประกาศ `--text-main` หรือ `--text-muted` ไว้
   - เบราว์เซอร์จึงหันไปใช้ค่า Fallback สีเข้มของโหมดสว่างเสมอเมื่อเปิดโหมดมืด
2. **การกำหนดสี Hardcoded ในปุ่มสถานะและไอคอน**:
   - ปุ่มเปลี่ยนหน้าตัวเลขที่ถูกเลือก (`.btn-pagination-page.active`) และจุดสเต็ปนำจ่ายสำเร็จใช้สีเขียวเข้ม `#042f2e` ซึ่งมองเห็นไม่ชัดบนพื้นหลังสีมืด

### 🛠️ การแก้ไขที่ดำเนินการ
1. **`src/index.css`**:
   - ประกาศตัวแปรแม่แบบสำหรับโหมดมืด `:root[data-theme="dark"]`:
     - `--text-main: #f8fafc;` (ขาวประกาย คมชัด)
     - `--text-primary: #f8fafc;`
     - `--text-muted: #94a3b8;` (เงินสว่าง สบายตา)
     - `--text-secondary: #cbd5e1;`
     - `--bg-card: #1e293b;`
     - `--bg-card-sub: #0f172a;`
     - `--border-color: rgba(255, 255, 255, 0.08);`
2. **ปรับปรุงไฟล์ CSS ทุกคอมโพเนนต์ (รวม 12 ไฟล์)**:
   - `DashboardView.css`: ปรับสีข้อความการ์ดสถิติ, ส่วนหัว, การ์ดรายละเอียดจังหวัด และรายการสาเหตุการส่งคืน/นำจ่ายไม่สำเร็จ
   - `DepositReportView.css` & `DepositReportModal.css`: ปรับสีชื่อผู้รับ, ที่อยู่, ป้ายเวลา, สถิติสรุป, เมนู e-AR และ Alert Box
   - `TrackingInquiryView.css` & `TrackingTimelineModal.css`: ปรับสีป้ายบาร์โค้ด, ผู้รับตามจ่าหน้า, ผู้ลงนาม, คำแนะนำ และจุดสเต็ป
   - `PreviewGrid.css`, `Navbar.css`, `ThailandMap.css`, `SupportedDocsModal.css`, `RegistrationModal.css`, `LoginModal.css`, `AdminManagementView.css`, `App.css`: ปรับแต่งให้อ่านง่าย สบายตา ครบ 100%
3. **ผลลัพธ์**:
   - ข้อความทุกจุดในโหมดมืดมีสีขาวสะอาดตา (`#f8fafc`), สีเงินนวลตา (`#cbd5e1`, `#94a3b8`) หรือสีเน้นที่คมชัดสูง อ่านง่ายขึ้นอย่างเห็นได้ชัดและไม่แสบตา
"""

if "v2026.0925.0705" not in bug_content:
    with open(bugfix_path, 'a', encoding='utf-8') as f:
        f.write(section_27)
    print("Updated BUGFIX_REPORT.md")
else:
    print("BUGFIX_REPORT.md already contains v2026.0925.0705")

# 4. Update SKILL.md
skill_path = '../.agents/skills/c2dpost-web-workflow/SKILL.md'
skill_content = open(skill_path, 'r', encoding='utf-8').read()

section_102 = """

---

## 102. System-Wide Dark Mode Typography & Contrast Variable Architecture (v2026.0925.0705)

### 1. The Core Variable Deficit
- **The Issue**: Components frequently applied CSS fallback colors such as `color: var(--text-main, #0f172a)` or `color: var(--text-muted, #64748b)`.
- When `:root[data-theme="dark"]` in `src/index.css` lacked definitions for `--text-main` and `--text-muted`, the browser triggered fallback evaluation, rendering ink-black `#0f172a` text on deep-slate `#1e293b` backgrounds.

### 2. Standardized Global Variable Contract (`src/index.css`)
```css
:root, :root[data-theme="light"] {
  --text-main: #0f172a;
  --text-primary: #0f172a;
  --text-muted: #64748b;
  --text-secondary: #475569;
  --bg-card: #ffffff;
  --bg-card-sub: #f8fafc;
  --bg-hover: #f1f5f9;
  --bg-input: #ffffff;
  --bg-row-even: #f8fafc;
  --border-color: rgba(0, 0, 0, 0.08);
}

:root[data-theme="dark"] {
  --text-main: #f8fafc;
  --text-primary: #f8fafc;
  --text-muted: #94a3b8;
  --text-secondary: #cbd5e1;
  --bg-card: #1e293b;
  --bg-card-sub: #0f172a;
  --bg-hover: rgba(255, 255, 255, 0.06);
  --bg-input: #0f172a;
  --bg-row-even: rgba(15, 23, 42, 0.35);
  --border-color: rgba(255, 255, 255, 0.08);
}
```

### 3. Component Verification Checklist
1. All card titles and numeric values must use `--text-main` or `#f8fafc` in dark mode.
2. All labels, subtitles, units, and timestamps must use `--text-muted` or `#94a3b8` in dark mode.
3. Secondary body text (receiver names, addresses, descriptions) must use `--text-secondary` or `#cbd5e1`.
4. Interactive active pills and status badges must avoid dark text colors (use `#ffffff` on active badges).
"""

if "v2026.0925.0705" not in skill_content:
    with open(skill_path, 'a', encoding='utf-8') as f:
        f.write(section_102)
    print("Updated SKILL.md")
else:
    print("SKILL.md already contains v2026.0925.0705")
