require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const fsPromises = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// สร้างเวอร์ชันจาก ปี.เดือนวัน.ชั่วโมงนาที (YYYY.MMDD.HHmm)
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');
const generatedVersion = `${year}.${month}${day}.${hours}${minutes}`;

const APP_VERSION = process.env.APP_VERSION || generatedVersion;

// โหลด Credentials ตามที่ผู้ใช้ระบุ
const SHOP_ID = "18488";
const API_KEY = "V9JN25IFH5hdZYc1k8NNRVgnLYXyQLzc";
const POSTONE_URL = "https://postone.thailandpost.com/api/bc.php";

// การตั้งค่า Forward Proxy (อ่านจาก Environment Variable)
const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

// ==============================
//  MongoDB Connection (Serverless-safe)
// ==============================
// ==============================
//  Local File Logging System
// ==============================
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

const GOOGLE_barcode_WEBHOOK_URL = process.env.GOOGLE_barcode_WEBHOOK_URL;

async function saveLogToFile(logData) {
    try {
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const logFile = path.join(logDirectory, `history_${dateStr}.jsonl`);
        const logEntry = JSON.stringify({ ...logData, requestedAt: new Date().toISOString() }) + '\n';
        await fsPromises.appendFile(logFile, logEntry, 'utf8');
    } catch (err) {
        console.error('❌ File logging error:', err.message);
    }

    if (GOOGLE_barcode_WEBHOOK_URL) {
        try {
            const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
            
            let payload = [];
            if (logData.status === 'SUCCESS' && Array.isArray(logData.barcodes) && logData.barcodes.length > 0) {
                payload = logData.barcodes.map(barcode => ({
                    timestamp: timestamp,
                    type: logData.serviceType,
                    barcode: barcode,
                    user: logData.user || 'Unknown'
                }));
            } else {
                payload = [{
                    timestamp: timestamp,
                    type: logData.serviceType,
                    barcode: 'ERROR: ' + (logData.errorMessage || '-'),
                    user: logData.user || 'Unknown'
                }];
            }
            
            // Fire and forget (ไม่ให้รอนาน)
            axios.post(GOOGLE_barcode_WEBHOOK_URL, payload).catch(e => console.error('⚠️ Google Sheets error:', e.message));
        } catch (err) {
            console.error('❌ Google Sheets preparation error:', err.message);
        }
    }
}

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
        connected: true,
        readyState: 1,
        hasUri: false,
        mode: 'local_file'
    });
});

// ==============================
//  API: App Version
// ==============================
app.get('/api/version', (req, res) => {
    res.json({
        status: 'SUCCESS',
        version: APP_VERSION
    });
});

// ==============================
//  API: Check Google Sheets Connection
// ==============================
app.get('/api/check-google-sheets', (req, res) => {
    const loginOk = !!process.env.GOOGLE_LOGIN_WEBHOOK_URL;
    const historyOk = !!process.env.GOOGLE_barcode_WEBHOOK_URL;
    res.json({
        connected: loginOk && historyOk,
        loginOk,
        historyOk
    });
});

// ==============================
//  API: Check Status
// ==============================
let statusCache = null;
let statusCacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 ชั่วโมง

app.get('/api/check-status', async (req, res) => {
    const force = req.query.force === 'true';
    const now = Date.now();
    
    // ถ้าไม่บังคับเช็คใหม่ และมี Cache ที่อายุไม่เกินกำหนด
    if (!force && statusCache && (now - statusCacheTime < CACHE_DURATION)) {
        return res.json({
            status: 'SUCCESS',
            cached: true,
            data: statusCache
        });
    }

    const typesToCheck = [1, 2, 5, 8, 9, 11, 20, 21];
    const results = {};
    const credentials = `${SHOP_ID}:${API_KEY}`;
    const authHeader = 'Basic ' + Buffer.from(credentials).toString('base64');
    
    const baseAxiosConfig = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        },
        responseType: 'text'
    };

    if (PROXY_HOST && PROXY_PORT) {
        baseAxiosConfig.proxy = {
            protocol: 'http',
            host: PROXY_HOST,
            port: parseInt(PROXY_PORT, 10)
        };
        if (PROXY_USER && PROXY_PASS) {
            baseAxiosConfig.proxy.auth = {
                username: PROXY_USER,
                password: PROXY_PASS
            };
        }
    }

    for (const typ of typesToCheck) {
        try {
            const config = { ...baseAxiosConfig, params: { typ: typ, cnt: 1 } };
            const response = await axios.get(POSTONE_URL, config);
            const cleanedText = removeUtf8Bom(response.data);
            const data = JSON.parse(cleanedText);
            
            if (data.STATUS === 'SUCCESS') {
                results[typ] = 'SUCCESS';
            } else {
                results[typ] = 'ERROR';
            }
        } catch (error) {
            results[typ] = 'ERROR';
        }
    }
    
    // บันทึก Cache
    statusCache = results;
    statusCacheTime = now;
    
    res.json({
        status: 'SUCCESS',
        cached: false,
        data: results
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

        if (parseInt(cnt, 10) > 1000) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'จำนวนบาร์โค้ดที่ดึงได้สูงสุดต้องไม่เกิน 1000 รายการ'
            });
        }

        // เข้ารหัส Basic Auth
        const credentials = `${SHOP_ID}:${API_KEY}`;
        const authHeader = 'Basic ' + Buffer.from(credentials).toString('base64');

        // กำหนด Configuration สำหรับ Axios
        const axiosConfig = {
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
        };

        // หากมีการตั้งค่า Proxy ให้เพิ่มเข้าไปใน config
        if (PROXY_HOST && PROXY_PORT) {
            axiosConfig.proxy = {
                protocol: 'http',
                host: PROXY_HOST,
                port: parseInt(PROXY_PORT, 10)
            };
            if (PROXY_USER && PROXY_PASS) {
                axiosConfig.proxy.auth = {
                    username: PROXY_USER,
                    password: PROXY_PASS
                };
            }
        }

        // เรียก API ของไปรษณีย์ไทย
        const response = await axios.get(POSTONE_URL, axiosConfig);

        // ลบ BOM และแปลงเป็น Object
        const cleanedText = removeUtf8Bom(response.data);
        let data;
        try {
            data = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Original text:", cleanedText);

            // บันทึก error log ลงไฟล์
            await saveLogToFile({
                serviceType: typ,
                requestedCount: parseInt(cnt, 10),
                status: 'ERROR',
                errorMessage: 'JSON Parse Failed: ' + cleanedText.substring(0, 200)
            });

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

            // บันทึก success log ลงไฟล์
            await saveLogToFile({
                user: req.query.user || 'Unknown',
                serviceType: typ,
                requestedCount: parseInt(cnt, 10),
                status: 'SUCCESS',
                prefix: prefix,
                begin: begin,
                end: end,
                barcodes: barcodes.map(b => b.barcode)
            });

            return res.json({
                status: 'SUCCESS',
                prefix: prefix,
                begin: begin,
                end: end,
                count: barcodes.length,
                barcodes: barcodes
            });
        } else {
            // บันทึก error log ลงไฟล์
            await saveLogToFile({
                user: req.query.user || 'Unknown',
                serviceType: typ,
                requestedCount: parseInt(cnt, 10),
                status: 'ERROR',
                errorMessage: `API Response: ${data.STATUS}`
            });

            return res.status(400).json({
                status: 'ERROR',
                message: `API Response: ${data.STATUS}`
            });
        }

    } catch (error) {
        console.error("API Error Details:", error.message);

        // บันทึก error log ลงไฟล์
        await saveLogToFile({
            user: req.query.user || 'Unknown',
            serviceType: req.query.typ,
            requestedCount: parseInt(req.query.cnt, 10),
            status: 'ERROR',
            errorMessage: error.message
        });

        return res.status(500).json({
            status: 'ERROR',
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลจาก API ของไปรษณีย์ไทย: ' + error.message
        });
    }
});

// ==============================
//  API: Get Logs from DB
// ==============================
app.post('/api/login', async (req, res) => {
    try {
        const { user, pass } = req.body;
        const GOOGLE_LOGIN_WEBHOOK_URL = process.env.GOOGLE_LOGIN_WEBHOOK_URL;
        
        if (!GOOGLE_LOGIN_WEBHOOK_URL) {
            return res.status(400).json({ status: 'ERROR', message: 'กรุณาตั้งค่า GOOGLE_LOGIN_WEBHOOK_URL ในไฟล์ .env' });
        }
        
        const response = await axios.post(GOOGLE_LOGIN_WEBHOOK_URL, {
            action: 'login',
            user: user,
            pass: pass
        });
        
        if (response.data && response.data.status === 'SUCCESS') {
            return res.json({ status: 'SUCCESS' });
        } else {
            return res.status(401).json({ status: 'ERROR', message: response.data.message || 'รหัสผ่านไม่ถูกต้อง' });
        }
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ status: 'ERROR', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบตรวจสอบรหัสผ่าน' });
    }
});

// ==============================
//  API: Get Logs from DB (Original)
// ==============================
app.get('/api/logs', async (req, res) => {
    try {
        const dateStr = new Date().toISOString().split('T')[0];
        const logFile = path.join(logDirectory, `history_${dateStr}.jsonl`);
        
        if (!fs.existsSync(logFile)) {
            return res.json({ status: 'SUCCESS', logs: [] });
        }
        
        const data = await fsPromises.readFile(logFile, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        const logs = lines.map(line => JSON.parse(line)).reverse().slice(0, 50); // Get last 50
        
        res.json({ status: 'SUCCESS', logs });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', message: err.message });
    }
});

// เริ่มต้น Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT} (v${APP_VERSION})`);
});
