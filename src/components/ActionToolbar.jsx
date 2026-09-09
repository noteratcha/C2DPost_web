import React, { useRef } from 'react';
import './ActionToolbar.css';

export default function ActionToolbar({
  records = [],
  statusText = 'ยังไม่ได้เลือกไฟล์',
  progress = null, // { val: number, current: number, total: number, percent: number }
  isProcessing = false,
  isSendingApi = false,
  onFilesSelected,
  onFetchBarcodes,
  onExportExcel,
  onExportEnvelope,
  onSendEparcel
}) {
  const fileInputRef = useRef(null);

  const totalRecords = records.length;
  const hasMissingBarcode = records.some(r => !r.BARCODE_NO || String(r.BARCODE_NO).trim() === '');
  const allHaveBarcodes = totalRecords > 0 && !hasMissingBarcode;
  const allApiSuccess = totalRecords > 0 && records.every(r => (r.API_STATUS || '').trim() === '✓ สำเร็จ');

  // Exact button state conditions matching Python gui.py:
  // 1. btn_select_files: disabled during processing OR once all e-Parcel sent successfully
  const canSelectFiles = !isProcessing && !allApiSuccess;

  // 2. btn_fetch_barcodes: enabled when records exist AND still missing barcodes
  const canFetchBarcodes = totalRecords > 0 && hasMissingBarcode && !isProcessing;

  // 3. btn_send_api: enabled when all records have barcodes AND not yet all successful
  const canSendApi = allHaveBarcodes && !allApiSuccess && !isProcessing && !isSendingApi;

  // 4. btn_export: enabled ONLY when all records have API_STATUS == '✓ สำเร็จ'
  const canExport = allApiSuccess && !isProcessing;

  // 5. btn_envelope: enabled ONLY when all records have API_STATUS == '✓ สำเร็จ'
  const canEnvelope = allApiSuccess && !isProcessing;

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = ''; // Reset input to allow selecting same file if desired
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!canSelectFiles) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <section 
      className="card-file-selection"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="card-header-title">
        <h3>เลือกเอกสาร PDF</h3>
      </div>

      <div className="card-controls-row">
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          multiple 
          accept=".pdf" 
          onChange={handleFileInputChange}
        />

        {/* 1. เพิ่มไฟล์ PDF Button */}
        <div 
          className="btn-tooltip-wrapper" 
          data-tooltip="เลือกไฟล์ PDF ที่ออกจากระบบ"
        >
          <button
            type="button"
            className="btn-card-action btn-add-pdf"
            disabled={!canSelectFiles}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
            เพิ่มไฟล์ PDF
          </button>
        </div>

        {/* 2. Center Status Box */}
        <div className="center-status-box-wrap">
          <div className="status-box">
            <span className="lbl-status-text">{statusText}</span>
            {progress && (
              <div className="progress-bar-track">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${Math.min(100, Math.max(0, progress.percent || 0))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 3. Action Buttons Group */}
        <div className="action-buttons-group">
          {/* ดึงหมายเลข */}
          <div 
            className="btn-tooltip-wrapper"
            data-tooltip="ทำการดึงหมายเลขบาร์โค้ดจากระบบไปรษณีย์"
          >
            <button
              type="button"
              className="btn-card-action btn-fetch-barcodes"
              disabled={!canFetchBarcodes}
              onClick={onFetchBarcodes}
            >
              ดึงหมายเลข
            </button>
          </div>

          {/* บันทึกไฟล์ */}
          <div 
            className="btn-tooltip-wrapper"
            data-tooltip={"เมื่อบันทึกไฟล์ จะไม่สามารถแก้ไขข้อมูลได้\nไฟล์ที่ได้รับ:\n1.ไฟล์ excel (สำหรับ DPost)\n2.ไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)\n3.ไฟล์ PDF (ใบนำส่ง)"}
          >
            <button
              type="button"
              className="btn-card-action btn-export-excel"
              disabled={!canExport}
              onClick={onExportExcel}
            >
              บันทึกไฟล์
            </button>
          </div>

          {/* สร้างจ่าหน้าซอง */}
          <div 
            className="btn-tooltip-wrapper"
            data-tooltip="ต้องดึงหมายเลขบาร์โค้ดก่อน จึงจะสร้างจ่าหน้าซองได้"
          >
            <button
              type="button"
              className="btn-card-action btn-envelope"
              disabled={!canEnvelope}
              onClick={onExportEnvelope}
            >
              สร้างจ่าหน้าซอง
            </button>
          </div>

          {/* ส่งข้อมูล e-Parcel */}
          <div 
            className="btn-tooltip-wrapper"
            data-tooltip={"ต้องดึงหมายเลขบาร์โค้ดก่อน\nจึงจะส่งข้อมูล e-Parcel ได้"}
          >
            <button
              type="button"
              className="btn-card-action btn-send-api"
              disabled={!canSendApi}
              onClick={onSendEparcel}
            >
              {isSendingApi ? 'กำลังส่งข้อมูล...' : 'ส่งข้อมูล e-Parcel'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
