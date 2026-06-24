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
*   **IP Blocking (403 Forbidden):** API ของไปรษณีย์ไทยจะบล็อกทราฟฟิกจากผู้ให้บริการ Cloud ต่างประเทศ (เช่น Vercel, AWS, Google Cloud)
*   **การแก้ไข:** ต้องรันแอปพลิเคชันบน **โฮสติ้งที่ตั้งอยู่ในประเทศไทย** (เช่น Shared Hosting ไทย หรือ VPS ไทย) หรือรันผ่านเครื่องภายในหน่วยงานเท่านั้น
