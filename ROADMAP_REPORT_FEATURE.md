# แผนงานและเช็กลิสต์พัฒนาระบบรายงานการรับฝาก (Deposit Report Checklist)
> **โปรเจกต์**: C2DPost Web Edition  
> **เป้าหมาย**: เพิ่มระบบดึงข้อมูลและรายงานตรวจสอบรายการรับฝากจากไปรษณีย์ไทย (e-Parcel Web Service)  
> **สถานะ**: กำลังดำเนินการพัฒนาทีละขั้นตอน (Step-by-Step)

---

## 📌 ภาพรวมขั้นตอนการทำงาน (Phased Roadmap)

```
[Phase 1: Backend API] ➔ [Phase 2: UI Dashboard] ➔ [Phase 3: Export Excel/PDF] ➔ [Phase 4: Timeline & Polish]
```

---

## 🚀 Phase 1: การเตรียมโครงสร้างพื้นฐานและการเชื่อมต่อ API (API & Data Pipeline)
- [x] **1.1 กำหนดค่าการเชื่อมต่อ (Config & Credentials)**
  - กำหนดตัวแปรสำหรับเก็บ Username / Password และ Endpoint ของ `r_dservice.thailandpost.com`
  - ตรวจสอบความปลอดภัย ไม่ให้รหัสผ่านรั่วไหลไปยังฝั่ง Browser
- [x] **1.2 สร้าง Backend Endpoint บน Python Serverless (`api/index.py`)**
  - สร้าง Endpoint `/api/reports/received` รับ Parameter `date` (`DD/MM/YYYY`)
  - เชื่อมต่อ API `GET https://r_dservice.thailandpost.com/webservice/getAllOrderReceived?date=:date` ผ่าน Basic Authentication
  - ดักจับ Error กรณีเชื่อมต่อไม่สำเร็จ หรือไม่มีข้อมูลในวันนั้น
- [x] **1.3 Data Normalization & Data Cleansing**
  - แปลงฟิลด์ข้อมูลจาก e-Parcel ให้เป็นมาตรฐานเดียวกัน (เช่น `barcode`, `customerName`, `receivedDate`, `status`, `productWeight`)
  - แปลงวันที่และเวลาให้อยู่ในฟอร์แมตภาษาไทยที่อ่านง่าย

---

## 💻 Phase 2: หน้าต่างแสดงผลรายงานบนเว็บ (Web UI & Interactive Modal)
- [x] **2.1 เมนูปุ่มเปิดรายงาน (Navbar / ActionToolbar)**
  - เพิ่มปุ่มไอคอน **"📋 รายงานรับฝาก"** บนแถบเมนูด้านบน พร้อม Tooltip
- [x] **2.2 คอมโพเนนต์หน้าต่างรายงาน (`DepositReportModal.jsx`)**
  - ตัวเลือกวันที่ (DatePicker) ย้อนหลัง/ปัจจุบัน
  - ปุ่มกด **"ดึงข้อมูลรับฝาก"** พร้อมไฟแสดงสถานะกำลังโหลด (Loading Spinner)
- [x] **2.3 การ์ดสรุปยอดภาพรวม (Executive Stat Cards)**
  - 📦 ยอดรวมรายการทั้งหมด
  - 🟢 รับฝากสำเร็จ (ชิ้น และ %)
  - ⏳ รอยืนยันเข้าระบบ
  - ⚖️ น้ำหนักรวม (กรัม/กก.) & ค่าบริการรวม
- [x] **2.4 ตารางรายการข้อมูล (Report Data Grid)**
  - ตารางแสดง: ลำดับ, วัน-เวลารับฝาก, เลขบาร์โค้ด, ผู้รับ, ปณ.รับฝาก, น้ำหนัก, สถานะ
  - ระบบค้นหาด่วน (Search Box) ค้นหาจากชื่อหรือเลขบาร์โค้ด
  - แท็บกรองสถานะ: `ทั้งหมด`, `🟢 รับฝากแล้ว`
- [x] **2.5 ออกแบบ UI & ธีม (Design System & Dual Theme)**
  - รองรับทั้ง **Light Mode** (คลีน ขาว คอนทราสต์สูง) และ **Dark Mode** (Slate Glassmorphism) 100%

---

## 📄 Phase 3: การส่งออกรายงาน (Exporting Excel & PDF)
- [x] **3.1 ส่งออกตาราง Excel (.xlsx) สำหรับกระทบยอด**
  - ใช้ `openpyxl` ออกแบบตารางรายงานค่าใช้จ่ายประจำวัน
  - มีหัวตารางสีสวยงาม ฟอนต์อ่านง่าย
  - ใส่สูตร Auto-SUM คำนวณยอดรวมน้ำหนักและค่าจัดส่งล่างสุด สำหรับฝ่ายการเงิน/บัญชี
- [x] **3.2 ส่งออกรายงาน PDF (.pdf) สำหรับงานราชการ**
  - ใช้ `reportlab` ออกแบบรายงานทางการ มีหัวหนังสือราชการ, ชื่อ สนง.ที่ดิน, วันที่
  - ตารางสรุปรายการพร้อมช่องลงนามเจ้าหน้าที่ผู้ส่งมอบและผู้รับฝากไปรษณีย์
  - ใช้ฟอนต์ภาษาไทย Tahoma/Prompt 100% ไม่เพี้ยนบน Cloud Serverless
- [x] **3.3 ปุ่มดาวน์โหลดแบบแยกไฟล์ (One-Click Downloads)**
  - ปุ่ม `[📊 ดาวน์โหลด Excel]` และ `[📄 ดาวน์โหลด PDF]` บนหน้าต่างรายงาน

---

## 🔍 Phase 4: ประวัติสถานะเชิงลึกและปรับแต่งสมบูรณ์แบบ (Advanced Features & Polish)
- [x] **4.1 ดูประวัติสถานะรายชิ้น (Tracking Timeline Modal)**
  - เมื่อคลิกที่แถว สามารถดึงไทม์ไลน์สถานะจริงจาก `getHistoryStatus` มาแสดงเป็น Stepper
- [x] **4.2 Auto-Reconcile กับตารางหน้าแรก**
  - สามารถกดตรวจสอบรายการที่เพิ่งแปลงไฟล์ PDF ไปว่า ชิ้นไหนไปรษณีย์รับฝากแล้วบ้างแบบไฮไลต์แถว
- [x] **4.3 บันทึกประวัติและเลขเวอร์ชัน**
  - อัปเดตเลขเวอร์ชันของเว็บ (`APP_VERSION`) เป็น `v2026.0914.1422` ตามกฎ `vYYYY.MMDD.HHMM` (Section 15)
- [x] **4.4 Deploy ขึ้น Production** — `vercel --prod --yes` สำเร็จ (aliased → `https://c2dpost-web.vercel.app`)
- [x] **4.5 โชว์ข้อผิดพลาดของ API จริงใน UI** — เพิ่มแบนเนอร์แจ้งเตือน `api_notice` (Amber Warning) และแบนเนอร์โหมดจำลอง `is_mock` (Sky Info) ทั้งบนหน้าตาราง Reconcile, Tracking Timeline Stepper และ Deposit Report Modal แสดงผลสวยงามทั้ง Light/Dark Mode 100%
- [x] **4.6 ปรับแต่ง UI ตาราง (Table Polish)** — นำคอลัมน์ "การรับฝาก" ออกจากตารางหลัก เพื่อให้พื้นที่การแสดงผลที่อยู่และชื่อผู้รับกว้างขึ้น ชัดเจนขึ้น โดยยังคงแถบแบนเนอร์สรุปและระบบไฮไลต์แถวสีเขียว (.reconciled-row) เมื่อตรวจสอบรับฝากไว้ครบถ้วน
- [x] **4.7 บันทึกประวัติ UseBarcode (Google Sheet)** — เชื่อมต่อการดึงหมายเลขบาร์โค้ดทุกครั้ง ให้บันทึกประวัติลง `UseBarcode` (แท็บ `Barcode`) โดยบันทึก `Timestamp`, `UserName`, `Barcode`, `Details` พร้อมบันทึกสรุปยอดและประวัติผู้ใช้งานแบบเดียวกับโปรแกรม Python Desktop 100%

---

## 🔴 งานค้าง/สิ่งที่ต้องทำต่อ (Next Backlog)

- [ ] **4.6 สร้าง Git commit แรก + int remote** — repo ที่ Drive root ยังไม่มี commit/remote (branch `master`) ยังไม่ได้ `git push origin main`
