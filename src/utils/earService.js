/**
 * earService.js — Client-Side e-AR Fetching & Parsing Pipeline
 * 
 * Bypasses foreign server geoblocking (Akamai / Thai Post edge) by querying 
 * https://e-ar.thailandpost.com/ear-api/print/e-ar directly from the user's browser in Thailand (CORS enabled).
 * Then passes the received PDF bytes to our API backend to extract signature thumbnail and metadata.
 */

import { API_BASE } from './api';
import { fetchEarPdfFromExtension, checkEarCapability } from './extensionBridge';

const earCache = new Map();

/**
 * Fetch official e-AR PDF directly from Thailand Post, then parse signature & metadata.
 * 
 * @param {string} barcode - Parcel barcode (e.g. "BC414111081TH")
 * @returns {Promise<{has_ear: boolean, blob_url: string, relationship: string, delivery_officer: string, status: string, signature_image: string}>}
 */
export async function fetchEarDetailsClient(barcode, force = false) {
  const cleanBarcode = (barcode || '').trim().toUpperCase();
  if (!cleanBarcode) return null;

  if (!force && earCache.has(cleanBarcode)) {
    const cached = earCache.get(cleanBarcode);
    if (cached && (cached.pdfBlob || cached.pdfBase64)) {
      return cached;
    }
  }

  try {
    let pdfBlob = null;
    let pdfBase64 = null;

    // 1. Primary Strategy: Request PDF via C2DPost Helper Extension (Domestic Thai IP + No CORS restrictions)
    try {
      const extRes = await fetchEarPdfFromExtension(cleanBarcode);
      if (extRes && extRes.success && extRes.pdfBase64) {
        pdfBase64 = extRes.pdfBase64;
        const binaryString = atob(extRes.pdfBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfBlob = new Blob([bytes], { type: 'application/pdf' });
      }
    } catch (extErr) {
      console.warn('[earService] Extension fetch attempt notice:', extErr);
    }

    // 2. Secondary Strategy: Direct browser fetch fallback
    if (!pdfBlob) {
      try {
        const res = await fetch('https://e-ar.thailandpost.com/ear-api/print/e-ar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([cleanBarcode])
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await res.blob();
            if (blob.size >= 500) {
              pdfBlob = blob;
              pdfBase64 = await blobToBase64(blob);
            }
          }
        }
      } catch (directErr) {
        // Direct fetch failed (e.g. CORS preflight without extension)
      }
    }

    if (!pdfBlob) {
      // Check if extension is available but not responding
      const extInfo = await checkEarCapability(500).catch(() => ({ supported: false, installed: false, version: '' }));
      if (!extInfo.installed) {
        throw new Error(
          '❌ ไม่พบส่วนขยาย C2DPost Helper\n\n' +
          '📥 วิธีติดตั้ง:\n' +
          '1. ดาวน์โหลดไฟล์ ZIP: /C2DPost_Helper_v1.4.0_WebStore.zip\n' +
          '2. แตกไฟล์ (Extract) ไว้ในโฟลเดอร์\n' +
          '3. เปิด chrome://extensions → เปิด "โหมดนักพัฒนา" (Developer mode)\n' +
          '4. กด "โหลดส่วนขยายที่ไม่ได้บีบอัด" (Load unpacked) → เลือกโฟลเดอร์ที่แตกไฟล์\n' +
          '5. Refresh (F5) หน้านี้\n\n' +
          '🔗 หรือติดตั้งจาก Chrome Web Store (เมื่ออนุมัติแล้ว): https://chromewebstore.google.com/detail/cdkmibacceaacdiopcekkmfifaocapgk'
        );
      }
      if (!extInfo.supported) {
        throw new Error(
          `❌ ส่วนขยาย C2DPost Helper เวอร์ชันเก่า (v${extInfo.version || 'ไม่ทราบ'})\n` +
          `ต้องการ v${extInfo.latestVersion || '1.4.0'} ขึ้นไป\n\n` +
          `📥 วิธีอัปเดต:\n` +
          `1. ดาวน์โหลดเวอร์ชันล่าสุด: ${extInfo.updateUrl || '/C2DPost_Helper_v1.4.0_WebStore.zip'}\n` +
          `2. แตกไฟล์ แล้วเข้า chrome://extensions\n` +
          `3. กด "รีเฟรช" (🔄) ที่ส่วนขยาย C2DPost Helper\n` +
          `4. Refresh (F5) หน้านี้\n\n` +
          `🔗 Chrome Web Store: ${extInfo.storeUrl || 'https://chromewebstore.google.com/detail/cdkmibacceaacdiopcekkmfifaocapgk'}`
        );
      }
      throw new Error(
        '❌ ไม่สามารถดึง PDF e-AR จากระบบไปรษณีย์ไทยได้\n\n' +
        '🔧 วิธีแก้ไข:\n' +
        '1. ตรวจสอบว่าส่วนขยาย C2DPost Helper เปิดใช้งานอยู่ (v1.3.0+)\n' +
        '2. หากเพิ่งติดตั้ง/อัปเดต ให้กด Refresh (F5) หน้านี้\n' +
        '3. ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต\n' +
        '4. หากยังไม่ได้ ให้ลองปิด/เปิด Extension ใน chrome://extensions แล้ว Refresh อีกครั้ง'
      );
    }

    const blobUrl = URL.createObjectURL(pdfBlob);

    // 2. Send PDF bytes to backend parser to extract signature thumbnail and text
    let parsedData = {
      relationship: '',
      delivery_officer: '',
      status: '',
      signature_image: ''
    };

    try {
      const parseRes = await fetch(`${API_BASE}/reports/parse-ear-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf'
        },
        body: pdfBlob
      });

      if (parseRes.ok) {
        const json = await parseRes.json();
        if (json.success && json.data) {
          parsedData = json.data;
        }
      }
    } catch (parseErr) {
      console.warn('Backend e-AR parsing notice:', parseErr);
    }

    const finalResult = {
      has_ear: true,
      barcode: cleanBarcode,
      pdfBlob: pdfBlob,
      pdfBase64: pdfBase64,
      blob_url: blobUrl,
      relationship: parsedData.relationship || '',
      delivery_officer: parsedData.delivery_officer || '',
      status: parsedData.status || '',
      signature_image: parsedData.signature_image || ''
    };

    earCache.set(cleanBarcode, finalResult);
    return finalResult;
  } catch (err) {
    console.warn(`e-AR client fetch error for ${cleanBarcode}:`, err);
    return null;
  }
}

/**
 * Converts a Blob into raw Base64 string (without Data URL prefix)
 */
function blobToBase64(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result ? reader.result.split(',')[1] : null;
      resolve(base64data);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Opens official e-AR PDF (Page 1) with complete tracking history and delivery evidence (Page 2).
 */
export async function openEarWithTrackingPdf({
  barcode,
  events = [],
  matchedRecord = null,
  clientEar = null,
  trackData = null,
  downloadedAt = ''
}) {
  const cleanBarcode = String(barcode || '').trim().toUpperCase();
  if (!cleanBarcode) return;

  // 1. Get clientEar if not provided or missing blob/base64
  let earObj = clientEar;
  if (!earObj || (!earObj.pdfBlob && !earObj.pdfBase64 && !earObj.blob_url)) {
    try {
      const fetched = await fetchEarDetailsClient(cleanBarcode);
      if (fetched) earObj = fetched;
    } catch (e) {
      console.warn('e-AR fetch notice:', e);
    }
  }

  // 2. Format downloaded_at Thai timestamp string
  let dlStr = downloadedAt;
  if (!dlStr) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yearBe = now.getFullYear() + 543;
    const time = now.toTimeString().split(' ')[0];
    dlStr = `${day}/${month}/${yearBe} ${time} น.`;
  }

  // 3. Resolve authentic client_pdf_base64 through multiple priority channels
  let clientPdfBase64 = earObj?.pdfBase64 || null;

  if (!clientPdfBase64 && earObj?.pdfBlob) {
    try {
      clientPdfBase64 = await blobToBase64(earObj.pdfBlob);
    } catch (bErr) {
      console.warn('blobToBase64 notice:', bErr);
    }
  }

  if (!clientPdfBase64 && earObj?.blob_url) {
    try {
      const resp = await fetch(earObj.blob_url);
      if (resp.ok) {
        const b = await resp.blob();
        clientPdfBase64 = await blobToBase64(b);
      }
    } catch (uErr) {
      console.warn('blob_url fetch notice:', uErr);
    }
  }

  // Priority 4: Direct fetch from Chrome extension if still missing
  if (!clientPdfBase64) {
    try {
      const extRes = await fetchEarPdfFromExtension(cleanBarcode);
      if (extRes && extRes.success && extRes.pdfBase64) {
        clientPdfBase64 = extRes.pdfBase64;
      }
    } catch (extErr) {
      console.warn('Direct extension fetch in openEar notice:', extErr);
    }
  }

  // Priority 5: Force fetch through fetchEarDetailsClient
  if (!clientPdfBase64) {
    try {
      const fresh = await fetchEarDetailsClient(cleanBarcode, true);
      if (fresh?.pdfBase64) {
        clientPdfBase64 = fresh.pdfBase64;
      } else if (fresh?.pdfBlob) {
        clientPdfBase64 = await blobToBase64(fresh.pdfBlob);
      }
    } catch (frErr) {
      console.warn('Force fetchEarDetailsClient notice:', frErr);
    }
  }

  // Safeguard: If authentic e-AR PDF could not be obtained from browser/extension,
  // DO NOT send empty PDF to server (which would generate a broken placeholder or fail).
  if (!clientPdfBase64) {
    alert(
      '⚠️ ไม่สามารถเปิดใบตอบรับ e-AR ฉบับจริงได้ในขณะนี้\n\n' +
      'ระบบไม่สามารถดึงไฟล์ PDF ใบตอบรับจากระบบไปรษณีย์ไทยได้\n\n' +
      'กรุณาตรวจสอบว่า:\n' +
      '1. มีการติดตั้งและเปิดใช้งานส่วนขยาย "C2DPost Helper" ในเบราว์เซอร์ Chrome แล้ว\n' +
      '2. หากเพิ่งติดตั้งหรือเปิดใช้งาน ให้กดปุ่ม Refresh (F5) หน้านี้อีกครั้ง\n' +
      '3. ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
    );
    return;
  }

  const payload = {
    barcode: cleanBarcode,
    client_pdf_base64: clientPdfBase64,
    receiver_name: matchedRecord?.name || matchedRecord?.receiver_name || matchedRecord?.receiver || '',
    inv_no: matchedRecord?.invNo || matchedRecord?.inv_no || '',
    relationship: earObj?.relationship || trackData?.relationship || '',
    delivery_officer: earObj?.delivery_officer || trackData?.delivery_officer || '',
    signature_image: earObj?.signature_image || '',
    latest_datetime: trackData?.latest_datetime || (events.length > 0 ? events[events.length - 1]?.datetime : ''),
    latest_location: trackData?.latest_location || (events.length > 0 ? events[events.length - 1]?.location : ''),
    events: events,
    downloaded_at: dlStr
  };

  try {
    const response = await fetch(`${API_BASE}/reports/ear-with-tracking-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const fileUrl = URL.createObjectURL(blob);
    window.open(fileUrl, '_blank');
  } catch (err) {
    console.warn('Error creating 2-page e-AR PDF, opening authentic 1-page e-AR directly:', err);
    if (earObj?.blob_url) {
      window.open(earObj.blob_url, '_blank');
    } else if (clientPdfBase64) {
      try {
        const binStr = atob(clientPdfBase64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const singleBlob = new Blob([bytes], { type: 'application/pdf' });
        window.open(URL.createObjectURL(singleBlob), '_blank');
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเปิดไฟล์ใบตอบรับ e-AR');
      }
    } else {
      alert(`ไม่สามารถเปิดไฟล์ใบตอบรับ e-AR ได้: ${err.message || 'เกิดข้อผิดพลาด'}`);
    }
  }
}

/**
 * Downloads e-AR receipts in batch for delivered items.
 * Supports "pdf" (merged multi-page document) or "zip" (archive of individual PDFs).
 * 
 * @param {Object} options
 * @param {Array} options.records - Array of items with barcode, receiver_name/receiver, inv_no, etc.
 * @param {string} options.format - "pdf" | "zip"
 * @param {Function} options.onProgress - Optional callback(current, total, currentBarcode)
 * @returns {Promise<{success: boolean, count: number, filename?: string, error?: string}>}
 */
export async function downloadBatchEar({ records, format = 'pdf', onProgress }) {
  if (!records || records.length === 0) {
    throw new Error('ไม่พบรายการพัสดุสำหรับดาวน์โหลด e-AR');
  }

  // 0. Pre-flight check: Non-blocking capability check
  // Strategy 1 (Extension bridge) and Strategy 2 (Direct browser fetch) will both be attempted.
  // Only if 0 documents could be retrieved AND the extension is missing/old, will we prompt for the extension.
  const cap = await checkEarCapability(500).catch(() => ({ supported: false, installed: false }));

  // 1. Filter and clean barcodes
  const validItems = [];
  const seenBarcodes = new Set();
  for (const r of records) {
    const bcode = String(r.barcode || r.BARCODE_NO || r.item_barcode || '').trim().toUpperCase();
    if (bcode && !seenBarcodes.has(bcode)) {
      seenBarcodes.add(bcode);
      validItems.push({
        barcode: bcode,
        receiver: r.receiver_name || r.receiver || r.RECEIVER || r.FULL_NAME || '',
        inv_no: r.inv_no || r.INV_NO || r.item_no || ''
      });
    }
  }

  if (validItems.length === 0) {
    throw new Error('ไม่พบบาร์โค้ดที่ถูกต้องสำหรับดาวน์โหลด e-AR');
  }

  const total = validItems.length;
  const clientBlobs = [];
  let completed = 0;

  // Helper to convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result ? reader.result.split(',')[1] : null;
        resolve(base64data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  };

  // Retry helper with exponential backoff
  const fetchWithRetry = async (fn, maxRetries = 2, baseDelay = 800) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt === maxRetries) throw err;
        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 500, 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  };

  // Helper to fetch individual e-AR PDF (extension first, then direct fetch)
  const fetchSinglePdfBlob = async (item) => {
    const bcode = item.barcode;
    try {
      // Strategy 1: Extension Bridge (Domestic Thai IP) - with retry
      let extRes = await fetchWithRetry(async () => {
        const res = await fetchEarPdfFromExtension(bcode);
        if (!res || !res.success || !res.pdfBase64) {
          throw new Error('Extension fetch failed');
        }
        return res;
      }, 2, 800).catch(() => null);

      if (extRes && extRes.success && extRes.pdfBase64) {
        return {
          barcode: bcode,
          receiver: item.receiver,
          inv_no: item.inv_no,
          base64: extRes.pdfBase64
        };
      }

      // Strategy 2: Direct browser fetch (with retry)
      let directRes = await fetchWithRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        const res = await fetch('https://e-ar.thailandpost.com/ear-api/print/e-ar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([bcode]),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/pdf')) {
          throw new Error('Not a PDF response');
        }
        
        const blob = await res.blob();
        if (blob.size < 500) {
          throw new Error('PDF too small');
        }
        
        const b64 = await blobToBase64(blob);
        if (!b64) throw new Error('Base64 conversion failed');
        
        return { barcode: bcode, receiver: item.receiver, inv_no: item.inv_no, base64: b64 };
      }, 2, 1000).catch(() => null);

      if (directRes) {
        return directRes;
      }
    } catch (err) {
      console.warn(`[downloadBatchEar] Failed fetching ${bcode}:`, err);
    }

    // Return item with no base64, backend will attempt fallback
    return {
      barcode: bcode,
      receiver: item.receiver,
      inv_no: item.inv_no,
      base64: null
    };
  };

  // 2. Fetch in concurrency batches (adaptive concurrency)
  // Start with 4, reduce if many items, increase if few
  const BASE_CONCURRENCY = 4;
  const CONCURRENCY = Math.min(BASE_CONCURRENCY, Math.max(2, Math.floor(validItems.length / 3)));
  for (let i = 0; i < validItems.length; i += CONCURRENCY) {
    const chunk = validItems.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        const res = await fetchSinglePdfBlob(item);
        completed++;
        if (onProgress) {
          onProgress(completed, total, item.barcode);
        }
        return res;
      })
    );
    clientBlobs.push(...chunkResults);
    
    // Small delay between chunks to avoid rate limiting
    if (i + CONCURRENCY < validItems.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // 3. Format Thai timestamp for page footer
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const yBe = now.getFullYear() + 543;
  const timeStr = now.toTimeString().split(' ')[0]; // "HH:MM:SS"
  const downloadedAtStr = `${d}/${m}/${yBe} ${timeStr} น.`;

  // Track results for partial success reporting
  const successfulBlobs = clientBlobs.filter((b) => b && b.base64);
  const failedItems = clientBlobs.filter((b) => !b || !b.base64).map(b => b?.barcode).filter(Boolean);
  
  // If no successful blobs, throw appropriate error
  if (successfulBlobs.length === 0) {
    if (!cap.supported) {
      const error = new Error(
        cap.installed
          ? `ต้องการส่วนขยาย C2DPost Helper เวอร์ชัน 1.3.0 ขึ้นไป (ปัจจุบันในเบราว์เซอร์เป็น v${cap.version || '1.2.0'}) กรุณารีเฟรชส่วนขยายในแท็บ Extensions`
          : 'จำเป็นต้องเปิดใช้งานส่วนขยาย C2DPost Helper เพื่อดาวน์โหลดใบตอบรับ e-AR จากไปรษณีย์ไทย'
      );
      error.code = 'EXTENSION_EAR_REQUIRED';
      error.details = cap;
      throw error;
    }
    throw new Error('ไม่พบข้อมูลเอกสาร e-AR จากไปรษณีย์ไทยสำหรับรายการที่เลือก (ไปรษณีย์ไทยอาจยังไม่ได้สแกนอัปโหลดภาพใบตอบรับเข้าระบบ หรือเพิ่งนำจ่ายสำเร็จวันนี้)');
  }

  // 4. Send all gathered e-AR PDFs to backend for combination (PDF merge or ZIP archive)
  if (onProgress) {
    onProgress(completed, total, 'กำลังประมวลผลและจัดทำเอกสารรวม...');
  }

  const response = await fetch(`${API_BASE}/reports/batch-ear-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barcodes: validItems.map((v) => v.barcode),
      format: format,
      client_blobs: successfulBlobs,
      downloaded_at: downloadedAtStr
    })
  });

  if (!response.ok) {
    let errorDetail = 'ไม่สามารถดาวน์โหลดไฟล์ e-AR จากเซิร์ฟเวอร์ได้';
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch (e) {
      // Non-JSON error
    }
    throw new Error(errorDetail);
  }

  // 5. Download file
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  let filename = '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  if (match && match[1]) {
    filename = match[1];
  } else {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    filename = format === 'zip' ? `e-AR_Delivered_Archive_${timestamp}.zip` : `e-AR_Delivered_Combined_${timestamp}.pdf`;
  }

  const countHeader = response.headers.get('x-total-count');
  const actualCount = countHeader ? parseInt(countHeader, 10) : successfulBlobs.length;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 2000);

  // Prepare detailed result with partial success info
  const result = {
    success: true,
    count: actualCount,
    filename: filename,
    requested: total,
    successful: successfulBlobs.length,
    failed: failedItems.length,
    failedBarcodes: failedItems
  };

  // Show warning if partial success
  if (failedItems.length > 0) {
    let warningMsg = `ดาวน์โหลดเสร็จสิ้น (สำเร็จ ${successfulBlobs.length}/${total} รายการ)`;
    warningMsg += `\n❌ ไม่พบข้อมูล e-AR ในระบบ: ${failedItems.slice(0, 5).join(', ')}${failedItems.length > 5 ? '...' : ''}`;
    console.warn('[downloadBatchEar] Partial success:', warningMsg);
    // Show user-friendly alert for partial success
    if (typeof window !== 'undefined' && window.alert) {
      setTimeout(() => alert(warningMsg), 100);
    }
  }

  return result;
}

