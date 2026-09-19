# โฟลเดอร์รวมไฟล์ Extension สำหรับ Chrome Web Store & โหลดใช้งาน (C2DPost Helper)

โฟลเดอร์นี้รวบรวมไฟล์แพ็กเกจส่วนขยาย (Chrome Extension) ทุกเวอร์ชันของ **C2DPost Helper** เพื่อให้ผู้ดูแลระบบและผู้ใช้งานสามารถตรวจสอบ เปรียบเทียบโค้ด และนำไปใช้งานได้ง่าย

---

## รายการไฟล์ในโฟลเดอร์นี้

### 1. ไฟล์บีบอัด Zip สำหรับอัปโหลด Chrome Web Store หรือดาวน์โหลดติดตั้ง
| ไฟล์ | เวอร์ชัน | ขนาด | รายละเอียดการปรับปรุง |
| :--- | :---: | :---: | :--- |
| **`C2DPost_Helper_v1.4.0_WebStore.zip`** | **1.4.0 (ล่าสุด)** | ~25 KB | รอบแก้บั๊กความเสถียร: เช็ค `lastError` + fallback เปิดแท็บใหม่ใน popup, เพิ่ม host permission `*.vercel.app`, เช็ค `lastError` ทุก sendMessage ใน content.js, ยับยั้ง auto-fill ตอนแท็บซ่อน + clearInterval ชั่วคราว |

> 📋 ดูประวัติการปรับปรุงทุกเวอร์ชันได้ที่ **`CHANGELOG.md`** ในโฟลเดอร์นี้


### 2. โฟลเดอร์ซอร์สโค้ดแบบแตกไฟล์แล้ว (Unpacked Source Code)
- **`../extension/` (ซอร์สปัจจุบัน = v1.4.0)** — ต้นฉบับโค้ดที่ใช้พัฒนาและแพ็ก zip (อ่านจาก `manifest.json` โดย `sync_extension_webstore.py`):
  - `manifest.json`: ไฟล์คอนฟิกหลักของ Extension (Manifest V3)
  - `background.js`: Service Worker สำหรับดึงข้อมูล API จาก PostOne และ e-AR
  - `content.js`: สคริปต์เชื่อมต่อสื่อสารระหว่างหน้าเว็บ C2DPost กับ Extension
  - `external_autofill.js`: สคริปต์ช่วยกรอกข้อมูลอัตโนมัติบนเว็บภายนอก (DPost / e-AR)
  - `popup.html` & `popup.js`: หน้าต่างป๊อปอัปแจ้งสถานะการทำงาน
  - `icons/`: ไอคอนขนาด 16x16, 48x48, 128x128 px
- **`C2DPost_Helper_v1.3.0_unpacked/`** และ **`C2DPost_Helper_v1.3.0_WebStore/`**: สแนปช็อตเวอร์ชัน 1.3.0 (เก็บไว้เปรียบเทียบอ้างอิง) — โครงสร้างไฟล์เหมือนด้านบน

---

## นโยบายการจัดการเวอร์ชัน (Version Management Policy)

> **เมื่อมี extension เวอร์ชันใหม่ ต้องลบของเดิมทุกตัวเสมอ** — ทั้ง zip และโฟลเดอร์สแนปช็อตเก่า (`*_unpacked/`, `*_WebStore/`) ในโฟลเดอร์นี้

- บังคับอัตโนมัติโดย `sync_extension_webstore.py` (ขั้นตอนที่ 3.1): หลังแพ็กเวอร์ชันใหม่ จะลบ zip และ directory เวอร์ชันอื่นที่ไม่ตรงกับ `manifest.json` ทิ้งทันที
- ทำงานกับ **zip** ใน: `extension_Webstore/`, `public/` และ `dist/` (dist สร้างใหม่โดย Vite จาก public)
- ⚠️ **ข้อจำกัด Google Drive:** ถ้าโฟลเดอร์เก่าโดน Drive Virtual File System รั้ง ACL (ผิดพลาด `Access is denied` / `takeown: no support for ACLs`) สคริปต์จะ **ข้ามพร้อมคำเตือน WARN** ไม่ทำให้การแพ็กสะดุด — ต้องลบด้วยมือผ่าน **Google Drive (web/app)** หรือ PowerShell แบบ **Run as administrator**

---

## วิธีการนำไปใช้งานใน Google Chrome

### วิธีที่ A: โหลดแบบ Unpacked (แนะนำสำหรับการทดสอบ/พัฒนา)
1. เปิด Google Chrome แล้วไปที่ `chrome://extensions`
2. เปิดสวิตช์ **"Developer mode" (โหมดนักพัฒนา)** ที่มุมบนขวา
3. คลิกปุ่ม **"Load unpacked" (โหลดที่คลายการบีบอัดแล้ว)**
4. เลือกโฟลเดอร์ `C2DPost_web\extension` (ซอร์ส v1.4.0)
5. ระบบจะติดตั้งส่วนขยายเวอร์ชัน **1.4.0** ทันที

### วิธีที่ B: อัปเดตจากเวอร์ชันเดิมที่ติดตั้งไว้แล้ว
1. เปิด `chrome://extensions`
2. กดปุ่ม **รีโหลด 🔄** บนการ์ดส่วนขยาย **C2DPost Helper**
