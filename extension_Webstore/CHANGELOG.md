# CHANGELOG — C2DPost Helper (Chrome Web Store Extension)

บันทึกการปรับปรุงทุกเวอร์ชันของส่วนขยาย **C2DPost Helper - Thailand Post API Bridge**

เลขเวอร์ชันตรวจจับพร้อมกันที่ 4 จุดเสมอ: `manifest.json` → `background.js` (PONG) → `content.js` → `popup.js` (ดู BUGFIX_REPORT.md หัวข้อ 3.7)

---

## v1.4.0 — รอบแก้บั๊กความเสถียร (2026-09-18)

- **popup.js**: เพิ่มเช็ค `chrome.runtime.lastError` ทุก callback ของ `chrome.tabs` + fallback เปิดแท็บใหม่เมื่อลิงก์เปิดซ้ำเดิม + `chrome.windows.update` โฟกัสหน้าต่าง (แก้ปุ่ม "เปิดเว็บ C2DPost" กดแล้วไม่โฟกัส)
- **manifest.json**: เพิ่ม host permission `https://*.vercel.app/*` เพื่อให้ `chrome.tabs.query` ค้นหาแท็บเว็บ C2DPost ที่ deploy บน Vercel ได้
- **content.js**: เช็ค `chrome.runtime.lastError` ทุก `sendMessage` (`FETCH_BARCODES` / `SET_CREDENTIALS` / `SET_EAR_SEARCH` / `FETCH_EAR_PDF`) → ถ้าผิดพลาดตอบ error กลับหน้าเว็บแทนการ "คลิกเงียบ" (เหตุหลัก: extension ถูกปิด/ถูก reload ทิ้งทำให้หน้าเว็บรอไม่จบ)
- **external_autofill.js**: guard `document.visibilityState !== 'visible'` ไม่รัน auto-fill เมื่อแท็บถูกซ่อน + `pagehide` → `clearInterval` ล้างตัวตรวจจับ (ลดการทำงานเบื้องหลังที่เกินจำเป็น)
- **เวอร์ชัน**: ซิงก์ 1.4.0 ครบ 4 จุด, แพ็ก zip ใหม่, ลบ zip ล้าสมัย v1.1.0/v1.2.0/v1.3.0 ออกจาก web root และ public

## v1.3.0 — Bridge ใบตอบรับ e-AR (Batch / Akamai Relay) (2026-09-18)

- เพิ่ม `FETCH_EAR_PDF`: ดึงใบตอบรับอิเล็กทรอนิกส์ (e-AR PDF) จาก `https://e-ar.thailandpost.com/ear-api/print/e-ar` ผ่าน extension บน IP ไทยในเครื่อง ข้ามการบล็อก CORS + Akamai 403 ที่ตี cloud IP (Vercel/AWS/GCP)
- ส่งผลเป็น `pdfBase64` → ตัวพิมพ์ซอง (Deposit Report) และภาพลายเซ็น/ผู้รับบนหน้าเว็บ
- รองรับ batch ดาวน์โหลด e-AR หลายชิ้นพร้อมกัน (แผน 3-up A4 / ZIP) ผ่าน `earService.js`
- เว็บฝั่ง client ใช้ `compareVersions(ver, '1.3.0')` จำกัดฟีเจอร์เฉพาะเวอร์ชันที่รองรับ
- ซิงก์อัลกอริทึม Modulus 11 check digit ให้ตรงกับ `convert_dpost.py`

## v1.2.0 — เครื่องมือค้นหาพัสดุอัตโนมัติใน e-AR (2026-09-17)

- บนหน้า `https://e-ar.thailandpost.com/ear`: สลับเงื่อนไขค้นหา (Joy UI `<Select>`) เป็น **"หมายเลขบาร์โค้ด"** อัตโนมัติ
- กรอกบาร์โค้ดลงในช่องค้นหา + กดปุ่ม **"ค้นหา"** ให้เอง ไม่ต้องสัมผัสเมนู
- บันทึกคำขอค้นหาลง `chrome.storage.local` (`SET_EAR_SEARCH` / `GET_EAR_SEARCH`) เพื่อให้หน้าเว็บรู้สถานะ

## v1.1.0 — ระบบช่วยกรอก Username/Password อัตโนมัติ (2026-09-17)

- ไฟล์ใหม่ `external_autofill.js`: content script ที่หน้าล็อกอิน **DPost** (`https://dpost.thailandpost.com`) และ **e-AR** (`https://e-ar.thailandpost.com`) — กรอก Username/Password อัตโนมัติแล้ว submit
- เก็บ credentials ใน `chrome.storage.local` (`SET_CREDENTIALS` / `GET_CREDENTIALS`) และตอบกลับเว็บ C2DPost
- Floating badge "⚡ C2DPost Helper • กรอกข้อมูลสำเร็จ" ที่มุมล่างขวาเมื่อทำงานสำเร็จ
- **Version telemetry**: inject `data-c2dpost-version` ให้เว็บหน้า C2DPost รู้เวอร์ชันจริง (Navbar โชว์ "• ติดตั้งแล้ว (v1.1.0)") — fallback เป็น 1.0.0 ถ้าเป็นบิลด์เก่า
- เพิ่ม host permissions `dpost.thailandpost.com/*`, `e-ar.thailandpost.com/*`
- สร้างสคริปต์แพ็กเกจ `sync_extension_webstore.py` (ลบ `key` ออกจาก manifest ก่อนทำ Web Store zip)

## v1.0.0 — รุ่นแรก: Bridge ดึงเลขบาร์โค้ด PostOne (2026-09-16)

- bridge `FETCH_BARCODES` → `POST https://postone.thailandpost.com/api/bc.php?typ=&cnt=` ผ่าน extension บน IP ไทยในเครื่อง
- แก้ปัญหา CORS + Geo-block ต้นทาง ทำให้เว็บบน cloud ดึงเลขบาร์โค้ดได้จริง
- คำนวณ **Check Digit (Modulus 11)** ขั้นตอนวิธี 8-6-4-2-3-5-9-7 เพื่อให้เลขครบ 13 หลักถูกต้องตามไปรษณีย์ไทย
- ตรวจจับการติดตั้งผ่าน `data-c2dpost-extension` + handshake `PING`
- โครงสร้าง Manifest V3: Service Worker `background.js` + `content.js` + popup แจ้งสถานะ