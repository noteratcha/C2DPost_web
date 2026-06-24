const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// โหลด Credentials ตามที่ผู้ใช้ระบุ
const SHOP_ID = "18488";
const API_KEY = "V9JN25IFH5hdZYc1k8NNRVgnLYXyQLzc";
const POSTONE_URL = "https://postone.thailandpost.com/api/bc.php";

// ==============================
//  MongoDB Connection
// ==============================
const MONGODB_URI = process.env.MONGODB_URI;

let isDbConnected = false;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
    .then(() => {
        console.log('✅ MongoDB Atlas connected successfully!');
        isDbConnected = true;
    })
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('connected', () => { isDbConnected = true; });
    mongoose.connection.on('disconnected', () => { isDbConnected = false; });
} else {
    console.warn('⚠️ MONGODB_URI not set. Database logging is disabled.');
}

// ==============================
//  MongoDB Schema & Model
// ==============================
const barcodeLogSchema = new mongoose.Schema({
    requestedAt: { type: Date, default: Date.now },
    serviceType: { type: String }, // typ parameter
    requestedCount: { type: Number }, // cnt parameter
    status: { type: String }, // SUCCESS / ERROR
    prefix: { type: String },
    begin: { type: Number },
    end: { type: Number },
    barcodes: [{ type: String }], // เก็บเฉพาะ string ของบาร์โค้ด
    errorMessage: { type: String }
});

const BarcodeLog = mongoose.model('BarcodeLog', barcodeLogSchema);

// ==============================
//  Middleware
// ==============================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ลบ UTF-8 BOM ออกจากข้อความ
 */
function removeUtf8Bom(text) {
    if (text.charCodeAt(0) === 0xFEFF) {
        return text.substring(1);
    }
    return text;
}

/**
 * คำนวณ Check Digit (Modulus 11) ตามสูตรของไปรษณีย์ไทย
 */
function calculateCheckDigit(numStr) {
    const numDigits = numStr.split('').map(Number);
    const weights = [8, 6, 4, 2, 3, 5, 9, 7];

    let weightedSum = 0;
    for (let i = 0; i < 8; i++) {
        weightedSum += numDigits[i] * weights[i];
    }

    const remainder = weightedSum % 11;
    let checkDigit = 11 - remainder;

    if (checkDigit === 10) {
        checkDigit = 0;
    } else if (checkDigit === 11) {
        checkDigit = 5;
    }

    return checkDigit;
}

// ==============================
//  API: Check DB Status
// ==============================
app.get('/api/db-status', (req, res) => {
    res.json({
        connected: isDbConnected,
        hasUri: !!MONGODB_URI
    });
});

// ==============================
//  API: Get Barcodes
// ==============================
/**
 * API สำหรับดึงบาร์โค้ด
 * Query parameters:
 *  - typ: ประเภทบริการ (เช่น 2 = ลงทะเบียน, 1 = EMS, 11 = eCo-Post)
 *  - cnt: จำนวนเลขบาร์โค้ดที่ต้องการขอ (เช่น 100)
 */
app.get('/api/get-barcodes', async (req, res) => {
    try {
        const { typ, cnt } = req.query;

        if (!typ || !cnt) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'กรุณาระบุพารามิเตอร์ typ และ cnt ให้ครบถ้วน'
            });
        }

        if (parseInt(cnt, 10) > 2) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'จำนวนบาร์โค้ดที่ดึงได้สูงสุดต้องไม่เกิน 2 รายการ'
            });
        }

        // เข้ารหัส Basic Auth
        const credentials = `${SHOP_ID}:${API_KEY}`;
        const authHeader = 'Basic ' + Buffer.from(credentials).toString('base64');

        // เรียก API ของไปรษณีย์ไทย
        const response = await axios.get(POSTONE_URL, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            },
            params: {
                typ: parseInt(typ, 10),
                cnt: parseInt(cnt, 10)
            },
            responseType: 'text' // รับเป็น text เพื่อเคลียร์ BOM ก่อนแปลง JSON
        });

        // ลบ BOM และแปลงเป็น Object
        const cleanedText = removeUtf8Bom(response.data);
        let data;
        try {
            data = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Original text:", cleanedText);

            // บันทึก error log ลง MongoDB
            if (isDbConnected) {
                await BarcodeLog.create({
                    serviceType: typ,
                    requestedCount: parseInt(cnt, 10),
                    status: 'ERROR',
                    errorMessage: 'JSON Parse Failed: ' + cleanedText.substring(0, 200)
                }).catch(e => console.error('DB log error:', e));
            }

            return res.status(500).json({
                status: 'ERROR',
                message: 'ไม่สามารถแปลงผลลัพธ์จาก API ของไปรษณีย์ไทยได้ (JSON Parsing Failed)'
            });
        }

        // ตรวจสอบความสำเร็จจาก API
        if (data.STATUS === 'SUCCESS') {
            const prefix = data.PRE || '';
            const begin = parseInt(data.BEGIN, 10) || 0;
            const end = parseInt(data.END, 10) || 0;

            if (begin > end) {
                return res.status(500).json({
                    status: 'ERROR',
                    message: 'ช่วงหมายเลขเริ่มต้นมีค่ามากกว่าช่วงหมายเลขสุดท้าย'
                });
            }

            const barcodes = [];
            for (let num = begin; num <= end; num++) {
                const numStr = String(num).padStart(8, '0');
                const checkDigit = calculateCheckDigit(numStr);
                const barcode = `${prefix.substring(0, 2)}${numStr}${checkDigit}${prefix.substring(2, 4)}`;
                barcodes.push({
                    serial: numStr,
                    checkDigit: checkDigit,
                    barcode: barcode
                });
            }

            // บันทึก success log ลง MongoDB
            if (isDbConnected) {
                await BarcodeLog.create({
                    serviceType: typ,
                    requestedCount: parseInt(cnt, 10),
                    status: 'SUCCESS',
                    prefix: prefix,
                    begin: begin,
                    end: end,
                    barcodes: barcodes.map(b => b.barcode)
                }).catch(e => console.error('DB log error:', e));
            }

            return res.json({
                status: 'SUCCESS',
                prefix: prefix,
                begin: begin,
                end: end,
                count: barcodes.length,
                barcodes: barcodes
            });
        } else {
            // บันทึก error log ลง MongoDB
            if (isDbConnected) {
                await BarcodeLog.create({
                    serviceType: typ,
                    requestedCount: parseInt(cnt, 10),
                    status: 'ERROR',
                    errorMessage: `API Response: ${data.STATUS}`
                }).catch(e => console.error('DB log error:', e));
            }

            return res.status(400).json({
                status: 'ERROR',
                message: `API Response: ${data.STATUS}`
            });
        }

    } catch (error) {
        console.error("API Error Details:", error.message);

        // บันทึก error log ลง MongoDB
        if (isDbConnected) {
            await BarcodeLog.create({
                serviceType: req.query.typ,
                requestedCount: parseInt(req.query.cnt, 10),
                status: 'ERROR',
                errorMessage: error.message
            }).catch(e => console.error('DB log error:', e));
        }

        return res.status(500).json({
            status: 'ERROR',
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลจาก API ของไปรษณีย์ไทย: ' + error.message
        });
    }
});

// ==============================
//  API: Get Logs from DB
// ==============================
app.get('/api/logs', async (req, res) => {
    if (!isDbConnected) {
        return res.status(503).json({
            status: 'ERROR',
            message: 'ไม่ได้เชื่อมต่อฐานข้อมูล'
        });
    }

    try {
        const logs = await BarcodeLog.find()
            .sort({ requestedAt: -1 })
            .limit(50);
        res.json({ status: 'SUCCESS', logs });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', message: err.message });
    }
});

// เริ่มต้น Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
