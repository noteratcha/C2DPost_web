# รายละเอียด API Barcode Service (Post One Webservice Ver 1.0.2)

เอกสารนี้ระบุรายละเอียดสำหรับการเรียกใช้งาน API เพื่อขอช่วงหมายเลข Tracking Barcode สำหรับลูกค้าที่พิมพ์บาร์โค้ดใช้งานเอง

---

## 1. ข้อมูลการเชื่อมต่อ API (Endpoint & Method)

*   **HTTP Method:** `GET`
*   **Request URL:** `https://postone.thailandpost.com/api/bc.php?typ=1&cnt=100`

### Headers ที่ต้องการ (Header)
| Field | Type | Description |
| :--- | :--- | :--- |
| **Content-Type** | String | `application/json` (ค่าเริ่มต้น: `application/json`) |
| **Authorization** | String | `Basic Authentication [Username/Password]` |

---

## 2. พารามิเตอร์ที่ส่งไปกับ URL (Parameters)

| Field | Type | Description |
| :--- | :--- | :--- |
| **typ** | Number | **ประเภทบริการ (Service Type):**<br>• `1` = ไปรษณีย์ด่วนพิเศษในประเทศ (EMS)<br>• `2` = ไปรษณีย์ลงทะเบียนในประเทศ (R)<br>• `5` = พัสดุไปรษณีย์ในประเทศ (P)<br>• `8` = ไปรษณีย์รับรองในประเทศ (C)<br>• `9` = ไปรษณีย์รับประกันในประเทศ (V)<br>• `11` = eCo-Post (O)<br>• `20` = e-Parcel COD<br>• `21` = e-Parcel NON COD<br>• `99` = สำหรับทดสอบระบบเท่านั้น (For Test API ONLY) |
| **cnt** | Number | จำนวนเลขที่ Tracking ที่ต้องการร้องขอ |

---

## 3. ผลลัพธ์ที่ตอบกลับจากระบบ (Response)

เมื่อระบบประมวลผลสำเร็จจะส่ง HTTP Status `200` กลับมาพร้อมข้อมูล JSON

### รายละเอียดข้อมูลใน Response
| Field | Type | Description |
| :--- | :--- | :--- |
| **STATUS** | String | **สถานะการร้องขอเลข Tracking:**<br>• `"SUCCESS"` = เสร็จสมบูรณ์<br>• `"Error"` = เครื่องแม่ข่ายขัดข้อง<br>• `"Empty"` = เลข Tracking หมด<br>• `"Limit"` = ร้องขอเกินจำนวนที่กำหนด<br>• `"Access Denied"` = ปฏิเสธการเข้าถึง |
| **PRE** | String | ตัวอักษรกำกับหมวดเลขที่ Tracking (เช่น `"EATH"` สำหรับ EMS) |
| **BEGIN** | Number | หมายเลข Serial ลำดับเริ่มต้น (เช่น `10000000`) |
| **END** | Number | หมายเลข Serial ลำดับสุดท้าย (เช่น `10000009`) |

### ตัวอย่าง Response รูปแบบ JSON
```json
{ 
  "STATUS": "SUCCESS", 
  "PRE": "EATH", 
  "BEGIN": 10000000, 
  "END": 10000009 
}
```

---

## 4. ข้อควรระวังในการรับข้อมูล (UTF-8 BOM)
ในบางกรณีอาจจะไม่สามารถ Decode ข้อมูล JSON ที่ตอบกลับมาได้เนื่องจากมีอักขระพิเศษ **UTF-8 BOM (Byte Order Mark)** นำหน้าข้อมูล JSON 

สำหรับภาษา PHP สามารถลบอักขระ BOM ออกได้โดยใช้ฟังก์ชันตัวอย่างดังนี้:

```php
function remove_utf8_bom($text) 
{ 
    $bom = pack('H*', 'EFBBBF'); 
    $text = preg_replace("/^$bom/", '', $text); 
    return $text; 
}
```
