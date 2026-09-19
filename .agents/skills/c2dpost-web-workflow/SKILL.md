---
name: c2dpost-web-workflow
description: >-
  Comprehensive guide, architecture, design system, API bridge patterns, and deployment workflows
  for the C2DPost Web project (Thailand Post PDF extraction, PostOne Barcode Extension, and document exports).
---

# C2DPost Web Workflow & Technical Guide

This skill documents the complete architecture, technical stack, design patterns, and deployment techniques used in the **C2DPost Web** application (`Convert PDF To Excel & Thailand Post Barcode Integration`). Use this guide when maintaining, extending, or replicating this system in future projects.

---

## 1. System Overview & Architecture (สถาปัตยกรรมระบบ)

```
[User Browser (Thailand)]
    │
    ├── 1. Web App UI (React + Vite on Vercel)
    │       ├── Drag & drop DOL Land Office PDF
    │       ├── Interactive editable table (PreviewGrid)
    │       └── Download Excel, PDF Delivery Notes, Envelopes
    │
    ├── 2. Python Serverless API (/api/index.py on Vercel)
    │       ├── PDF extraction via pdfplumber
    │       ├── openpyxl Excel DPost generation
    │       └── ReportLab PDF & Code128 Barcode generation
    │
    └── 3. Chrome Extension Bridge (C2DPost Helper - Manifest V3)
            ├── Solves CORS & Geo-blocking: fetches from Thai IP
            ├── Connects to https://postone.thailandpost.com/api/bc.php
            └── Relays 13-digit barcode list back to React Web App
```

### Key Technical Problem & The Hybrid Solution
1. **The Challenge**:
   - The Thailand Post PostOne API (`https://postone.thailandpost.com/api/bc.php`) is **geo-restricted to Thailand IP addresses**.
   - Cloud serverless platforms (Vercel, AWS, GCP) run in US/Europe/Singapore data centers and are blocked with HTTP 403 or timeouts.
   - PostOne API also lacks CORS headers (`Access-Control-Allow-Origin`), blocking standard `fetch()` from browser web apps.
2. **The Solution (Method 1 - Chrome Extension Bridge)**:
   - A lightweight Chrome Extension (Manifest V3) acts as a local proxy running directly inside the user's browser in Thailand.
   - The React web app communicates with the extension via `window.postMessage` and DOM handshake events.
   - The extension performs the `fetch()` to PostOne API (permitted by `host_permissions: ["https://postone.thailandpost.com/*"]`) and passes the 13-digit barcode numbers back to the web app.

---

## 2. Technology Stack (เทคโนโลยีที่ใช้)

| Layer | Technology | Key Libraries / Notes |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite | Vanilla CSS (Glassmorphism), Google Fonts (`Prompt`, `Inter`) |
| **Backend API** | Python 3.12 (Vercel Serverless) | `pdfplumber`, `reportlab`, `openpyxl`, `flask` / Vercel Python runtime |
| **Browser Extension** | Chrome Manifest V3 | Service Worker (`background.js`), Content Script (`content.js`), Storage API |
| **Auth / Database** | Google Sheets CSV API | Real-time CSV export, zero-maintenance user & organization management |
| **Deployment** | Vercel Serverless | Auto-builds Vite frontend (`/dist`) + Python serverless (`/api`) |

---

## 3. UI/UX Design System & Theme Switcher (สไตล์และระบบสลับธีม)

- **Aesthetic Tone**: Ultra-modern, high-contrast Dark Glassmorphism and Clean Light Mode tailored for enterprise/governmental productivity.
- **Dual Theme Support (Light / Dark Mode)**:
  - **Dark Mode**: Deep slate background (`#0b1120`, `#0f172a`), emerald accents (`#10b981`), high-contrast white text (`#f8fafc`).
  - **Light Mode**: Crisp clean white card background (`#ffffff`), subtle borders (`rgba(0,0,0,0.08)`), dark slate typography (`#0f172a`), and emerald accents.
  - **Theme Switcher**: Smooth button in Navbar with Sun ☀️ / Moon 🌙 icons and rotation animation.
  - **Persistence**: Stored in `localStorage.getItem('c2dpost_theme')` and applied via `document.documentElement.setAttribute('data-theme', theme)`.
- **Typography**:
  - Headings & Branding: `'Prompt', sans-serif` (clean Thai glyphs).
  - Body & Data Grid: `'Inter', sans-serif` (high tabular legibility).
- **Extension Status Indicator**:
  - Live pill badge on top navbar: Glowing green dot `Extension เชื่อมต่อแล้ว (IP ไทย)` vs Red `ไม่พบ Extension`.
- **Extension Gate (`ExtensionGate.jsx`)**:
  - Restricts app access until extension handshake is confirmed.
  - Dual action cards: Official Chrome Web Store link + Immediate ZIP developer download.
  - Automatically unlocks the app the moment the extension is installed without page reload.

---

## 4. Extension & Web Handshake Protocol (กลไกการเชื่อมต่อ Web กับ Extension)

### A. Handshake (ตรวจจับการติดตั้ง)
1. **Content Script (`content.js`)** runs on `https://*.vercel.app/*` at `document_start`.
2. Content Script injects a custom attribute or dispatches a custom event:
   ```javascript
   window.postMessage({ type: 'C2DPOST_EXTENSION_INSTALLED', version: '1.0.0' }, '*');
   document.documentElement.setAttribute('data-c2dpost-extension', 'installed');
   ```
3. Web App (`ExtensionGate.jsx`) listens for:
   - DOM attribute: `document.documentElement.getAttribute('data-c2dpost-extension') === 'installed'`
   - Message listener: `window.addEventListener('message', (e) => { if (e.data?.type === 'C2DPOST_EXTENSION_INSTALLED') unlock(); });`
   - Polling ping: Web posts `{ type: 'C2DPOST_PING' }`, Extension responds with `{ type: 'C2DPOST_PONG' }`.

### B. Barcode Request Relay (การขอเลขบาร์โค้ด)
1. User selects barcode type (e-AR Type 2 `R...TH` or Type 1 `E...TH`) and clicks "ขอหมายเลข Barcode".
2. Web App dispatches `window.postMessage({ type: 'C2DPOST_REQUEST_BARCODES', count: 3, barcodeType: '2' }, '*')`.
3. `content.js` forwards message to `background.js` via `chrome.runtime.sendMessage()`.
4. `background.js` fetches from:
   ```
   https://postone.thailandpost.com/api/bc.php?type={barcodeType}&cust_id={user_id}&amount={count}
   ```
5. `background.js` parses the 13-character barcode strings and responds back to `content.js`.
6. `content.js` sends `window.postMessage({ type: 'C2DPOST_BARCODES_RESPONSE', success: true, barcodes: [...] }, '*')`.
7. React state updates `records[i].BARCODE_NO` in the interactive table instantly.

---

## 5. ReportLab & Font Techniques for Linux Serverless (ฟอนต์ภาษาไทยบน Vercel)

- **Problem**: Default ReportLab in `ConvertDpost` referenced `C:/Windows/Fonts/tahoma.ttf`, crashing on Vercel's Linux environment.
- **Solution**:
  - Bundle `tahoma.ttf` inside `api/fonts/tahoma.ttf` within the repository.
  - In `api/core/convert_dpost.py`, implement a smart font resolver:
    ```python
    possible_paths = [
        os.path.join(os.path.dirname(__file__), '..', 'fonts', 'tahoma.ttf'),
        os.path.join(os.getcwd(), 'api', 'fonts', 'tahoma.ttf'),
        '/usr/share/fonts/truetype/tahoma.ttf',
        'C:/Windows/Fonts/tahoma.ttf'
    ]
    font_path = next((p for p in possible_paths if os.path.exists(p)), None)
    if font_path:
        pdfmetrics.registerFont(TTFont('Tahoma', font_path))
    ```

---

## 6. Chrome Web Store Publishing Rules (กฎการเผยแพร่ Chrome Web Store)

When uploading a Chrome extension to the Google Developer Dashboard:

1. **Manifest V3 Match Patterns**:
   - Do **NOT** specify ports in `matches` (e.g. `http://localhost:5173/*` will cause Chrome Web Store to reject the zip file).
   - Use strict HTTPS domains: `"matches": ["https://*.vercel.app/*"]`.
2. **Icon Requirements**:
   - Store Icon: `128x128` PNG (derived from official logo).
3. **Screenshot Requirements**:
   - Dimensions: Exactly `1280x800` or `640x400` pixels.
   - Color Mode: Strictly **24-bit RGB (no alpha channel)**.
   - Content: Must be an authentic, live capture of the application UI.
4. **Policy & Compliance Settings**:
   - **Trader Status**: "ไม่ใช่ผู้ค้า" (Non-trader / Personal/Internal tool).
   - **Mature Content**: Toggle **OFF** (Grey).
   - **Remote Code**: Strictly set to **"No, I am not using remote code"** (Manifest V3 prohibits external code).
   - **Publisher Contact Email**: Must register and verify via email link in Developer Settings before publishing.
   - **Privacy Policy**: Host a dedicated HTML page at `https://c2dpost-web.vercel.app/privacy.html` detailing permissions.
   - **Single Purpose**: "เป็นตัวกลางเชื่อมต่อ API ไปรษณีย์ไทยสำหรับระบบ C2DPost Web"
   - **Permission Justification (`https://postone.thailandpost.com/*`)**: "ใช้สำหรับส่งคำขอรับหมายเลขบาร์โค้ดจากระบบ PostOne ไปรษณีย์ไทยให้แก่ผู้ใช้งานระบบ C2DPost Web"
   - **Permission Justification (`storage`)**: "ใช้สำหรับบันทึกการตั้งค่าภายในเครื่องของผู้ใช้ (Local Storage) เช่น ตัวเลือกประเภทบาร์โค้ดเริ่มต้น โดยไม่มีการส่งข้อมูลออกภายนอก"
   - **Distribution**: "สาธารณะ" (Public) with "ทุกภูมิภาค" (All regions) for worldwide availability.

---

## 7. Store Item ID & Post-Approval Handover

- **Item ID**: `cdkmibacceaacdiopcekkmfifaocapgk`
- **Official Store Link (Active upon approval)**:
  `https://chromewebstore.google.com/detail/cdkmibacceaacdiopcekkmfifaocapgk`
- **Post-Approval Action**:
  Update `C2DPost_web/src/components/ExtensionGate.jsx` to change the download button directly to:
  ```jsx
  <a href="https://chromewebstore.google.com/detail/cdkmibacceaacdiopcekkmfifaocapgk" target="_blank" rel="noopener noreferrer" className="btn-install">
    ติดตั้งส่วนขยายจาก Chrome Web Store
  </a>
  ```
  Then deploy with `vercel --prod --yes`.

---

## 8. Common Commands & Operational Runbook

### Deploy Web & API to Vercel
```bash
cd "C2DPost_web"
vercel --prod --yes
```

### Package Extension for Chrome Web Store
```powershell
Compress-Archive -Path "C2DPost_web\extension\*" -DestinationPath "C2DPost_web\public\c2dpost-extension.zip" -Force
```

### Capture Live Authentic Screenshot (1280x800 RGB) with CDP
Uses headless Chrome DevTools Protocol with auto-zoom `0.72` to fit both dashboard and table:
```bash
node C2DPost_web/capture_screenshot.cjs
```

---

## 9. Serverless File Streaming & Barcode Overlay (การแก้ปัญหาไฟล์รวมใน Serverless)

### 🔴 The Pitfall (ทำไมไฟล์รวม PDF ถึงเสียหาย 311 bytes)
- บน Desktop Python: ไฟล์ PDF ต้นฉบับอยู่บนดิสก์เครื่องผู้ใช้ ฟังก์ชัน `generate_combined_pdf` เรียก `pypdf.PdfReader(source_file)` ได้โดยตรง
- บน Cloud Serverless (Vercel): ฟังก์ชันเป็น **Stateless & Ephemeral** ไฟล์ที่อัปโหลดตอน `/api/convert` ถูกลบหลังตอบกลับ การส่งเฉพาะ JSON ตารางไป `/api/export-pdf` ทำให้เซิร์ฟเวอร์หาไฟล์ต้นฉบับไม่พบ (`os.path.exists == False`)
- ผลลัพธ์: PyPDF เขียนไฟล์เปล่าขนาด **311 bytes (0 หน้า)** ทำให้โปรแกรมเปิด PDF แจ้งข้อผิดพลาดว่าไฟล์เสียหาย ("ทำไมไฟล์นี้ถึงเปิดไม่ได้")

### 🟢 The Solution Pattern
1. **Frontend (`selectedFiles` in React state)**: เก็บอ็อบเจกต์ `File` ต้นฉบับไว้ใน state เบราว์เซอร์
2. **Multipart Form Streaming**: เมื่อผู้ใช้สั่งบันทึกไฟล์ ฟังก์ชัน `exportPdf` และ `exportAllFiles` จะแนบไฟล์ต้นฉบับผ่าน `FormData` ไปยัง `/api/export-pdf`
3. **Backend Dynamic Remapping (`api/index.py`)**:
   ```python
   # 1. เขียนไฟล์ลง TemporaryDirectory
   file_map[file.filename] = temp_path
   # 2. แมป SOURCE_FILE ในแต่ละเรคคอร์ดให้ชี้ไปที่ temp_path จริง
   for rec in records:
       if rec.get("SOURCE_FILE") in file_map:
           rec["SOURCE_FILE"] = file_map[rec["SOURCE_FILE"]]
   ```
4. **Zero-Byte PDF Guard (`convert_dpost.py`)**:
   ```python
   if len(writer.pages) == 0:
       raise ValueError("ไม่พบไฟล์เอกสาร PDF ต้นฉบับ หรือไม่พบหน้าเอกสารสำหรับรวมไฟล์")
   ```
5. ผลลัพธ์: ไฟล์ `DPost_Combined.pdf` ได้รับการประทับตรารหัสบาร์โค้ด Code128 และ e-AR บนเอกสารต้นฉบับอย่างสมบูรณ์ (~110 KB+) เปิดอ่านได้ 100%

---

## 10. Export Parity: 3 Sequential Downloads vs ZIP (การบันทึกไฟล์ 3 ไฟล์แยกกัน)

### 🔴 The Requirement
ผู้ใช้ต้องการให้การบันทึกไฟล์บนเว็บเหมือนกับโปรแกรม Python Desktop โดย **ไม่ต้องการไฟล์ .zip** แต่ต้องการไฟล์ 3 ไฟล์แยกกันทันที:
1. `DPost_Export_<timestamp>.xlsx` (สำหรับ DPost)
2. `DPost_Combined_<timestamp>.pdf` (เอกสารพร้อมบาร์โค้ด)
3. `DeliveryNote_<timestamp>.pdf` (ใบนำส่ง)

### 🟢 Browser Download Throttling & Progress Pattern
เมื่อสั่งดาวน์โหลดหลายไฟล์ติดต่อกัน เบราว์เซอร์อาจบล็อก Popup หรือดาวน์โหลดไม่ทัน ให้ใช้เทคนิคหน่วงเวลาแบบควบคุม (Controlled Throttling):
```javascript
export async function exportAllFiles(records, files = [], onProgress) {
  // Step 1: Excel
  if (onProgress) onProgress(1, 3, 'กำลังสร้างไฟล์ Excel (สำหรับ DPost)...');
  await exportExcel(records);
  await new Promise(r => setTimeout(r, 500)); // หน่วงเวลา 500ms ป้องกัน Browser Throttling

  // Step 2: Combined PDF (ส่งไฟล์ต้นฉบับไปแนบบาร์โค้ด)
  if (onProgress) onProgress(2, 3, 'กำลังสร้างไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)...');
  await exportPdf(records, 'combined', files);
  await new Promise(r => setTimeout(r, 500));

  // Step 3: Delivery Note PDF
  if (onProgress) onProgress(3, 3, 'กำลังสร้างไฟล์ PDF (ใบนำส่ง)...');
  await exportPdf(records, 'delivery_note');
}
```

---

## 11. Data Normalization & Cross-Platform Parity (การซิงก์คีย์ข้อมูล)

- **Python Internal Format**: `process_pdf()` ส่งออกคีย์มีช่องว่าง เช่น `'RECEIVER ADDRESS'`, `'RECEIVER ZIPCODE'` แต่ `records_to_dataframe()` แปลงเป็น Underscore: `'RECEIVER_ADDRESS'`, `'RECEIVER_ZIPCODE'`
- **Best Practice ใน Web API**:
  - ฝั่ง Backend `/api/convert`: รัน `records_to_dataframe(all_records)` ก่อนแปลงเป็น dict เพื่อให้ได้คีย์มาตรฐาน
  - ฝั่ง Frontend (`App.jsx`, `PreviewGrid.jsx`): ใช้ Fallback Coalescing เสมอ:
    ```javascript
    const address = row.RECEIVER_ADDRESS || row['RECEIVER ADDRESS'] || '';
    const zipcode = row.RECEIVER_ZIPCODE || row['RECEIVER ZIPCODE'] || '';
    ```
  - รับประกันความถูกต้อง 100% ไม่ว่าเอกสารจะเป็นคำขอรังวัดประเภทใด (แบ่งแยก, รวมโฉนด, ออกโฉนด)

---

## 12. Micro-UI Polish: Non-Wrapping Checkbox Badge (เทคนิคปุ่มเลือก)

- **ปัญหา**: สตริง `[ ✓ ]` มีช่องว่าง หากคอลัมน์แคบ เบราว์เซอร์จะตัดคำทำให้ก้ามปูปิด `]` หล่นไปอยู่อีกบรรทัด
- **โซลูชัน**:
  - แยกคอมโพเนนต์เป็น 3 ชิ้น:
    ```jsx
    <span className="chk-box-badge">
      <span className="chk-bracket">[</span>
      <span className="chk-mark">✓</span>
      <span className="chk-bracket">]</span>
    </span>
    ```
  - CSS: กำหนด `white-space: nowrap !important;`, `width: 58px; min-width: 58px;`, และตรึงความกว้างของ `.chk-mark { width: 14px; text-align: center; }`
  - ตกแต่งด้วยขอบมนและสีพื้นหลังโปร่งแสง (Emerald Tint) ทำให้ดูเป็นปุ่มสวิตช์ระดับพรีเมียม ทั้งในโหมดสว่างและโหมดมืด

---

## 13. Automated Cleanup Workflow (เทคนิคการทำความสะอาดโปรเจคอัตโนมัติ)

- **ปัญหา**: ระหว่างการพัฒนาโปรเจค จะมีไฟล์ทดสอบหน้าจอ (`test_*.cjs`, `capture_*.cjs`) และสกรีนช็อตที่สร้างขึ้นชั่วคราว (`preview_*.png`, โฟลเดอร์ `temp_assets`) จำนวนมาก ทำให้โฟลเดอร์รกรุงรังและอาจเผลออัปโหลดขึ้น Production
- **โซลูชัน**: 
  - สร้างไฟล์ `cleanup.cjs` ใน Root Directory เพื่อสแกนและลบไฟล์ชั่วคราวเหล่านี้ผ่าน Node.js อย่างปลอดภัย (ใช้ `fs.unlinkSync` และตรวจสอบรูปแบบชื่อไฟล์)
  - ผูกสคริปต์เข้ากับ `package.json` ผ่าน NPM Lifecycle Hooks:
    ```json
    "scripts": {
      "clean": "node cleanup.cjs",
      "predev": "npm run clean",
      "prebuild": "npm run clean"
    }
    ```
  - **ผลลัพธ์**: ทุกครั้งที่รันเซิร์ฟเวอร์ (`npm run dev`) หรือสร้างบิลด์ (`npm run build`) ระบบจะเคลียร์ไฟล์ขยะให้แบบอัตโนมัติก่อนเริ่มทำงาน ช่วยรักษาความสะอาดของ Codebase ในระยะยาว

---

## 14. Git & Google Drive Sync Workflow (การแก้ปัญหาและซิงก์ Git บน Google Drive)

- **ปัญหา**: เมื่อใช้งานระบบ Git ภายในโฟลเดอร์ของ Google Drive มักเกิดข้อผิดพลาด `fatal: bad object refs/desktop.ini` ระหว่างที่รัน `git fetch` หรือ `git push` สาเหตุมาจาก Google Drive จะสร้างไฟล์ซ่อนชื่อ `desktop.ini` เข้าไปในระบบโฟลเดอร์ `.git/refs/` อัตโนมัติ ทำให้โครงสร้างอ็อบเจกต์ของ Git พัง
- **โซลูชัน**:
  - สแกนและลบไฟล์ `desktop.ini` ภายในโฟลเดอร์ `.git` ออกให้หมดด้วยสคริปต์ (PowerShell):
    ```powershell
    Get-ChildItem -Path .\.git -Filter "desktop.ini" -Recurse -Force | Remove-Item -Force
    ```
  - เมื่อซิงก์โปรเจคเข้ากับ GitHub ที่มีข้อมูลอยู่แล้ว (เช่น เพิ่งเปลี่ยนชื่อโปรเจค หรือมี History อยู่บนเซิร์ฟเวอร์) ให้ใช้เทคนิคการ Reset แบบ Soft เพื่อผสานโค้ดโดยไม่ลบไฟล์เครื่อง Local:
    ```powershell
    git fetch origin
    git reset origin/main
    git add .
    git commit -m "Sync project files"
    git push -u origin main
    ```
  - **ผลลัพธ์**: โฟลเดอร์ที่อยู่บนคลาวด์ไดรฟ์สามารถผูกเข้ากับ GitHub ได้อย่างสมบูรณ์แบบ หมดปัญหาไฟล์พัง และช่วยให้ทำงานข้ามเครื่องผ่าน Google Drive + GitHub ได้อย่างปลอดภัย

---

## 15. Web Version Number Update Policy (ข้อบังคับการอัปเดตเลขเวอร์ชันเว็บทุกครั้ง)

- **นโยบาย**: ทุกครั้งที่มีการแก้ไขโค้ดหรือปรับปรุงฟีเจอร์ใดๆ **ต้องอัปเดตเลขเวอร์ชันของเว็บทุกครั้ง** ก่อนทำการ Build และ Deploy ขึ้นระบบจริง
- **รูปแบบเลขเวอร์ชัน**: `vYYYY.MMDD.HHMM` (อิงตามเวลาปัจจุบันในประเทศไทย เช่น `v2026.0914.1135`)
- **เวอร์ชันล่าสุดคงค้างในงาน**: `v2026.0918.2118` (โฟลเดอร์ซิงก์ร่วม `PROJECT_DOCUMENTATION.md` และ `config.js`)
- **ตำแหน่งที่ต้องอัปเดต**:
  1. `src/config.js`:
     ```javascript
     export const APP_VERSION = 'vYYYY.MMDD.HHMM';
     ```
  2. `package.json`:
     ```json
     "version": "YYYY.MMDD.HHMM"
     ```
  3. `src/components/AboutModal.jsx`: แสดง `C2DPost Web Edition {APP_VERSION} — ส่วน ทข.ปข.10`
  4. `src/components/LoginModal.jsx`: แสดง `{APP_VERSION} (เวอร์ชันล่าสุด)` ด้านล่างการ์ด เข้าสู่โฟลเดอร์ Google Drive รวมตัวติดตั้ง
- **ขั้นตอนการ Deploy**:
  ```powershell
  npm run build
  git add -A; git commit -m "chore(release): bump version to vYYYY.MMDD.HHMM"; git push origin main
  vercel --prod --yes
  ```

---

## 16. File Upload & Conversion Status Tracking Architecture

- **จุดประสงค์**: แสดงสถานะการอัปโหลดและประมวลผลของแต่ละไฟล์ PDF อย่างชัดเจนว่า **สำเร็จ (Success)** หรือ **ไม่สำเร็จ (Error)** พร้อมเหตุผลและจำนวนรายการ
- **การจัดการ State (`fileStatuses`)**:
  - `fileStatuses`: อ็อบเจกต์เก็บสถานะแบบ Key-Value คู่กับชื่อไฟล์:
    ```javascript
    {
      [fileName]: {
        status: 'success' | 'error',
        recordCount?: number,
        error?: string,
        message?: string
      }
    }
    ```
- **การทำงานใน `FileListModal.jsx`**:
  - แสดงป้ายกำกับ `✓ สำเร็จ` (สีเขียวมรกต) และ `✕ ไม่สำเร็จ` (สีแดง)
  - มีแท็บกรองสถานะ: `ทั้งหมด`, `✓ สำเร็จ`, `✕ ไม่สำเร็จ`
  - กล่องแจ้งเตือนสาเหตุความผิดพลาด (`file-error-notice`)
  - รองรับทั้ง Light Mode และ Dark Mode 100%
- **การทำงานใน `PreviewGrid.jsx`**:
  - แสดงป้ายแจ้งเตือนสีแดง `✕ {failedCount}` ที่ปุ่ม `ไฟล์ PDF: {N} ไฟล์` เมื่อมีไฟล์ที่ไม่สำเร็จ เพื่อให้ผู้ใช้งานกดตรวจสอบได้ทันที

---

## 17. e-Parcel Web Service API (ไปรษณีย์ไทย) — Tracking & Reconcile

### 🔴 IP Whitelist Pitfall (สำคัญที่สุด)
- **`https://r_dservice.thailandpost.com/webservice/*` อนุญาตเฉพาะ IP ที่ลงทะเบียนไว้กับไปรษณีย์ไทย** — เซิร์ฟเวอร์ Vercel (Washington D.C., US) ปิดกั้นเสมอ ทำให้ "บัญชีจริง" ที่เรียกผ่าน Vercel มักล้มเหลว (401/403/timeout) และระบบ fallback เป็นข้อมูลจำลอง/ว่าง
- **แนวทาง**: ใช้บัญชี Demo สำหรับทดสอบ UI, ส่วนเรียก API จริงต้องรันจากเครื่อง/IP ในทะเบียน (Desktop Python, ที่ทำงาน, หรือ VPN ไทย)

### API Endpoints ที่ใช้
| ฟังก์ชัน | Method / URL | ตัวอย่าง Payload |
| :--- | :--- | :--- |
| **Tracking รายชิ้น** | `GET /webservice/getHistoryStatus?barcode=:barcode` | — |
| **Reconcile แบบ batch** | `POST /webservice/getOrderByBarcodes` | `{"barcodes": ["EF1938…TH", ...]}` (เครื่องหมาย `,` คั่น) |

- **Auth**: HTTP Basic Auth (`username`/`password` ของผู้ใช้ระบบ e-Parcel ที่ลงทะเบียน) — ใช้ `requests` + `HTTPBasicAuth` + `urllib3.disable_warnings` + `verify=False`
- **เขตข้อมูลสำคัญ**: `status`, `statusDescription`, `createdDate`, `receivedDate`, `postcodeName`, `signature`
- **สถานะ "ได้รับฝากแล้ว"** เช็คได้ 3 แบบ: ค่าข้อความใน `statusDescription` (`_is_received_text`), รหัสสถานะ (`_is_received_status_code`), หรือเหตุการณ์แรกของไทม์ไลน์ (`_is_received_event`)

### ⚠️ Demo Users (ข้อมูลจำลอง — mock data)
- Username ในกลุ่ม `admin`, `renu_officer`, `demo`, `usertest` หรือ **ค่าว่าง** (`""`) → ระบบสร้างข้อมูลจำลองแทนการเรียก API จริง
- จุดเช็คเดียวในโค้ด: `is_demo_user = username.lower() in ("admin", "renu_officer", "demo", "usertest", "")`
- เป็นสาเหตุที่ผู้ใช้เห็น "ข้อมูลไม่จริง" — ต้องแจ้งให้ล็อกอินด้วยบัญชีจริง หรือโชว์แบนเนอร์ว่าเป็นข้อมูลตัวอย่าง

---

## 18. Deposit Report — Tracking Timeline Modal (Phase 4)

- **จุดประสงค์**: ดูไทม์ไลน์สถานะรายชิ้น (Stepper) จาก `getHistoryStatus`
- **Backend**: `POST /api/reports/tracking` รับ `TrackingRequest {barcode, username, password}` ตอบ `{success, barcode, is_mock, api_notice, events[]}`
  - `events[]` เรียงตามเวลาจริง: `{seq, status, status_description, datetime, location, signature}`
  - 401 → `JSONResponse(status_code=401)` พร้อมข้อความภาษาไทย "ชื่อผู้ใช้หรือรหัสผ่านสำหรับระบบไปรษณีย์ e-Parcel ไม่ถูกต้อง"
  - Demo: `_build_demo_tracking(barcode)` สร้าง 3 เหตุการณ์ (รับฝาก → อยู่ระหว่างนำส่ง → ถึงปลายทาง)
- **UI**: `src/components/TrackingTimelineModal.jsx` + `.css`
  - Stepper แนวตั้ง (จุด : เส้นคั่น), badge "รับฝากแล้ว" สีเขียวบนเหตุการณ์แรก
  - แสดงแบนเนอร์ "ข้อมูลตัวอย่าง (Demo)" เมื่อ `trackData?.is_mock`
  - สถานะ loading / error (ถ่วง delay 700ms จริงจัง) / empty, ปุ่มรีเฟรช, ปิดด้วย Esc
  - เปิดจากปุ่มไอคอนนาฬิกาในคอลัมน์ "เครื่องมือ" ของ `PreviewGrid` (`btn-tool-track`, disabled เมื่อยังไม่มีบาร์โค้ด)

## 19. Auto-Reconcile + Row Highlight (Phase 4)

- **จุดประสงค์**: ตรวจเป็นกลุ่มว่าแต่ละชิ้นไปรษณีย์รับฝากแล้วหรือยัง แบบไฮไลต์แถว
- **Backend**: `POST /api/reports/reconcile` รับ `ReconcileRequest {barcodes[], username, password}` ตอบ `{success, is_mock, api_notice, total_checked, received_count, results[]}`
  - เรียก `getOrderByBarcodes` ก่อน; ถ้าได้ผลว่างและไม่มี error → fallback วนเรียก `getHistoryStatus` รายชิ้น
  - Demo: `received = (sum(ord(c) for c in barcode) % 3) != 0` (สุ่มแบบ deterministic)
  - รายการที่ยังไม่มีข้อมูล → `received: False, status_description: "ไม่พบข้อมูล / ยังไม่ตรวจสอบ"`
- **UI / Frontend** (`src/App.jsx` `handleCheckDeposit` → `reconcileRecords` ใน `src/utils/api.js`):
  - Map ผลกลับลง record: `DEPOSIT_STATUS`, `DEPOSIT_RECEIVED` (bool), `DEPOSIT_DATE`, `DEPOSIT_POSTOFFICE` (ฟิลด์ใหม่เพิ่มในตาราง)
  - `Alert` สรุป "รับฝากแล้ว X / Y" + `setStatusText` แสดง progress
  - `PreviewGrid` เพิ่มคอลัมน์ "การรับฝาก" แสดง badge (`deposit-badge ok/idle`) และไฮไลต์แถวด้วย class `.reconciled-row` (พื้นเขียวอ่อน) เมื่อ `DEPOSIT_RECEIVED === true`
- **ปุ่ม**: `ActionToolbar` เพิ่มปุ่ม "ตรวจสอบรับฝาก" (`btn-check-deposit` สีฟ้า `#0ea5e9`, เปิดเมื่อมีบาร์โค้ดครบและไม่ busy) + spinner `.btn-spinner-small`

---

## 20. Deployment Runbook & Gotchas (Vercel)

### Sequence ที่ใช้จริงในรอบนี้
```powershell
npm run build                          # 1. build ผ่าน ระยะเวลา ~2s
git add -A; git commit -m "chore(release): bump version ..."; git push origin main
vercel --prod --yes                    # 3. ขึ้น Production + Aliased สู่ c2dpost-web.vercel.app
```

### 🔴 Gotchas ที่เจอจริง
1. **`vercel --prod --yes` ครั้งแรกอาจ fail "Not authorized"** ทั้งที่ token ถูกต้อง — ไม่ต้อง panic ลองรันใหม่ (`vercel deploy --prod`) หรือลอง `vercel --yes` (preview) ก่อนได้; ในทางปฏิบัติถ้า preview ผ่านแล้ว prod รอบถัดไปจะผ่าน
2. **Repo Git ที่ Drive root ยังไม่มี commit / no remote** (branch `master`, เห็น `git log` → `fatal: does not have any commits yet`) — `git push origin main` จะไม่ได้ถ้าไม่มี remote; Vercel deploy **ไม่ต้องพึ่ง git** (ส่งไฟล์ตรง) ใช้ได้ทันที
3. **PowerShell 5.1 กินเครื่องหมายคำพูด** ตอนเรียก `curl.exe -d '{"a":"b"}'` → FastAPI ตอบ `json_invalid`; ให้เขียน JSON ลงไฟล์แล้วใช้ `--data-binary @file` แทน (ตัวอย่าง: `curl.exe -s -X POST <url> -H "Content-Type: application/json" --data-binary "@file.json"`)
4. **Version bump ทุกรอบ**: `src/config.js` (APP_VERSION), `package.json` (version), `api/core/convert_dpost.py` (`__version__`), และโฟลเดอร์ซิงก์ `PROJECT_DOCUMENTATION.md` ที่ฝังเลขเวอร์ชันเก่า
5. **API Health**: `GET /api/health` ตอบ `{"status":"healthy","version":"YYYY.MMDD.HHMM",...}` ใช้ยืนยันเวอร์ชันโปรดักชันได้ทันทีหลัง deploy

---

## 21. UseBarcode & User Log Google Sheet Integration (ระบบบันทึกประวัติ UseBarcode)

- **จุดประสงค์**: เมื่อระบบทำการเรียกหมายเลขบาร์โค้ดจาก PostOne มาใช้งาน ให้บันทึกประวัติลง `UseBarcode` (แท็บ `Barcode`) เช่นเดียวกับระบบ Python Desktop
- **โครงสร้างข้อมูลใน UseBarcode.gsheet**:
  - `A: Timestamp` (เช่น `2026-09-14 14:22:00` อิงเวลาประเทศไทย GMT+7)
  - `B: UserName` (เช่น `DOL.Renunakhon`, `Usertest`)
  - `C: Barcode` (เช่น `BC414154232TH`)
  - `D: Details` (ชื่อผู้รับ + ที่อยู่ + อำเภอ + จังหวัด + รหัสไปรษณีย์ รวมเป็นข้อความเดียว)
- **สถาปัตยกรรมการส่งข้อมูล**:
  - Web App (`src/App.jsx`) ส่งรายการหมายเลขและรายละเอียดผู้รับไปยัง Backend `/api/log-barcodes`
  - Backend (`api/index.py`) ส่งข้อมูลไปยัง Google Apps Script Web App:
    `https://script.google.com/macros/s/AKfycbyznLrLf7Qgi0glxzytW8uhpZfnu5Jkh_eUibgJxBe8z9dmBDs7ndM6deT6x8v59Q/exec`
    ด้วย Payload:
    ```json
    {
      "action": "log_detailed_barcodes",
      "data": [
        {
          "timestamp": "2026-09-14 14:22:00",
          "username": "Usertest",
          "barcode": "BC414154232TH",
          "details": "นายวินัย บุญรัตน์ 169 หมู่ที่ 8 ต.กกตูม ดงหลวง มุกดาหาร 49140"
        }
      ]
    }
    ```
  - พร้อมบันทึกสรุปยอดรวม (ems, r, eco) และบันทึกประวัติผู้ใช้ (`record_user_log`) ในเบื้องหลัง (Background Thread) แบบ Asynchronous
  - ช่วยแก้ปัญหาเรื่อง CORS และ Redirect ของ Google Apps Script ได้ 100%

---

## 22. e-Parcel Submission & Column E Status Sync (การอัปเดตสถานะคอลัมน์ E "ส่งข้อมูล e-Parcel")

- **จุดประสงค์**: เมื่อผู้ใช้กดปุ่ม "ส่งข้อมูล e-Parcel" (`addItems`) สำเร็จ รายการหมายเลขบาร์โค้ดดังกล่าวจะต้องถูกบันทึกสถานะลงในชีต `UseBarcode` (แท็บ `Barcode`) คอลัมน์ E (`ส่งข้อมูล e-Parcel`) เป็น `"yes"` โดยอัตโนมัติ เพื่อให้ผู้ดูแลและเจ้าหน้าที่ตรวจสอบได้ว่ารายการใดถูกส่งเข้าระบบไปรษณีย์เรียบร้อยแล้ว
- **สถาปัตยกรรมการอัปเดตสถานะ (`updateEparcelStatusInSheet`)**:
  - Frontend (`src/utils/api.js`): ส่ง payload `{ action: 'update_eparcel_status', barcodes: [...], status: 'yes' }`
  - ยิงตรงไปยัง Google Apps Script Web App ด้วยโหมด `no-cors` พร้อมทั้งยิงสำรองผ่าน Backend Proxy `/api/update-eparcel-status`
  - ฝั่ง Google Apps Script จะค้นหาแถวที่มีหมายเลข Barcode ตรงกันในชีต `UseBarcode` แล้วเขียนค่า `"yes"` ลงในคอลัมน์ที่ 5 (คอลัมน์ E) ทันที

---

## 23. Focused Working Directory & Continuous Skill Evolution Policy

- **โฟลเดอร์หลักในการทำงาน**: ต่อไปนี้การพัฒนาฟีเจอร์ แก้ไขบั๊ก และปรับปรุงทั้งหมดจะดำเนินการในโฟลเดอร์ `C2DPost_web` เป็นหลัก
- **การรักษาและอัปเดตสกิลอย่างต่อเนื่อง (Continuous Evolution)**:
  - ทุกครั้งที่มีการพัฒนาเทคนิคใหม่ แก้บั๊ก หรือปรับปรุง UI/UX สไตล์ จะต้องอัปเดตไฟล์ `.agents/skills/c2dpost-web-workflow/SKILL.md` และ `C2DPost_web/PROJECT_DOCUMENTATION.md` เสมอ
  - อัปเดต `ROADMAP_REPORT_FEATURE.md` หากมีฟีเจอร์ใหม่หรือบันทึกเช็กลิสต์สถานะ
  - รักษากฎเลขเวอร์ชัน `vYYYY.MMDD.HHMM` อย่างเคร่งครัด

---

## 24. Real-Time Deposit Verification Flow via "รายงานรับฝาก" (การตรวจรับฝากผ่านปุ่มรายงานรับฝาก และระบบ Auto-Sync)

- **จุดประสงค์และมาตรฐานการใช้งาน**:
  การตรวจรับฝากพัสดุเข้าระบบไปรษณีย์ไทยของ C2DPost Web มีศูนย์กลางอยู่ที่ **ปุ่ม "รายงานรับฝาก"** บน ActionToolbar และ Navbar ซึ่งถูกออกแบบมาเพื่อเป็นเครื่องมือตรวจสอบหลัก แทนการไล่ตรวจทีละรายการ
- **ขั้นตอนการทำงาน (Workflow)**:
  1. ผู้ใช้คลิกปุ่ม **"รายงานรับฝาก"** (`.btn-deposit-report-white`) บน Toolbar หรือ Navbar
  2. หน้าต่าง `DepositReportModal` แสดงขึ้น พร้อมเลือกวันที่ต้องการตรวจรับฝาก (ค่าเริ่มต้นคือวันที่ปัจจุบัน `DD/MM/YYYY`)
  3. ระบบเรียก API `POST /api/reports/received` ดึงรายการพัสดุทั้งหมดที่ไปรษณีย์ได้รับฝากในวันนั้นมาแสดงเป็นสรุปสถิติ (จำนวนชิ้นรวม, รับฝากสำเร็จ, ยอดเงินค่าบริการ)
  4. ผู้ใช้สามารถกดปุ่ม **"ซิงก์ผลรับฝากกับตารางหลัก"** (`handleSyncFromDepositReport`):
     - ระบบจะนำรายการ Barcode ที่รับฝากแล้วจากรายงาน ไปเปรียบเทียบกับรายการในตารางหลัก (`PreviewGrid`)
     - รายการที่มี Barcode ตรงกันจะถูกอัปเดตสถานะเป็น `รับฝากแล้ว` ทันที พร้อมบันทึกวันที่และที่ทำการไปรษณีย์รับฝาก
     - แถวในตารางหลักจะแสดงไฮไลต์สีเขียวมรกตโปร่งแสง (`.reconciled-row`) เพื่อให้ผู้ใช้มองเห็นความคืบหน้าอย่างชัดเจน
     - แสดงการแจ้งเตือนสรุป: `"ซิงก์ผลตรวจรับฝากสำเร็จ: รับฝากแล้ว X ชิ้น (จากรายงาน Y รายการ)"`
  5. รองรับการส่งออกรายงานเป็นไฟล์ **Excel (.xlsx)** พร้อมสูตรคำนวณเงินรวมอัตโนมัติ และ **PDF (.pdf)** ที่จัดหน้าตามแบบฟอร์มราชการพร้อมช่องลงนาม

---

## 25. Google Apps Script Web App Deployment & Sheet Column E Integration (เทคนิคการดีพลอยและเชื่อมโยง GAS Web App)

- **สถาปัตยกรรมและข้อแตกต่างระหว่าง Script Project ID กับ Web App URL**:
  - Script Project ID (เช่น `16TAW2fgTXNcu2iwzSqlqNpDngK01WF8w1MGf66z2hIa6sJee63zfMJjp`) เป็นเพียงรหัสของโปรเจกต์โค้ด/Library บน Google Apps Script
  - การเชื่อมต่อจากภายนอก (API/Web App) ต้องใช้ **Deployment Web App URL** (`/exec`) ที่ได้จากการกด Deploy > New Deployment > Web App (ตั้งค่า `Execute as: Me` และ `Who has access: Anyone`):
    `https://script.google.com/macros/s/AKfycbyyuEJ3pLdXUidsyYoHv84uspMDf8G93U8Mw1ZYCB9ELpFAPjmpwUxsuarxnklnnQ/exec`
- **ชีตเป้าหมายในการจัดเก็บ (`UseBarcode.gsheet`)**:
  - Spreadsheet ID: `1vl-vPd5LUuJB8wnU2YwDYmXxWpp_vVfAXKicKFJlOv0`
  - แท็บหลัก: `Barcode`
  - โครงสร้างคอลัมน์:
    - `Column A`: Timestamp (วันเวลาตามเวลาประเทศไทย GMT+7)
    - `Column B`: UserName (ชื่อผู้ใช้งาน เช่น `DOL.Renunakhon`)
    - `Column C`: Barcode (หมายเลขบาร์โค้ด 13 หลัก)
    - `Column D`: Details (ข้อมูลผู้รับ ที่อยู่ และรหัสไปรษณีย์)
    - `Column E`: **ส่งข้อมูล e-Parcel** (สถานะการส่งข้อมูลเข้าสู่ e-Parcel)
- **กลไกการบันทึกสถานะ "yes" ลงคอลัมน์ E (`update_eparcel_status`)**:
  - เมื่อผู้ใช้งานกดปุ่ม "ส่งข้อมูล e-Parcel" (`addItems`) สำเร็จ ระบบจะยิงคำสั่งอัปเดตสถานะทันที
  - Payload ที่ส่งไปยัง Apps Script Web App:
    ```json
    {
      "action": "update_delivery_status",
      "barcodes": ["EF193812345TH", "EF193812346TH"],
      "status": "yes"
    }
    ```
  - Apps Script จะทำการค้นหาแถวในคอลัมน์ C ที่มีหมายเลข Barcode ตรงกัน และบันทึกคำว่า `"yes"` ลงในคอลัมน์ E (คอลัมน์ที่ 5) ด้วยคำสั่ง `sheet.getRange(row, 5).setValue("yes")`
  - **เทคนิค Dual-Dispatch เพื่อความเสถียร 100%**:
    - ส่งตรงจากเบราว์เซอร์ผู้ใช้งานผ่าน `fetch(APPS_SCRIPT_URL, { mode: 'no-cors' })` ทันที
    - ส่งสำรองผ่าน Backend API Proxy (`/api/update-eparcel-status`) ในกรณีที่ผู้ใช้เปิดเบราว์เซอร์ที่มีการบล็อก Tracking
- **การทดสอบและการจัดการ GAS Redirect (302 Moved Temporarily)**:
  - Google Apps Script จะตอบกลับคำขอ POST ด้วย HTTP Status 302 ไปยัง `script.googleusercontent.com` เสมอ
  - หากทดสอบด้วย Python หรือ cURL ต้องอนุญาตการติดตาม Redirect (`follow_redirects=True` ใน `httpx` หรือ `requests` จะติดตามอัตโนมัติ)

---

## 26. Advanced UI/UX Design System & White Glassmorphism Styling Techniques (ทักษะและเทคนิคสไตล์ UI/UX)

- **เทคนิค White Glassmorphism High-Contrast (`.btn-deposit-report-white`)**:
  - **ปัญหาเดิม**: เมื่อใน Toolbar มีปุ่มสีสันต่างๆ (ปุ่มขอ Barcode สีเขียว, ส่ง e-Parcel สีฟ้า) ปุ่มสำคัญอย่าง "รายงานรับฝาก" อาจดูกลืนหรือแย่งสายตา
  - **การแก้ปัญหาด้วยสไตล์เฉพาะ**:
    - **Light Mode**: ใช้พื้นหลังขาวกระจกใสโปร่งแสง `rgba(255, 255, 255, 0.95)` ผสาน `backdrop-filter: blur(12px)` ขอบเส้นสีเขียวมรกตคมชัด `border: 1.5px solid #059669` ตัวหนังสือสีเขียวเข้ม `#065f46` น้ำหนัก `font-weight: 700` มิติเงา `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)` ทำให้ปุ่มมีความโดดเด่น สะอาดตา และหรูหราแบบพรีเมียม
    - **Hover Effect**: ยกตัวขึ้นเล็กน้อย `transform: translateY(-1px)` พร้อมแสงเรืองรอบปุ่ม `box-shadow: 0 4px 14px rgba(5, 150, 105, 0.22)`
    - **Dark Mode**: ปรับเป็น Slate Glass สีเข้ม `rgba(15, 23, 42, 0.75)` ขอบเรืองแสงสีเขียวมรกตสวยงาม
- **นโยบายป้องกันคำตัดบรรทัดอย่างเด็ดขาด (`white-space: nowrap !important;`)**:
  - Badge แสดงสถานะ, ปุ่ม Badge, ชิปตัวกรอง และปุ่มกดคำสั่งทุกจุด **ต้องกำหนด `white-space: nowrap !important;` เสมอ**
  - ป้องกันไม่ให้ข้อความภาษาไทยหรือวงเล็บสถานะ เช่น `(รับฝากแล้ว)` หรือ `✓ สำเร็จ` ตกไปอยู่อีกบรรทัด ซึ่งจะทำให้ Layout ตารางหรือแถบเครื่องมือกระตุกและเสียสัดส่วน
- **ระบบ Table Row Elevation & Reconcile Highlight (`.reconciled-row`)**:
  - แถวของรายการที่ได้รับการตรวจรับฝากแล้ว จะได้รับคลาส `.reconciled-row`
  - แสดงพื้นหลังสีเขียวมรกตอ่อนโปร่งแสง `rgba(16, 185, 129, 0.08)` ใน Light Mode และ `rgba(16, 185, 129, 0.15)` ใน Dark Mode
  - มีเส้นแถบสีมรกตขอบซ้าย `border-left: 3px solid #10b981` เพื่อเป็นจุดสังเกตของผู้ใช้งานได้อย่างชัดเจนทันที

---

## 27. Strict 6-Location Version Synchronization Rule (กฎเหล็กการอัปเดตเวอร์ชัน 6 จุด)

- **นโยบาย**: ทุกครั้งที่มีการแก้ไขฟีเจอร์ บั๊ก หรือสไตล์ **ต้องปรับปรุงเลขเวอร์ชันให้ตรงกันทั้ง 6 จุดเสมอ** ตามรูปแบบ `vYYYY.MMDD.HHMM` (หรือ `YYYY.MMDD.HHMM` ในไฟล์ JSON/Python) ก่อนทำการ Build และ Deploy
- **รายการ 6 จุดที่ต้องตรวจสอบและอัปเดต**:
  1. `C2DPost_web/src/config.js`:
     ```javascript
     export const APP_VERSION = 'vYYYY.MMDD.HHMM';
     ```
  2. `C2DPost_web/package.json`:
     ```json
     "version": "YYYY.MMDD.HHMM"
     ```
  3. `C2DPost_web/api/core/convert_dpost.py`:
     ```python
     __version__ = "YYYY.MMDD.HHMM"
     ```
     *(สำคัญอย่างยิ่ง: จุดนี้ขับเคลื่อนค่า `/api/health` และหัวเรื่อง FastAPI Documentation หากไม่อัปเดต การตรวจสอบ API จะยังคงรายงานเวอร์ชันเก่า)*
  4. `C2DPost_web/PROJECT_DOCUMENTATION.md`: หัวข้อเลขเวอร์ชันและประวัติ (`v2026.0918.2118`)
  5. `C2DPost_web/ROADMAP_REPORT_FEATURE.md`: เช็กลิสต์เวอร์ชันล่าสุด (`v2026.0918.2118`)
  6. `.agents/skills/c2dpost-web-workflow/SKILL.md`: ส่วนสรุปเวอร์ชันล่าสุด (`v2026.0918.2118`)
- **คำสั่งทดสอบตรวจสอบความถูกต้องหลัง Deploy ขึ้น Production**:
  ```powershell
  python -c "import urllib.request; print(urllib.request.urlopen('https://c2dpost-web.vercel.app/api/health').read().decode())"
  ```
  *ต้องได้ผลลัพธ์: `{"status":"healthy","version":"YYYY.MMDD.HHMM",...}` ที่ตรงกับเวอร์ชันปัจจุบัน 100%*

---

## 28. Date Range & 20-Item Pagination Architecture (v2026.0914.2119)

### A. Date Formatting Engine & Presets Math
Thailand Post's backend API (`getAllOrderReceived`) requires dates in `DD/MM/YYYY` format, whereas HTML `<input type="date">` natively handles ISO `YYYY-MM-DD`. The application implements a bidirectional date formatting pipeline:
1. **Input Date Helper (`toInputDateFormat(dateObj)`)**:
   ```javascript
   function toInputDateFormat(dateObj) {
     const y = dateObj.getFullYear();
     const m = String(dateObj.getMonth() + 1).padStart(2, '0');
     const d = String(dateObj.getDate()).padStart(2, '0');
     return `${y}-${m}-${d}`;
   }
   ```
2. **API Date Converter (`toApiDateFormat(isoDateStr)`)**:
   ```javascript
   function toApiDateFormat(isoDateStr) {
     if (!isoDateStr) return '';
     const parts = isoDateStr.split('-');
     if (parts.length !== 3) return isoDateStr;
     return `${parts[2]}/${parts[1]}/${parts[0]}`; // YYYY-MM-DD -> DD/MM/YYYY
   }
   ```
3. **Quick Date Shortcut Presets**:
   - **วันนี้ (Today)**: `todayIso = toInputDateFormat(new Date())`
   - **เมื่อวาน (Yesterday)**: `d.setDate(d.getDate() - 1)`
   - **7 วันล่าสุด (Last 7 Days)**: `d.setDate(d.getDate() - 6)` (inclusive of today = 7 days)
   - **เดือนนี้ (This Month)**: `new Date(d.getFullYear(), d.getMonth(), 1)` (first day of current month to today)

### B. Parallel ThreadPoolExecutor Batching
When querying multiple days (e.g. 7 days or a full month), sequential HTTP calls would quickly exceed Vercel's serverless timeout limit. The backend `/api/reports/received` employs Python's `ThreadPoolExecutor`:
```python
with ThreadPoolExecutor(max_workers=5) as executor:
    future_to_date = {
        executor.submit(fetch_single_day_report, d_str, username, password): d_str
        for d_str in date_list
    }
    for future in as_completed(future_to_date):
        day_records = future.result()
        for rec in day_records:
            bcode = rec.get("barcode", "").strip()
            if bcode and bcode not in seen_barcodes:
                seen_barcodes.add(bcode)
                all_records.append(rec)
```
- **Deduplication**: Uses `seen_barcodes` set to eliminate duplicates across boundary timestamps.
- **Aggregated Metrics**: Recalculates total parcels, delivered count, in-transit count, returned count, total weight, and total fees across all merged dates.

### C. 20-Item Strict Pagination & Dynamic Navigation
- **Constant**: `PAGE_SIZE = 20`
- **Total Pages**: `totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE) || 1`
- **Slicing**: `paginatedRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)`
- **Row Index Numbering**: `globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1` (guarantees continuous sequential numbers across page turns).
- **Navigation Controls**:
  - `[◀ ย้อนกลับ]` / `[ถัดไป ▶]` buttons with disabled states when at boundaries.
  - Numeric page buttons with active highlight (`.page-num-btn.active`).
  - Dynamic page window with ellipsis (`...`) for large page counts.
  - Records count indicator: `แสดง X - Y จากทั้งหมด Z รายการ`.

### D. Active Dynamic Table Height Technique
- **The Issue**: Fixed or max-height containers (`max-height: 600px; overflow-y: auto`) cause ugly nested vertical scrollbars inside the card and cut off the 20th row midway.
- **The Solution**:
  ```css
  .deposit-table-scroll {
    width: 100%;
    overflow-x: auto;
    overflow-y: visible !important;
    height: auto !important;
    max-height: none !important;
  }
  ```
  The table container naturally grows and fits exactly the 20 items (or fewer) displayed on the active page, giving an unobstructed, clean reading experience.

---

## 29. Delivery Status Normalization Architecture (v2026.0914.2135)

### A. The Canonical 3-Tier Model
Thailand Post post offices record dozens of granular checkpoint descriptions and numeric codes. To provide immediate clarity to governmental officers, the system maps all events into **3 canonical status categories**:
1. **`delivered` (นำจ่ายสำเร็จ)**:
   - **Color**: Emerald Green (`#059669`, Dark Mode `#34d399`, Pill Background `rgba(16, 185, 129, 0.12)`)
   - **Icon**: Checkmark `✓`
   - **Keywords / Codes**: `นำจ่ายสำเร็จ`, `ผู้รับได้รับเรียบร้อย`, `จัดส่งสำเร็จ`, `ส่งมอบเรียบร้อย`, `ส่งถึงผู้รับแล้ว`, code `501`, `delivered`.
2. **`returned` (ส่งคืน)**:
   - **Color**: Rose Red (`#e11d48`, Dark Mode `#fb7185`, Pill Background `rgba(225, 29, 72, 0.12)`)
   - **Icon**: Return Arrow `↩`
   - **Keywords / Codes**: `ส่งคืน`, `คืนต้นทาง`, `ส่งคืนผู้ส่ง`, `ตีกลับ`, `ไม่สามารถส่งมอบ`, `ไม่สามารถนำจ่าย`, codes `502`, `503`, `401`, `402`, `returned`.
3. **`in_transit` (อยู่ระหว่างการนำจ่าย)**:
   - **Color**: Amber Orange (`#d97706`, Dark Mode `#fbbf24`, Pill Background `rgba(217, 119, 6, 0.12)`)
   - **Icon**: Transit / Shipping Truck `🚚`
   - **Scope**: **All other intermediate statuses** (e.g. `รับฝากเข้าระบบแล้ว`, `ส่งออกจากศูนย์คัดแยก`, `อยู่ระหว่างการขนส่ง`, `เตรียมการนำจ่าย`, ฯลฯ) to ensure an uncluttered, consistent overview.

### B. Tooltip Raw Description Preservation
While the badge displays the clean 3-tier label, the officer can hover over any status badge to view the full raw description reported by the postal station:
```jsx
const tooltipText = item.status_description_raw && item.status_description_raw !== statusInfo.label
  ? `${statusInfo.label} (${item.status_description_raw})`
  : statusInfo.label;

<span className={`status-pill ${statusInfo.className}`} title={tooltipText}>
  {statusInfo.label}
</span>
```

### C. Unified 5 Stat Cards & 4 Filter Tabs
- **Summary Metrics**:
  1. `รายการทั้งหมด` (Total Items)
  2. `นำจ่ายสำเร็จ` (Delivered Count - Emerald)
  3. `อยู่ระหว่างการนำจ่าย` (In-Transit Count - Amber)
  4. `ส่งคืน` (Returned Count - Rose)
  5. `ยอดรวมค่าบริการ` (Total Postal Fee - Currency format `฿X,XXX.00`)
- **Filter Tabs**: Instant client-side filtering by clicking any tab (`ทั้งหมด`, `🟢 นำจ่ายสำเร็จ`, `🟠 อยู่ระหว่างการนำจ่าย`, `🔴 ส่งคืน`) with live count badges.

---

## 30. Tracking Timeline Date-Time & Location Architecture (v2026.0914.2155)

### A. Payload Normalization (`api/core/convert_dpost.py`)
Thailand Post's `getHistoryStatus` Web Service returns disparate field names across different service versions. The backend normalizer handles all known schema variants:
```python
# Extract Date & Time
datetime_str = (
    ev.get("statusDate") or
    ev.get("createdDate") or
    ev.get("receivedDate") or
    ev.get("dateTime") or
    ev.get("eventDate") or ""
).strip()

# Combine separate statusTime if present
if not datetime_str and ev.get("statusTime"):
    datetime_str = f"{ev.get('orderDate', '')} {ev.get('statusTime', '')}".strip()

# Extract Station / Location
location_str = (
    ev.get("station") or
    ev.get("stationName") or
    ev.get("postcodeName") or
    ev.get("location") or
    ev.get("officeName") or ""
).strip()
```

### B. Stepper Timeline Presentation
Each step in the tracking timeline renders:
1. **Sequence Dot & Connecting Line**: Numbered dot (`1, 2, 3...`) or checkmark `✓` with vertical connecting rail.
2. **Status Title**: Bold description of the scan checkpoint.
3. **Date & Time Badge**: Inline badge with calendar/clock SVG icon showing exact timestamp (`DD/MM/YYYY HH:mm:ss`).
4. **Location Badge**: Inline badge with map pin SVG icon showing post office / sorting center name.
5. **Signature**: Recipient signature or delivery agent note if available.

---

## 31. Supported Document Types: ท.ด. 38 ค. (v2026.0914.2200)

### A. Land Office Document Types Catalog
The C2DPost system specifically extracts and formats cadastral survey notices issued by Department of Lands (DOL) offices:
1. **ท.ด. 13**: คำขอรังวัดที่ดินทั่วไป (General cadastral survey request)
2. **ท.ด. 38**: คำขอรังวัดแบ่งแยกในนามเดิม (Subdivision survey request under original owner)
3. **ท.ด. 38 ค.**: เอกสารแจ้งการปักหลักเขตที่ดิน (Land boundary marker notification letter)
4. **ท.ด. 81**: คำขอรังวัดรวมโฉนด (Title deed consolidation survey request)
5. **ออกโฉนดที่ดิน**: คำขอรังวัดออกโฉนด (Cadastral survey for new title deed issuance)

### B. Advanced Regex & Fallback Extraction
In `convert_dpost.py`, the document form code is extracted using a flexible regular expression that accounts for optional periods, varying spaces, Thai numerals, and Thai consonant suffixes:
```python
# Matches: (ท.ด. 13), (ท.ด. 38), (ท.ด. 38 ค.), (ท. ด. ๓๘ ค), (ท.ด.81)
FORM_CODE_PATTERN = r'\(\s*(ท\s*\.\s*ด\s*\.\s*[๐-๙0-9]+(?:\s*[ก-ฮ]\.?)?)\s*\)'
```
- **Fallback Keyword Detection**: If the header form code is obscured by a stamp or missing parentheses, the extractor scans for keywords:
  - `แจ้งการปักหลักเขตที่ดิน` ➜ Automatically sets document type to `ท.ด. 38 ค.`
  - `แบ่งแยกในนามเดิม` ➜ Sets to `ท.ด. 38`
  - `รวมโฉนด` ➜ Sets to `ท.ด. 81`

---

## 32. Action Button Label UX: อัปเดตข้อมูล (v2026.0914.2205)

- **Semantic Alignment**: The toolbar action button was renamed from `ดึงข้อมูลรับฝาก` to **`อัปเดตข้อมูล`** (Update Data).
- **User Mental Model**: Officers repeatedly press this button throughout the workday to refresh status data from Thailand Post e-Parcel servers. "อัปเดตข้อมูล" accurately communicates that the action fetches the latest live status without implying a destructive re-import.
- **Consistency**: Applied identically across both the full-page view (`DepositReportView.jsx`) and popup modal (`DepositReportModal.jsx`).

---

## 33. Barcode Click Tracking Inspection Architecture (v2026.0914.2215)

### A. Interactive Table Barcode Buttons
Rather than a static text string, barcode numbers in tables are rendered as interactive buttons with dedicated hover styling:
```jsx
<button
  type="button"
  className="table-barcode-btn"
  onClick={() => setSelectedTrackingItem(item)}
  title={`คลิกเพื่อดูสถานะการตรวจสอบพัสดุ ${item.barcode}`}
>
  <span className="table-barcode-pill">{item.barcode}</span>
  <svg className="barcode-track-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
</button>
```
- **CSS Styling Tokens**:
  - Monospaced typography: `'Inter', monospace`, font-weight 700.
  - Colors: Sky Blue `#0284c7` (Light Mode) / `#38bdf8` (Dark Mode).
  - Hover micro-interactions: Underline, subtle background tint (`rgba(2, 132, 199, 0.1)`), icon scale `1.18x`, and smooth transition (`cubic-bezier(0.16, 1, 0.3, 1)`).

### B. Non-Destructive In-Place Inspection
- Clicking any barcode opens `TrackingTimelineModal` directly over the current table.
- **Zero State Loss**: The user's active table page (e.g. Page 3 of 5), selected date range, search query, and filter tab remain 100% intact.
- **Optimistic Fallback**: The modal immediately displays the row's known recipient name and status while `fetchTrackingHistory` asynchronously queries the postal timeline.
- **Full-Screen Jump**: A secondary button `เปิดหน้าตรวจสอบเต็มจอ` (`.btn-track-fullpage`) is provided inside the modal for users who wish to transition to the dedicated `TrackingInquiryView` page.

---

## 34. Tab Label Renaming: รายงานสถานะ (v2026.0915.0931)

- **Information Architecture Elevation**:
  - Main navigation tab renamed from `รายงานรับฝาก` to **`รายงานสถานะ`** (Status Report).
  - Why: The report has evolved beyond simple deposit verification to track the full parcel lifecycle (In-Transit, Delivered, Returned, Fees, and Timeline events).
- **Synchronized Locations**:
  - Desktop Navbar tab: `<span>รายงานสถานะ</span>`
  - Mobile Drawer menu: Title `รายงานสถานะ`, subtitle `ตรวจสอบสถานะรายการพัสดุรับฝาก`
  - Page header: `รายงานสถานะไปรษณีย์ (e-Parcel Status Report)`
  - Modal title: `รายงานสถานะไปรษณีย์ (e-Parcel Status Report)`

---

## 35. UI/UX Design System & Micro-Interactions Blueprint (สไตล์และดีไซน์ซิสเต็ม)

### A. The "No Thai Text Wrapping" Rule
Thai script does not use spaces between words. Without explicit CSS control, browsers will arbitrarily break Thai words mid-syllable when container widths change.
- **Mandatory CSS Rule**: All badges, action buttons, table header cells, and timestamp tags must enforce:
  ```css
  white-space: nowrap !important;
  ```
- **Targeted Elements**: `.nav-tab-btn`, `.table-barcode-pill`, `.status-pill`, `.timestamp-badge`, `.btn-sync-action`, `.btn-track-fullpage`, `.date-quick-btn`.

### B. Design Tokens & Color Palette
| Token | Light Mode Value | Dark Mode Value | Usage |
| :--- | :--- | :--- | :--- |
| `--bg-page` | `#f8fafc` (Slate 50) | `#0b1120` (Deep Slate) | Main page background |
| `--bg-card` | `#ffffff` | `#0f172a` (Slate 900) | Content cards & containers |
| `--text-main` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Primary typography |
| `--text-muted` | `#64748b` (Slate 500) | `#94a3b8` (Slate 400) | Secondary / metadata text |
| `--accent-emerald` | `#059669` / `#10b981` | `#10b981` / `#34d399` | Primary brand & delivered status |
| `--accent-amber` | `#d97706` | `#fbbf24` | In-transit intermediate status |
| `--accent-rose` | `#e11d48` | `#fb7185` | Returned / error status |
| `--accent-sky` | `#0284c7` | `#38bdf8` | Barcode pills & informational badges |

### C. Micro-Interactions & Animation Curves
- **Standard Transition Curve**: `transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);` provides a snappy, organic spring feel.
- **Card Hover Elevation**: `transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);`
- **Modal Entry Animation**:
  - Overlay: `@keyframes trackFadeIn { from { opacity: 0; } to { opacity: 1; } }`
  - Container: `@keyframes trackScaleUp { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }`

### D. Layered Modal Hierarchy (z-Index Architecture)
To ensure modals, tooltips, and navigation menus never clash or bleed through each other, the app strictly follows this z-index hierarchy:
- `z-index: 10`: Table sticky headers (`th`)
- `z-index: 100`: Floating action bars
- `z-index: 900`: Main desktop Navbar
- `z-index: 1000`: Mobile Drawer Menu & Navigation Overlays
- `z-index: 1100`: Primary Modals (`DepositReportModal`, `FileListModal`, `AboutModal`)
- `z-index: 1300`: Detail / Child Modals (`TrackingTimelineModal`)
- `z-index: 2000`: Toast Alerts & Critical Confirmations

---

## 36. Full-Page vs. Modal Dual-Mode Architecture (สถาปัตยกรรม Dual-Mode)

The application supports both **Dedicated Full Pages** and **Modal Overlays** for major workflows:
```
[User Interaction]
   ├── Workspace Workflow  ──► Modal Overlay (Quick lookup without losing PDF queue)
   │                              ├── DepositReportModal
   │                              └── TrackingTimelineModal
   │
   └── Management Workflow ──► Full Page View (Deep auditing & report exporting)
                                  ├── DepositReportView (Page-based, URL/State driven)
                                  ├── TrackingInquiryView
                                  └── AdminManagementView
```
- **Why Coexistence?**:
  - **Full Pages** give maximum horizontal space for 10-column tables, pagination, and multi-day date range controls.
  - **Modals** allow quick status verification while in the middle of converting land office PDFs without disrupting the uploaded file queue.
- **Shared Business Logic**: Both modes share the exact same `utils/api.js` endpoints, data normalization functions (`getDeliveryStatusInfo`), and theme tokens.

---

## 37. Developer Troubleshooting Cookbook & Recipes (คู่มือแก้ปัญหา)

### Recipe 1: Windows PowerShell UTF-8 File Encoding
- **Symptom**: Editing markdown or code files containing Thai characters via PowerShell causes mojibake or `SyntaxError: unterminated triple-quoted string literal`.
- **Cause**: PowerShell CLI defaults to Windows-1252 / CP874 when piping text.
- **Solution**: Always execute file edits via Python scripts specifying `encoding='utf-8'`:
  ```python
  with open('path/to/file', 'r', encoding='utf-8') as f:
      content = f.read()
  with open('path/to/file', 'w', encoding='utf-8') as f:
      f.write(updated_content)
  ```

### Recipe 2: Verifying Production Health & Bundle Contents
Always run this one-liner post-deployment to verify API health and verify that newly deployed strings are live in the production bundle:
```powershell
python -c "import urllib.request, json; print(json.loads(urllib.request.urlopen('https://c2dpost-web.vercel.app/api/health').read().decode()))"
```

### Recipe 3: Prebuild Cache Cleanup
Vite or Node build caches occasionally retain stale chunks. The project includes a dedicated `cleanup.cjs` run automatically before every `npm run dev` and `npm run build`:
```javascript
// cleanup.cjs
const fs = require('fs');
const path = require('path');
// Cleans temporary build artifacts safely across Windows and Linux
```

---

## 38. Stat Summary Cards & Filter Tabs Reordering Architecture (v2026.0915.0931)

### A. The 6-Card Logical Flow
The executive summary stat cards at the top of the Status Report view (both DepositReportView.jsx and DepositReportModal.jsx) are sequenced according to the actual parcel lifecycle followed by totals:
1. **รับฝากแล้ว (Received)**: Barcode items confirmed accepted into e-Parcel (	ext-blue, icon package) with percentage of total items ({receivedRate}%).
2. **อยู่ระหว่างการนำจ่าย (In-Transit)**: All intermediate checkpoints and sorting hub transfers (	ext-amber, icon truck) with percentage of total items ({inTransitRate}%).
3. **นำจ่ายสำเร็จ (Delivered)**: Completed deliveries verified by recipient signature (	ext-emerald, icon checkmark) with percentage of total items ({deliveredRate}%).
4. **ส่งคืน (Returned)**: Return-to-sender or undeliverable parcels (	ext-rose, icon return arrow) with newly added percentage calculation ({returnedRate}%).
5. **รายการทั้งหมด (Total Items)**: Sum of all deposit records (summary.total_items ฉบับ).
6. **ยอดรวมค่าบริการ (Total Fee)**: Total postal fee calculated across all items (฿summary.total_fee).

### B. Synchronized Filter Tabs
The interactive filter tabs directly beneath the cards are synchronized in the exact same order:
ทั้งหมด ({total}) ➔ รับฝากแล้ว ({received}) ➔ อยู่ระหว่างการนำจ่าย ({inTransit}) ➔ นำจ่ายสำเร็จ ({delivered}) ➔ ส่งคืน ({returned})
Ensuring a harmonious visual hierarchy and seamless mental model for governmental officers.

---

## 39. Deposit Report State & Cache Persistence Architecture (v2026.0915.0931)

- **The Problem**: Navigating between SPA page views (`workspace` <-> `deposit-report` <-> `tracking`) causes React to unmount `DepositReportView`. Upon remounting, local states were wiped back to default `todayIso` and triggered a redundant empty network fetch.
- **The Solution Pattern**:
  1. **Dual Persistence Strategy (`sessionStorage` + React State Initializer)**:
     - Stores `{ startDate, endDate, reportData, searchQuery, filterTab, currentPage, updatedAt }` under key `c2dpost_deposit_report_cache`.
     - `useState(() => cachedState?.field || default)` initializes states synchronously upon mount with zero latency.
  2. **Mount Guard (`hasInitializedRef`)**:
     - The initial load effect checks `if (cachedState && cachedState.reportData) return;` preventing destructive overwrites.
  3. **Pagination Reset Guard (`isInitialMount`)**:
     - Filters change effect uses `isInitialMount.current` to avoid resetting `currentPage` back to 1 on initial component mount.
  4. **Security & Session Hygiene**:
     - Automatically cleared on `handleLogout` via `sessionStorage.removeItem('c2dpost_deposit_report_cache')`.

---

## 40. Latest Status Date & Station Tracking Architecture (v2026.0915.0938)

- **The Problem**: In governmental deposit reporting, officers need to see where each parcel currently is and when its latest event occurred, rather than repeatedly viewing the initial deposit timestamp and acceptance post office across all rows.
- **The Solution Pattern**:
  1. **Dual Column Shift**:
     - Columns renamed from `วัน-เวลารับฝาก` / `ปณ.รับฝาก` to `วัน-เวลาล่าสุด` / `ปณ./สถานที่ล่าสุด`.
  2. **Data Model Enrichment (`api/index.py`)**:
     - Extracts latest checkpoint timestamp into `latest_date` (coalescing `statusDate`, `dateTime`, `eventDate`, `receivedDate`).
     - Extracts latest location/sorting hub/station into `latest_station` (coalescing `station`, `stationName`, `location`, `postcodeName`).
     - Maintains initial deposit metadata (`received_date`, `received_postoffice`) for origin traceability.
  3. **Rich Tooltips & Search Integration**:
     - Frontend tooltips display both current checkpoint and initial deposit timestamp/office on hover.
     - Search filter checks `latest_station` and `latest_date` in addition to origin office and barcode.
  4. **Official Export Parity**:
     - Both openpyxl Excel spreadsheet and reportlab PDF report reflect the new columns and latest status data.

---

## 41. Tracking Timeline Modal Runtime Stability & Parity (v2026.0915.0947)

- **The Problem**: Clicking on barcode links within the report tables caused silent render failure due to `ReferenceError: useMemo is not defined` in `TrackingTimelineModal.jsx`.
- **The Solution Pattern**:
  1. **Strict Hook Import Audit**: Ensure all React Hooks (`useMemo`, `useCallback`, `useState`, `useEffect`) used in modal components are explicitly imported in the top-level declaration.
  2. **Comprehensive recInfo Context**: Pass `{ receiver, invNo, receiver_address, deposit_date, status_key, status_label, status_description_raw }` to provide fallback status badges immediately before the asynchronous network fetch resolves.
  3. **Realistic Mock Timelines**: Ensure backend `_build_demo_tracking` generates sequential events aligned with the actual barcode category (Delivered, Returned, In-Transit, Received).

---

## 42. Live Tracking Auto-Enrichment & Sync Parity Architecture (v2026.0915.1025)

- **The Problem**: Thailand Post's `getAllOrderReceived` API is an order-level summary endpoint that freezes the checkpoint datetime and station at the time of deposit (`receivedDate` / `postcodeName`). Although it flags `status` as `003` (in-transit), the actual latest checkpoint datetime and delivery station are only accessible via the item-level `getHistoryStatus` track-and-trace endpoint. Consequently, report tables previously showed stale deposit timestamps across all rows.
- **The Solution Pattern**:
  1. **Automatic Parallel Enrichment on Load**:
     - Within `/api/reports/received`, if the query results contain `<= 35` records, a `concurrent.futures.ThreadPoolExecutor(max_workers=min(len(records), 10))` concurrently calls `get_tracking_history()` with a strict 5s timeout.
     - Extracted `latest_datetime`, `latest_location`, and `latest_status_key` overwrite `latest_date`, `latest_station`, and `status_key` in the returned JSON, so the table loads with real-time checkpoint data instantly.
  2. **Reactive Item-Level Upward Propagation (`onTrackingUpdated`)**:
     - When an officer clicks any barcode to open `TrackingTimelineModal.jsx`, its successful track-and-trace resolution emits `onTrackingUpdated(barcode, trackingResult)` to `DepositReportView.jsx` and `DepositReportModal.jsx`.
     - The parent component immediately immutably updates the corresponding row in `reportData.records`, recalculates summary counts across all status categories, and persists the fresh state to `sessionStorage`.
  3. **Batch Sync API & Interface (`/api/reports/batch-tracking`)**:
     - Supports on-demand bulk synchronization for larger batches via `batchFetchTracking({ barcodes, username, password })`.
     - A dedicated "ซิงก์สถานะล่าสุด" action button with live progress spinner allows manual synchronization anytime.

---

## 43. Header Navigation Streamlining & Redundant Actions Cleanup (v2026.0915.1029)

- **The Pattern**: When migrating an SPA from modal-heavy views to full page-based navigation via a fixed global Navbar (`[ แปลงไฟล์ PDF ]  [ รายงานสถานะ ]  [ ตรวจสอบพัสดุ ]`), in-page back buttons such as `btn-back-to-workspace` (`← กลับหน้าแปลงไฟล์`) become redundant and add visual noise to page headers.
- **The Solution**: Remove nested page return buttons from `DepositReportView.jsx` and `TrackingInquiryView.jsx` headers, letting the top application navbar serve as the single source of truth for view navigation.

---

## 44. Unified Auto-Enrichment Action & Action Redundancy Elimination (v2026.0915.1032)

- **The Pattern**: Avoid placing side-by-side buttons that have overlapping semantic meaning (e.g., "อัปเดตข้อมูล" vs "ซิงก์สถานะล่าสุด").
- **The Solution**: Consolidate live parcel tracking enrichment directly into the single "อัปเดตข้อมูล" workflow. The action handles both small batches (backend parallel execution) and large batches (frontend background batch-tracking) transparently, hiding the secondary sync button from the user interface completely.

---

## 45. Last Month Date Preset Calculation & Responsive Wrapping (v2026.0915.1044)

- **The Math Pattern**: To determine the previous calendar month's exact range without timezone shifting:
  - Start Date: `toInputDateFormat(new Date(now.getFullYear(), now.getMonth() - 1, 1))`
  - End Date: `toInputDateFormat(new Date(now.getFullYear(), now.getMonth(), 0))` (Day 0 of current month cleanly resolves to the last day of the preceding month, automatically handling leap years and January-to-December rollover).
- **The UI Pattern**: Added `[ เดือนที่แล้ว ]` shortcut button with synchronized `.active` indicator and applied `flex-wrap: wrap; align-items: center;` to `.deposit-quick-date-btns` containers across full-page and modal views.

---

## 46. Currency Symbol ฿ Removal & Pure Number Formatting (v2026.0915.1051)

- **The Pattern**: In official governmental reporting and spreadsheets, numeric currency columns should display clean floating numbers rather than prepending currency symbols like ฿ to avoid alignment mismatch and calculation disruption.
- **The Solution**: Removed ฿ symbol across summary statistic cards, table fee cells, Excel headers, and PDF landscape tables in `DepositReportView.jsx`, `DepositReportModal.jsx`, and `convert_dpost.py`.

---

## 47. Seamless Multi-Target Drag & Drop PDF Upload Architecture (v2026.0915.1105)

- **The Problem**: Users expect to be able to drag and drop PDF files anywhere on the conversion workspace. Previously, only a small toolbar had a drop event listener with no visual indication (`drag-over`), and dropping a file anywhere else (such as on the large empty table prompt) caused default browser behavior (navigating away and opening the PDF file in a new tab, losing application state).
- **The Solution Pattern**:
  1. **Global Browser Tab Hijack Prevention**:
     - Attach `dragover` and `drop` event listeners to `window` with `e.preventDefault()`, ensuring accidental drops never kick the user out of the application.
  2. **Non-Flickering Workspace Drag Overlay**:
     - Use a `dragCounterRef = useRef(0)` to track `dragenter` and `dragleave` events across nested DOM elements. Show `.workspace-drop-overlay` only when files enter the window/workspace, rendering an emerald dashed card with bounce animations and backdrop blur.
  3. **Interactive Click & Drop Empty Table State**:
     - Convert `.empty-table-state` in `PreviewGrid.jsx` into both a clickable file chooser (`emptyFileInputRef.current.click()`) and a direct drop zone with `.drag-over` highlighting.
  4. **Multi-Target Drop Consistency**:
     - Allow dropping files onto the workspace overlay, the file action toolbar (`ActionToolbar`), and the table preview area (`PreviewGrid`), all uniformly passing `FileList` to `handleFilesSelected(files)` for seamless appending and conversion.

---

## 48. Drop Zone Full-Frame Fit & Balanced Layout Architecture (v2026.0915.1118)

- **The Problem**: When empty, the interactive drop zone (`.empty-table-state`) sized only to its textual content, leaving a large awkward void at the bottom of the table card frame (`.card-preview-table`).
- **The Solution Pattern**:
  - Apply `flex: 1; display: flex; flex-direction: column; width: 100%; min-height: 380px;` to `.table-wrapper`.
  - Apply `flex: 1; width: 100%; min-height: 380px; box-sizing: border-box;` to `.empty-table-state`.
  - Provide a permanent, subtle dashed emerald border (`border: 2px dashed rgba(16, 185, 129, 0.35);`) that harmoniously outlines the entire interior of the card frame with uniform padding on all 4 edges.


---

## 49. Envelope Layout & Decomposed Thai Vowel Normalization Architecture (v2026.0915.1145)

- **The Problem**:
  - Sample files like `แจ้งผลสอบเขต-ซอง.pdf` and `แจ้งผู้ขอจดทะเบียน-ซอง.pdf` have a 2-page structure where Page 1 is the notice body (without recipient address) and Page 2 is the official government envelope (with full mailing address and post office permit).
  - Previously:
    1. **Decomposed Sara Am**: The font emitted Thai character `ำ` as a consonant followed by space and `า` (e.g. `ส านักงาน`, `ต าบล`, `อ าเภอ`), breaking substring and regex matches.
    2. **Land Deed Number Mismatch**: Page 1 contained `โฉนดที่ดินเลขที่ 19583`, causing the 5-digit number `19583` to be falsely extracted as a postal code and surrounding text as an address.
    3. **Page 2 Skipped**: The envelope page on Page 2 lacked the word `เรียน`, causing `if "เรียน" in text` to skip the envelope completely.
    4. **e-Parcel API Error (Code: 027)**: Because amphur and province were null, submitting to e-Parcel failed with `Code: 027, Detail: Parameter amphur must not be null or blank value`.

- **The Solution Pattern**:
  1. **Decomposed Thai Text Normalization (`normalize_pdf_text`)**:
     - Normalize `([ก-ฮ])\s+า` -> `\1ำ` across all extracted page text.
     - Replace common separated words (`ส านักงาน` -> `สำนักงาน`, `ต าบล` -> `ตำบล`, `อ าเภอ` -> `อำเภอ`, `ช าระ` -> `ชำระ`).
  2. **Land Deed / Title Filtering in `parse_receiver_label`**:
     - When scanning lines for a 5-digit postal code, lines containing `โฉนด`, `ที่ดิน`, `หน้าสำรวจ`, `ระวาง`, or `คำขอ` are strictly excluded from postal code consideration.
  3. **Dedicated Envelope Parser (`parse_envelope_label`)**:
     - Triggered when a page contains postage markers (`ชำระค่าฝากส่ง`, `ใบอนุญาตเลขที่`, `ปณ.`, `ไปรษณีย์อนุญาต`) or `ผู้รับ` with a 5-digit zip.
     - Extracts:
       - `REF NO`: from `ที่ นพ 0020.05/644 ผู้รับ` -> `นพ0020.05/644`
       - `RECEIVER`: from person titles (`นาย`, `นางสาว`, `นาง`, `ว่าที่`, etc.) or after `ผู้รับ` -> `นาย สมบัติ บางศิริ`
       - `RECEIVER ADDRESS`: house/moo/tambon formatted as `ต.` -> `63 หมู่ที่ 7 ต.หนองย่างชิ้น`
       - `RECEIVER AMPHUR`: regex `(?:อำเภอ/เขต|อำเภอ|อ\.)\s*([\u0e00-\u0e7f]+)` supporting leading vowels -> `เรณูนคร`
       - `RECEIVER PROVINCE`: `(?:จังหวัด|จ\.)\s*([\u0e00-\u0e7f]+)` -> `นครพนม`
       - `RECEIVER ZIPCODE`: standalone 5-digit string -> `48170`
       - `PRODUCT IN BOX`: from notice subject `ขอให้ไปดำเนินการเรื่องสอบเขต` -> `สอบเขต`
  4. **Record Parity & Overwrite**:
     - In `process_pdf`, when matching on `REF NO` or `RECEIVER`, envelope data overwrites the notice body, ensuring complete and valid address data for e-Parcel submission.

---

## 50. Shipper Postcode & e-Parcel Submission Fix (v2026.0916.2105)

- **The Problem**:
  - When submitting parcels from `แจ้งผู้ขอจดทะเบียน-ซอง.pdf` to e-Parcel (`/webservice/addItems`), Thailand Post returned error:
    `Code: 073, Detail: Postcode ยังไม่เปิดให้บริการ., Status: false | Code: 017, Detail: Please check your input Zipcode or Prodinbox or Barcode., Status: false`
  - Root Cause:
    1. Page 1 had long narrative body text (`เจ้าพนักงานที่ดิน... ณ สำนักงานที่ดิน... บัดนี้ พนักงานเจ้าหน้าที่ได้ดำเนินการแล้ว จึงขอให้ท่านไปจดทะเบียน...` - 314 chars) directly following the office name.
    2. Page 2 (envelope) had the genuine office address (`116 หมู่ที่ 9 ตำบลโพนทอง นพ 48170` - 117 chars).
    3. The previous heuristic `if len(addr) > len(best_shipper_address)` selected the longer narrative garbage over the genuine address, leaving `SHIPPER_ZIPCODE = ""`.
    4. Submitting `shipperZipcode: ""` caused e-Parcel's server to reject the batch with Error 073 & 017 because the drop-off postal station was undefined.

- **The Solution Pattern**:
  1. **Smart Address Quality Scoring (`score_shipper_addr`)**:
     - `+1000` points if address contains a 5-digit postal code (`\b[0-9]{5}\b`).
     - `+500` points if address contains keywords (`หมู่`, `ตำบล`, `ต.`, `ถนน`, `ถ.`, `โพนทอง`).
     - `-2000` points penalty if narrative document phrases are present (`บัดนี้`, `ในวันที่`, `พนักงานเจ้าหน้าที่`, `เจ้าพนักงาน`).
     - Genuine address with postcode always beats narrative text 100% of the time.
  2. **Envelope Shipper Extraction (`parse_envelope_label`)**:
     - Added `'SHIPPER NAME'` and `'SHIPPER ADDRESS'` to `parse_envelope_label` result and integrated into `process_pdf`.
  3. **Thai Digits Normalization in Address Parsing**:
     - Added `address_text = clean_thai_digits(address_text)` at start of `parse_address_components`, allowing Thai digit postcodes (e.g. `๔๘๑๗๐`) to resolve cleanly to `48170`.
  4. **Dual Frontend & Backend Fallback (`src/App.jsx`)**:
     - In `handleSendEparcel`:
       - `shipperZipcode`: `row.SHIPPER_ZIPCODE || currentPerson?.ResponsibleZipcode`
       - `shipperDistrict`: `row.SHIPPER_AMPHUR || currentPerson?.ResponsiblePostoffice?.replace(/^ปณ\./, '')`
       - `shipperProvince`: `row.SHIPPER_PROVINCE || (currentPerson?.Organization?.includes('นครพนม') ? 'นครพนม' : '')`
       - `shipperMobile`: `shipperTel || currentPerson?.TelContactPerson1`
     - Guarantees e-Parcel API payloads always contain a valid, open post office zipcode.
     - Result: e-Parcel returns HTTP 200 `[]` (100% success), sets table status to `✓ สำเร็จ`, and automatically syncs Column E in Google Sheet `UseBarcode` to `"yes"`.


---

## 51. Pattern การจัดวางตราสัญลักษณ์ e-AR, QR และ Barcode ใต้ที่อยู่ผู้ฝากส่ง (v2026.0916.2125)

### 51.1 ปัญหา
ในไฟล์เอกสาร PDF ราชการ เช่น แบบแจ้งผู้ขอจดทะเบียนสิทธิ หรือแจ้งผลสอบเขต หน้าซองจดหมายใช้คำนำหน้าว่า `"ผู้รับ"` แทนที่จะเป็น `"เรียน"` ทำให้การค้นหาพิกัด `y_coord_rian` ล้มเหลว และตกเข้าเงื่อนไข Fallback ที่ `base_y = 40` (ขอบล่างสุดของหน้ากระดาษ A4)

### 51.2 โซลูชันมาตรฐาน
1. สแกนหาพิกัดของกลุ่มข้อความผู้ส่งที่อยู่ด้านบนซ้ายของหน้าเอกสาร (`x < width * 0.40` และ `y > height * 0.35`):
   - คีย์เวิร์ดสำนักงาน: `'สำนักงาน', 'ส านักงาน', 'ฝ่าย', 'กลุ่มงาน', 'ที่ดิน', 'ที่ นพ'`
   - คีย์เวิร์ดที่อยู่: `'หมู่ที่', 'ตำบล', 'ต าบล', 'อำเภอ', 'อ าเภอ', 'จังหวัด', 'นพ', '48170', '๔๘๑๗๐'`
2. หาพิกัดล่างสุด `sender_bottom = min(sender_y_list)` และขอบซ้าย `sender_left = min(sender_x_list)`
3. คำนวณตำแหน่งบาร์โค้ด:
   ```python
   # e-AR box top อยู่ที่ base_y + (210 * scale)
   # กำหนดให้กล่อง e-AR อยู่ใต้บรรทัดล่างสุดของผู้ส่ง 18pt
   base_y = sender_bottom - 18 - (210 * scale)
   base_x = max(18, sender_left if sender_left is not None else 20)
   ```
4. สำหรับการตัดหน้าซองแบบ `envelope_only`:
   ```python
   ref_y = y_coord_rian if y_coord_rian is not None else (sender_bottom - 30 if sender_bottom is not None else None)
   ```


---

## 52. Pattern การแสดงสถานะละเอียดย่อยใต้ป้ายสถานะหลัก (Sub-status Detail Rendering Pattern) (v2026.0916.2215)

### 52.1 สถาปัตยกรรมการแสดงสถานะ (Status Architecture)
1. **Primary Group Badge**:
   - จำแนกเป็น 4 กลุ่มหลัก: `delivered`, `in_transit`, `received`, `returned`
   - ใช้ฟังก์ชัน `getDeliveryStatusInfo(item)` ในการจำแนก
2. **Sub-status Extraction & Comparison**:
   ```javascript
   const rawDesc = (item.status_description_raw || item.status_description || '').trim();
   const hasSpecificDetail = rawDesc && rawDesc !== statusInfo.label && !statusInfo.label.includes(rawDesc);
   const isException = /บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(rawDesc);
   ```
3. **Sub-status Rendering**:
   ```jsx
   <div className="status-cell-container">
     <span className={`status-pill ${statusInfo.className}`} title={tooltipText}>
       <span className={`status-dot dot-${statusInfo.key}`}></span>
       <span>{statusInfo.label}</span>
     </span>
     {hasSpecificDetail && (
       <div 
         className={`status-subtext ${isException ? 'status-subtext-alert' : 'status-subtext-transit'}`}
         title={`สถานะย่อย: ${rawDesc}`}
       >
         {isException && <span className="status-subtext-icon">⚠️</span>}
         <span>{rawDesc}</span>
       </div>
     )}
   </div>
   ```
4. **Search Integration**:
   - ใน `filteredRecords` ต้องเพิ่ม:
     ```javascript
     (r.status_description_raw && r.status_description_raw.toLowerCase().includes(q)) ||
     (r.status_description && r.status_description.toLowerCase().includes(q)) ||
     (r.status_label && r.status_label.toLowerCase().includes(q))
     ```


---

## 53. Pattern เมนูผู้ใช้งานและดรอปดาวน์ออกจากระบบ (User Profile Dropdown Menu Pattern) (v2026.0916.2255)

### 53.1 โครงสร้าง Navbar Profile Dropdown
```jsx
<div className="user-profile-menu-container" ref={userMenuRef}>
  <button 
    type="button"
    className={`user-profile-badge ${isUserMenuOpen ? 'active' : ''}`}
    onClick={() => setIsUserMenuOpen(prev => !prev)}
    title={`ผู้ใช้งาน: ${user} (คลิกเพื่อเปิดเมนู)`}
    aria-expanded={isUserMenuOpen}
  >
    <div className="user-avatar-badge">...</div>
    <div className="user-info-stack">
      <span className="user-display-name">{user}</span>
      <span className="user-display-role">{role}</span>
    </div>
    <svg className={`user-badge-chevron ${isUserMenuOpen ? 'open' : ''}`}>...</svg>
  </button>

  {isUserMenuOpen && (
    <div className="user-profile-dropdown">
      <div className="user-dropdown-header">...</div>
      <div className="user-dropdown-divider"></div>
      <div className="user-dropdown-menu-list">
        <button type="button" className="user-dropdown-logout-btn" onClick={onLogout}>
          <div className="logout-icon-box">...</div>
          <div className="logout-text-stack">
            <span className="logout-text-main">ออกจากระบบ</span>
            <span className="logout-text-sub">ลงชื่อออกจากบัญชี {user}</span>
          </div>
        </button>
      </div>
    </div>
  )}
</div>
```

---

## 54. External Services Integration in Navbar Tabs (`v2026.0916.2315`)

### Architecture & UI Implementation
- **Location**: Rendered within `<nav className="navbar-nav-tabs">` in `Navbar.jsx`.
- **Divider Element**: Uses `.nav-tab-divider` (1px width, 18px height, translucent white) to cleanly delineate internal SPA page tabs (`workspace`, `deposit-report`, `tracking`) from external partner portals.
- **External Links**:
  1. **DPost**: `https://dpost.thailandpost.com` (Target: `_blank`, Rel: `noreferrer`)
  2. **e-AR**: `https://e-ar.thailandpost.com/` (Target: `_blank`, Rel: `noreferrer`)
- **Micro-interactions**: Subtle hover elevation and diagonal arrow translation (`transform: translate(1px, -1px)` on `.nav-tab-ext-icon`).
- **Cleanup**: Redundant external link cards removed from the hamburger menu drawer.

---

## 55. Consolidated Document Download Hub (`v2026.0916.2345`)

### Architecture & UI Implementation
- **Combined Button**: Replaced legacy `.btn-export-excel` and `.btn-envelope` buttons with unified `.btn-download-docs` in `ActionToolbar.jsx`.
- **Download Modal/Dropdown (`.download-docs-dropdown`)**:
  - Item 1: `excel` -> `exportExcel(records)` -> `DPost_Export.xlsx`
  - Item 2: `combined` -> `exportPdf(records, 'combined', selectedFiles)` -> `DPost_Combined.pdf`
  - Item 3: `delivery_note` -> `exportPdf(records, 'delivery_note')` -> `DeliveryNote.pdf`
  - Item 4: `envelopes` -> `exportPdf(target, 'envelopes', selectedFiles)` -> `Envelopes.pdf`
  - All-in-one: `all` -> sequentially triggers all 4 downloads with 600ms pacing delay to ensure browser download reliability.
- **Micro-interactions**: Chevron rotation, card hover translation, outside-click and Escape listeners.

---

## 56. Download Hub Tooltip Refactor, Delivery Status Fix & Multiline Tracking Inquiry (`v2026.0917.0515`)

### Download Dropdown Width & Tooltip Refinement
- **Width**: Adjusted `.download-docs-dropdown` to `min-width: 320px; width: max-content; max-width: 390px;` to dynamically fit document titles without truncation.
- **Tooltips**: Converted inline `.download-item-desc` text elements to native `title="..."` attributes on `.download-item-card` buttons, streamlining vertical height and avoiding text ellipsis.
- **Typography**: Set `.download-item-title` to `white-space: nowrap !important;` to ensure full document names and badges remain intact.

### Thailand Post Delivered Status Classification
- **Backend (`classify_delivery_status` in `api/index.py`)**:
  - Matched keywords `"นำจ่ายถึงผู้รับแล้ว"`, `"ถึงผู้รับแล้ว"`, `"นำจ่ายสำเร็จ"`, and status codes `"4"`, `"501"`, `"delivered"` to `("delivered", "นำจ่ายสำเร็จ")`.
  - Normalized decomposed Thai vowel sequences (`ํา` to `ำ`).
- **Frontend (`getDeliveryStatusInfo` in `DepositReportView.jsx`)**:
  - Prioritized regex `/นำจ่ายถึงผู้รับแล้ว|นําจ่ายถึงผู้รับแล้ว|ถึงผู้รับแล้ว|นำจ่ายสำเร็จ/i` to guarantee green pill rendering.
  - Dynamically recalculates summary metrics (`deliveredCount`, `inTransitCount`, `returnedCount`, `receivedCount`) directly against loaded records.

### Multiline Tracking Inquiry with Expandable Cards (`TrackingInquiryView`)
- **Multiline Input**: Converted input to `<textarea className="tracking-barcode-textarea" rows={3}>` with real-time barcode counting badge and quick-insert buttons (`+ ใส่ทั้งหมด`).
- **Batch Asynchronous Fetch**: Executes `Promise.allSettled` across all entered 13-digit barcodes simultaneously.
- **Accordion Card Layout**:
  - Collapsed state (default): Displays barcode mono, recipient name & invoice, latest update timestamp, latest station, status pill, and sub-status badge with warning icon for alerts.
  - Expanded state (on click): Smoothly unveils full vertical stepper timeline of all historical checkpoints.
  - Global controls: Added "เปิดทั้งหมด" (Expand All) and "ย่อทั้งหมด" (Collapse All) toggles.

---

## 57. Streamlined Hamburger Drawer & Redundant Tab Navigation Removal (`v2026.0917.0555`)

### Hamburger Drawer Cleanup
- **Removed Duplicate Items**: Removed `workspace` ("แปลงไฟล์ PDF"), `deposit-report` ("รายงานสถานะ"), and `tracking` ("ตรวจสอบพัสดุ") from the hamburger menu drawer in `Navbar.jsx`.
- **Rationale**: All three views are already permanently accessible via the top Navbar center navigation tabs (`.navbar-nav-tabs`), rendering drawer duplicates redundant.
- **Drawer Structure**:
  1. System Health Status Card (Gen barcode, Preload e-Parcel, Extension Helper + refresh)
  2. คู่มือ & ความช่วยเหลือ (Canva User Manual, LINE Official)
  3. ข้อมูลระบบ / การจัดการ (Admin link if administrator, About link)
  4. Theme Toggle Segmented Control (Light / Dark)

---

## 58. Advanced UX/UI Patterns, Thai Typography Normalization & Production Deployment Mastery (`v2026.0917.0845`)

### 1. Intrinsic Dynamic Width & Native Tooltip Delegation
- **Problem**: Fixed widths (`width: 360px` or similar) on dropdown menus and action palettes cause long text with format badges to truncate with ellipses (`...`). In contrast, multi-line inline descriptions clutter the interface and inflate vertical layout height.
- **Rule & Pattern**:
  1. **Dynamic Intrinsic Sizing**: Always use `min-width: 320px; width: max-content; max-width: 390px;` for action dropdowns (`.download-docs-dropdown`).
  2. **Non-Breaking Titles**: Apply `white-space: nowrap !important;` to `.download-item-title` and `.download-item-title-row` so that full document descriptions and format badges (`.xlsx`, `.pdf`) stay intact.
  3. **Tooltip Delegation**: Remove secondary inline descriptions (`.download-item-desc`) and delegate them to native OS/browser tooltips via HTML `title="..."` attributes. This provides instant hover guidance without consuming UI real estate.
  4. **Wrapper Tooltip Suppression**: When a dropdown or modal is opened, suppress parent button tooltips to prevent overlap:
     ```css
     .download-docs-wrapper.dropdown-active::after {
       display: none !important;
       opacity: 0 !important;
       visibility: hidden !important;
     }
     ```

### 2. Thai Character Normalization & Postal Status Precedence
- **Unicode Decomposed Vowel Pitfall**:
  - In Thailand Post APIs and older enterprise SQL/XML sources, Thai vowel *Sara Am* (`ำ` or `ำ`) frequently appears as decomposed Unicode characters: *Nikhahit* (`ํ`) followed by *Sara Aa* (`า`).
  - Standard string matching (`if "นำจ่าย" in text`) fails on decomposed characters.
  - **Mandatory Normalization**:
    ```python
    desc_norm = str(status_desc or "").strip().replace("ํา", "ำ")
    ```
- **Thailand Post e-Parcel Status Semantics**:
  - Code `"4"` with description `"นําจ่ายถึงผู้รับแล้ว"` or code `"501"` (`"นำจ่ายสำเร็จ"`) signifies successful delivery.
  - **Precedence Rule**: Always evaluate delivery status keywords (`"นำจ่ายถึงผู้รับแล้ว"`, `"ถึงผู้รับแล้ว"`, `"นำจ่ายสำเร็จ"`) before transit status keywords (`"อยู่ระหว่างการนำจ่าย"`), because "นำจ่ายถึงผู้รับแล้ว" contains the substring "นำจ่าย".
- **Dynamic Summary Metric Aggregation**:
  - Do not trust static summary fields from partial upstream API payloads. Always re-evaluate status counts dynamically across all loaded records in memory:
    ```javascript
    const deliveredCount = records.filter(r => getDeliveryStatusInfo(r).key === 'delivered').length;
    ```

### 3. Asynchronous Multiline Batch Tracking with Progressive Disclosure
- **Multiline Input Parser**:
  - Split text inputs by line breaks, commas, and semicolons:
    ```javascript
    const parsedBarcodes = Array.from(new Set(
      barcodeInput.split(/[\r\n,;]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 8)
    ));
    ```
- **Non-Blocking Parallel Queries**:
  - Use `Promise.allSettled(targetList.map(...))` to query real-time tracking checkpoints for all items simultaneously. An isolated network timeout or invalid barcode must never block other records.
- **Progressive Disclosure Accordion Cards**:
  - **Collapsed State (Default)**: Displays high-density summary: sequence badge (`#N`), monospace barcode, recipient & parcel reference, latest timestamp, station, status pill, and alert icon (`⚠️`) if problem sub-status occurs (e.g. "บ้านปิด", "ออกใบแจ้ง", "ไม่มีเลขบ้าน").
  - **Expanded State (On-Click)**: Smoothly animates into a vertical stepper timeline with checkpoint numbers, success checkmark (`✓`), status badge, date, time, station, and recipient signature.
  - **Batch Accelerators**: Provide "ตรวจพบ X หมายเลข" real-time counter, "+ ใส่ทั้งหมด" bulk import button, and "เปิดทั้งหมด" / "ย่อทั้งหมด" toggles.

### 4. Vercel CLI Project Linking Protocol
- **Case-Sensitivity Requirement**:
  - Vercel strictly mandates lowercase project names. When running in directories containing uppercase letters (e.g. `C2DPost_web`), `vercel link --yes` fails with HTTP 400.
  - **Correct Linking Command**:
    ```bash
    npx vercel link --project c2dpost-web --yes
    ```
  - This reliably binds `.vercel/project.json`, downloads the fresh `VERCEL_OIDC_TOKEN`, updates `.env.local`, and allows one-step production promotion via `npx vercel --prod --yes`.

---

## 59. Cross-Origin Credential Bridge & Extension Auto-fill Assistant (`v2026.0917.0910`)

### 1. Architectural Challenge: Cross-Origin Credential Transfer
- **The Problem**: Users login to C2DPost Web with their official Thailand Post (e-Parcel) credentials. When clicking external Thailand Post links on the Navbar (**DPost** at `https://dpost.thailandpost.com` and **e-AR** at `https://e-ar.thailandpost.com`), the user needs their logged-in username and password automatically populated in the target site's login inputs.
- **Security Constraints**:
  - The **Same-Origin Policy** strictly prohibits one web page from reading or manipulating DOM elements on another domain or tab.
  - Passing passwords via URL query strings (e.g. `?pass=...`) is an insecure anti-pattern (exposing sensitive credentials in browser histories, proxy logs, and referer headers).

### 2. Dual-Engine Architecture
The solution integrates a seamless two-tier mechanism:

#### Tier 1: C2DPost Helper Extension Auto-fill Engine (`v1.1.0`)
- **Manifest Updates (`manifest.json`)**:
  - Expanded `host_permissions` to include `https://postone.thailandpost.com/*`, `https://dpost.thailandpost.com/*`, and `https://e-ar.thailandpost.com/*`.
  - Registered `external_autofill.js` as a content script for `https://dpost.thailandpost.com/*` and `https://e-ar.thailandpost.com/*`.
- **Background Storage (`background.js`)**:
  - Receives `SET_CREDENTIALS` and securely stores `{ username, password, organization, updatedAt }` in `chrome.storage.local`.
- **Target DOM Injection (`external_autofill.js`)**:
  - **DPost (ASP.NET Web Forms)**: Finds `#txtUsername` and `#txtPassword`, injects values, and dispatches native `input` and `change` events.
  - **e-AR (Next.js + MUI Joy UI)**: Navigates to `/sign-in` and observes DOM with `MutationObserver`. Uses the **Native Property Descriptor Setter** to bypass React's synthetic input overrides:
    ```javascript
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    prototypeValueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    ```
  - **Unobtrusive Floating Badge**: Injects a sleek emerald green pill (`#c2dpost-autofill-badge`) in the bottom-right corner to visually confirm auto-fill success.

#### Zero-Modal Frictionless Direct Navigation
- User experience requirement: When clicking DPost or e-AR, eliminate all intermediate modal popups. Direct navigation opens the external site in a new tab immediately.
- Credentials (`UserName` and `Password`) are automatically synchronized to `C2DPost Helper` in the background and filled on the destination web page seamlessly.

---

## 60. Frictionless 1-Click External Integration & Chrome Extension Autofill Architecture (v2026.0917.0925)

### 1. UX Principle: Zero-Modal Direct Action
- **Cognitive Friction Removal**: Requiring users to click through an intermediary popup modal to copy-paste credentials introduces friction and breaks workflow momentum.
- **Direct 1-Click Execution**:
  - The Navbar buttons (`DPost` and `e-AR`) are standard `<a target="_blank">` links.
  - Clicking a link immediately calls `syncCredentialsToExtension(uname, pass, org)` and opens the external URL in a new browser tab without showing any modal on C2DPost Web.

### 2. Chrome Extension Dual-Trigger Autofill Engine (`external_autofill.js`)
- **Dual-Trigger Reactivity**:
  1. **On-Load Lookup**: When the target page loads, `chrome.storage.local.get(["c2dpost_credentials"])` inspects stored credentials.
  2. **Storage Change Listener**: In case the destination tab opens slightly before the background worker receives the storage update, `chrome.storage.onChanged.addListener` immediately fires and populates inputs the moment credentials arrive.
- **Cross-Framework Input Setting**:
  - **DPost (ASP.NET WebForms)**: Identifies `#txtUsername` and `#txtPassword`.
  - **e-AR (React / MUI Joy UI)**: Identifies `input[name="username"]` and `input[name="password"]` and invokes the native `HTMLInputElement.prototype.value` setter followed by `input`, `change`, and `blur` synthetic events to ensure React state synchronizes with DOM.
- **Visual Feedback**:
  - Injects a compact, floating badge (`#c2dpost-autofill-badge`) with the text `⚡ C2DPost Helper • กรอกข้อมูลสำเร็จ` in the bottom-right corner of the destination page.

### 3. Developer & User Deployment Guidance
- **Chrome Unpacked Extension Lifecycle**:
  - When loading unpacked extensions in Developer Mode (`chrome://extensions`), users must click **"Load unpacked"** and select the folder containing `manifest.json`.
  - To prevent confusion with sample data folders (e.g. `C2DPost_Python/ไฟล์ตัวอย่าง/รอบ2`), provide direct, flat paths such as `C:\c2dpost-extension` or `Desktop\c2dpost-extension`.

---

## 61. Chrome Web Store Deployment Pipeline & Auto-Update Lifecycle Architecture (v2026.0917.1050)

### 1. Web Store (`location: 1`) vs. Unpacked (`location: 4`) Technical Distinction
- **The "Reload" Gotcha**:
  - Extensions originally installed from the Chrome Web Store reside in `AppData\Local\Google\Chrome\User Data\Default\Extensions\<id>\<version>` and have `from_webstore: true`.
  - Clicking the 🔄 **Reload** button in `chrome://extensions` on a Web Store installation **only reloads the cached package from disk**. It does NOT pull unreleased changes from local workspace files or update to newer code until Google reviews and publishes it on the Chrome Web Store.
  - To test or use bleeding-edge versions locally before Web Store review approval, developers must turn off/remove the Web Store card and load the unpacked source directory via **"Load unpacked"** (โหลดส่วนขยายที่แยกแล้ว).

### 2. Extension ID Preservation with Public Key
- **Parity Principle**:
  - If an unpacked extension lacks a `"key"` in `manifest.json`, Chrome generates an arbitrary 32-character ID based on the folder path. This breaks any hardcoded extension IDs in bridges, external messaging, or storage namespaces.
  - **The Solution**: Extract the base64 public key from the official Web Store manifest and embed it as `"key"` in the local development `manifest.json`:
    ```json
    "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsUd2ChCjv0kmG3lut7krR4eDX3psq4qufzI/6Xf19oRqpvECuBV3M+oDUn22xywRl5BXOu7vDDQbqHt5rVBq1LTp7PfQia4NLsfkKyRSZEjSxVlOLvV7be8eqGNJ0Ck7WsoYjzVecdQmd+8o4MGp0/WB5omKtQyl1vBfzg7UyAjFlLjPUIh/nFfrRFe5j3t2d7XqVcHwESc6p+RXR09aI5yPqONH3LYfm89ZsUzisIbF43jY8154L5SyQeawZk+Bv7BS2JFonpfyS+eMhEG1bMj3UsT9sPWoKLHYpnrrn0sylVzpFxQ4AWgocgyKkdukshylPSb77zAkxZU2CgZ6xQIDAQAB"
    ```
  - Result: Chrome guarantees that the unpacked extension ID matches `cdkmibacceaacdiopcekkmfifaocapgk` 100% identically.

### 3. Web Store Package Sanitation Protocol
- **Strict Prohibition of "key" During Upload**:
  - The Google Chrome Web Store Developer Console strictly prohibits the `"key"` property when uploading a `.zip` package. If `"key"` is present, the upload fails immediately with:  
    `"An error occurred: 'key' is not allowed in the manifest."`
- **Automated Packaging Pipeline**:
  - The packaging script reads `manifest.json`, executes `manifest_data.pop("key", None)`, and writes a clean in-memory manifest into `C2DPost_Helper_v1.1.0_WebStore.zip`.
  - Excludes operating system metadata files (`desktop.ini`, `.DS_Store`, `Thumbs.db`) to ensure clean ingestion by Google's automated scanners.

### 4. Omaha Background Auto-Update Mechanics
- **Automatic Background Propagation**:
  - End users who installed the extension from the Chrome Web Store **do not need to reinstall or perform any action**.
  - Google Chrome's update engine (Omaha) polls for Web Store updates every 4–5 hours in the background and checks upon every browser restart.
  - Once Google approves the new version, Chrome silently downloads and promotes the extension to `v1.1.0`.
- **Host Permission Escalation**:
  - When an update introduces new host permissions (`dpost.thailandpost.com/*`, `e-ar.thailandpost.com/*`), Chrome may display an extension warning indicator asking the user to accept additional permissions. Upon user acceptance, all autofill content scripts activate immediately.
- **Forced Developer Immediate Update**:
  - To bypass the 4-hour polling interval, navigate to `chrome://extensions`, enable **Developer mode**, and click the **"Update"** (อัปเดต) button in the top-left toolbar.

### 5. Multi-Tier Distribution Architecture
- **Master Repository Artifact**: `C2DPost_web/C2DPost_Helper_v1.1.0_WebStore.zip` (committed in Git).
- **Public Web Fallback**: `C2DPost_web/public/c2dpost-extension.zip` and `public/C2DPost_Helper_v1.1.0_WebStore.zip` (served statically by Vercel for 1-click end-user downloads in `ExtensionGate.jsx`).
- **Local Unpacked Hub**: `C:\c2dpost-extension` and `Desktop\c2dpost-extension` for instant offline and developer testing without waiting for Web Store review cycles.



---

## 62. Installed Extension Version Telemetry & Dynamic Badge Architecture (v2026.0917.1105)

### 1. The Challenge & Technical Objective
- **Problem**: Users running Chrome may have either the older Web Store build (`v1.0.0`) or the newly loaded developer/unpacked build (`v1.1.0`), but the hamburger drawer status item previously showed only a generic `• ติดตั้งแล้ว`. Users lacked immediate visual confirmation of which version was currently active.
- **Objective**: Expose the exact active extension version dynamically to the React web app and render it cleanly on the `status-badge-chip` (e.g. `• ติดตั้งแล้ว (v1.1.0)`).

### 2. Multi-Channel Version Detection Protocol (`extensionBridge.js`)
To guarantee version discovery across page loads, live reloads, and asynchronous extension injections, a triple-tier detection strategy is implemented:
1. **Direct DOM Inspection (`document.documentElement`)**:
   - `content.js` synchronously marks `data-c2dpost-version="1.1.0"` alongside `data-c2dpost-extension-installed="true"` at `document_start`.
   - `getExtensionVersion()` reads `document.documentElement.getAttribute('data-c2dpost-version')`. If the installed flag is present but no version attribute exists (legacy v1.0.0), it gracefully defaults to `'1.0.0'`.
2. **Handshake Ping / Pong Relay (`window.postMessage`)**:
   - During `checkExtensionInstalled()`, the ping message triggers a `C2DPOST_PONG` response carrying `{ version: VERSION, status: "connected" }`.
   - The version payload is saved directly into `installedVersionCache`.
3. **Reactive CustomEvent Channel (`C2DPOST_EXTENSION_READY`)**:
   - When the extension becomes ready while the page is open, `content.js` dispatches `window.dispatchEvent(new CustomEvent('C2DPOST_EXTENSION_READY', { detail: { version: VERSION } }))`.
   - `subscribeExtensionReady()` captures `detail.version` and triggers state updates in `App.jsx`.

### 3. UI Component Integration & CSS Layout Preservation
- **`App.jsx`**:
  - Maintains `extensionVersion` state alongside `extensionUnlocked`.
  - Subscribes to `C2DPOST_PONG` and `C2DPOST_EXTENSION_READY` to continuously update `extensionVersion`.
  - Passes `extensionVersion` to `<Navbar />`.
- **`Navbar.jsx`**:
  - In drawer menu line 456, renders:
    ```jsx
    <span 
      className={`status-badge-chip ${extensionInstalled ? 'success' : 'danger'}`}
      title={extensionInstalled ? `C2DPost Helper ติดตั้งแล้ว${extensionVersion ? ` (เวอร์ชัน ${extensionVersion})` : ''}` : 'ไม่พบส่วนขยาย C2DPost Helper'}
    >
      {extensionInstalled ? (
        <>
          <span className="chip-dot"></span>
          <span>ติดตั้งแล้ว{extensionVersion ? ` (v${extensionVersion})` : ''}</span>
        </>
      ) : (
        'ไม่พบ'
      )}
    </span>
    ```
- **`Navbar.css`**:
  - Enforces `white-space: nowrap;` and `flex-shrink: 0;` on `.status-badge-chip` to guarantee that adding `(v1.1.0)` does not break into multiple lines or compress adjacent labels.

---

## 63. Persistent Drawer Footer Version Pill (v2026.0917.1335)

### 1. The Design Rationale
- **User Experience Problem**: Previously, users had to click "About" to open a modal dialog just to inspect the full web application build version (`C2DPost Web Edition v2026.0917.xxxx — ส่วน ทข.ปข.10`).
- **Solution**: Project the exact pill badge directly into the hamburger dropdown drawer immediately below the "ธีมการแสดงผล" (Theme switcher) panel.

### 2. Implementation Specifications
- **Component (`Navbar.jsx`)**:
  - Placed directly inside `.nav-hamburger-dropdown` below `.theme-toggle-panel`.
  - Imports `APP_VERSION` from `../config`.
  - Renders:
    ```jsx
    <div className="drawer-footer-version">
      <div 
        className="drawer-version-pill"
        onClick={() => {
          setIsNavMenuOpen(false);
          setShowAboutModal(true);
        }}
        title="คลิกเพื่อดูรายละเอียดเกี่ยวกับระบบ (About)"
        role="button"
        tabIndex={0}
      >
        <span>C2DPost Web Edition {APP_VERSION} — ส่วน ทข.ปข.10</span>
      </div>
    </div>
    ```
- **Styles (`Navbar.css`)**:
  - Border separator: `border-top: 1px solid rgba(0, 0, 0, 0.06)` (Light) / `rgba(255, 255, 255, 0.08)` (Dark).
  - Pill styling: `border-radius: 20px; font-size: 0.74rem; font-weight: 600; padding: 6px 12px;`.
  - Micro-interaction: Hover background transition and subtle `transform: translateY(-1px)`.

---

## 64. Envelope Extraction Architecture: Abbreviated Titles & Tambon Homonym Preservation (v2026.0917.1415)

### 1. Root Cause Analysis for `25.pdf` Failure
- **Document Nature**: `25.pdf` consists of a single envelope face (ไม่มีคำว่า "เรียน", ใช้โครงสร้าง `ที่ ... ผู้รับ` และตราอนุญาตฝากส่ง).
- **Failure Cause 1 (Abbreviated Titles)**: The receiver name was written as `น.ส.ภัครดา ธงยศ`. The parser pattern only searched for `นางสาว`, `นาย`, `นาง`, failing to match the abbreviated prefix `น.ส.` and causing `RECEIVER` to evaluate to `""` (empty), which rejected the entire record.
- **Failure Cause 2 (Tambon/Province Homonym Collision)**: In addresses where the Sub-district (Tambon) has the same name as the District or Province (e.g. `ต.มุกดาหาร` in `อ.เมืองมุกดาหาร จ.มุกดาหาร`), standard word boundary stripping `re.sub(r'\b' + province + r'\b', '', addr)` inadvertently obliterated the Tambon name, leaving only `ต.`.

### 2. Solutions Implemented
- **Comprehensive Thai Title Pattern**:
  ```python
  prefix_pat = r'^(?:นาย|นางสาว|นาง|น\.ส\.|น\.ส|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นายก|ว่าที่\s*(?:ร\.ต\.|ร้อยตรี)?|พันตำรวจ|ร้อยตำรวจ|พลฯ|ผู้ใหญ่บ้าน|กำนัน|ด\.ต\.|จ\.ส\.ต\.|จ\.ส\.อ\.|ร\.ต\.|ร\.ท\.|ร\.อ\.|พ\.ต\.|พ\.ท\.|พ\.อ\.|พล\.ต\.|พล\.ท\.|พล\.อ\.|นพ\.|พญ\.|ทพ\.|ทพญ\.|ผศ\.|รศ\.|ศ\.|ดร\.|พระ|พระครู|พระมหา|ม\.ร\.ว\.|ม\.ล\.)\s*[\u0e00-\u0e7f]'
  ```
- **Heuristic Fallback**: Identifies candidate lines formatted as 1–4 Thai words with no digits or postal/boundary keywords.
- **Tambon Boundary Lookbehind**:
  ```python
  addr_clean = re.sub(r'(?<!ต\.)(?<!ต\.\s)(?<!ตำบล\s)(?<!ตำบล)\b' + re.escape(province) + r'\b', '', addr_clean)
  ```

---

## 65. Minimal Clean Status Column & Selective Alert Pill (v2026.0917.1445)

### 1. The Design Challenge
- **Visual Clutter in Table Layouts**: Previously, every table row in `DepositReportView` and `DepositReportModal` stacked two boxed badges (a primary status pill and a sub-status box). For normal deliveries, this resulted in redundant text (e.g. `[ นำจ่ายสำเร็จ ]` directly above `[ นำจ่ายถึงผู้รับแล้ว ]`). For in-transit parcels, lengthy transit station steps formed wide boxes that congested the layout.
- **Goal**: Achieve a clean, modern, minimal dashboard experience without losing critical delivery exception alerts.

### 2. Implementation Specifications
- **Selective Alert Rendering Logic**:
  ```javascript
  const rawDesc = (item.status_description_raw || item.status_description || '').trim();
  const isException = /บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน|ตกค้าง|อายัด|จ่าหน้าไม่ชัดเจน|ติดต่อไม่ได้/i.test(rawDesc);
  const shouldShowAlertSubtext = isException && rawDesc;
  ```
- **Rendering Pattern**:
  - **Normal Cases (`!isException`)**: Renders ONLY the primary status pill (`นำจ่ายสำเร็จ`, `อยู่ระหว่างการนำจ่าย`, `รับฝากแล้ว`). No subtext box is rendered. Full step details remain viewable via `title={tooltipText}` and in the expandable tracking timeline.
  - **Exception Cases (`isException`)**: Renders the primary pill accompanied by a rounded alert tag:
    ```jsx
    {shouldShowAlertSubtext && (
      <div className="status-subtext status-subtext-alert" title={`ข้อยกเว้นการนำจ่าย: ${rawDesc}`}>
        <span className="status-subtext-icon">⚠️</span>
        <span>{rawDesc}</span>
      </div>
    )}
    ```
- **CSS Styling (`border-radius: 999px; font-size: 0.72rem; padding: 0.1rem 0.5rem;`)**: Ensures the alert badge appears as a compact, elegant pill rather than a bulky square box.
- **Search Query Preservation**: The global search filter continues to evaluate `status_description_raw` and `status_description`, enabling instant query filtering for terms like `"บ้านปิด"`, `"ออกใบแจ้ง"`, etc.

---

## 66. Reorder Weight & Fee Columns Before Latest Timestamp (v2026.0917.1455)

### 1. The Design Intent
- **Ergonomics & Reading Flow**: When users review e-Parcel postal reports, physical package attributes ("น้ำหนัก" and "ค่าบริการ") logically belong directly beside the destination address and receiver information, before proceeding to tracking timelines ("วัน-เวลาล่าสุด", "ปณ./สถานที่ล่าสุด", and "สถานะ").
- **Universal Alignment**: Synchronize the column sequence across all web tables, popup modals, Excel exports, and PDF reports.

### 2. Standard Column Sequence
1. `#` (ลำดับ)
2. `หมายเลข Barcode`
3. `เลขที่คำขอ`
4. `ชื่อผู้รับ`
5. `ที่อยู่ปลายทาง`
6. `น้ำหนัก (g)`
7. `ค่าบริการ (บาท)`
8. `วัน-เวลาล่าสุด`
9. `ปณ./สถานที่ล่าสุด`
10. `สถานะ`

### 3. Implementation Locations
- **Web UI Tables**: `DepositReportView.jsx` and `DepositReportModal.jsx` (th & td positions reordered).
- **Excel Export Engine (`convert_dpost.py` -> `generate_deposit_report_excel`)**:
  - `headers = [..., "ที่อยู่ปลายทาง", "น้ำหนัก (g)", "ค่าบริการ", "วัน-เวลาล่าสุด", ...]`
  - `row_values` reordered; column 6 formatted as `#,##0.0`, column 7 as `#,##0.00`.
  - Summary row merged across A to E (cols 1–5), col 6 `=SUM(F...)`, col 7 `=SUM(G...)`.
- **Landscape PDF Export Engine (`convert_dpost.py` -> `generate_deposit_report_pdf`)**:
  - `th_headers` and `col_widths` updated (`1.7*cm` for weight, `1.8*cm` for fee placed at cols 5 and 6).
  - Summary row label span: `('SPAN', (0, len(table_data) - 1), (4, len(table_data) - 1))`.

---

## 67. Postal Code Resolution in Location / Station Column (v2026.0917.1505)

### 1. Goal
When viewing deposit reports and parcel tracking lists, the "ปณ./สถานที่ล่าสุด" (Latest Post Office / Location) column displays the station name appended with its 5-digit Thailand postal code (e.g. `เรณูนคร 48170`, `นาแก 48130`, `ศป. หาดใหญ่ 90110`, `บัวใหญ่ 30120`).

### 2. Multi-Tier Resolution Hierarchy (`formatStationWithZipcode`)
1. **Existing Zipcode Guard**: If string already contains a 5-digit number (`/\b\d{5}\b/`), keep as is to avoid duplication.
2. **National Mail Centers (ศูนย์ไปรษณีย์ ศป. / Hubs)**:
   - Fixed mapping for all regional processing centers across Thailand (`หาดใหญ่ 90110`, `เด่นชัย 54110`, `นครราชสีมา 30000`, `ขอนแก่น 40000`, `อุดรธานี 41000`, `อุบลราชธานี 34000`, `ลำพูน 51000`, `เชียงใหม่ 50000`, `พิษณุโลก 65000`, `นครสวรรค์ 60000`, `อยุธยา 13000`, `กบินทร์บุรี 25110`, `ศรีราชา 20110`, `ราชบุรี 70000`, `สุวรรณภูมิ 10540`, `หลักสี่/EMS 10210`, `สุราษฎร์ธานี 84000`, `ทุ่งสง 80110`, `ชุมพร 86000`, `ภูเก็ต 83000`).
3. **Origin / Sender Post Office**:
   - Matches origin post office (Renu Nakhon / sender unit) ➔ appends sender postal code `48170`.
4. **Destination / Recipient Address Matching**:
   - Matches destination amphur, province, or recipient address with clean station name ➔ appends `receiver_zipcode`.
   - If parcel is in delivery stage (e.g. `นำจ่ายสำเร็จ`, `บ้านปิด`, `ออกใบแจ้ง`, `รอจ่าย`) and station is not a mail center, links to `receiver_zipcode`.
5. **Comprehensive District Dictionary**:
   - Local post offices in Nakhon Phanom, Mukdahan, Sakon Nakhon, Bueng Kan, Korat, Bangkok & major delivery cities.
6. **Fallback**: Returns original station string if no zipcode is resolved.

### 3. Implementation Locations
- **Frontend Utility**: `src/utils/postalUtils.js` (`formatStationWithZipcode`, `cleanStationName`, `MAIL_CENTERS`, `KNOWN_DISTRICT_ZIPCODES`).
- **Web UI Views**:
  - `DepositReportView.jsx`: renders `{formatStationWithZipcode(item.latest_station || item.received_postoffice, item)}` in cell and title tooltip.
  - `DepositReportModal.jsx`: renders in `.po-badge` and title tooltip.
- **Backend Export Engine (`convert_dpost.py`)**:
  - `generate_deposit_report_excel`: formats `latest_s` in data rows.
  - `generate_deposit_report_pdf`: formats `latest_s` in table data cells.
- **Python Desktop Parity (`C2DPost_Python/convert_dpost.py`)**: Parity updated.

---

## 68. Delivered Recipient & Signer Resolution in Tracking Stepper (v2026.0917.1515)

### 1. Goal
When viewing parcel tracking history in the timeline stepper modal (`TrackingTimelineModal`) or inquiry view (`TrackingInquiryView`), items with successful delivery (`นำจ่ายถึงผู้รับแล้ว` / `นำจ่ายสำเร็จ`) display the recipient/signer's name clearly under the delivery step.

### 2. Resolution Hierarchy
1. **API Signer / Signature**: If Thailand Post API provides a signer name (`ev.signature`, `signatureName`), display as `ผู้ลงนาม: ${ev.signature}`.
2. **Fallback Recipient Name**: In Thailand Post e-Parcel, `getHistoryStatus` does not include signature fields, and `getAllOrderDelivered` frequently returns empty signature strings (`""`).
3. **Location Enhancement**: Location at each checkpoint is formatted with 5-digit postal code (`formatStationWithZipcode`).

---

## 69. Strict Distinction of Addressee Name vs. Real Signer with Direct e-AR Verification (v2026.0917.1610)

### 1. The Challenge & Architectural Reality
- **Official Specification Analysis**:
  - In `คู่มือ API Standard preload Data on e-Parcel` (`API Standard preload Data on e-Parcel.pdf`):
    - `getHistoryStatus` (pp. 87-88) contains ONLY 5 fields: `barcode`, `status`, `statusDescription`, `statusDate`, `station`. No receiver or signer information exists.
    - `getOrderByBarcode` (pp. 89-93) and `getAllOrderDelivered` (pp. 66-72) define distinct fields:
      - `customerName`: Recipient name from order/envelope declaration (e.g. `ผู้อำนวยการแขวงทางหลวงนครพนม`).
      - `signature`: Actual receiver/signer name at delivery (e.g. `คุณถนอม`, `คุณสุดา`).
- **Live System Reality**:
  - In real-world postal operations, the postman collects the receiver's physical signature on a handheld device. The handwritten signature image is transmitted directly to Thailand Post's **e-AR** (Electronic Acknowledgement of Receipt) repository (`https://e-ar.thailandpost.com`).
  - The text string field `signature` in the e-Parcel webservice (`r_dservice.thailandpost.com`) is left empty (`""`).
  - Directly replacing `signature` with `customerName` causes user confusion because the recipient on the envelope declaration is mistaken for the actual person who signed for the item.

### 2. Dual-Row Granular Delivery Protocol (Approach 2)
To eliminate ambiguity and give users transparent insight:
1. **Row 1 - Addressee Name (`.track-step-receiver`)**:
   - `👤 ผู้รับตามจ่าหน้า: [receiverName]`
   - Renders the declared recipient from document metadata clearly labeled.
2. **Row 2 - Real Signer / Delivery Proof (`.track-step-signature`)**:
   - If Thailand Post sends a non-empty `ev.signature`:
     `✍️ ผู้เซ็นรับจริง: [ev.signature]`
   - If `ev.signature` is empty `""`:
     `✍️ ผู้เซ็นรับจริง: (ไม่พบชื่อพิมพ์ในระบบ e-Parcel / ลายเซ็นอยู่ในระบบ e-AR)`
     Followed by an interactive deep-link button: `ดูภาพลายเซ็นใน e-AR ↗` linking directly to `https://e-ar.thailandpost.com`.

### 3. Implementation Locations
- **`TrackingTimelineModal.jsx`**:
  - Renders separate rows for `track-step-receiver` and `track-step-signature`.
  - Distinguishes between text signer and e-AR link fallback.
- **`TrackingTimelineModal.css`**:
  - Added styling for `.track-step-receiver`, `.step-field-label`, `.sig-name`, `.sig-hint`, `.sig-ear-link`.
- **`TrackingInquiryView.jsx`**:
  - Stepper meta row implements identical dual-field rendering.
- **`TrackingInquiryView.css`**:
  - Added `.stepper-meta-item.receiver-name`, `.stepper-meta-item .sig-hint`, `.stepper-meta-item .sig-ear-link`.

---

## 70. Automated e-AR Condition Switching & Barcode Search Engine (v2026.0917.1630 / Extension v1.2.0)

### 1. User Requirement & Architectural Challenge
- **User Goal**: When clicking the link `"ดูภาพลายเซ็นใน e-AR ↗"`, the browser opens e-AR (`https://e-ar.thailandpost.com/ear`), automatically switches the search condition select dropdown to **"หมายเลขบาร์โค้ด"**, puts the barcode number into the input field, and triggers the Search button (`ค้นหา`) immediately without manual intervention.
- **Underlying Technology of e-AR**:
  - e-AR is a **Next.js Single Page Application (SPA)** using **`@mui/joy` (Joy UI)**.
  - The search condition dropdown is a controlled Joy UI `<Select>` associated with `#select-field-demo-button` and label `#select-field-demo-label`.
  - Its options are rendered dynamically in a portalized `<ul role="listbox">` with `<li role="option" data-value="barcode">`.
  - Selecting "barcode" updates React state `I = "barcode"`, which triggers conditional mounting of `<input name="barcode" type="text" placeholder="Barcode No.">`.
  - Standard DOM assignment (`input.value = ...`) does not trigger React's internal fiber state; a native property descriptor setter is strictly required.

### 2. Triple-Tier Barcode Transit Pipeline
1. **Clipboard Transit**:
   - `openEarWithBarcode(barcode)` in `extensionBridge.js` copies the barcode to the system clipboard as a frictionless fallback.
2. **URL Hash Parameter**:
   - The link opens `https://e-ar.thailandpost.com/ear#barcode=${encodeURIComponent(barcode)}`.
   - The hash does not trigger SSR errors on Next.js and survives route changes.
3. **Extension Local Storage Sync**:
   - `window.postMessage({ type: 'C2DPOST_SET_EAR_SEARCH', barcode })` -> `content.js` -> `background.js` sets `c2dpost_ear_search: { barcode, timestamp }` in `chrome.storage.local`.
   - Freshness TTL: 10 minutes.
   - If the user was not logged in, they land on `/sign-in`. The extension auto-fills credentials, the user logs in, and upon reaching `/ear`, the pending search from storage automatically triggers!

### 3. Joy UI DOM Execution Routine (`external_autofill.js`)
When `external_autofill.js` detects a pending barcode search on `e-ar.thailandpost.com/ear`:
1. **Check Visibility**: If `<input name="barcode">` is already rendered, immediately populate it.
2. **Open Dropdown**: Click `#select-field-demo-button` (or `[aria-labelledby*="select-field-demo-label"]`).
3. **Select Option**: Locate `li[role="option"][data-value="barcode"]` and invoke `.click()`.
4. **Populate Value**: Poll for `<input name="barcode">` and invoke `setNativeValue(input, targetBarcode)`.
5. **Trigger Submit**: Locate `button[type="submit"]` (or button containing text "ค้นหา") and invoke `.click()`.
6. **Confirmation Toast**: Render floating emerald green badge `⚡ C2DPost Helper • ค้นหาพัสดุสำเร็จ`.
7. **State Cleanup**: Clear `c2dpost_ear_search` in storage and sanitize URL hash to prevent accidental re-triggers.

---

## 71. Real Signer & Signature Field Integration (v2026.0917.1645)

### 1. Specification Grounding
- According to Thailand Post's official manual `API Standard preload Data on e-Parcel.pdf` (p. 90):
  - Field: `signature` (String) is defined as `ชื่อ-นามสกุล ผู้รับสินค้า` (Example: `"คุณถนอม"`, `"คุณสุดา"`).
- In earlier versions, `/api/reports/tracking` only queried `getHistoryStatus` which solely returns 5 status audit trail fields (`barcode`, `status`, `statusDescription`, `statusDate`, `station`) without `signature`.
- `api/index.py` now queries both `getHistoryStatus` AND `getOrderByBarcode?barcode={barcode}`:
  - Extracts official `signature` and `customerName` from the order object.
  - Automatically attaches `ev["signature"] = order_signature` to the delivered status event.

### 2. UI Representation
- In `TrackingTimelineModal.jsx` and `TrackingInquiryView.jsx`:
  - Label updated to **`ชื่อผู้รับจริง:`** (matching Thailand Post API manual definition).
  - If `ev.signature` contains a value, it renders immediately: `✍️ ชื่อผู้รับจริง: [ev.signature]`.
  - If Thailand Post's live server returns `signature: ""` (empty string due to physical e-AR handheld capture), it clearly informs: `(ไม่พบข้อมูล signature ในระบบ e-Parcel / ตรวจสอบลายเซ็นใน e-AR)` along with the 1-click automated e-AR inspection button.

---

## 72. e-AR Signature Image & Electronic Receipt Proxy Integration (v2026.0917.2030)

### 1. Specification & Protocol Grounding
- Official Thailand Post manual: `คู่มือ API e-AR/คู่มือ API เรียกดูใบตอบรับ e-ar.pdf`
- **Endpoint**: `POST https://e-ar.thailandpost.com/ear-api/print/e-ar`
- **Request Body**: `JSON Array` of barcode strings e.g. `["BC414111081TH"]`
- **Response**:
  - `Content-Type: application/pdf`
  - Returns complete electronic acknowledgment receipt (e-AR) PDF with embedded digital signatures and postman timestamps.
  - Publicly accessible without requiring separate session tokens or basic auth headers.

### 2. Backend Extraction Pipeline (`api/index.py`)
- Function `_fetch_ear_details(barcode: str) -> dict`:
  - Issues `POST` to `https://e-ar.thailandpost.com/ear-api/print/e-ar` with timeout of 6 seconds.
  - Automatically parses PDF in-memory:
    - **Signature Image**: Locates the signature image object on the page, automatically checks aspect ratio (rotates 90° clockwise if drawn vertically on handheld screen), and encodes as a high-fidelity Base64 PNG data URL (`data:image/png;base64,...`).
    - **Relationship (`relationship`)**: Extracts `ความสัมพันธ์ :` field (e.g. `เจ้าหน้าที่เวรรับส่ง`, `ผู้รับรับเอง`, `คนในบ้าน`, `เจ้าหน้าที่ของรัฐ`).
    - **Delivery Officer (`delivery_officer`)**: Extracts `เจ้าหน้าที่นำจ่าย :` field (e.g. `นายธนพนธ์ พรมพันธ์`).
    - **Status (`status`)**: Extracts `สถานะ :` field (e.g. `นำจ่ายถึงผู้รับแล้ว`).
    - **PDF URL**: `/api/reports/ear-pdf?barcode={barcode}`.
- Proxy Endpoint `GET /api/reports/ear-pdf?barcode={barcode}`:
  - Fetches the raw PDF from Thailand Post and serves it inline with `Content-Type: application/pdf` and `Content-Disposition: inline; filename=e-AR-{barcode}.pdf`.
  - Eliminates browser CORS restrictions and avoids needing complex POST calls from frontend tabs.

### 3. Frontend Component & UX Design
- Implemented in `TrackingTimelineModal.jsx` and `TrackingInquiryView.jsx`:
  - **`.track-step-ear-box`**: Premium emerald gradient card with dashed divider.
  - **Thumbnail Image (`.ear-sig-thumb-img`)**: Clean 46px white container with hover zoom hint.
  - **Lightbox Zoom Modal (`.ear-lightbox-modal`)**: Clicking the thumbnail opens an interactive high-resolution popup of the signature along with full recipient metadata and a close button.
  - **Metadata Badges**: `ความสัมพันธ์` rendered with `.ear-detail-badge`, `จนท.นำจ่าย` and `ชื่อผู้รับ` displayed cleanly.
  - **Direct PDF Link**: `📄 ดูใบตอบรับ e-AR (PDF) ↗` button opens the authentic Thailand Post PDF in a new tab.

### 4. Akamai Edge Geoblocking & Client-Side Hybrid Architecture (`earService.js`)
- **Foreign IP Geoblocking**:
  - When hosted on Vercel Serverless (US East `iad1`), Thailand Post's Akamai Edge blocks incoming server requests to `https://e-ar.thailandpost.com/ear-api/print/e-ar` with `403 Access Denied`.
- **Client-Side Direct Fetch & CORS Compatibility**:
  - Thailand Post's e-AR API explicitly sends `Access-Control-Allow-Origin: *` with `204 No Content` on preflight `OPTIONS` requests.
  - Because end-users reside in Thailand, their browsers can query `https://e-ar.thailandpost.com/ear-api/print/e-ar` directly without experiencing 403 blocks.
- **Hybrid Bridge Flow (`src/utils/earService.js`)**:
  1. Browser executes `fetch('https://e-ar.thailandpost.com/ear-api/print/e-ar', { method: 'POST', body: JSON.stringify([barcode]) })` directly from the user's domestic IP.
  2. Creates a local zero-latency `blobUrl = URL.createObjectURL(blob)` for instant PDF viewing when the user clicks `📄 ดูใบตอบรับ e-AR (PDF) ↗`.
  3. Sends the raw PDF bytes to `/api/reports/parse-ear-pdf` on Vercel, where PyMuPDF/pypdf parses and extracts the upright PNG signature image and metadata.
  4. Caches the parsed result in memory (`earCache`), providing instant, resilient display across both modal and batch inquiry views.

### 5. Signature Extraction Heuristics & Admin Extension Management (v2026.0917.2215)
- **e-AR True Handwritten Signature vs Banner Logo Heuristic**:
  - In Thailand Post e-AR PDF documents, multiple embedded images exist: `I1` (header logo banner 1320x280), `I2` (circular stamp ~1028x976), and `I3` (handwritten signature ~340x542).
  - The extraction pipeline (`_parse_ear_pdf_content` in `api/index.py`) uses candidate scoring:
    1. Filter out wide banners: `width / height > 2.2`.
    2. Filter out large postal stamps: `width > 700 and height > 700` or raw byte size `> 90KB`.
    3. Prefer RGBA images (digital pen strokes with transparency).
    4. Handheld postman devices capture signatures vertically: auto-rotate 90° counter-clockwise (`rotate(90, expand=True)`) to make signatures upright.
    5. Auto-crop transparent margins using `im.getbbox()` and composite onto a clean white RGB background.
- **ExtensionGate Modernization**:
  - Keep option 2 download link synchronized with the latest extension release (`/C2DPost_Helper_v1.3.0_WebStore.zip`).
- **Admin Chrome Web Store Console Shortcut**:
  - Direct upload URL (Developer Dashboard):
    `https://chrome.google.com/webstore/devconsole/`
  - Rendered in `Navbar.jsx` (User profile dropdown & drawer) and `AdminManagementView.jsx` guarded by `isAdmin === true`.

---

## 73. Status Report Default Reset Button & Extension Asset Optimization (v2026.0917.2238)

### 1. "คืนค่าเริ่มต้น" (Reset to Default) Workflow
- **Component Implementations**:
  - Integrated in both `DepositReportView.jsx` (full page status report) and `DepositReportModal.jsx` (quick popup report).
  - Button styling class: `.btn-reset-deposit` placed neatly next to `.btn-fetch-report` inside `.deposit-control-actions` / `.deposit-action-group`.
- **Reset Sequence**:
  1. **Purge Cache**: Clears browser session persistence: `sessionStorage.removeItem(DEPOSIT_REPORT_CACHE_KEY)`.
  2. **Restore Dates**: Reverts date picker inputs to today's local date (`todayIso`).
  3. **Reset Filters & Query**: Sets `searchQuery = ''` and `filterTab = 'all'`.
  4. **Reset Pagination**: Sets `currentPage = 1`.
  5. **Auto-Fetch**: Automatically triggers `handleFetchReport(todayIso, todayIso)` to immediately refresh live Thailand Post e-Parcel records.
- **Visual Design**:
  - Light & Dark mode support, 8px border-radius, SVG counter-clockwise rotate icon, responsive flex wrapping for mobile displays.

### 2. Extension Artifact Deduplication
- Removed stale archive packages (`v1.1.0`, `v1.2.0`) from web root and public distribution directories.
- Cleaned unpacked staging folders from Git tracking and added `.vercelignore` exclusion rules for production builds.

---

## 74. UX/UI Refinements & URL Migration Patterns (v2026.0917.2238+)

### 1. Chrome Web Store Developer Console URL Migration
- **Breaking Change**: Google migrated the Chrome Extension Developer Console domain.
  - ❌ Old (404): `https://chrome.google.com/webstore/devconsole/{extension_id}/edit`
  - ✅ New (correct): `https://chromewebstore.google.com/devconsole/{extension_id}/edit`
- **Search Pattern**: Always search all files for `chrome.google.com/webstore/devconsole` when updating.
- **Affected files** (must update all simultaneously): `Navbar.jsx` (2x: dropdown + mobile drawer), `AdminManagementView.jsx`, `PROJECT_DOCUMENTATION.md`, `SKILL.md`.

### 2. Chrome Extension Popup Minimal Design Pattern (`popup.html`)
- **Design Philosophy**: Extension popup must be ultra-compact and scannable at a glance. No bulky cards or long paragraphs.
- **Minimal Layout Structure**:
  ```html
  Header (logo 34px + brand name + version)
  Status Pill (inline dot + status text, pill shape, no border-box)
  Divider (hr, 1px #1e293b)
  CTA Button (full width, icon + text)
  Hint text (10px, muted, centered)
  ```
- **Key Rules**:
  - Width: `260px` (not 280px — tighter)
  - Status dot: `animation: pulse 2s infinite` for living feel
  - Long description → move to small `.hint` text below CTA button
  - Avoid `status-card` bordered boxes; use `border-radius: 100px` pill instead
  - Dark background: `#0f172a`, accent: `#059669`

### 3. Static Display-Only Info Pills (Non-Interactive Version Badges)
- **Pattern**: When a pill/badge element should show info only (not be clickable), apply these CSS rules:
  ```css
  cursor: default;          /* NOT cursor: pointer */
  user-select: none;
  /* Remove: transition, :hover effects, onClick, role="button", tabIndex */
  ```
- **Multi-line pill**: Use `flex-direction: column` + `line-height: 1.5` to stack text vertically inside a pill.
- **Implementation in `Navbar.jsx` (drawer version pill)**:
  - Remove: `onClick`, `title`, `role="button"`, `tabIndex`
  - Split single `<span>` into two `<span>` elements — first line: version, second line: organization name

### 4. Removing Redundant "ปิดหน้าต่าง" Close Button from Modals
- **Rule**: If a modal already has an ✕ close button in the header, do NOT add a secondary "ปิดหน้าต่าง" button in the footer.
- **Standard Footer Pattern** (TrackingTimelineModal best practice):
  ```jsx
  <div className="track-footer-actions">   {/* justify-content: flex-end */}
    <button className="btn-track-refresh">🔄 รีเฟรชสถานะ</button>
    {onOpenTrackingPage && (
      <button className="btn-track-fullpage">↗ เปิดหน้าตรวจสอบเต็มจอ</button>
    )}
    {/* ❌ NO: <button className="btn-track-close">ปิดหน้าต่าง</button> */}
  </div>
  ```
- **Footer action alignment**: Use `justify-content: flex-end` so buttons align to the right — cleaner UX.

### 5. Modal Width Sizing Guidelines
- **Tracking Timeline Modal**: `max-width: 780px` — wide enough for barcode + receiver name + ref no + status in one row without wrapping.
- **General Rule**: Set `max-width` wide enough so the primary content row (summary bar) renders on a single line at common desktop resolutions (1280px+).
- **Never use fixed `width:`** on modal containers — always use `max-width` with `width: 100%` for responsive behavior.

### 6. Removing Info Elements from Login Page (LoginModal.jsx)
- **Version Badge**: The `login-version-footer` div (showing `APP_VERSION + เวอร์ชันล่าสุด`) can be safely removed if the user prefers a cleaner minimal login screen.
- **JSX Nesting Warning**: When removing a block like `login-version-footer` from `LoginModal.jsx`, ensure the closing `</div>` for `.login-modal-card` is not accidentally removed with it. Always verify the JSX div nesting depth after such deletions.

---

## 75. Admin User Management: Interactive Row Edit/Add/Delete Popup Architecture (v2026.0917.2340)

### 1. The Challenge & User Experience Intent
- **Table Interaction**: In the Admin User Management dashboard (`AdminManagementView.jsx`), clicking directly on any user row in the list opens an interactive modal dialog for full lifecycle user management (View, Edit, Save, Delete, and Add New).
- **Active Dynamic Sizing ("ขนาด active ตามข้อมูลที่มี")**: The modal container adapts its dimensions smoothly to the content (`max-width: min(94vw, 700px); max-height: 90vh; width: 100%`) rather than having bloated whitespace or rigid dimensions.
- **Elimination of Redundant Close Buttons**: Following modern minimal UX principles, if a modal has an explicit `✕` close button in the header, do NOT include a secondary "ปิดหน้าต่าง" or "ยกเลิก" button in the footer. The footer remains exclusively dedicated to primary actions: Delete (`ลบบัญชี`) on the left, and Save (`บันทึกข้อมูล` / `บันทึกผู้ใช้ใหม่`) on the right.
- **Escape Key & Backdrop Close**: The dialog supports instant dismissal via the `Escape` key (`keydown` event listener) and clicking outside on the overlay backdrop.

### 2. Form Field & Section Organization (`aem-*` Design System)
- **Header (`.aem-header`)**:
  - Distinguishes between **Create New** (`_isNew === true`) and **Edit Existing** (`_isNew === false`).
  - Dynamic Icon: User+ for creation, User for editing.
  - Title: Displays username when editing or "เพิ่มข้อมูลผู้ใช้งานใหม่" when creating.
  - Subtitle: Renders status badge (`.aem-status-badge.status-dol`, `status-inactive`, `status-admin`) and organization name.
  - Header Actions: Includes "+ เพิ่มใหม่" button when editing to quickly switch to new user creation mode without leaving the modal, and the close `✕` button (`.aem-close-btn`).
- **Body Grid Layout**:
  - Organized into distinct visual groups with emerald accent border labels (`.aem-section-label`):
    1. **ข้อมูลบัญชีผู้ใช้**: UserName, Password, Email, Prefix
    2. **หน่วยงานและไปรษณีย์**: Organization, ไปรษณีย์รับผิดชอบ, รหัส ปณ., วันที่เปิดใช้งาน
    3. **ผู้ประสานงาน**: Contact persons 1–3 and telephone numbers 1–3 (with automatic phone number digits sanitization)
    4. **สิทธิ์และประเภทบาร์โค้ด**: Status (`DOL`, `INACTIVE`, `ADMIN`) and TypeBarcode (`EMS`, `R`, `eCo`)
- **Protected Administrator Accounts Guard**:
  - Guarded by `NO_EDIT_USERNAMES` (`admin`, etc.):
    - UserName field is disabled for editing on existing protected accounts.
    - Delete button (`.aem-btn-delete`) is completely hidden for protected accounts.
- **Footer Actions**:
  - Left: `.aem-btn-delete` (Red themed button with trash icon and confirmation prompt).
  - Right: `.aem-btn-save` (Emerald gradient button with diskette icon and loading spinner).
  - Auto-close: On successful save, displays green success notification banner and automatically closes the modal after 1.2 seconds.
- **Toolbar "+ เพิ่มผู้ใช้" Integration**:
  - Adds `.btn-admin-add-user` button in the table toolbar (`table-actions-right`) beside the search box and refresh button, opening the modal in fresh creation mode.

### 3. Removal of Redundant Left Form Panel & Full-Width Table Layout
- **Legacy Layout**: Originally, the page was divided into a 2-column split layout (`.admin-split-layout` with `440px 1fr`) where the left panel contained a static form (`.admin-form-panel`) and the right panel contained the table.
- **Problem**: With all Add/Edit/Save/Delete operations unified into the interactive row-click popup modal, the left form panel became redundant ("รูปที่ 1") and severely constrained horizontal space for the 12-column user table.
- **Refactoring Solution**:
  1. Removed `<aside className="admin-form-panel">` entirely from `AdminManagementView.jsx`.
  2. Cleaned up obsolete component states (`formData`, `selectedUserIndex`, `formError`, `formSuccess`, `isSaving`) and handlers (`handleInputChange`, `handleClearForm`, `handleSelectUser`, `handleSaveUser`).
  3. Expanded `.admin-split-layout` and `.admin-table-panel` to `width: 100%` single-column layout, enabling all 12 columns (`NO`, `UserName`, `Password`, `Prefix`, `Organization`, `Post Office`, `Zipcode`, `Activation Date`, `Contact 1`, `Tel 1`, `Status`, `Barcode Type`) to stretch across full desktop width with high readability and no awkward horizontal scrolling.

### 4. Admin Dedicated Navigation View: Hiding Regular User Tabs
- **Pattern**: When the active user is an administrator (`isAdmin === true`), hide all regular Land Office / postal tabs (`แปลงไฟล์ PDF`, `รายงานสถานะ`, `ตรวจสอบพัสดุ`, `.nav-tab-divider`, `DPost`, `e-AR`) from `.navbar-nav-tabs`.
- **Implementation (`Navbar.jsx`)**:
  ```jsx
  {!isAdmin && (
    <>
      <button ...>แปลงไฟล์ PDF</button>
      <button ...>รายงานสถานะ</button>
      <button ...>ตรวจสอบพัสดุ</button>
      <div className="nav-tab-divider" ... />
      <a ...>DPost</a>
      <a ...>e-AR</a>
    </>
  )}
  {isAdmin && (
    <button className="nav-tab-btn nav-tab-admin active">จัดการระบบ</button>
  )}
  ```
- **Brand Click Navigation**: Brand logo/title click navigates to `isAdmin ? 'admin' : 'workspace'` so administrators stay locked inside the admin portal.
- **Routing Enforcement (`App.jsx`)**: Enforce `activePage` locking via `useEffect` to guarantee admin accounts cannot inadvertently navigate to hidden user views.

### 5. Admin Users Excel Export Architecture
- **Dual-Engine Export Workflow**:
  - **Backend Primary (`/api/admin/export-users-excel`)**: Uses Python `openpyxl` with styled headers (`#064E3B`), zebra rows (`#F8FAFC`), auto-fit widths, and explicit Text formatting (`@`) for phone numbers, zipcodes, and passwords to prevent Excel from dropping leading zeros.
  - **Client-side Fallback (`src/utils/api.js`)**: If offline or backend proxy fails, generates UTF-8 BOM (`\uFEFF`) CSV with tab prefixes on sensitive numerical columns to ensure Thai character rendering and leading zero safety in Microsoft Excel.
- **UI Button Integration**: `.btn-admin-export-excel` placed on the table toolbar beside `+ เพิ่มผู้ใช้` with loading spinner animation and dynamic tooltip.


---

## 76. Tracking Timeline Modal UX/UI Architecture (v2026.0918.0600)

### 1. Structured 2-Tier Header Card Layout
- **Problem**: When barcode, timestamp, and recipient names were long, `flex-wrap: wrap` pushed the status pill to the bottom-left on row 2, creating an empty gap on the right.
- **Solution**:
  - **Tier 1 (Header Row)**: Barcode info on left (large monospace, one-click copy button, update time) and permanent anchored status badge on right (`.track-summary-status-box`).
  - **Tier 2 (Recipient Row)**: Recipient name and reference number organized in a dedicated horizontal pill strip (`.track-summary-recipient-row`).

### 2. Elimination of Redundant Status Description Subtext
- Do NOT display repetitive subtext tags for normal delivery or transit states (e.g. 'นำจ่ายถึงผู้รับแล้ว' below 'นำจ่ายสำเร็จ', or long transit location text below 'อยู่ระหว่างการนำจ่าย').
- Only trigger selective alert tags when an actual delivery exception occurs (`/บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีผู้รับ|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/`).

### 3. Rich Timeline Stepper Markers
- **Delivery Exception (e.g. บ้านปิด)**: Amber warning dot ⚠️ with pulsing ring, bold amber title, `[ ⚠️ ข้อยกเว้น: บ้านปิด ]` pill badge, and subtle amber card background tint.
- **Delivered**: Emerald circle ✓ with green title and `[ นำจ่ายสำเร็จ ]` badge.
- **Latest In-Transit**: Blue active circle with 🚚 truck icon, ripple pulse ring, and `[ สถานะล่าสุด ]` badge.
- **Clean Titles**: If title contains รับฝากแล้ว, omit duplicate `[รับฝากแล้ว]` badge.

---

## 77. Batch e-AR Download Architecture & Akamai Edge Relay (v2026.0918.0620)

### 1. Hybrid Client-to-Backend Architecture
- **Problem**: 
  1. `POST https://e-ar.thailandpost.com/ear-api/print/e-ar` only returns a 1-page PDF for the first barcode in a request array, even when multiple barcodes are provided.
  2. Thailand Post edge (Akamai) strictly blocks cloud datacenter IPs (Vercel US/EU/SG, AWS, GCP) with `403 Forbidden Access Denied`.
- **Solution**:
  1. **Frontend Concurrent Fetching (`earService.js`)**: Queries C2DPost Helper Extension (Domestic Thai IP) in chunks of 4 concurrent requests. Converts returned PDF array buffers to base64.
  2. **Backend Document Stitching (`api/index.py` -> `/api/reports/batch-ear-pdf`)**:
     - **PDF Merging (3-Up)**: Uses PyMuPDF (`fitz`) to tile individual receipts into 3 slots per A4 page with high-resolution vector fidelity.
     - **ZIP Archiving**: Uses standard library `zipfile.ZipFile` to compress individual PDFs named cleanly by sequence, barcode, and receiver name (e.g. `01_e-AR_BC414110982TH_ละอองทอง.pdf`).
     - **Header Streaming**: Returns proper MIME types (`application/pdf` or `application/zip`) with `Content-Disposition: attachment; filename=...` and `X-Total-Count`.

### 2. UI Components & State Management
- **Table Selection**: Checkbox per row (enabled only on delivered items) and header Select All checkbox that toggles all filtered delivered items.
- **Smart Default**: If user checks specific items, the button downloads selected items. If none are checked, it defaults to all delivered items in the active view/filter.
- **Live Progress Toast**: Bottom-right floating toast displaying live progress (`กำลังรวบรวม e-AR (3/10) • BC...`) and success confirmation.

---

## 78. Batch e-AR 3-Up Vector Layout Engine (3 รายการต่อหน้า A4)

### 1. The Paper Waste Problem & Vector Solution
- **The Problem**: Official Thailand Post e-AR PDFs format each delivery receipt strictly within the upper 1/3 of an A4 canvas (`y: 0` to `~280 pt`), leaving the bottom 2/3 as blank white space. Merging with standard `merged_doc.insert_pdf(sub_doc)` results in 1 receipt per page, wasting 66% of paper (e.g. 13 items require 13 printed pages).
- **The Solution**: 3-Up A4 Tiling via PyMuPDF (`fitz`) Vector Viewport Clipping:
  - 13 receipts are neatly packed into **only 5 pages** (3 + 3 + 3 + 3 + 1).
  - Uses vector coordinate mapping (`show_pdf_page`) instead of raster image scaling, preserving 100% razor-sharp barcode scanability, signature details, and text clarity.

### 2. Mathematics & Bounding Box Coordinates
```python
PAGE_WIDTH, PAGE_HEIGHT = fitz.paper_size("a4")  # 595.28 pt x 841.89 pt
ITEMS_PER_PAGE = 3
SLOT_HEIGHT = PAGE_HEIGHT / 3.0                  # 280.63 pt

# For each item (0, 1, 2) on a target page:
slot_idx = item_index % ITEMS_PER_PAGE
slot_y0 = slot_idx * SLOT_HEIGHT
slot_y1 = (slot_idx + 1) * SLOT_HEIGHT
target_slot_rect = fitz.Rect(0, slot_y0, PAGE_WIDTH, slot_y1)

# Clip source receipt to upper 1/3 to eliminate empty margin bleed:
src_clip_box = fitz.Rect(0, 0, src_page.rect.width, src_page.rect.height / 3.0)

# High-fidelity vector embedding:
target_page.show_pdf_page(target_slot_rect, sub_doc, 0, clip=src_clip_box)
```

### 3. Subtle Dashed Cutting Guides (เส้นประบอกตำแหน่งตัด)
To facilitate physical scissors or guillotine trimming for physical archiving:
```python
# Draw separator line between slots (after slot 0 and slot 1):
if slot_idx < ITEMS_PER_PAGE - 1:
    line_y = slot_y1
    target_page.draw_line(
        fitz.Point(35, line_y),
        fitz.Point(PAGE_WIDTH - 35, line_y),
        color=(0.78, 0.78, 0.78),  # Subtle modern gray #C7C7C7
        width=0.6,
        dashes="[3 5] 0"           # 3pt dash, 5pt gap
    )
```

---

## 79. Headless Serverless Typography & Buddhist Era Real-Time Timestamping

### 1. Headless Linux Font Deficit on Vercel
- **The Issue**: Vercel Serverless Python containers (Amazon Linux / Debian base) have zero Thai system fonts installed (`fc-list` is empty or missing Thai glyphs). Using PyMuPDF's default `helv` font renders Thai characters as question marks (`???`) or empty squares.
- **The Solution**:
  - Bundle `tahoma.ttf` directly in `api/fonts/tahoma.ttf`.
  - Dynamically register font at runtime:
  ```python
  FONT_PATH = os.path.join(os.path.dirname(__file__), "fonts", "tahoma.ttf")
  font_name = "helv"
  if os.path.exists(FONT_PATH):
      try:
          target_page.insert_font(fontname="tahoma-th", fontfile=FONT_PATH)
          font_name = "tahoma-th"
      except Exception as fe:
          logger.warning(f"Font registration warning: {fe}")
  ```

### 2. Timezone Normalization & Buddhist Era Year Calculation
- **Serverless UTC vs. Bangkok Time**: Vercel serverless containers execute in UTC time. Calling `datetime.now()` directly yields timestamps 7 hours behind Thailand.
- **Timestamp Pipeline**:
  1. Frontend passes client Bangkok local time string in payload: `downloaded_at: "18/09/2569 07:15:30 น."`.
  2. If missing, backend calculates GMT+7 with Buddhist Era offset:
  ```python
  from datetime import datetime, timezone, timedelta

  tz_bkk = timezone(timedelta(hours=7))
  now_bkk = datetime.now(tz_bkk)
  be_year = now_bkk.year + 543
  stamp_text = f"ดาวน์โหลดเมื่อ: {now_bkk.strftime('%d/%m')}/{be_year} {now_bkk.strftime('%H:%M:%S')} น."
  ```

### 3. Thai Tone Mark (ไม้เอก/ไม้โท) Submerged Artifact & TextWriter Solution
- **The Problem**: MuPDF's default text rendering (`page.insert_text`) lacks OpenType GSUB complex script shaping for Thai. In TrueType fonts like Tahoma, upper vowels (`ิ`, `ี`, `ึ`, `ื`, `ั`, `ํ`) reside at Level 2, while tone marks (`่`, `้`, `๊`, `๋`, `์`) have a zero advance width (`0.0 pt`) and are also positioned by default at Level 2.
- When a tone mark follows an upper vowel (e.g. `เมื่อ`, `ที่`, `พื้นที่`), standard MuPDF draws both glyphs at the exact same vertical baseline. The tone mark (such as ไม้เอก `่`) collides with and becomes submerged/obscured inside the upper vowel (`ื`), causing `ดาวน์โหลดเมื่อ` to appear as `ดาวน์โหลดเมือ` ("สระไม้เอกหายหรือจม").
- **The Solution (`_render_thai_footer`)**:
  - Uses `fitz.TextWriter(page.rect)` to track individual character widths and positions.
  - Automatically detects when a tone mark follows an upper vowel (`c in TONE_MARKS and prev_char in UPPER_VOWELS`).
  - Lifts the tone mark glyph up to Level 3 (`y0 - lift_y` where `lift_y = fontsize * 0.28`).
  - Result: Perfect Thai typographic rendering where ไม้เอก floats naturally and crisply above สระอือ without clipping or distortion.

```python
def _render_thai_footer(page, pos, text, tahoma_font, fontsize=8.0, color=(0.42, 0.42, 0.42)):
    if not tahoma_font:
        try:
            page.insert_text(pos, text, fontname="helv", fontsize=fontsize, color=color)
        except Exception:
            pass
        return

    import unicodedata, fitz
    norm_text = unicodedata.normalize('NFC', text)
    UPPER_VOWELS = {'\u0e31', '\u0e34', '\u0e35', '\u0e36', '\u0e37', '\u0e4d'}
    TONE_MARKS = {'\u0e48', '\u0e49', '\u0e4a', '\u0e4b', '\u0e4c'}

    tw = fitz.TextWriter(page.rect)
    x0, y0 = pos
    curr_x = x0
    prev_char = ''
    lift_y = fontsize * 0.28

    for c in norm_text:
        if c in TONE_MARKS and prev_char in UPPER_VOWELS:
            tw.append((curr_x, y0 - lift_y), c, font=tahoma_font, fontsize=fontsize)
        else:
            tw.append((curr_x, y0), c, font=tahoma_font, fontsize=fontsize)
            lengths = tahoma_font.char_lengths(c, fontsize)
            w = lengths[0] if lengths else fontsize * 0.5
            curr_x += w
        prev_char = c

    tw.write_text(page, color=color)
```

### 4. Dual-Corner Footer Layout & Pagination
- **Footer Placement on 3-Up Merged PDF**:
  - **Bottom-Left**: `_render_thai_footer(p, (20, 832), f"ดาวน์โหลดเมื่อ: {downloaded_str}", tahoma_font, fontsize=8.0)`.
  - **Bottom-Right**: `_render_thai_footer(p, (PAGE_WIDTH - 85, 832), f"หน้า {pno + 1} จาก {total_pages}", tahoma_font, fontsize=8.0)`.
- **Footer Placement on Individual ZIP PDFs**:
  - Each individual PDF in the ZIP archive is stamped identically with `หน้า 1 จาก 1` and the exact download timestamp before archive compression.

---

## 80. Split Action Button UX Pattern & Modern Glassmorphism Styling

### 1. Frictionless 1-Click vs. 2-Click UX
- **The Problem**: Standard dropdown menus force users through 2 clicks (Click 1: open menu, Click 2: choose PDF). Since 90% of users want the combined 3-up PDF, this creates repetitive friction.
- **The Solution**: **Split Action Button** (`.ear-download-split-wrap`):
  - **Primary Left Button (`.btn-footer-ear-main`)**: 1-click downloads the Combined 3-Up PDF directly without opening any menus.
  - **Secondary Right Caret (`.btn-footer-ear-arrow`)**: Clicking the chevron arrow opens the popover menu for the ZIP archive option.

### 2. Component Structure (JSX)
```jsx
<div className="ear-download-split-wrap" ref={dropdownRef}>
  <button
    className="btn-footer-ear btn-footer-ear-main"
    onClick={() => handleDownloadEar('pdf')}
    disabled={isDownloading}
    title="ดาวน์โหลด e-AR รวมเป็นไฟล์เดียว (3 รายการต่อหน้า A4)"
  >
    <span className="ear-btn-icon">📄</span>
    <span>ดาวน์โหลด e-AR ({targetCount})</span>
  </button>
  <button
    className={`btn-footer-ear-arrow ${showEarDropdown ? 'active' : ''}`}
    onClick={() => setShowEarDropdown(!showEarDropdown)}
    disabled={isDownloading}
    title="เลือกรูปแบบการดาวน์โหลดเพิ่มเติม (ZIP)"
  >
    ▾
  </button>
  {showEarDropdown && (
    <div className="ear-dropdown-menu">
      <button onClick={() => { setShowEarDropdown(false); handleDownloadEar('pdf'); }}>
        <span className="ear-menu-icon">📄</span>
        <div className="ear-menu-text">
          <div className="ear-menu-title">ไฟล์ PDF รวมหน้า (3 รายการ/หน้า)</div>
          <div className="ear-menu-desc">รวม e-AR เป็นเอกสารชุดเดียว ประหยัดกระดาษ</div>
        </div>
      </button>
      <button onClick={() => { setShowEarDropdown(false); handleDownloadEar('zip'); }}>
        <span className="ear-menu-icon">📦</span>
        <div className="ear-menu-text">
          <div className="ear-menu-title">ไฟล์บีบอัด ZIP (แยกไฟล์ละใบ)</div>
          <div className="ear-menu-desc">ดาวน์โหลดไฟล์ PDF แยกตามเลขแทร็กกิ้ง</div>
        </div>
      </button>
    </div>
  )}
</div>
```

### 3. Glassmorphism CSS Architecture
```css
.ear-download-split-wrap {
  display: inline-flex;
  align-items: stretch;
  border-radius: 9999px;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.28);
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.ear-download-split-wrap:hover {
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
  transform: translateY(-1px);
}

.btn-footer-ear-main {
  border: none;
  background: transparent;
  color: #ffffff;
  font-family: 'Prompt', sans-serif;
  font-weight: 600;
  font-size: 0.88rem;
  padding: 0.55rem 1rem 0.55rem 1.15rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  border-top-left-radius: 9999px;
  border-bottom-left-radius: 9999px;
}

.btn-footer-ear-arrow {
  border: none;
  background: transparent;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
  color: #ffffff;
  padding: 0 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  border-top-right-radius: 9999px;
  border-bottom-right-radius: 9999px;
}

.btn-footer-ear-arrow:hover,
.btn-footer-ear-arrow.active {
  background: rgba(255, 255, 255, 0.15);
}

.ear-dropdown-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 290px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04);
  padding: 0.4rem;
  z-index: 1000;
  animation: earDropdownFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 81. Fast Extension Capability Handshake Protocol (Fail-Fast 600ms)

### 1. The 30-Second Silent Freeze Trap
- When an extension is not installed or has an older version lacking `ear_download` support, standard un-monitored `window.postMessage` listeners silently hang until timeout.
- In batch operations with 10-20 items, users experience a frozen app for 30+ seconds with no actionable error feedback.

### 2. Fast Pre-Flight Check Protocol (`extensionBridge.js`)
```javascript
export const checkEarCapability = async (timeoutMs = 600) => {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handleMsg);
        resolve({ available: false, reason: 'TIMEOUT_NO_EXTENSION' });
      }
    }, timeoutMs);

    function handleMsg(e) {
      if (e.data?.type === 'C2DPOST_EXTENSION_PONG') {
        resolved = true;
        clearTimeout(timer);
        window.removeEventListener('message', handleMsg);
        
        const extVersion = e.data.version || '1.0.0';
        const hasEar = e.data.capabilities?.includes('ear_download') || compareVersions(extVersion, '1.2.0') >= 0;
        resolve({ available: hasEar, version: extVersion });
      }
    }

    window.addEventListener('message', handleMsg);
    window.postMessage({ type: 'C2DPOST_EXTENSION_PING', source: 'c2dpost-web' }, '*');
  });
};
```

### 3. Guided Troubleshooting Modal (`earHelpModal`)
If `checkEarCapability()` returns `available: false`:
- The app immediately aborts batch network requests in **0.6 seconds**.
- Pops open the **e-AR Helper Guide Modal** (`earHelpModal`):
  1. Explanation: "ต้องใช้ส่วนขยาย C2DPost Helper เวอร์ชัน 1.2.0 ขึ้นไป เพื่อเชื่อมต่อกับระบบ e-AR ไปรษณีย์ไทย"
  2. Quick Action Steps:
     - กดดาวน์โหลดส่วนขยายเวอร์ชันล่าสุด
     - เปิด `chrome://extensions/` แล้วกดปุ่มโหลดซ้ำ 🔄 (Reload)
  3. Copyable link to extension files.

---

## 82. High-Performance ZIP Compression & Sanitized Thai Filename Engine

### 1. In-Memory Stream Architecture
```python
import io
import re
import zipfile

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zip_file:
    for idx, item in enumerate(items, 1):
        barcode = item.get("barcode", "UNKNOWN")
        receiver = item.get("receiver_name", "ผู้รับ")
        
        # Sanitize Windows & Unix illegal characters (\ / : * ? " < > |)
        clean_receiver = re.sub(r'[\\/*?:"<>|]', "", receiver).strip()[:30]
        filename = f"{idx:02d}_e-AR_{barcode}_{clean_receiver}.pdf"
        
        # Stamp single-item footer
        stamped_bytes = stamp_single_ear_footer(item_pdf_bytes, stamp_text)
        
        # Write to zip archive
        zip_file.writestr(filename, stamped_bytes)

zip_buffer.seek(0)
```

### 2. Header Specification
```python
return StreamingResponse(
    zip_buffer,
    media_type="application/zip",
    headers={
        "Content-Disposition": f'attachment; filename="e-AR_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip"',
        "X-Total-Count": str(len(items))
    }
)
```

---

## 83. Auto-Collapsing External Services Navbar Widget (30s Interaction Timer & Smooth Morph)

### 1. Requirements & UX Purpose
- The desktop navbar navigation bar houses primary tabs (`แปลงไฟล์ PDF`, `รายงานสถานะ`, `ตรวจสอบพัสดุ`).
- Secondary external Thai Post services (`DPost ↗` and `e-AR ↗`) take up valuable horizontal real estate on standard laptop screens.
- **Solution**: Collapse both external buttons behind a single Internet Globe icon button (`nav-internet-toggle-btn`).
- **Interactive Behavior**:
  1. Default State: Collapsed into the Internet Globe icon with a downward indicator (`▾`).
  2. Click to Expand: Morphs and slides open horizontally displaying `DPost ↗` and `e-AR ↗` with smooth cubic-bezier transitions.
  3. Auto-Collapse Timer: Stays expanded for **30 seconds** (`30,000 ms`). If no further click occurs, it automatically collapses back to save space.
  4. Timer Reset on Click: Clicking either `DPost` or `e-AR` restarts the 30s timer to prevent premature closing during interaction.
  5. Immediate Toggle: Clicking the Internet Globe button while expanded toggles it closed immediately and clears the timer.

### 2. State & Timer Architecture (`Navbar.jsx`)
```jsx
const [isExtLinksExpanded, setIsExtLinksExpanded] = useState(false);
const extLinksTimerRef = useRef(null);

const startExtLinksTimer = useCallback(() => {
  if (extLinksTimerRef.current) {
    clearTimeout(extLinksTimerRef.current);
  }
  extLinksTimerRef.current = setTimeout(() => {
    setIsExtLinksExpanded(false);
    extLinksTimerRef.current = null;
  }, 30000);
}, []);

const handleToggleExtLinks = () => {
  if (isExtLinksExpanded) {
    if (extLinksTimerRef.current) {
      clearTimeout(extLinksTimerRef.current);
      extLinksTimerRef.current = null;
    }
    setIsExtLinksExpanded(false);
  } else {
    setIsExtLinksExpanded(true);
    startExtLinksTimer();
  }
};

useEffect(() => {
  return () => {
    if (extLinksTimerRef.current) {
      clearTimeout(extLinksTimerRef.current);
    }
  };
}, []);
```

### 3. CSS Animation Engine (`Navbar.css`)
```css
.nav-ext-group {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.nav-ext-links-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  visibility: hidden;
  white-space: nowrap;
  transition: max-width 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, visibility 0.38s ease;
}

.nav-ext-links-wrapper.expanded {
  max-width: 280px;
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
  overflow: visible;
}
```

---

## 84. Streamlined Single-Action e-AR Download (Direct PDF Mode)

### 1. Requirements & UX Philosophy
- Previously, the batch e-AR download button featured a split dropdown allowing users to select between a Combined PDF or a compressed ZIP archive.
- **User Preference**: Eliminate format selection ambiguity and extra clicks. Default strictly to **Direct PDF Download** (`format = 'pdf'`).
- The button is now a single unified pill button (`btn-footer-ear`) that triggers the batch PDF generation pipeline immediately upon click.

### 2. Implementation Specifications
- **Button Element**: `<button className="btn-footer-ear ...">`
- **Click Handler**: Directly calls `handleBatchDownloadEar('pdf')`.
- **States & Visual Styling**:
  - Unselected/All: Purple theme (`#7c3aed`).
  - Active Selection: Blue accent (`#2563eb` with `.has-selection`).
  - Loading: Animated spinner with progressive feedback text (`กำลังรวบรวม e-AR (X/Y)...`).
  - Disabled: Transparent slate (`#94a3b8`) when no delivered items exist.
- Applied consistently across:
  1. `DepositReportView.jsx` (Main Status Report page)
  2. `DepositReportModal.jsx` (Status Report pop-up modal)
  3. `TrackingInquiryView.jsx` (Tracking lookup page)

---

## 85. Tracking Timeline Modal: Receiver Address Banner Integration

### 1. Requirements & UX Purpose
- When users click on a barcode to inspect tracking history in `TrackingTimelineModal`, the summary card displays the recipient's name (`ผู้รับ: ...`) and the reference number (`เลขที่อ้างอิง: ...`).
- **User Request**: Display the full recipient delivery address (`ที่อยู่: ...`) immediately following the reference number pill.
- Provides immediate contextual verification of the destination without requiring the user to switch back and forth to the report table.

### 2. Implementation Specifications
- **Address Construction Engine**:
  - Automatically merges address components (`receiver_address`, `receiver_amphur`, `receiver_province`, `receiver_zipcode`) avoiding duplicate prefixes.
  - Automatically handles fallbacks (`address`, `cusAdd`, `RECEIVER_ADDRESS`).
- **Pill Presentation (`.track-address-pill`)**:
  - Emerald subtle background (`rgba(16, 185, 129, 0.08)` in light mode, `rgba(16, 185, 129, 0.16)` in dark mode).
  - High-visibility icon: Location Pin (`📍`).
  - `word-break: break-word` and `flex-wrap` ensure proper responsiveness on small screens.

---

## 86. ThaiDateInput: Day/Month/Year (วัน/เดือน/ปี) Date Picker Component

### 1. Requirements & Problem Solved
- Standard HTML `<input type="date">` renders its display format according to the operating system / browser locale.
- On Windows PCs configured with English (United States) locale, Chrome displays `MM/DD/YYYY` (e.g. `09/18/2026`), which confuses Thai government officials who expect `วัน/เดือน/ปี` (`DD/MM/YYYY`, e.g. `18/09/2026`).
- **Solution (`ThaiDateInput`)**:
  1. Displays strictly in `DD/MM/YYYY` (`วัน/เดือน/ปี`) format inside the text box.
  2. Embeds an overlaid calendar action button (`📅`) that triggers the native HTML5 calendar picker on click.
  3. Supports manual keyboard typing with smart parsing (including Thai Buddhist Era `+543` years if typed).
  4. Keeps parent state synchronized with standard ISO `YYYY-MM-DD` strings for full API and comparison compatibility.
  5. Removes redundant grammar repetitions (e.g. "ถึง ถึงวันที่:" -> "ตั้งแต่วันที่: ... ถึงวันที่: ...").

---

## 87. Resilient e-AR Batch Download & State Cleanup Best Practices

### 1. Root Cause Analysis: Undefined State Setter (`ReferenceError`)
- When refactoring the e-AR download button from a split dropdown menu to a single direct-action button, state definitions like `showEarDropdown` and `setShowEarDropdown` were removed.
- However, stale references (`setShowEarDropdown(false)`) remained on the initial line of `handleBatchDownloadEar` across `DepositReportView.jsx`, `DepositReportModal.jsx`, and `TrackingInquiryView.jsx`.
- In JavaScript, invoking an undeclared setter triggers an immediate runtime exception:
  `Uncaught ReferenceError: setShowEarDropdown is not defined`
  This halts execution before any download network request or progress state can be dispatched, making the button appear completely unresponsive to user clicks.

### 2. Resolution & Fallback Resilience Architecture
1. **Clean State Handler**:
   - Completely pruned all residual references to `setShowEarDropdown(false)` in all views.
2. **Non-Blocking Preflight Capability Check (`earService.js`)**:
   - Previously, Step 0 in `downloadBatchEar` hard-blocked with an immediate `throw error` if `!cap.supported` before attempting any document fetch.
   - Users on domestic networks where Thailand Post APIs are directly reachable, or users with slight handshake latency, were unnecessarily blocked.
   - Refactored to a non-blocking capability probe:
     - Attempts Strategy 1 (Extension bridge) and Strategy 2 (Direct browser fetch).
     - Only if 0 valid documents could be retrieved AND the extension capability check confirms it is missing or outdated, prompt the user with the extension install/reload modal.

---

## 88. Primary Action Toolbar Workflow Reordering (Fetch -> Send e-Parcel -> Download)

### 1. Requirements & UX Psychology
- Standard operational workflow for Thailand Post Land Office batch processing is linear:
  1. **Add PDF documents** (Parse Land Office records).
  2. **Fetch Barcode (`[ดึงหมายเลข]`)** (Allocate PostOne barcode numbers via Extension).
  3. **Send e-Parcel (`[ส่งข้อมูล e-Parcel]`)** (Push consignment details and recipient addresses to Thailand Post e-Parcel cloud).
  4. **Download Documents (`[ดาวน์โหลดเอกสาร ▾]`)** (Print physical envelopes, delivery note manifest, and barcode stamped PDFs).
- **Previous Order**: `[ดึงหมายเลข]` ➔ `[ดาวน์โหลดเอกสาร ▾]` ➔ `[ส่งข้อมูล e-Parcel]`.
  - Having "Download" positioned in the middle caused users to accidentally generate manifests and envelopes before submitting the consignment to e-Parcel.
- **Enhanced Order**: `[ดึงหมายเลข]` ➔ **`[ส่งข้อมูล e-Parcel]`** ➔ **`[ดาวน์โหลดเอกสาร ▾]`**.
  - Naturally guides users through the logical sequence.
  - Aligns the physical UI button sequence 1-to-1 with the chapters in the official User Manual (`USER_MANUAL.md`).

### 2. Dropdown Alignment Architecture
- When `download-docs-wrapper` is positioned on the far-right edge of `.action-buttons-group`:
  - CSS rule `.download-docs-dropdown { position: absolute; top: calc(100% + 10px); right: 0; }` aligns flush with the right bounding box of the button/toolbar.
  - Guarantees zero viewport overflow and avoids clipping on smaller notebook displays.

---

## 89. PDF Conversion Table: Plain Barcode Display vs Interactive Tracking

### 1. Requirements & Scope Isolation
- In the main PDF conversion data grid (`PreviewGrid.jsx`), barcode numbers retrieved from PostOne should render as **plain informational text** rather than clickable links or buttons with search icons (`🔍`).
- **Rationale**:
  - During document preparation, clicking barcodes caused accidental navigation to the tracking modal when users merely intended to highlight or inspect the text.
  - Full tracking exploration remains accessible via the tool column action button (`btn-tool-track` ⏰ icon) and the dedicated `TrackingInquiryView` / `DepositReportView` pages.

### 2. Implementation Specifications
- **Render Markup**:
  ```jsx
  <td className="col-barcode">
    {barcode ? (
      <span className="barcode-text has-bcode">{barcode}</span>
    ) : (
      <span className="barcode-text no-bcode">-</span>
    )}
  </td>
  ```
- Removed anchor tags, pointer cursor, and magnifying glass search icons from the barcode column.

---

## 90. Streamlined General User Manual Architecture (`USER_MANUAL.md`)

### 1. Structural Design Principles
- Separation of concerns between technical documentation (`PROJECT_DOCUMENTATION.md`) and end-user operational manuals (`USER_MANUAL.md`).
- Completely removes technical internals: no database schemas, API endpoints, microservice diagrams, or code snippets.
- Organizes the operational lifecycle into 4 cohesive chapters:
  - **บทที่ 1: การเตรียมตัวก่อนใช้งานและการติดตั้ง Extension** (Chrome, C2DPost Helper Extension).
  - **บทที่ 2: การลงทะเบียนขอสิทธิ์ใช้งานและการเข้าสู่ระบบ** (2.1 Registration 4-part form, 2.2 Login & automatic credential persistence).
  - **บทที่ 3: การแปลงไฟล์ PDF การส่งข้อมูล e-Parcel และการดาวน์โหลดเอกสาร** (Core workflow matching button sequence 3.1 to 3.4).
  - **บทที่ 4: รายงานการรับฝาก การติดตามสถานะพัสดุ และใบตอบรับ e-AR** (Deposit report stats, 3-up e-AR downloads, and tracking history).
  - **FAQ & Support Channels** (Troubleshooting common codes like Error 018, Line Official, Canva guide).

---

## 91. Multi-Tier e-Parcel Authentication & Credential Architecture

### 1. Verification Architecture
1. **Registration Verification (`RegistrationModal.jsx`)**:
   - Step 1 requires users to verify their e-Parcel credentials directly against Thailand Post via the Chrome Extension bridge (`C2DPOST_TEST_EPARCEL_LOGIN`).
   - Returns immediate validation status (`✅ ถูกต้อง` or `❌ ไม่ถูกต้อง`). Users cannot proceed to enter organization details until credentials pass.
2. **Centralized User Master (`LoginC2DPost.gsheet`)**:
   - Upon admin approval, authorized credentials and agency metadata are stored in Google Sheets.
   - Frontend accesses user whitelist via live CSV export.
3. **Login Tolerance & Security**:
   - Case-insensitive username evaluation (`username.trim().toLowerCase()`) eliminates mobile/caps-lock errors.
   - Strict case-sensitive password verification.
   - Active session tokens cached in `localStorage` for transparent reconnection.

---

## 92. PDF Status Step Classification Fix: เตรียมนำจ่าย vs ถึง ปณ.ปลายทาง (v2026.0918.2118)

- **Problem (`classify_step_for_pdf` in `api/index.py`)**: Descriptions like `ถึงที่ทำการไปรษณีย์ปลายทาง (เตรียมการนำจ่าย)` contain both `ปลายทาง` AND `ถึง`, so the old guard `if "เตรียมนำจ่าย" in desc and "ถึง" not in desc:` never fired (because `ถึง` appears in `ถึงที่ทำการ...`). Result: the latest action was mislabeled `ถึง ปณ.ปลายทาง` instead of `เตรียมนำจ่าย`. The real phrase may also be `เตรียมการนำจ่าย` (with `การ`) which `"เตรียมนำจ่าย" in desc` did not even match.
- **Solution**: Check `เตรียมนำจ่าย` / `เตรียมการนำจ่าย` in a dedicated step placed BEFORE the destination-office group, and delete the contradictory `"ถึง" not in desc` guard entirely. Plain `ถึงที่ทำการไปรษณีย์ปลายทาง` (no prepare-phrase) still classifies as `ถึง ปณ.ปลายทาง`.
- **Rule**: Always classify by the *latest action* (e.g. ready-for-delivery) before grouping by the *arrival checkpoint* when both keywords coexist in one description.

---

## 93. Central Bugfix Ledger and Bug Resolution Protocol (`BUGFIX_REPORT.md`)

### 1. Mandatory Bug Tracking Policy
- Any bug detected, investigated, or resolved in `C2DPost_web` (across Python Backend, PDF Core Engine, React Frontend, or Chrome Extension) must be permanently logged in `C2DPost_web/BUGFIX_REPORT.md`.
- `BUGFIX_REPORT.md` acts as the single source of truth (SSOT) for all quality engineering findings, root-cause analyses, and resolution verifications.

### 2. Standard Bugfix Documentation Schema
Each bug recorded must adhere to the standardized structure:
1. **Severity Classification**:
   - `HIGH`: Unhandled crashes, serverless 500 errors, core data corruption, or fatal missing imports.
   - `MEDIUM`: Misclassified state logic, UI mismatch between View & Modal, or unauthorized mock/demo data leakage into official government documents.
   - `MINOR/LOW`: Path sanitization, XML escaping in ReportLab, logging cleanup in hot paths, or extension interval/memory leak hygiene.
2. **Tabular Summary Matrix**:
   - Column schema: `#` | `ความรุนแรง (Severity)` | `ตำแหน่ง (File:Line)` | `ปัญหา (Issue)` | `ผลกระทบ (Impact)` | `สถานะ (Status)`
3. **Deep-Dive Engineering Section**:
   - Detailed "ก่อน (Before)" vs "หลัง (After)" code comparison.
   - Root-cause explanation and technical solution.
   - Architectural benefits and regression prevention.
4. **Verification & Deployment Checklist**:
   - Python AST syntax checking.
   - `npm run build` frontend bundling.
   - Multi-file version bump synchronization (`config.js`, `package.json`, `convert_dpost.py`, `PROJECT_DOCUMENTATION.md`, `ROADMAP_REPORT_FEATURE.md`, `SKILL.md`).
   - Production deployment verification (`GET /api/health`).








