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
