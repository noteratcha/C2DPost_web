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
    return earCache.get(cleanBarcode);
  }

  try {
    let pdfBlob = null;

    // 1. Primary Strategy: Request PDF via C2DPost Helper Extension (Domestic Thai IP + No CORS restrictions)
    try {
      const extRes = await fetchEarPdfFromExtension(cleanBarcode);
      if (extRes && extRes.success && extRes.pdfBase64) {
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
            }
          }
        }
      } catch (directErr) {
        // Direct fetch failed (e.g. CORS preflight without extension)
      }
    }

    if (!pdfBlob) {
      return null;
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

  // 1. Get clientEar if not provided or missing blob
  let earObj = clientEar;
  if (!earObj || !earObj.pdfBlob) {
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

  // 3. Prepare client_pdf_base64 if available
  let clientPdfBase64 = null;
  if (earObj?.pdfBlob) {
    try {
      clientPdfBase64 = await blobToBase64(earObj.pdfBlob);
    } catch (bErr) {
      console.warn('blobToBase64 notice:', bErr);
    }
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
    console.warn('Error fetching 2-page e-AR PDF, falling back to direct URL:', err);
    window.open(`${API_BASE}/reports/ear-pdf?barcode=${encodeURIComponent(cleanBarcode)}`, '_blank');
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

  // Helper to fetch individual e-AR PDF (extension first, then direct fetch)
  const fetchSinglePdfBlob = async (item) => {
    const bcode = item.barcode;
    try {
      // Strategy 1: Extension Bridge (Domestic Thai IP)
      try {
        const extRes = await fetchEarPdfFromExtension(bcode);
        if (extRes && extRes.success && extRes.pdfBase64) {
          return {
            barcode: bcode,
            receiver: item.receiver,
            inv_no: item.inv_no,
            base64: extRes.pdfBase64
          };
        }
      } catch (extErr) {
        // Continue to strategy 2
      }

      // Strategy 2: Direct browser fetch
      try {
        const res = await fetch('https://e-ar.thailandpost.com/ear-api/print/e-ar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([bcode])
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await res.blob();
            if (blob.size >= 500) {
              const b64 = await blobToBase64(blob);
              if (b64) {
                return {
                  barcode: bcode,
                  receiver: item.receiver,
                  inv_no: item.inv_no,
                  base64: b64
                };
              }
            }
          }
        }
      } catch (directErr) {
        // Direct fetch failed
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

  // 2. Fetch in concurrency batches (4 concurrent requests)
  const CONCURRENCY = 4;
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
  }

  // Filter out items that have valid base64
  const validBlobs = clientBlobs.filter((b) => b && b.base64);
  if (validBlobs.length === 0) {
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

  // 3. Format Thai timestamp for page footer
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const yBe = now.getFullYear() + 543;
  const timeStr = now.toTimeString().split(' ')[0]; // "HH:MM:SS"
  const downloadedAtStr = `${d}/${m}/${yBe} ${timeStr} น.`;

  // 4. Call backend /api/reports/batch-ear-pdf
  const barcodesList = validItems.map((v) => v.barcode);
  const response = await fetch(`${API_BASE}/reports/batch-ear-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barcodes: barcodesList,
      format: format,
      client_blobs: validBlobs,
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

  // 4. Download file
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
  const actualCount = countHeader ? parseInt(countHeader, 10) : validBlobs.length || total;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 2000);

  return {
    success: true,
    count: actualCount,
    filename: filename
  };
}

