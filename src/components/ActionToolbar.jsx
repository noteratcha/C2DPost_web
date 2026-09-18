import React, { useState, useRef, useEffect } from 'react';
import './ActionToolbar.css';

export default function ActionToolbar({
  records = [],
  statusText = 'ยังไม่ได้เลือกไฟล์',
  progress = null, // { val: number, current: number, total: number, percent: number }
  isProcessing = false,
  isSendingApi = false,
  isReconciling = false,
  onFilesSelected,
  onFetchBarcodes,
  onDownloadDocument,
  onExportExcel,
  onExportEnvelope,
  onSendEparcel,
  onCheckDeposit,
  onOpenDepositReport
}) {
  const fileInputRef = useRef(null);
  const downloadMenuRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const dragCounterRef = useRef(0);

  const totalRecords = records.length;
  const selectedCount = records.filter(r => r.SELECTED === true).length;
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

  // 4. btn_download_docs (รวม บันทึกไฟล์ + สร้างจ่าหน้าซอง): enabled ONLY when all records have API_STATUS == '✓ สำเร็จ'
  const canDownloadDocs = allApiSuccess && !isProcessing;

  // Close download menu on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setIsDownloadMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsDownloadMenuOpen(false);
      }
    };

    if (isDownloadMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDownloadMenuOpen]);

  const downloadTooltip = !allHaveBarcodes
    ? "ต้องดึงหมายเลขบาร์โค้ดก่อน จึงจะดาวน์โหลดเอกสารได้"
    : !allApiSuccess
    ? "ต้องส่งข้อมูล e-Parcel สำเร็จก่อน\nจึงจะดาวน์โหลดเอกสารได้"
    : "เลือกดาวน์โหลดเอกสาร (Excel, PDF รวม, ใบนำส่ง, จ่าหน้าซอง)";


  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = ''; // Reset input to allow selecting same file if desired
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!canSelectFiles) return;
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDragOver(true);
      }
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    if (!canSelectFiles) return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <section 
      className={`card-file-selection ${isDragOver ? 'drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          <div 
            className={`status-box ${canSelectFiles && records.length === 0 ? 'clickable-status-box' : ''}`}
            onClick={() => {
              if (canSelectFiles && records.length === 0 && fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
            title={canSelectFiles && records.length === 0 ? 'คลิกหรือลากไฟล์ PDF มาวางเพื่อเลือกไฟล์' : ''}
          >
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

          {/* ดาวน์โหลดเอกสาร (รวม บันทึกไฟล์ + สร้างจ่าหน้าซอง เข้าเป็นปุ่มเดียว) */}
          <div 
            className={`btn-tooltip-wrapper download-docs-wrapper ${isDownloadMenuOpen ? 'dropdown-active' : ''}`}
            data-tooltip={downloadTooltip}
            ref={downloadMenuRef}
          >
            <button
              type="button"
              className={`btn-card-action btn-download-docs ${isDownloadMenuOpen ? 'active' : ''}`}
              disabled={!canDownloadDocs}
              onClick={() => setIsDownloadMenuOpen(prev => !prev)}
              aria-expanded={isDownloadMenuOpen}
              aria-haspopup="true"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>ดาวน์โหลดเอกสาร</span>
              <svg className={`chevron-down-icon ${isDownloadMenuOpen ? 'open' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {isDownloadMenuOpen && (
              <div className="download-docs-dropdown" role="menu">
                <div className="download-dropdown-header">
                  <div className="download-header-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span className="download-header-title">เลือกเอกสารที่ต้องการดาวน์โหลด</span>
                  </div>
                  <span className="download-header-badge">{totalRecords} รายการ</span>
                </div>

                <div className="download-dropdown-list">
                  {/* 1. ไฟล์ Excel (สำหรับ DPost) */}
                  <button
                    type="button"
                    className="download-item-card"
                    title="ข้อมูลนำเข้าสำหรับระบบ DPost ไปรษณีย์ไทย"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      if (onDownloadDocument) onDownloadDocument('excel');
                      else if (onExportExcel) onExportExcel();
                    }}
                    disabled={isProcessing}
                  >
                    <div className="download-item-icon-box icon-excel">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="8" y1="13" x2="16" y2="17"></line>
                        <line x1="16" y1="13" x2="8" y2="17"></line>
                      </svg>
                    </div>
                    <div className="download-item-info">
                      <div className="download-item-title-row">
                        <span className="download-item-title">1. ไฟล์ Excel (สำหรับ DPost)</span>
                        <span className="doc-format-badge badge-xlsx">.xlsx</span>
                      </div>
                    </div>
                    <div className="download-item-action-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </div>
                  </button>

                  {/* 2. ไฟล์ PDF (เอกสารพร้อมบาร์โค้ด) */}
                  <button
                    type="button"
                    className="download-item-card"
                    title="เอกสารต้นฉบับพร้อมประทับตราและหมายเลขบาร์โค้ด"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      if (onDownloadDocument) onDownloadDocument('combined');
                      else if (onExportExcel) onExportExcel();
                    }}
                    disabled={isProcessing}
                  >
                    <div className="download-item-icon-box icon-pdf-combined">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                    </div>
                    <div className="download-item-info">
                      <div className="download-item-title-row">
                        <span className="download-item-title">2. ไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)</span>
                        <span className="doc-format-badge badge-pdf">.pdf</span>
                      </div>
                    </div>
                    <div className="download-item-action-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </div>
                  </button>

                  {/* 3. ไฟล์ PDF (ใบนำส่ง) */}
                  <button
                    type="button"
                    className="download-item-card"
                    title="ใบนำส่งสิ่งของส่งทางไปรษณีย์สรุปรายการฝากส่ง"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      if (onDownloadDocument) onDownloadDocument('delivery_note');
                      else if (onExportExcel) onExportExcel();
                    }}
                    disabled={isProcessing}
                  >
                    <div className="download-item-icon-box icon-pdf-note">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                        <line x1="9" y1="12" x2="15" y2="12"></line>
                        <line x1="9" y1="16" x2="13" y2="16"></line>
                      </svg>
                    </div>
                    <div className="download-item-info">
                      <div className="download-item-title-row">
                        <span className="download-item-title">3. ไฟล์ PDF (ใบนำส่ง)</span>
                        <span className="doc-format-badge badge-pdf">.pdf</span>
                      </div>
                    </div>
                    <div className="download-item-action-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </div>
                  </button>

                  {/* 4. ไฟล์ PDF (สร้างจ่าหน้าซอง) */}
                  <button
                    type="button"
                    className="download-item-card"
                    title={`ใบปะหน้าซองจดหมาย ${selectedCount > 0 ? `(เฉพาะที่เลือก ${selectedCount} รายการ)` : `(ทั้งหมด ${totalRecords} รายการ)`}`}
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      if (onDownloadDocument) onDownloadDocument('envelopes');
                      else if (onExportEnvelope) onExportEnvelope();
                    }}
                    disabled={isProcessing}
                  >
                    <div className="download-item-icon-box icon-pdf-envelope">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                    </div>
                    <div className="download-item-info">
                      <div className="download-item-title-row">
                        <span className="download-item-title">4. ไฟล์ PDF (สร้างจ่าหน้าซอง)</span>
                        <span className="doc-format-badge badge-envelope">.pdf</span>
                      </div>
                    </div>
                    <div className="download-item-action-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </div>
                  </button>
                </div>

                <div className="download-dropdown-divider"></div>

                {/* Action: ดาวน์โหลดทั้งหมด (ครบทั้ง 4 ไฟล์) */}
                <div className="download-dropdown-footer">
                  <button
                    type="button"
                    className="btn-download-all-combo"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      if (onDownloadDocument) onDownloadDocument('all');
                      else if (onExportExcel) onExportExcel();
                    }}
                    disabled={isProcessing}
                    title="ดาวน์โหลดไฟล์ทั้งหมดทั้ง 4 ไฟล์ในครั้งเดียว"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="8 17 12 21 16 17"></polyline>
                      <line x1="12" y1="12" x2="12" y2="21"></line>
                      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
                    </svg>
                    <span>ดาวน์โหลดทั้งหมด (ครบทั้ง 4 ไฟล์)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
