# สรุปคู่มือทักษะ เทคนิค สถาปัตยกรรม และสไตล์ (C2DPost Web Architecture & Master Guide)

เอกสารฉบับนี้รวบรวม **ทักษะ เทคนิค โซลูชันทางวิศวกรรม สไตล์ UI/UX และแนวทางการพัฒนาต่อยอด** ของโปรเจกต์ **C2DPost Web** ไว้อย่างละเอียดสมบูรณ์แบบ เพื่อใช้อ้างอิงและพัฒนาต่อในอนาคต

---

## 1. ปัญหาหลักและแนวทางสถาปัตยกรรม (Core Problem & Architecture)

### 🔴 โจทย์ความท้าทาย
1. **API บาร์โค้ดไปรษณีย์ไทย (PostOne) มีข้อจำกัด 2 ประการใหญ่**:
   - **Geo-Blocking**: เซิร์ฟเวอร์ `https://postone.thailandpost.com/api/bc.php` อนุญาตให้เฉพาะ IP Address ภายในประเทศไทยเท่านั้นที่จะส่งคำขอได้ Cloud Serverless ต่างประเทศ (เช่น Vercel สหรัฐฯ, AWS, DigitalOcean) จะถูกปฏิเสธ (HTTP 403 / Timeout)
   - **No CORS Header**: เซิร์ฟเวอร์ไม่มีการส่ง `Access-Control-Allow-Origin` ทำให้หน้าเว็บ Browser แบบ SPA ทั่วไปไม่สามารถเรียก API ผ่าน JavaScript `fetch()` ได้โดยตรง

### 🟢 ทางออก: สถาปัตยกรรมไฮบริด (Web App + Chrome Extension Bridge)
- **Frontend & Python Serverless (บน Vercel)**:
  - ทำหน้าที่เป็นศูนย์กลางของระบบ (เว็บใช้งาน, UI แดชบอร์ด, อัปโหลด PDF)
  - ประมวลผลเอกสาร PDF ด้วย Python Serverless (`pdfplumber`)
  - สร้างไฟล์ Excel DPost (`openpyxl`) และเอกสารพิมพ์พร้อมบาร์โค้ด Code128 (`reportlab`)
- **Chrome Extension Helper (Manifest V3)**:
  - ทำหน้าที่เป็น **API Proxy ภายในเครื่องของผู้ใช้ในไทย**
  - รับคำขอจำนวนและประเภทบาร์โค้ดจากหน้าเว็บผ่าน `window.postMessage`
  - ทำการ `fetch()` ไปยัง PostOne ด้วย IP ประเทศไทยของผู้ใช้เอง (โดยไม่มีปัญหาเรื่อง CORS เพราะมีสิทธิ์ `host_permissions`)
  - ส่งรายการหมายเลขบาร์โค้ด 13 หลักกลับเข้าสู่หน้าเว็บแบบเรียลไทม์

---

## 2. โครงสร้างและเทคโนโลยีที่ใช้ (Tech Stack & Structure)

```
C2DPost_web/
├── api/                          # Python Serverless API บน Vercel
│   ├── index.py                  # API Handler (/api/convert, /api/health)
│   ├── requirements.txt          # pdfplumber, reportlab, openpyxl, flask
│   ├── fonts/
│   │   └── tahoma.ttf            # ฟอนต์ไทย Tahoma สำหรับ ReportLab บน Linux
│   └── core/
│       ├── convert_dpost.py      # เอนจินสกัด PDF คำขอ สนง.ที่ดิน & สร้าง PDF/Excel
│       └── template.xlsx         # ไฟล์ต้นแบบ Excel DPost นำเข้า PostOne
├── extension/                    # Chrome Extension Helper (Manifest V3)
│   ├── manifest.json             # ประกาศ host_permissions & externally_connectable
│   ├── background.js             # Service Worker ยิง API PostOne
│   ├── content.js                # ตัวเชื่อมโยง DOM Handshake & postMessage
│   ├── popup.html & popup.js     # หน้าต่างทดสอบสถานะการเชื่อมต่อ
│   └── icons/                    # ไอคอนขนาด 16, 32, 48, 128 พิกเซล
├── src/                          # React + Vite Frontend
│   ├── components/
│   │   ├── ExtensionGate.jsx     # ตัวกักหน้าจอ ตรวจสอบการติดตั้ง Extension อัตโนมัติ
│   │   ├── LoginModal.jsx        # ระบบล็อกอินตรวจสอบสิทธิ์ผ่าน Google Sheets CSV
│   │   ├── Navbar.jsx            # แถบด้านบน พร้อมไฟสถานะ Extension แบบสด
│   │   ├── DropZone.jsx          # โซนลากวางไฟล์ PDF (Drag & Drop)
│   │   ├── PreviewGrid.jsx       # ตารางข้อมูลที่สกัดได้ พร้อมช่องแก้ไข/ลบ
│   │   └── ActionToolbar.jsx     # ปุ่มดึงบาร์โค้ด & ปุ่มส่งออกไฟล์ (Excel, PDF, ZIP)
│   ├── utils/
│   │   ├── api.js                # ฟังก์ชันยิง API ฝั่ง Vercel
│   │   └── parseCsv.js           # ตัวแยกข้อมูล CSV สำหรับระบบล็อกอิน
│   └── App.jsx                   # Component หลักรวมการทำงานทั้งหมด
└── vercel.json                   # ตั้งค่า Build & Routing บน Vercel
```

---

## 3. สไตล์และดีไซน์ UI/UX (Design System & Theme Switcher)

1. **ระบบ 2 ธีม (Dual Theme System: Light / Dark Mode)**:
   - **Light Mode (โหมดสว่าง - ค่าเริ่มต้น Default)**: ใช้โทนขาวคลีนสะอาดตา คอนทราสต์สูง (`#ffffff`, พื้นหลัง `#f8fafc`, ตัวหนังสือเข้มคมชัด `#0f172a`) เหมาะกับการทำงานเอกสารในเวลากลางวัน เป็นค่าเริ่มต้นสำหรับผู้ใช้งานใหม่ทุกคน พร้อม inline script ป้องกันการกระพริบแสง (Zero-FOUC)
   - **Dark Mode (โหมดมืด)**: ใช้โทน Slate Dark Glassmorphism (`#0b1120` ถึง `#0f172a`) แสงเงาสบายตา เหมาะกับการทำงานในที่แสงน้อยและลดความล้าของสายตา
   - **การจำค่าถาวร (Persistence)**: บันทึกโหมดที่ผู้ใช้เลือกลงใน `localStorage.getItem('c2dpost_theme')` และกำหนดค่า Attribute บน `<html>` อัตโนมัติ ทำให้เมื่อรีเฟรชหน้าเว็บแล้วธีมไม่รีเซ็ต
2. **Typography**:
   - หัวข้อและแบรนด์: ใช้ฟอนต์ **Prompt** (จาก Google Fonts) เพื่อความทันสมัย ชัดเจน และเป็นทางการ
   - ตัวเลขและตารางข้อมูล: ใช้ฟอนต์ **Inter** เพื่อความแม่นยำในการแสดงผลข้อมูลตัวเลขและรหัสไปรษณีย์
3. **Micro-Interactions**:
   - ปุ่มสลับธีม (`btn-theme-toggle`): บนแถบ Navbar มีไอคอน ☀️ ดวงอาทิตย์ / 🌙 พระจันทร์ พร้อมแอนิเมชันหมุนนุ่มนวล
   - ไฟสถานะ Extension (`ext-status-pill`): มีจุดกระพริบเขียวสดใสเมื่อ Extension เชื่อมต่อ และเปลี่ยนเป็นสีแดงทันทีหากยังไม่ได้ติดตั้ง
   - ตารางข้อมูลแบบ Inline Edit: ผู้ใช้สามารถแก้ไขหมายเลขบาร์โค้ด ชื่อ หรือที่อยู่ได้โดยตรงในตารางก่อนสั่งพิมพ์

---

## 4. เทคนิควิศวกรรมสำคัญ (Key Engineering Techniques)

### 1) การตรวจจับ Extension โดยไม่ต้องรีเฟรชหน้าเว็บ (Extension Gating)
- เมื่อหน้าเว็บโหลด `ExtensionGate.jsx` จะเช็ก Attribute `data-c2dpost-extension` บนแท็ก `<html>`
- Content Script จะรันที่ `run_at: document_start` และส่งสัญญาณ `postMessage` ยืนยันการมีอยู่ของ Extension ทันที
- มีระบบ Polling ส่ง Ping ทุก 1 วินาที เพื่อตรวจจับกรณีที่ผู้ใช้เพิ่งกดติดตั้ง Extension เสร็จ หน้าเว็บจะปลดล็อกเข้าสู่แดชบอร์ดอัตโนมัติทันที

### 2) การแก้ปัญหาฟอนต์ไทยบน Linux Serverless (ReportLab on Vercel)
- Vercel Serverless รันบนระบบปฏิบัติการ Linux ที่ไม่มีฟอนต์ภาษาไทยของ Windows (`C:/Windows/Fonts/tahoma.ttf`)
- **เทคนิค**: ฝังไฟล์ `tahoma.ttf` ไว้ในโฟลเดอร์ `api/fonts/` ภายในโปรเจกต์ และเขียนโค้ดค้นหาตามลำดับไดเรกทอรี ทำให้ระบบสามารถออกเอกสารใบนำส่งและซองจดหมายที่มีภาษาไทยถูกต้อง 100% ทั้งบน Local และ Production

### 3) ฐานข้อมูลสมาชิกแบบไม่ต้องใช้ Database Server (Google Sheets CSV Backend)
- ใช้ Google Spreadsheet เผยแพร่เป็นสาธารณะในรูปแบบ CSV:
  `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid=0`
- ทำให้แอดมินสามารถเพิ่ม/ลด/แก้ไขรายชื่อผู้มีสิทธิ์ใช้งาน สนง.ที่ดิน รหัสไปรษณีย์ และประเภทบาร์โค้ดผ่าน Google Sheet ได้โดยตรงแบบ Zero-Maintenance

### 4) เทคนิคการบันทึกภาพหน้าจอจริงสำหรับ Store (CDP Scaling & Profile Sanitization)
- **โจทย์ความละเอียด**: Chrome Web Store กำหนดขนาดภาพหน้าจอเคร่งครัดที่ `1280 x 800` พิกเซล แต่หน้าจอ Web App ที่มีทั้ง Header, Dropzone, แถบเครื่องมือคำสั่ง และตารางข้อมูลขนาดยาว จะถูกครอปส่วนล่างขาดหายไป
- **เทคนิคการย่อสัดส่วนผ่าน CDP**: ใช้ Node.js + Chrome DevTools Protocol สั่งรัน JavaScript `document.body.style.zoom = '0.72';` ก่อนสั่ง `Page.captureScreenshot` ทำให้ทั้ง แดชบอร์ด, ปุ่มคำสั่ง, และตารางข้อมูลผู้รับพร้อมหมายเลขบาร์โค้ด พอดีกับกรอบ 1280x800 อย่างสวยงามครบถ้วน
- **การตกแต่งข้อมูลให้เป็นทางการ (Profile Sanitization)**: แทนที่จะใช้ข้อมูล mock เช่น `admin / ADMIN` ได้ปรับระบบเดโมให้แสดงโปรไฟล์ผู้ใช้จริงระดับองค์กร เช่น `สนง.ที่ดินเรณูนคร` และตำแหน่ง `เจ้าหน้าที่` เพื่อความน่าเชื่อถือระดับมืออาชีพบน Store
- **ฟอร์แมตสี 24-bit RGB**: ใช้ PIL (Pillow) แปลงโหมดภาพเป็น RGB ตัด Alpha Channel (RGBA) ออก 100% ตามข้อกำหนดของ Store

### 5) เทคนิคการผ่านการตรวจสอบ Chrome Web Store (Submission & Compliance Checklist)
- **การตั้งค่าความปลอดภัยและนโยบาย**:
  - **Match Pattern ใน manifest.json**: ห้ามระบุ Port หรือ Wildcard Port ในส่วน `externally_connectable` (เช่น `http://localhost:*` จะถูก Store ปฏิเสธทันที) ต้องใช้โดเมนจริง เช่น `https://*.vercel.app/*`
  - **การห้ามใช้รีโมตโค้ด (Remote Code Prohibition)**: ในข้อกำหนด Manifest V3 ห้ามมีการโหลดไฟล์ JavaScript หรือสคริปต์ภายนอกมารันเด็ดขาด ในหน้าตั้งค่า Privacy ต้องเลือก **"ไม่ ฉันไม่ได้ใช้รีโมตโค้ด อยู่"**
  - **การยืนยันอีเมลผู้เผยแพร่ (Publisher Contact Email)**: Google จะบล็อกการส่งตรวจหากยังไม่ได้ยืนยันอีเมลในหน้า Developer Settings ต้องใส่อีเมลและกดลิงก์ยืนยันในกล่องข้อความ Gmail ก่อนเสมอ
  - **นโยบายความเป็นส่วนตัว (Privacy Policy)**: สร้างหน้าเว็บ HTML ทางการบรรจุไว้ใน `C2DPost_web/public/privacy.html` และขึ้นระบบจริงที่ `https://c2dpost-web.vercel.app/privacy.html` ระบุขอบเขตการใช้งานสิทธิ์ `storage` และ `host_permissions` อย่างโปร่งใส
  - **Trader Status**: เลือกเป็น **ไม่ใช่ผู้ค้า (Non-trader)**
  - **เนื้อหาสำหรับผู้ใหญ่ (Mature Content)**: ต้องปิดเป็น **OFF (สีเทา)**
  - **การเปิดเผย (Visibility)**: เลือกเป็น **สาธารณะ (Public)** ทั่วโลก (`ทุกภูมิภาค`) เพื่อให้ผู้ใช้จากทุกที่สามารถค้นหาและติดตั้งได้ทันที

---

## 5. ข้อมูลการเผยแพร่และรหัสรายการ (Store Deployment Details)

- **ชื่อส่วนขยาย**: C2DPost Helper - Thailand Post API Bridge
- **รหัสส่วนขยาย (Item ID)**: `cdkmibacceaacdiopcekkmfifaocapgk`
- **สถานะปัจจุบัน**: รอการตรวจสอบ (Pending Review)
- **ลิงก์หน้า Chrome Web Store อย่างเป็นทางการ (เมื่อผ่านการอนุมัติ)**:
  `https://chromewebstore.google.com/detail/cdkmibacceaacdiopcekkmfifaocapgk`
- **หน้านโยบายความเป็นส่วนตัว**:
  `https://c2dpost-web.vercel.app/privacy.html`

---

## 6. แนวทางการเชื่อมโยงหลังได้รับการอนุมัติ (Post-Approval Handover)

เมื่อทาง Google อนุมัติส่วนขยายเรียบร้อยแล้ว:
1. นำลิงก์หน้า Chrome Web Store ไปอัปเดตในไฟล์ `C2DPost_web/src/components/ExtensionGate.jsx`
2. ปรับปุ่ม "ดาวน์โหลดส่วนขยาย" ให้เปลี่ยนเป็น "ติดตั้งจาก Chrome Web Store" (คลิกเดียวติดตั้งลง Chrome ได้ทันที)
3. รันคำสั่ง `vercel --prod --yes` เพื่ออัปเดตหน้าเว็บหลัก

---

## 7. คำสั่งปฏิบัติการที่ใช้บ่อย (Useful Commands)

```bash
# 1. Build และ Deploy เว็บไซต์และ Python API ขึ้น Vercel
cd C2DPost_web
vercel --prod --yes

# 2. บีบอัด Extension เตรียมส่ง Chrome Web Store
Compress-Archive -Path "C2DPost_web\extension\*" -DestinationPath "C2DPost_web\public\c2dpost-extension.zip" -Force

# 3. บันทึกภาพหน้าจอจริงของระบบขนาด 1280x800 RGB แบบอัตโนมัติ
node C2DPost_web/capture_screenshot.cjs
```

---

## 8. ระบบเข้าสู่ระบบและการลงทะเบียนขอสิทธิ์ (Login & Registration Parity)

1. **หน้าต่าง Login (Login Screen)**:
   - **หัวข้อหลัก**: `C2DPost Login` โทนสีเขียว `#059669` พร้อมไฟสถานะ API คู่มุมขวาบน
   - **ลงทะเบียนขอสิทธิ์การใช้งาน**: ลิงก์เปิดแบบฟอร์มลงทะเบียนแบบ Progressive Unlocking ถอดแบบจาก Python Desktop (`RegistrationWindow`)
   - **คู่มือการใช้งาน**: ลิงก์ตรงสู่สื่อนำเสนอคู่มือการใช้งานบน Canva:
     `https://canva.link/dyl3brb47lyph8r`
   - **ติดต่อเจ้าหน้าที่**: ลิงก์ติดต่อเจ้าหน้าที่ส่วน ทข.ปข.10 ผ่าน LINE Official:
     `https://lin.ee/UzWqlKP`
   - **เลขเวอร์ชันเว็บ**: แสดง `v2026.0914.2046 (เวอร์ชันล่าสุด)` ด้านล่างการ์ด เชื่อมต่อโฟลเดอร์ Google Drive รวมตัวติดตั้ง:
     `https://drive.google.com/drive/folders/1ksrVAQVwkHDBE7qiqLT2ndyPHPQhz6vZ`

2. **ระบบลงทะเบียนขอสิทธิ์การใช้งาน (Registration Window Flow)**:
   - **ข้อความและโครงสร้าง 4 ส่วนถอดแบบจาก Python 100%**:
     - **ส่วนที่ 1 (ข้อมูลการเข้าสู่ระบบ)**:
       - Username & Password (ตัวอักษรสีส้มทอง `#d97706`)
       - ตรวจสอบความถูกต้อง Regex `^[a-zA-Z0-9.@$%&!<>?*/\\[\\]{}#_\\-=+]*$` หากพิมพ์ภาษาไทยจะขึ้นขอบแดงและแจ้งเตือน `❌ รองรับเฉพาะภาษาอังกฤษ ตัวเลข และสัญลักษณ์`
       - ปุ่ม `ตรวจสอบ` ยิงทดสอบไปยัง Web Service ของไปรษณีย์ไทยผ่าน `/api/verify_user` (`https://r_dservice.thailandpost.com/webservice/addItems`)
       - เมื่อผ่าน: ปุ่มเปลี่ยนเป็นสีเขียว, ขึ้นข้อความ `✅ ตรวจสอบ Username และ Password ถูกต้อง`, ล็อกช่อง Username/Password ไม่ให้แก้ไข และ**ปลดล็อกส่วนที่ 2**
     - **ส่วนที่ 2 (ข้อมูลหน่วยงาน)**:
       - ชื่อสำนักงาน/หน่วยงาน แบบเต็ม
       - Email ตรวจสอบรูปแบบ Regex
       - รหัสไปรษณีย์ (5 หลัก) ค้นหาชื่อที่ทำการอัตโนมัติจาก Google Sheets CSV:
         `https://docs.google.com/spreadsheets/d/12tt2MBVqBRMzoqfCjskt_Aft-SUGVMs7uH1Endp2cQI/export?format=csv`
       - เมื่อพบที่ทำการ (เช่น `ปณ.เรณูนคร`): แสดงชื่อที่ทำการในช่อง Readonly และ**ปลดล็อกส่วนที่ 3 และ 4**
     - **ส่วนที่ 3 (ข้อมูลผู้ประสานงาน)**:
       - ผู้ประสานงานหลัก (บังคับ) + เบอร์โทรศัพท์ 10 หลัก
       - ปุ่ม `+ เพิ่มผู้ประสานงาน` สามารถเพิ่มคนที่ 2 และคนที่ 3 ได้แบบ Dynamic (และซ่อนปุ่มเมื่อครบ 3 คน)
     - **ส่วนที่ 4 (ข้อตกลงและเงื่อนไข PDPA)**:
       - ข้อความเงื่อนไขทางกฎหมาย 5 ข้อเต็มรูปแบบตรงตามกฎหมาย PDPA และ พ.ร.บ.คอมพิวเตอร์
       - เช็คบ็อกซ์ยินยอม เมื่อติ๊กเลือกจะปลดล็อกปุ่ม `[ลงทะเบียน]`
   - **การส่งข้อมูลและจัดการสถานะ (Submission & Duplication)**:
     - ส่งข้อมูลผ่าน `/api/register_user` ไปยัง Google Apps Script:
       `https://script.google.com/macros/s/AKfycbwulS3437Gqf8tM_5pjYQhPfcSqcUNwM-PoKxjzw4cWL5FRCszE7VFDUKFuHEGYQg/exec`
     - ตรวจสอบ Username ซ้ำ: หากเคยลงทะเบียนแล้ว จะขึ้นเตือน `❌ Username นี้ มีการลงทะเบียนแล้ว` พร้อมปุ่ม `ลองใหม่อีกครั้ง`
      - หากลงทะเบียนสำเร็จ: ปุ่มเปลี่ยนเป็น `ส่งข้อมูลเสร็จสิ้น`, ล้างข้อมูลในฟอร์ม และนับถอยหลัง 10 วินาที `(ปิดหน้าต่างอัตโนมัติใน {count} วินาที)` ก่อนปิดหน้าต่างลงทะเบียนอัตโนมัติ

---

## 9. การบันทึกไฟล์ 3 ไฟล์แยกกันเทียบเท่าโปรแกรม Python (Exporting 3 Individual Files Parity)

- **การเปลี่ยนแปลงสำคัญ**: เดิมหน้าเว็บทำการรวบไฟล์ทั้งหมดเป็นไฟล์บีบอัด `.zip` เพียงไฟล์เดียว แต่ผู้ใช้ต้องการให้อ้างอิงตามโปรแกรม Python Desktop คือการได้รับไฟล์ 3 ไฟล์แยกกันทันที โดยไม่ต้องแตกไฟล์ ZIP
- **รายการไฟล์ที่ได้รับ**:
  1. 📊 **ไฟล์ Excel** (สำหรับ DPost นำเข้า PostOne) — `DPost_Export_<timestamp>.xlsx`
  2. 📄 **ไฟล์ PDF รวม** (เอกสารคำขอที่ดินพร้อมประทับตราสติกเกอร์บาร์โค้ดและ e-AR) — `DPost_Combined_<timestamp>.pdf`
  3. 📄 **ไฟล์ PDF ใบนำส่ง** (สำหรับยื่นที่ทำการไปรษณีย์) — `DeliveryNote_<timestamp>.pdf`
- **เทคนิคการดาวน์โหลดต่อเนื่องโดยไม่ถูกบล็อก (Sequential Controlled Throttling)**:
  - เบราว์เซอร์ส่วนใหญ่จะบล็อกคำสั่งดาวน์โหลดไฟล์หลายไฟล์พร้อมกันในคลิกเดียว (มองว่าเป็น Pop-up spam)
  - **วิธีแก้**: ในฟังก์ชัน `exportAllFiles` ใช้ `await new Promise(r => setTimeout(r, 500))` หน่วงเวลา 500ms ระหว่างไฟล์แต่ละประเภท ทำให้เบราว์เซอร์ดาวน์โหลดไฟล์ต่อเนื่องได้ราบรื่น 100% โดยไม่ติดบล็อก
  - แสดงความคืบหน้าแบบสด (Live Progress Status): `กำลังสร้างไฟล์ Excel...` ➔ `กำลังสร้างไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)...` ➔ `กำลังสร้างไฟล์ PDF (ใบนำส่ง)...`
  - กล่องแจ้งเตือนความสำเร็จ (Custom Success Dialog): แสดงรายการไฟล์ 3 ชนิดที่ได้รับตรงตาม Python

---

## 10. การแก้ปัญหาและเทคนิค Serverless File Streaming สำหรับประทับตราบาร์โค้ดลงบน PDF

### 🔴 ปัญหาเชิงลึก (The 311-Byte Damaged PDF Problem)
- **พฤติกรรมบน Python Desktop**: ไฟล์ PDF ต้นฉบับอยู่ในไดรฟ์เครื่องผู้ใช้ ฟังก์ชัน `generate_combined_pdf` สามารถเปิดไฟล์จาก Path จริง (`C:\...`) ได้ตลอดเวลาเพื่อค้นหาคำว่า `"เรียน"` และนำสติกเกอร์บาร์โค้ดไปแปะทับ (Merge Page)
- **พฤติกรรมบน Cloud Serverless**: บน Vercel ฟังก์ชันเป็นแบบ **Stateless** ไฟล์ที่ถูกส่งขึ้นมาแปลงในรอบแรกจะถูกลบออกจาก Temp Directory ทันทีเมื่อตอบกลับ JSON
- เมื่อผู้ใช้กด "บันทึกไฟล์" โค้ดเดิมส่งไปเฉพาะ JSON ตาราง ทำให้เซิร์ฟเวอร์หาไฟล์ต้นฉบับไม่พบ (`os.path.exists == False`) ส่งผลให้ไม่มีหน้าเอกสารถูกเพิ่มลงในไฟล์ PDF เลย (`0 หน้า`) และ PyPDF สร้างไฟล์ขนาด **311 bytes** ซึ่งเปิดไม่ได้และขึ้นว่าไฟล์ชำรุดเสียหาย

### 🟢 สถาปัตยกรรมแก้ไขแบบไร้ช่องโหว่ (Multipart Form Streaming Architecture)
1. **Frontend**: เก็บ State อ็อบเจกต์ `File` ต้นฉบับไว้ในตัวแปร `selectedFiles`
2. **Streaming via FormData**: เมื่อส่งออก PDF ประเภท `combined` ฟังก์ชัน `exportPdf` จะแพ็กอ็อบเจกต์ `File` ทั้งหมดส่งผ่าน `FormData` ไปยัง Endpoint `/api/export-pdf`
3. **Backend Dynamic Remapping (`api/index.py`)**:
   - เซิร์ฟเวอร์อ่านไฟล์ PDF ต้นฉบับและเขียนลงใน `tempfile.TemporaryDirectory()` ชั่วคราว
   - สแกนและแมปชื่อไฟล์ `SOURCE_FILE` ของแต่ละแถวเข้ากับ Path ของไฟล์ต้นฉบับใน Temp Directory
   - ส่งต่อ DataFrame ที่มี Path ไฟล์จริงให้ `generate_combined_pdf`
4. **Zero-Byte PDF Guard (`convert_dpost.py`)**:
   - เพิ่มคำสั่งตรวจสอบ: `if len(writer.pages) == 0: raise ValueError(...)` เพื่อการันตีว่าจะไม่มีการปล่อยไฟล์ชำรุด 311 bytes ออกไปสู่ผู้ใช้เด็ดขาด
5. **ผลลัพธ์**: ไฟล์ `DPost_Combined.pdf` สร้างหน้าเอกสารจริงพร้อมประทับตราบาร์โค้ด Code128 และตรา e-AR ได้ครบถ้วนทุกหน้า ขนาดไฟล์ปกติ (~110 KB ขึ้นไป) เปิดอ่านและสั่งพิมพ์ได้ 100%

---

## 11. การซิงก์คีย์และสกัดที่อยู่/รหัสไปรษณีย์ให้ตรงกับ Python 100% (Data Normalization)

- **สาเหตุที่ที่อยู่และรหัสไปรษณีย์ไม่แสดงในบางกรณี**:
  - ฟังก์ชัน `process_pdf()` ของ Python ต้นฉบับ คืนค่าพจนานุกรมที่มีคีย์เว้นวรรค เช่น `'RECEIVER ADDRESS'`, `'RECEIVER ZIPCODE'`
  - แต่ในฟังก์ชัน `records_to_dataframe()` จะแปลงชื่อคีย์เป็นแบบ Underscore (`RECEIVER_ADDRESS`, `RECEIVER_ZIPCODE`)
  - หน้าเว็บตาราง React ค้นหาคีย์ที่มี Underscore หาก API ส่งคีย์แบบเว้นวรรคมา ค่าจะกลายเป็น undefined และแสดงเป็น `-`
- **แนวทางปฏิบัติที่เป็นเลิศ (Best Practice)**:
  - ฝั่ง API `/api/convert`: ส่งผ่าน `records_to_dataframe(all_records)` เสมอเพื่อให้ชื่อคีย์ถูกแปลงเป็นมาตรฐานเดียวกัน
  - ฝั่ง Frontend (`App.jsx`, `PreviewGrid.jsx`): ใช้ Fallback Coalescing 2 ชั้นเสมอ:
    ```javascript
    const address = row.RECEIVER_ADDRESS || row['RECEIVER ADDRESS'] || '';
    const zipcode = row.RECEIVER_ZIPCODE || row['RECEIVER ZIPCODE'] || '';
    ```
  - รองรับเอกสารคำขอรังวัดของกรมที่ดินทุกรูปแบบ: ท.ด. 38 (แบ่งแยกในนามเดิม), ท.ด. 38 ค. (เอกสารแจ้งการปักหลักเขตที่ดิน), ท.ด. 81 (รวมโฉนด), ออกโฉนดที่ดิน

---

## 12. เทคนิคตกแต่งปุ่มเลือกหัวตารางและแถวข้อมูล (Non-Wrapping Checkbox Badges)

- **สาเหตุของปัญหา**: สัญลักษณ์ `[ ✓ ]` และ `[   ]` มีอักขระเว้นวรรค เมื่อคอลัมน์ในตารางถูกบีบขนาด เบราว์เซอร์จะตัดคำขึ้นบรรทัดใหม่ตรงช่องว่าง ทำให้ก้ามปูปิด `]` หล่นไปอยู่อีกบรรทัด (กลายเป็น `[ ✓` บรรทัดบน และ `]` บรรทัดล่าง)
- **แนวทางการแก้ไข**:
  1. แยกโครงสร้างเป็น Checkbox Badge 3 ชิ้นส่วน:
     ```jsx
     <span className="chk-box-badge" title="เลือก/ยกเลิกเลือก">
       <span className="chk-bracket">[</span>
       <span className="chk-mark">{isSelected ? '✓' : '\u00A0'}</span>
       <span className="chk-bracket">]</span>
     </span>
     ```
  2. กำหนด CSS `white-space: nowrap !important;` ทั้งในคลาส `.th-select`, `.col-checkbox` และ `.chk-box-badge`
  3. ตรึงความกว้างของคอลัมน์คงที่ `width: 58px; min-width: 58px;`
  4. ตรึงความกว้างของตัวติ๊กถูก `.chk-mark { width: 14px; text-align: center; }` เพื่อให้ก้ามปูซ้ายและขวาอยู่ตำแหน่งเดิมเสมอ ไม่กระตุกเมื่อสลับสถานะเลือก
  5. ดีไซน์สไตล์ Glassmorphism Emerald Tint พร้อมเอฟเฟกต์ Transition และ Hover เมื่อเอาเมาส์ชี้ รองรับทั้ง Light Mode และ Dark Mode อย่างประณีต

---

## 13. ระบบรายงานการรับฝากและตรวจสอบประวัติพัสดุ (Deposit Report & Tracking Stepper)

1. **รายงานการรับฝากไปรษณีย์ (`DepositReportModal.jsx`)**:
   - เชื่อมต่อ API `POST /api/reports/received` รับ Parameter วันที่ (`DD/MM/YYYY`) เพื่อดึงรายการพัสดุที่ไปรษณีย์ไทยรับฝากเข้าระบบ e-Parcel
   - แสดงการ์ดสถิติรวม: จำนวนชิ้นทั้งหมด, รับฝากสำเร็จ (ชิ้น และ %), ยอดรวมค่าบริการ
   - ตารางรายการพร้อมระบบค้นหาและแท็บกรองสถานะ (`ทั้งหมด`, `🟢 รับฝากแล้ว`)
   - ส่งออกรายงานเป็นไฟล์ **Excel (.xlsx)** พร้อมสูตร SUM ค่าบริการอัตโนมัติ และ **PDF (.pdf)** หัวราชการสำหรับลงนามส่งมอบ
2. **การดูประวัติสถานะพัสดุรายชิ้น (`TrackingTimelineModal.jsx`)**:
   - เปิดจากปุ่มไอคอนนาฬิกาในตาราง (`btn-tool-track`)
   - แสดงไทม์ไลน์สถานะจริง (Stepper) จาก `GET /webservice/getHistoryStatus` เรียงตามลำดับเวลา
   - มีระบบแสดงแบนเนอร์ข้อสังเกต API (`api_notice`) และแบนเนอร์โหมดจำลอง (`is_mock`) อย่างโปร่งใส
3. **ระบบตรวจสอบรับฝากอัตโนมัติ (Auto-Reconcile)**:
   - ปุ่ม "ตรวจสอบรับฝาก" (`btn-check-deposit`) ตรวจสอบรายการในตารางแบบกลุ่ม
   - ไฮไลต์แถวที่รับฝากแล้วด้วยสีเขียวอ่อน (`.reconciled-row`) เพื่อความชัดเจน

---

## 14. ระบบบันทึกประวัติ UseBarcode และอัปเดตสถานะคอลัมน์ E เป็น "yes"

1. **การบันทึกประวัติ UseBarcode อัตโนมัติ**:
   - เมื่อกดขอหมายเลขบาร์โค้ดจาก PostOne สำเร็จ ระบบจะส่งข้อมูลไปบันทึกที่ `UseBarcode.gsheet` (แท็บ `Barcode`) โดยบันทึก Timestamp (GMT+7), UserName, Barcode และ รายละเอียดผู้รับ
   - บันทึกสรุปยอดรวมประเภทบาร์โค้ด (EMS, R, eCo) และประวัติเวลาการใช้งาน (`TimeUse`) ในเบื้องหลังแบบ Asynchronous
2. **การอัปเดตสถานะคอลัมน์ E ("ส่งข้อมูล e-Parcel")**:
   - เมื่อผู้ใช้กดส่งข้อมูลเข้าสู่ e-Parcel Web Service สำเร็จ ระบบจะค้นหาหมายเลขบาร์โค้ดในชีต `UseBarcode` และอัปเดตค่าคอลัมน์ E เป็น `"yes"` โดยอัตโนมัติ
   - เรียกผ่านทั้ง Browser ตรง (`no-cors`) และสำรองผ่าน Backend API Proxy เพื่อความเสถียร 100%

---

## 15. นโยบายการพัฒนาใน C2DPost_web และการอัปเดตทักษะ สกิล และสไตล์อย่างต่อเนื่อง

1. **ขอบเขตการทำงานหลัก (Primary Workspace)**:
   - การพัฒนาฟีเจอร์ ปรับแต่ง และแก้ไขบั๊กทั้งหมดจะดำเนินการภายในโฟลเดอร์ `C2DPost_web` เป็นหลัก
2. **การอัปเดตสกิลและคู่มืออย่างต่อเนื่อง (Continuous Skill & Doc Sync)**:
   - ทุกครั้งที่มีการพัฒนาเทคนิคใหม่ แก้บั๊ก หรือปรับปรุง UI/UX จะต้องอัปเดตทั้ง `.agents/skills/c2dpost-web-workflow/SKILL.md` และ `C2DPost_web/PROJECT_DOCUMENTATION.md` เสมอ
   - อัปเดตเช็กลิสต์ใน `ROADMAP_REPORT_FEATURE.md` ให้สะท้อนสถานะปัจจุบัน
3. **การรักษามาตรฐานสไตล์และระบบ 2 ธีม**:
   - รองรับทั้ง Light Mode (Clean White) และ Dark Mode (Slate Glassmorphism) 100%
   - ใช้ฟอนต์ Google Fonts `Prompt` (หัวข้อ) และ `Inter` (ตาราง/ตัวเลข)
   - ป้องกันการตัดคำสัญลักษณ์ด้วย `white-space: nowrap !important` ในปุ่ม Badge และปุ่มคำสั่ง
4. **นโยบายเลขเวอร์ชัน (Version Policy)**:
   - อัปเดตเลขเวอร์ชันตามรูปแบบ `vYYYY.MMDD.HHMM` ใน `src/config.js`, `package.json`, `AboutModal.jsx`, `LoginModal.jsx` และ `api/core/convert_dpost.py` ทุกครั้งก่อน Deploy

---

## 16. การตรวจรับฝากผ่านปุ่ม "รายงานรับฝาก" และระบบ Auto-Sync สู่ตารางหลัก

1. **จุดศูนย์กลางการตรวจรับฝาก**:
   - การตรวจรับฝากพัสดุใน C2DPost Web ได้รับการรวมศูนย์ไว้ที่ **ปุ่ม "รายงานรับฝาก"** บน ActionToolbar และ Navbar ซึ่งแสดงเด่นด้วยสไตล์ White Glassmorphism
2. **ขั้นตอนการทำงานและ Auto-Sync**:
   - คลิกปุ่ม "รายงานรับฝาก" เพื่อเปิด `DepositReportModal` พร้อมดึงข้อมูลจาก API `POST /api/reports/received` ตามวันที่เลือก
   - ปุ่ม **"ซิงก์ผลรับฝากกับตารางหลัก"** (`handleSyncFromDepositReport`) จะจับคู่หมายเลข Barcode ในรายงานรับฝากกับรายการในตารางหลักทันที
   - แถวที่รับฝากแล้วจะขึ้นไฮไลต์สีเขียวอ่อน `.reconciled-row` และอัปเดตสถานะการรับฝากแบบเรียลไทม์ พร้อมแจ้งเตือนสรุปจำนวนชิ้นที่ซิงก์สำเร็จ
   - รองรับการส่งออกเป็นไฟล์ Excel (`.xlsx`) และ PDF (`.pdf`) หัวราชการพร้อมลงนาม

---

## 17. สถาปัตยกรรม Google Apps Script Web App และการบันทึกคอลัมน์ E ("ส่งข้อมูล e-Parcel")

1. **Script Project ID vs Deployment Web App URL**:
   - Script ID (เช่น `16TAW2fgTXNcu2iwzSqlqNpDngK01WF8w1MGf66z2hIa6sJee63zfMJjp`) เป็นเพียงโค้ดต้นฉบับ
   - การเรียกใช้งานจริงต้องใช้ Deployment URL (`/exec`):
     `https://script.google.com/macros/s/AKfycbyyuEJ3pLdXUidsyYoHv84uspMDf8G93U8Mw1ZYCB9ELpFAPjmpwUxsuarxnklnnQ/exec`
2. **การบันทึกสถานะ "yes" ลงคอลัมน์ E ของ UseBarcode.gsheet**:
   - ค้นหาแถวในชีต `UseBarcode` (แท็บ `Barcode`) โดยอิงตาม Barcode ในคอลัมน์ C แล้วบันทึกค่า `"yes"` ลงในคอลัมน์ E (คอลัมน์ 5)
   - ใช้เทคนิค **Dual Dispatch**: ยิงตรงจาก Browser (`mode: 'no-cors'`) ร่วมกับการส่งผ่าน Python API Backend Proxy เพื่อการันตีความสำเร็จ 100%

---

## 18. เทคนิคการออกแบบ White Glassmorphism และกฎการจัดวาง UI/UX

1. **ปุ่ม White Glassmorphism High-Contrast (`.btn-deposit-report-white`)**:
   - ใน Light Mode ใช้พื้นหลังขาวใส `rgba(255, 255, 255, 0.95)` ผสาน `backdrop-filter: blur(12px)` ขอบเส้นสีเขียวมรกต `border: 1.5px solid #059669` ตัวอักษรสีเขียวเข้ม `#065f46` และเงาละมุน `box-shadow: 0 2px 8px rgba(0,0,0,0.08)`
   - โดดเด่น สะอาดตา ไม่กลืนกับปุ่มคำสั่งสีอื่นใน Toolbar
2. **กฎป้องกันคำตัดบรรทัดเด็ดขาด (`white-space: nowrap !important;`)**:
   - กำหนดใน Badge สถานะ ปุ่มคำสั่ง และแท็บกรองทุกจุด ป้องกันคำภาษาไทยหรือสัญลักษณ์แตกบรรทัด
3. **การเน้นแถวรับฝากสำเร็จ (`.reconciled-row`)**:
   - แสดงสีเขียวมรกตโปร่งแสง พร้อมแถบสีด้านซ้าย `border-left: 3px solid #10b981` ชัดเจนทั้งใน Light Mode และ Dark Mode

---

## 20. ระบบจัดกลุ่มและแสดงสถานะนำจ่าย: นำจ่ายสำเร็จ, ส่งคืน, และอยู่ระหว่างการนำจ่าย (v2026.0914.2135)

1. **เกณฑ์การจัดกลุ่มสถานะ (Canonical Delivery Status Classification)**:
   - **นำจ่ายสำเร็จ (Delivered)**: ตรวจจับจากคีย์เวิร์ด `นำจ่ายสำเร็จ`, `ผู้รับได้รับเรียบร้อย`, `จัดส่งสำเร็จ`, `ส่งมอบเรียบร้อย`, `ส่งถึงผู้รับแล้ว` หรือรหัสสถานะ `501`, `delivered` แสดงด้วยป้ายสีเขียว Emerald พร้อมไอคอนเครื่องหมายถูก
   - **ส่งคืน (Returned)**: ตรวจจับจากคีย์เวิร์ด `ส่งคืน`, `คืนต้นทาง`, `ส่งคืนผู้ส่ง`, `ตีกลับ`, `ไม่สามารถส่งมอบ`, `ไม่สามารถนำจ่าย` หรือรหัสสถานะ `502`, `503`, `401`, `402`, `returned` แสดงด้วยป้ายสีแดง Rose พร้อมไอคอนตีกลับ
   - **อยู่ระหว่างการนำจ่าย (In Transit)**: จัดกลุ่มสถานะอื่นๆ ทั้งหมดที่อยู่ระหว่างทาง (เช่น `ส่งออกจากศูนย์คัดแยกสินค้า/ที่ทำการ`, `รับฝากเข้าระบบแล้ว`, `อยู่ระหว่างการขนส่ง`, `เตรียมการนำจ่าย` ฯลฯ) ให้แสดงเป็น `อยู่ระหว่างการนำจ่าย` ด้วยป้ายสีส้ม Amber อย่างเป็นระเบียบชัดเจน
   - แสดง Tooltip ข้อความเหตุการณ์จริงจากไปรษณีย์ไทยเมื่อนำเมาส์ไปชี้ที่ป้ายสถานะ
2. **การ์ดสรุปสถิติด้านบน (Summary Stat Cards - 5 ช่อง)**:
   - แสดงตัวเลขสถิติครบทั้ง 5 มิติ: (1) รายการทั้งหมด, (2) นำจ่ายสำเร็จ (พร้อม % สำเร็จ), (3) อยู่ระหว่างการนำจ่าย (พร้อม %), (4) ส่งคืน, (5) ยอดรวมค่าบริการ
3. **แท็บตัวกรองข้อมูล (Filter Tabs Toolbar)**:
   - มี 4 แท็บกรองสถานะ: `ทั้งหมด (N)`, `🟢 นำจ่ายสำเร็จ (N)`, `🟠 อยู่ระหว่างการนำจ่าย (N)`, และ `🔴 ส่งคืน (N)`
4. **การส่งออกรายงาน Excel และ PDF**:
   - คอลัมน์สถานะแสดงค่าที่ Normalize แล้ว (`นำจ่ายสำเร็จ`, `อยู่ระหว่างการนำจ่าย`, `ส่งคืน`)
   - ส่วนหัวสรุปรายงานแสดงตัวเลขสถิติแยกตามทั้ง 3 กลุ่มสถานะอย่างเป็นทางการ

---

## 21. ระบบแสดงวัน-เวลา และสถานที่ในไทม์ไลน์ติดตามสถานะพัสดุ (v2026.0914.2155)

1. **การดึงข้อมูลวันและเวลาสถานะจริงจาก Thailand Post Web Service (`getHistoryStatus`)**:
   - ระบบเพิ่มการตรวจจับฟิลด์ `statusDate` และ `station` จาก e-Parcel Web Service ซึ่งส่งมาเป็น `statusDate: "14/09/2026 14:30:00"` และ `station: "เรณูนคร"`
   - รองรับฟิลด์วันที่เวลาทุกรูปแบบทั้ง `statusDate`, `createdDate`, `receivedDate`, `dateTime`, `eventDate`, `orderDate`, และเวลาแยก `statusTime`
2. **การแสดงผลในหน้าติดตามสถานะพัสดุ (Tracking Inquiry View)**:
   - **ส่วนหัวผลการค้นหา**: แสดงป้าย `อัปเดตล่าสุด: DD/MM/YYYY HH:mm:ss` และป้ายสถานที่ `📍 ที่ทำการล่าสุด` พร้อมป้ายสถานะ 3 ระดับ (`นำจ่ายสำเร็จ`, `อยู่ระหว่างการนำจ่าย`, `ส่งคืน`)
   - **แต่ละขั้นตอนใน Stepper**: แสดงป้ายวัน-เวลาที่ชัดเจนด้วยไอคอนปฏิทิน-นาฬิกา ป้ายสถานที่ที่ทำการไปรษณีย์ และชื่อผู้ลงนาม
3. **การแสดงผลในหน้าต่างป๊อปอัป (Tracking Timeline Modal)**:
   - ซิงค์โครงสร้างและสไตล์เดียวกันเมื่อเปิดดูประวัติสถานะรายชิ้นจากตารางรายงานรับฝากหรือตาราง Workspace หลัก

---

## 22. รองรับแบบพิมพ์เอกสาร ท.ด. 38 ค. (เอกสารแจ้งการปักหลักเขตที่ดิน) (v2026.0914.2200)

1. **การเพิ่มเอกสารในหน้าต่างเกี่ยวกับระบบ (About Modal)**:
   - เพิ่มรายการต่อจาก `ท.ด. 38` ได้แก่:
     - **ท.ด. 38** (คำขอรังวัดแบ่งแยกในนามเดิม)
     - **ท.ด. 38 ค.** (เอกสารแจ้งการปักหลักเขตที่ดิน)
     - **ท.ด. 81** (คำขอรังวัดรวมโฉนด)
     - **ออกโฉนดที่ดิน** (คำขอรังวัดออกโฉนด)
2. **การสกัดและแปลงไฟล์ PDF อัตโนมัติ (`convert_dpost.py`)**:
   - อัปเกรด Regex การตรวจจับรหัสแบบพิมพ์: `r'\(\s*(ท\s*\.\s*ด\s*\.\s*[๐-๙0-9]+(?:\s*[ก-ฮ]\.?)?)\s*\)'` เพื่อให้ตรวจจับตัวอักษรต่อท้ายเช่น `ค.` หรือ `ค` ได้อย่างแม่นยำ
   - เพิ่ม Fallback ตรวจจับข้อความ `แจ้งการปักหลักเขตที่ดิน` และ `ท.ด. 38 ค` เพื่อกำหนดประเภทเอกสารเป็น `ท.ด. 38 ค.` โดยอัตโนมัติ

---

## 23. ปรับเปลี่ยนข้อความปุ่มดึงข้อมูลเป็น "อัปเดตข้อมูล" (v2026.0914.2205)

1. **ปรับปรุงข้อความปุ่มในหน้ารายงานรับฝาก**:
   - เปลี่ยนข้อความจาก `ดึงข้อมูลรับฝาก` เป็น `อัปเดตข้อมูล`
   - ปรับใช้ทั้งในหน้ารายงานรับฝากแบบเต็มจอ ([DepositReportView.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/DepositReportView.jsx)) และหน้าต่างป๊อปอัปรายงาน ([DepositReportModal.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/DepositReportModal.jsx))
   - สอดคล้องกับพฤติกรรมผู้ใช้งานที่ต้องการกดเพื่อรีเฟรชหรืออัปเดตข้อมูลรับฝากล่าสุดจากระบบ e-Parcel ไปรษณีย์ไทย

---

## 24. คลิกหมายเลข Barcode เพื่อตรวจสอบสถานะพัสดุ (v2026.0914.2215)

1. **การคลิกหมายเลขบาร์โค้ดในตารางรายงานรับฝาก ([DepositReportView.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/DepositReportView.jsx) และ [DepositReportModal.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/DepositReportModal.jsx))**:
   - ปรับเปลี่ยนเซลล์คอลัมน์ "หมายเลข Barcode" จากข้อความธรรมดาให้กลายเป็นปุ่มแบบ Interactive (`table-barcode-btn` / `barcode-btn-mono`) พร้อมไอคอนแว่นขยายตรวจสอบสถานะ
   - มี Hover Effect, เส้นใต้, Tooltip คำแนะนำ `คลิกเพื่อดูสถานะการตรวจสอบพัสดุ ...`
   - เมื่อคลิก จะเปิดหน้าต่างป๊อปอัป [TrackingTimelineModal](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/TrackingTimelineModal.jsx) เพื่อแสดงประวัติการนำส่ง, ไทม์ไลน์สถานะ, ปณ. ที่เกี่ยวข้อง, และสถานะล่าสุดแบบเรียลไทม์ โดยผู้ใช้งานยังคงอยู่ในหน้าและรายการเดิมของตารางรายงานรับฝาก ไม่สูญเสียลำดับหน้าหรือตัวกรอง
2. **ปุ่มเปิดหน้าตรวจสอบเต็มจอในหน้าต่าง Tracking Timeline**:
   - เพิ่มปุ่ม `เปิดหน้าตรวจสอบเต็มจอ` ในกรณีที่ผู้ใช้งานต้องการสลับไปยังหน้า [TrackingInquiryView](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/TrackingInquiryView.jsx) แบบเต็มรูปแบบ
3. **การคลิกหมายเลขบาร์โค้ดในตาราง Workspace หลัก ([PreviewGrid.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/PreviewGrid.jsx))**:
   - รองรับการคลิกหมายเลขบาร์โค้ดในคอลัมน์ "หมายเลข" เพื่อเปิดดูสถานะพัสดุได้เช่นเดียวกัน สะดวก รวดเร็ว และเป็นธรรมชาติ

---

## 25. ปรับเปลี่ยนชื่อแท็บเมนูเป็น "รายงานสถานะ" (v2026.0915.0923)

1. **การปรับชื่อแท็บเมนูหลักบน Navbar ([Navbar.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/Navbar.jsx))**:
   - เปลี่ยนข้อความจาก `รายงานรับฝาก` ➜ `รายงานสถานะ`
   - ปรับ Title และเมนูด้านข้างให้เป็น `รายงานสถานะ` เพื่อความกระชับ ชัดเจน และสะท้อนถึงการตรวจเช็คสถานะการนำส่งพัสดุครบวงจร (ทั้งนำจ่ายสำเร็จ, อยู่ระหว่างการนำจ่าย, และส่งคืน)
2. **ปรับหัวข้อในหน้ารายงาน ([DepositReportView.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/DepositReportView.jsx) และ [DepositReportModal.jsx](file:///e:/My%20Drive/ส่วน%20ทข.ปข.10/เว็บ/Convert%20PDF%20To%20Excel/C2DPost_web/src/components/DepositReportModal.jsx))**:
   - ปรับชื่อหัวเรื่องเป็น `รายงานสถานะไปรษณีย์ (e-Parcel Status Report)` ให้สอดคล้องกับชื่อแท็บเมนู

---

## 26. จัดเรียงการ์ดสรุปยอดสถานะและตัวกรองใหม่ พร้อมแสดงค่า % ในการ์ดส่งคืน (v2026.0915.0923)

1. **การจัดเรียงลำดับการ์ดสถิติสรุปภาพรวม 6 ช่อง (DepositReportView.jsx & DepositReportModal.jsx)**:
   - **การ์ด 1: รับฝากแล้ว** (	ext-blue, ไอคอนกล่องพัสดุ icon-received-deposit) แสดงจำนวนชิ้นและสัดส่วน {receivedCount} ({receivedRate}%)
   - **การ์ด 2: อยู่ระหว่างการนำจ่าย** (	ext-amber, ไอคอนรถขนส่ง icon-transit) แสดงจำนวนชิ้นและสัดส่วน {inTransitCount} ({inTransitRate}%)
   - **การ์ด 3: นำจ่ายสำเร็จ** (	ext-emerald, ไอคอนเครื่องหมายถูก icon-delivered) แสดงจำนวนชิ้นและสัดส่วน {deliveredCount} ({deliveredRate}%)
   - **การ์ด 4: ส่งคืน** (	ext-rose, ไอคอนลูกศรย้อนกลับ icon-returned) ปรับจากการแสดงผลเดิมที่ไม่มีเปอร์เซ็นต์ ให้แสดงค่าเปอร์เซ็นต์อัตโนมัติ {returnedCount} ({returnedRate}%)
   - **การ์ด 5: รายการทั้งหมด** (icon-total) แสดงจำนวนรวม {total_items} ฉบับ
   - **การ์ด 6: ยอดรวมค่าบริการ** (	ext-gold, ไอคอนการเงิน icon-fee) แสดงยอดเงินรวม ฿{total_fee}
2. **การจัดเรียงแท็บตัวกรอง (Filter Tabs)**:
   - ปรับลำดับแท็บตัวกรองให้สอดคล้องกับลำดับการ์ดด้านบน: ทั้งหมด ➔ รับฝากแล้ว ➔ อยู่ระหว่างการนำจ่าย ➔ นำจ่ายสำเร็จ ➔ ส่งคืน
