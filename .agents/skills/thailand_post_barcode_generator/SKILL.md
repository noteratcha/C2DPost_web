---
name: thailand-post-barcode-generator
description: Handles Thailand Post (Post One) barcode generation, Modulus 11 check digit calculation, and network IP constraints.
---

# Thailand Post Barcode Generator (Post One API)

ทักษะนี้สำหรับการต่อ API ของไปรษณีย์ไทยเพื่อสร้างบาร์โค้ด 13 หลัก

## 1. API Specifications
*   **Endpoint:** `https://postone.thailandpost.com/api/bc.php`
*   **Method:** `GET`
*   **Authentication:** Basic Auth ในรูปแบบ Base64 ของ `SHOP_ID:API_KEY`
*   **Parameters:**
    *   `typ`: ประเภทบริการ (1 = EMS, 2 = ลงทะเบียน R)
    *   `cnt`: จำนวนเลขที่ต้องการ (จำกัดการทดสอบสูงสุดครั้งละ 2)

## 2. Logic & Algorithms
*   **UTF-8 BOM Removal:** ก่อน parse JSON ให้ลบ `\ufeff` หรือ BOM เสมอ
*   **Check Digit (Modulus 11):**
    *   คูณหลัก Serial Number 8 หลัก ด้วยน้ำหนักถ่วง `[8, 6, 4, 2, 3, 5, 9, 7]`
    *   `remainder = sum % 11`
    *   `check_digit = 11 - remainder`
    *   **เงื่อนไขพิเศษ:** หากเป็น 10 ให้แทนด้วย 0, หากเป็น 11 ให้แทนด้วย 5
*   **การต่อรหัส 13 หลัก:** `[PRE 2 ตัวแรก][Serial 8 หลัก][Check Digit][PRE 2 ตัวท้าย]` (เช่น EATH -> EAxxxxxxXTH)

## 3. Deployment Constraints (ข้อจำกัดสำคัญ)
*   **IP Blocking (403 Forbidden):** API ของไปรษณีย์ไทยจะบล็อกทราฟฟิกจากผู้ให้บริการ Cloud ต่างประเทศ (เช่น Vercel, Fly.io, AWS, Google Cloud) การนำไปรันบนระบบเหล่านี้โดยตรงจะถูกปฏิเสธการเชื่อมต่อเสมอ
*   **การแก้ไข (ทางเลือกที่ 1):** นำแอปพลิเคชันไปรันบน **โฮสติ้งที่ตั้งอยู่ในประเทศไทย** (เช่น Shared Hosting ไทย, VPS ไทย) หรือรันบนเซิร์ฟเวอร์ภายในองค์กร หรือใช้ Ngrok/Cloudflare Tunnels
*   **การแก้ไข (ทางเลือกที่ 2):** หากจำเป็นต้องใช้ Cloud ต่างประเทศ ต้องเพิ่มระบบ **Forward Proxy** เข้าไปใน Axios config และรันผ่าน Proxy Server ที่ตั้งอยู่ในประเทศไทย (รองรับค่าผ่าน Environment Variables: `PROXY_HOST`, `PROXY_PORT`)

## 4. Best Practices
*   **Dynamic Versioning:** ควรมีการสร้างเวอร์ชันโดยอัตโนมัติตอน Start Server (เช่นรูปแบบ `YYYY.MMDD.HHmm`) เพื่อให้ตรวจสอบผ่าน API `/api/version` ได้ง่ายขึ้นว่าเซิร์ฟเวอร์รันด้วยโค้ดชุดล่าสุดหรือไม่
