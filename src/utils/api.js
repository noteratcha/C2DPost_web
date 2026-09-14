/**
 * Backend API Client
 */

const API_BASE = '/api';

/**
 * Trigger browser file download from Blob
 */
function downloadBlob(blob, defaultFilename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Extract filename from Content-Disposition header
 */
function getFilenameFromHeader(header, fallback) {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/);
  return match ? match[1] : fallback;
}

/**
 * Upload PDF files for processing with progressive per-file conversion
 * Matching Python Desktop run_conversion_task (gui.py:2372-2405)
 *
 * @param {Array<File>} fileList
 * @param {function} [onProgress] - callback: (current, total, percent, statusText) => void
 */
export async function convertPdfs(fileList, onProgress) {
  const allRecords = [];
  const errorFiles = [];
  const total = fileList.length;

  for (let i = 0; i < total; i++) {
    const file = fileList[i];
    const current = i + 1;
    const startPercent = Math.round((i / total) * 100);

    if (onProgress) {
      onProgress(i, total, startPercent, `กำลังแปลงไฟล์... ${i}/${total} (${startPercent}%)`);
    }

    try {
      const formData = new FormData();
      formData.append('files', file);

      const response = await fetch(`${API_BASE}/convert`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        errorFiles.push({ filename: file.name, error: err.detail || 'เกิดข้อผิดพลาดในการประมวลผล' });
      } else {
        const resJson = await response.json();
        if (resJson.records) {
          allRecords.push(...resJson.records);
        }
        if (resJson.error_files) {
          errorFiles.push(...resJson.error_files);
        }
      }
    } catch (e) {
      errorFiles.push({ filename: file.name, error: e.message || 'การเชื่อมต่อล้มเหลว' });
    }

    const endPercent = Math.round((current / total) * 100);
    if (onProgress) {
      onProgress(current, total, endPercent, `กำลังแปลงไฟล์... ${current}/${total} (${endPercent}%)`);
    }
  }

  return {
    success: true,
    total_records: allRecords.length,
    records: allRecords,
    error_files: errorFiles
  };
}

/**
 * Export Excel (.xlsx) file
 */
export async function exportExcel(records) {
  const response = await fetch(`${API_BASE}/export-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || 'ไม่สามารถสร้างไฟล์ Excel ได้');
  }

  const filename = getFilenameFromHeader(response.headers.get('Content-Disposition'), `DPost_Export_${Date.now()}.xlsx`);
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

/**
 * Export PDF file ('combined', 'delivery_note', or 'envelopes')
 * When files are provided, sends multipart/form-data to allow overlaying barcodes on original PDFs.
 */
export async function exportPdf(records, pdfType = 'combined', files = []) {
  let response;

  const validFiles = (files || []).filter(f => f instanceof File);
  if (validFiles.length > 0) {
    const formData = new FormData();
    for (const f of validFiles) {
      formData.append('files', f);
    }
    formData.append('records', JSON.stringify(records));
    formData.append('pdf_type', pdfType);

    response = await fetch(`${API_BASE}/export-pdf`, {
      method: 'POST',
      body: formData
    });
  } else {
    response = await fetch(`${API_BASE}/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, pdf_type: pdfType })
    });
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || 'ไม่สามารถสร้างไฟล์ PDF ได้');
  }

  const fallback = pdfType === 'delivery_note' ? 'DeliveryNote.pdf' : (pdfType === 'envelopes' ? 'Envelopes.pdf' : 'DPost_Combined.pdf');
  const filename = getFilenameFromHeader(response.headers.get('Content-Disposition'), fallback);
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

/**
 * Export all 3 files individually (matching Python app behavior):
 * 1. ไฟล์ Excel (สำหรับ DPost)
 * 2. ไฟล์ PDF (เอกสารพร้อมบาร์โค้ด) - combined
 * 3. ไฟล์ PDF (ใบนำส่ง) - delivery_note
 *
 * @param {Array} records
 * @param {Array<File>} [files] - Original uploaded PDF files for barcode overlay
 * @param {function} [onProgress] - optional callback: (stepNumber, totalSteps, stepLabel) => void
 * @returns {Promise<{excel: string, combined: string, deliveryNote: string}>} filenames
 */
export async function exportAllFiles(records, files = [], onProgress) {
  const results = { excel: '', combined: '', deliveryNote: '' };

  // Step 1: Excel
  if (onProgress) onProgress(1, 3, 'กำลังสร้างไฟล์ Excel (สำหรับ DPost)...');
  await exportExcel(records);
  results.excel = 'DPost_Export.xlsx';

  // Small delay to avoid browser download throttling
  await new Promise(r => setTimeout(r, 500));

  // Step 2: Combined PDF (เอกสารพร้อมบาร์โค้ด)
  if (onProgress) onProgress(2, 3, 'กำลังสร้างไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)...');
  await exportPdf(records, 'combined', files);
  results.combined = 'DPost_Combined.pdf';

  await new Promise(r => setTimeout(r, 500));

  // Step 3: Delivery Note PDF (ใบนำส่ง)
  if (onProgress) onProgress(3, 3, 'กำลังสร้างไฟล์ PDF (ใบนำส่ง)...');
  await exportPdf(records, 'delivery_note');
  results.deliveryNote = 'DeliveryNote.pdf';

  return results;
}

/**
 * Fetch deposit report from Thailand Post e-Parcel API
 *
 * @param {Object} params
 * @param {string} params.date - Date in DD/MM/YYYY format (e.g. 14/09/2026)
 * @param {string} [params.username] - e-Parcel username
 * @param {string} [params.password] - e-Parcel password
 * @returns {Promise<{success: boolean, date: string, is_mock: boolean, summary: Object, records: Array}>}
 */
export async function fetchReceivedReport({ date, username = '', password = '' }) {
  const response = await fetch(`${API_BASE}/reports/received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, username, password })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.detail || `เกิดข้อผิดพลาดในการดึงรายงาน (HTTP ${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Fetch delivery timeline for a single barcode via getHistoryStatus.
 *
 * @param {Object} params
 * @param {string} params.barcode - 13-digit Thailand Post barcode
 * @param {string} [params.username] - e-Parcel username
 * @param {string} [params.password] - e-Parcel password
 * @returns {Promise<{success: boolean, barcode: string, is_mock: boolean, events: Array}>}
 */
export async function fetchTrackingHistory({ barcode, username = '', password = '' }) {
  const response = await fetch(`${API_BASE}/reports/tracking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode, username, password })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.detail || `เกิดข้อผิดพลาดในการดึงประวัติสถานะ (HTTP ${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Auto-reconcile: batch-check a list of barcodes to see which
 * items have already been received at the post office (รับฝากแล้ว).
 *
 * @param {Object} params
 * @param {Array<string>} params.barcodes
 * @param {string} [params.username]
 * @param {string} [params.password]
 * @returns {Promise<{success: boolean, total_checked: number, received_count: number, results: Array}>}
 */
export async function reconcileRecords({ barcodes, username = '', password = '' }) {
  const response = await fetch(`${API_BASE}/reports/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcodes, username, password })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.detail || `เกิดข้อผิดพลาดในการตรวจสอบรับฝาก (HTTP ${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Export Deposit Report to Excel (.xlsx)
 *
 * @param {Object} payload
 * @param {Array} payload.records
 * @param {Object} [payload.summary]
 * @param {string} [payload.date]
 * @param {string} [payload.organization]
 */
export async function exportDepositReportExcel({ records, summary = {}, date = '', organization = '' }) {
  const response = await fetch(`${API_BASE}/reports/export-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, summary, date, organization })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || 'ไม่สามารถสร้างไฟล์ Excel รายงานรับฝากได้');
  }

  const cleanDate = (date || '').replace(/\//g, '-');
  const fallback = `Deposit_Report_${cleanDate || Date.now()}.xlsx`;
  const filename = getFilenameFromHeader(response.headers.get('Content-Disposition'), fallback);
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

/**
 * Export Deposit Report to Landscape PDF (.pdf)
 *
 * @param {Object} payload
 * @param {Array} payload.records
 * @param {Object} [payload.summary]
 * @param {string} [payload.date]
 * @param {string} [payload.organization]
 */
export async function exportDepositReportPdf({ records, summary = {}, date = '', organization = '' }) {
  const response = await fetch(`${API_BASE}/reports/export-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, summary, date, organization })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || 'ไม่สามารถสร้างไฟล์ PDF รายงานรับฝากได้');
  }

  const cleanDate = (date || '').replace(/\//g, '-');
  const fallback = `Deposit_Report_${cleanDate || Date.now()}.pdf`;
  const filename = getFilenameFromHeader(response.headers.get('Content-Disposition'), fallback);
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

/**
 * Log fetched barcodes to UseBarcode Google Sheet
 *
 * @param {Array<Object>} items - list of { barcode, details, username, timestamp }
 * @param {string} username - current user name
 */
export async function logBarcodesToUseBarcode(items, username) {
  if (!items || items.length === 0) return { success: true, logged_count: 0 };
  try {
    const response = await fetch(`${API_BASE}/log-barcodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username || 'Unknown',
        items: items
      })
    });
    if (!response.ok) {
      console.warn(`logBarcodesToUseBarcode HTTP ${response.status}`);
      return { success: false, status: response.status };
    }
    return await response.json();
  } catch (error) {
    console.warn('Failed to log barcodes to UseBarcode:', error);
    return { success: false, error: error.message };
  }
}


