/**
 * earService.js — Client-Side e-AR Fetching & Parsing Pipeline
 * 
 * Bypasses foreign server geoblocking (Akamai / Thai Post edge) by querying 
 * https://e-ar.thailandpost.com/ear-api/print/e-ar directly from the user's browser in Thailand (CORS enabled).
 * Then passes the received PDF bytes to our API backend to extract signature thumbnail and metadata.
 */

import { API_BASE } from './api';
import { fetchEarPdfFromExtension } from './extensionBridge';

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

  // 3. Call backend /api/reports/batch-ear-pdf
  const barcodesList = validItems.map((v) => v.barcode);
  const response = await fetch(`${API_BASE}/reports/batch-ear-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barcodes: barcodesList,
      format: format,
      client_blobs: validBlobs
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

