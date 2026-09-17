# โฟลเดอร์รวมไฟล์ Extension สำหรับ Chrome Web Store & โหลดใช้งาน (C2DPost Helper)

โฟลเดอร์นี้รวบรวมไฟล์แพ็กเกจส่วนขยาย (Chrome Extension) ทุกเวอร์ชันของ **C2DPost Helper** เพื่อให้ผู้ดูแลระบบและผู้ใช้งานสามารถตรวจสอบ เปรียบเทียบโค้ด และนำไปใช้งานได้ง่าย

---

## รายการไฟล์ในโฟลเดอร์นี้

### 1. ไฟล์บีบอัด Zip สำหรับอัปโหลด Chrome Web Store หรือดาวน์โหลดติดตั้ง
| ไฟล์ | เวอร์ชัน | ขนาด | รายละเอียดการปรับปรุง |
| :--- | :---: | :---: | :--- |
| **`C2DPost_Helper_v1.3.0_WebStore.zip`** | **1.3.0 (ล่าสุด)** | ~25 KB | เพิ่ม Bridge `FETCH_EAR_PDF` เพื่อดึงใบตอบรับและลายเซ็น e-AR จาก IP ประเทศไทยโดยตรง (ข้ามปัญหา CORS), รองรับการแสดงภาพลายเซ็นและข้อมูลผู้รับบนหน้าเว็บ |
| `C2DPost_Helper_v1.2.0_WebStore.zip` | 1.2.0 | ~24 KB | เพิ่มฟังก์ชัน Auto-fill สำหรับระบบ e-AR และระบบ DPost |
| `C2DPost_Helper_v1.1.0_WebStore.zip` | 1.1.0 | ~21 KB | รองรับการขอช่วงเลขบาร์โค้ด PostOne สำหรับจดหมายลงทะเบียน (R) และ EMS |

### 2. โฟลเดอร์ซอร์สโค้ดแบบแตกไฟล์แล้ว (Unpacked Source Code)
- **`C2DPost_Helper_v1.3.0_unpacked/`**:
  - `manifest.json`: ไฟล์คอนฟิกหลักของ Extension (Manifest V3)
  - `background.js`: Service Worker สำหรับดึงข้อมูล API จาก PostOne และ e-AR
  - `content.js`: สคริปต์เชื่อมต่อสื่อสารระหว่างหน้าเว็บ C2DPost กับ Extension
  - `external_autofill.js`: สคริปต์ช่วยกรอกข้อมูลอัตโนมัติบนเว็บภายนอก (DPost / e-AR)
  - `popup.html` & `popup.js`: หน้าต่างป๊อปอัปแจ้งสถานะการทำงาน
  - `icons/`: ไอคอนขนาด 16x16, 48x48, 128x128 px

---

## วิธีการนำไปใช้งานใน Google Chrome

### วิธีที่ A: โหลดแบบ Unpacked (แนะนำสำหรับการทดสอบ/พัฒนา)
1. เปิด Google Chrome แล้วไปที่ `chrome://extensions`
2. เปิดสวิตช์ **"Developer mode" (โหมดนักพัฒนา)** ที่มุมบนขวา
3. คลิกปุ่ม **"Load unpacked" (โหลดที่คลายการบีบอัดแล้ว)**
4. เลือกโฟลเดอร์:
   `e:\My Drive\ส่วน ทข.ปข.10\เว็บ\Convert PDF To Excel\extension_Webstore\C2DPost_Helper_v1.3.0_unpacked`
5. ระบบจะติดตั้งส่วนขยายเวอร์ชัน **1.3.0** ทันที

### วิธีที่ B: อัปเดตจากเวอร์ชันเดิมที่ติดตั้งไว้แล้ว
1. เปิด `chrome://extensions`
2. กดปุ่ม **รีโหลด 🔄** บนการ์ดส่วนขยาย **C2DPost Helper**
