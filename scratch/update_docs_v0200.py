import os

# 1. Update PROJECT_DOCUMENTATION.md
p_doc = 'PROJECT_DOCUMENTATION.md'
txt_doc = open(p_doc, 'r', encoding='utf-8').read()
sec_doc = """
---

## 61. ระบบคลิกล็อคข้อมูลจังหวัดบนแผนที่ และ Floating Rich Tooltip อัตราสำเร็จ (v2026.0925.0200)

### 61.1 ความต้องการของผู้ใช้งาน
1. **การคลิกล็อคข้อมูลจังหวัด (Interactive Province Locking)**:
   - ผู้ใช้ต้องการให้คลิกที่รูปจังหวัดใดจังหวัดหนึ่งบนแผนที่ แล้วสามารถ "ล็อคข้อมูล" ของจังหวัดนั้นไว้ได้ โดยไม่หายไปเมื่อเลื่อนเมาส์ออกจากแผนที่
2. **การอัปเกรด UI ของ Tooltip (Floating Rich Tooltip UX)**:
   - ผู้ใช้ต้องการให้เมื่อเลื่อนเมาส์ชี้ที่จังหวัดบนแผนที่ มี Tooltip ที่มี UI สวยงาม ทันสมัย และอ่านค่าง่ายกว่าเดิม แทนที่ Tooltip ดั้งเดิมของเบราว์เซอร์

### 61.2 การออกแบบและการนำไปปฏิบัติ (Implementation Architecture)
1. **ระบบแยกสถานะ Hover vs. Lock (`DashboardView.jsx`)**:
   - เพิ่ม State `lockedProvince` เพื่อบันทึกจังหวัดที่ผู้ใช้คลิกเลือกตรึงข้อมูล
   - เพิ่ม State `hoveredProvince` และ `tooltip` สำหรับการแสดงผลชั่วคราวขณะเลื่อนเมาส์
   - ฟังก์ชัน `handleToggleLockProvince(provinceName)`:
     - หากคลิกจังหวัดเดิมที่ล็อคอยู่: ปลดล็อค (`lockedProvince = null`)
     - หากคลิกจังหวัดใหม่: ล็อคข้อมูลของจังหวัดนั้นทันที
   - การแสดงผลในการ์ดรายละเอียด (`dash-province-detail`):
     - เมื่ออยู่ในสถานะล็อค จะแสดงแถบสถานะสีทอง `🔒 ล็อคข้อมูลจังหวัด` พร้อมปุ่มกด `ปลดล็อค ✕` เพื่อให้ผู้ใช้สามารถปลดล็อคหรือคลิกสลับดูจังหวัดอื่นได้อย่างสะดวก
     - ข้อมูลจังหวัดที่ถูกล็อคจะคงอยู่ถาวรแม้ผู้ใช้จะเลื่อนเมาส์ออกนอกพื้นที่แผนที่
2. **Floating Rich Tooltip ดีไซน์ Glassmorphism สุดพรีเมียม**:
   - ยกเลิกแท็ก `<title>` เดิมของ SVG เพื่อระงับ Tooltip ดั้งเดิมของระบบปฏิบัติการ
   - สร้างโมดูล Tooltip ลอยอัจฉริยะ ติดตามเคอร์เซอร์เมาส์ด้วย `pointer-events: none` พร้อมอัลกอริทึม Smart Boundary Flipping (`flipX`, `flipY`) ป้องกัน Tooltip ล้นจอ
   - ข้อมูลบน Tooltip ประกอบด้วย:
     - 📍 ชื่อจังหวัด พร้อม Badge ป้ายกำกับอัตราสำเร็จตามเกณฑ์สีมาตรฐาน (เขียว/เขียวมะนาว/เหลือง/ส้ม/แดง)
     - Progress Bar แสดงอัตรานำจ่ายสำเร็จแบบกราฟิกสวยงาม
     - Mini Metrics Grid (2x2): รับฝากแล้ว, อยู่ระหว่างนำจ่าย, สำเร็จ, ส่งคืน
     - ยอดรวมพัสดุทั้งหมดของจังหวัด
     - ป้ายคำแนะนำการคลิก: `🔒 คลิกเพื่อล็อคข้อมูล` หรือ `🔓 คลิกเพื่อปลดล็อค`
3. **เอฟเฟกต์แผนที่และตารางจัดอันดับ (Visual Feedback)**:
   - จังหวัดที่ถูกล็อคบนแผนที่จะมีเส้นขอบสีทองเรืองแสงพร้อมเอฟเฟกต์ Pulsing Glow (`@keyframes lockedProvinceGlow`) ชัดเจนและไม่ถูกเส้นแบ่งจังหวัดข้างเคียงบดบัง
   - ในตารางจัดอันดับจังหวัด (`dash-ranking-table`) แถวของจังหวัดที่ถูกล็อคจะมีไฮไลท์สีทอง พร้อมไอคอน `🔒` และสามารถคลิกที่แถวเพื่อล็อค/ปลดล็อคได้เช่นกัน
"""
if "## 61." not in txt_doc:
    txt_doc = txt_doc.strip() + "\n" + sec_doc + "\n"
    open(p_doc, 'w', encoding='utf-8', newline='').write(txt_doc)
    print("PROJECT_DOCUMENTATION.md updated")

# 2. Update ROADMAP_REPORT_FEATURE.md
p_roadmap = 'ROADMAP_REPORT_FEATURE.md'
txt_roadmap = open(p_roadmap, 'r', encoding='utf-8').read()
item_roadmap = """- [x] **4.79 ระบบคลิกล็อคข้อมูลจังหวัดบนแผนที่ และ Floating Rich Tooltip แสดงสถิติอย่างละเอียด (v2026.0925.0200)**
  - **ระบบคลิกล็อคข้อมูลจังหวัด (Province Pinning & Locking)**:
    - ออกแบบ State `lockedProvince` แยกจาก `hoveredProvince` ทำให้เมื่อผู้ใช้คลิกเลือกจังหวัดบนแผนที่ ข้อมูลรายละเอียดในการ์ดจะถูกล็อคไว้ ไม่ถูกล้างค่าเมื่อเลื่อนเมาส์ออกนอกแผนที่
    - แสดงแถบแบนเนอร์สีทอง `🔒 ล็อคข้อมูลจังหวัด` พร้อมปุ่มกด `ปลดล็อค ✕` ที่สามารถคลิกเพื่อยกเลิกการล็อคได้ทันที
    - ซิงก์การล็อคเข้ากับตารางจัดอันดับจังหวัด แสดงไอคอน `🔒` และไฮไลท์แถวสีทองสวยงาม
  - **Floating Rich Tooltip ดีไซน์ Glassmorphism**:
    - ยกระดับ UI จากเบราว์เซอร์ Tooltip เดิม เป็นการ์ดลอยสุดพรีเมียม (Dark Glassmorphism พร้อมขอบโปร่งแสงและเงาลึก)
    - แสดงชื่อจังหวัด, ป้ายสถิติเปอร์เซ็นต์ความสำเร็จตามโค้ดสี, Progress Bar กราฟิก, ตารางตัวเลข 4 หมวด (รับฝาก/นำจ่าย/สำเร็จ/ส่งคืน) และยอดรวม
    - ระบบพิกัดไดนามิก Smart Boundary Detection ปรับทิศทางการแสดงผลอัตโนมัติ ไม่ตกขอบหน้าจอ
  - **Visual Glow Accent**:
    - เพิ่มเส้นขอบสีทองแอนิเมชันเรืองแสง `@keyframes lockedProvinceGlow` ให้กับจังหวัดที่ถูกล็อคบนแผนที่ SVG
"""
if "4.79" not in txt_roadmap:
    txt_roadmap = txt_roadmap.strip() + "\n\n" + item_roadmap + "\n"
    open(p_roadmap, 'w', encoding='utf-8', newline='').write(txt_roadmap)
    print("ROADMAP_REPORT_FEATURE.md updated")

# 3. Update BUGFIX_REPORT.md
p_bug = 'BUGFIX_REPORT.md'
txt_bug = open(p_bug, 'r', encoding='utf-8').read()
section_bug = """
---

## 24. ปรับปรุง UX แผนที่: คลิกล็อคข้อมูลจังหวัด และอัปเกรด Tooltip ลอยอัจฉริยะ (v2026.0925.0200)

### 📌 ปัญหาและความต้องการของผู้ใช้
- ผู้ใช้งานแจ้งความต้องการ:
  1. **"ต้องการให้คลิกที่รูป(แต่ละจังหวัด)แล้วสามารถล็อคข้อมูลของแต่ละจังหวัดได้"**:
     - เดิมทีเมื่อคลิกเลือกจังหวัด หรือเลื่อนเมาส์ผ่าน ข้อมูลจะแสดงแค่ชั่วคราว เมื่อขยับเมาส์ออกจากแผนที่ (`onMouseLeave`) ข้อมูลรายละเอียดจะถูกลบทันที ทำให้ไม่สามารถดูรายละเอียดค้างไว้เพื่อจดบันทึกหรือวิเคราะห์ได้
  2. **"และเมื่อชี้ที่จังหวัดต้องการให้ tooltip มี ui ที่สวยกว่านี้ด้วย"**:
     - เดิมใช้แท็ก `<title>` ของ SVG ซึ่งเป็น Tooltip ธรรมดาของเบราว์เซอร์ แสดงผลช้า ดีเลย์ 1-2 วินาที และเป็นเพียงกล่องสี่เหลี่ยมสีเทาเรียบๆ ขาดความน่าดึงดูด

### 🔍 สาเหตุและการออกแบบแก้ปัญหา
1. **การควบคุมสถานะ (State Decoupling)**:
   - แยก State การ Hover (`hoveredProvince`) ออกจาก State การล็อค (`lockedProvince`)
   - กำหนดให้การ์ดรายละเอียดอ้างอิง `lockedProvince` เป็นลำดับแรก หากมีจังหวัดที่ถูกล็อคอยู่ ข้อมูลในการ์ดจะคงอยู่ถาวรแม้เมาส์จะออกจากแผนที่
2. **สร้าง Custom Floating Tooltip**:
   - ถอด `<title>` ออกเพื่อกำจัด Tooltip ของเบราว์เซอร์
   - สร้าง Component Tooltip ลอยแบบ HTML5/CSS3 รองรับ Glassmorphism ทันสมัย พร้อมแสดงตัวเลขสถิติครบ 4 สถานะ และ Progress Bar สีสันชัดเจน

### 🛠️ การแก้ไขที่ดำเนินการ
1. **`src/components/DashboardView.jsx`**:
   - เพิ่ม State `lockedProvince`, `hoveredProvince`, `tooltip`, `mapWrapRef`
   - เพิ่มฟังก์ชัน `handleToggleLockProvince`, `handleMouseMove`, `handleProvinceMouseEnter`, `handleProvinceMouseLeave`
   - สร้างเลเยอร์เส้นขอบเรืองแสงสำหรับจังหวัดที่ถูกล็อค (`lockedProvinceObj`)
   - เพิ่ม Rich Tooltip JSX พร้อมคำนวณตำแหน่งและทิศทางการแสดงผลอัตโนมัติ
   - เพิ่มการ์ดรายละเอียดโหมดล็อค พร้อมปุ่ม `ปลดล็อค ✕`
   - ซิงก์การคลิกล็อคไปยังตารางจัดอันดับจังหวัดด้านขวา
2. **`src/components/DashboardView.css`**:
   - เพิ่มสไตล์ `.dash-map-rich-tooltip` พร้อม Glassmorphism, Rounded 14px, Box-Shadow พรีเมียม
   - เพิ่มสไตล์ `.dash-map-prov.locked` และแอนิเมชัน `@keyframes lockedProvinceGlow`
   - เพิ่มสไตล์ `.dash-pd-lock-banner`, `.dash-pd-unlock-btn`, `.dash-table tr.locked-row`
"""
if "## 24." not in txt_bug:
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

## 99. Map Interactive Province Locking & Floating Rich Tooltip Architecture (`v2026.0925.0200`)

### 1. State Separation: Hover vs. Persistent Lock
- **The Friction**: In typical SVG maps, `selectedProvince` is tied to `onMouseEnter` / `onMouseLeave`, causing selection to disappear the instant the cursor leaves the SVG canvas.
- **The Decoupled Architecture**:
  - `hoveredProvince`: string | null (transient hover state).
  - `lockedProvince`: string | null (persistent pinned state upon clicking a province or ranking table row).
  - Priority Resolution: `activeProvince = lockedProvince || hoveredProvince`.
  - When locked, mouse leaving the SVG retains the locked province data in the detail card until the user explicitly clicks again to toggle unlock or hits the `[ปลดล็อค ✕]` button.

### 2. Floating Rich Tooltip Engine
- **Eliminate Native `<title>`**: Remove browser `<title>` tags to prevent unsightly OS native yellow/gray tooltips with annoying 2-second delays.
- **Dynamic Mouse Tracking**:
  - `onMouseMove` monitors mouse offset within `ref={mapWrapRef}`.
  - Smart Boundary Flipping: `flipX = x + 265 > rect.width`, `flipY = y + 215 > rect.height` prevents edge overflow.
  - Content: Header with location pin & success rate pill, progress bar, 4-metric count grid (รับฝาก, นำจ่าย, สำเร็จ, ส่งคืน), total volume, and contextual click hints.

### 3. Visual Prominence for Locked Provinces
- **SVG Overlay Layer**: Render a dedicated accent outline (`stroke="#f59e0b"`, `strokeWidth="3.2"`) after normal province paths to guarantee the glowing border renders on top of adjacent borders.
- **Pulsing Glow Animation**: `@keyframes lockedProvinceGlow` alternates between 2.8px and 3.4px with soft golden drop shadow.
"""
if "## 99." not in txt_skill:
    txt_skill = txt_skill.strip() + "\n" + section_skill + "\n"
    open(p_skill, 'w', encoding='utf-8', newline='').write(txt_skill)
    print("SKILL.md updated")
