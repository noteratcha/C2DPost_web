import React, { useState, useEffect, useMemo } from 'react';
import './FileListModal.css';

export default function FileListModal({ 
  isOpen, 
  onClose, 
  files = [], 
  fileStatuses = {}, 
  records = [] 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'success' | 'error'

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setFilterTab('all');
    }
  }, [isOpen]);

  // Format file size helper
  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Calculate total size if file objects have size property
  const totalSizeBytes = useMemo(() => {
    return files.reduce((acc, f) => acc + (f?.size || 0), 0);
  }, [files]);

  // Map each file to its detailed status
  const filesWithStatus = useMemo(() => {
    return files.map((file, idx) => {
      const name = typeof file === 'string' ? file : (file.name || `file_${idx + 1}.pdf`);
      const size = typeof file === 'object' && file.size ? file.size : null;
      const explicit = fileStatuses[name];
      const recordsForFile = records.filter(r => (r.SOURCE_FILE || r.source_file || '') === name);

      let status = 'success';
      let error = '';
      let recordCount = recordsForFile.length;

      if (explicit) {
        status = explicit.status || 'success';
        error = explicit.error || '';
        if (explicit.recordCount !== undefined) {
          recordCount = explicit.recordCount;
        }
      } else if (recordsForFile.length > 0) {
        status = 'success';
        recordCount = recordsForFile.length;
      } else if (records.length > 0) {
        status = 'error';
        error = 'ไม่พบข้อมูลตารางในไฟล์ PDF หรือรูปแบบไม่ตรงกัน';
      } else {
        status = 'success';
      }

      return {
        file,
        name,
        size,
        status, // 'success' | 'error'
        error,
        recordCount,
        originalIndex: idx + 1
      };
    });
  }, [files, fileStatuses, records]);

  // Status counts
  const successCount = useMemo(() => {
    return filesWithStatus.filter(f => f.status === 'success').length;
  }, [filesWithStatus]);

  const errorCount = useMemo(() => {
    return filesWithStatus.filter(f => f.status === 'error').length;
  }, [filesWithStatus]);

  // Filter files by filterTab and searchQuery
  const filteredFiles = useMemo(() => {
    let list = filesWithStatus;

    if (filterTab === 'success') {
      list = list.filter(f => f.status === 'success');
    } else if (filterTab === 'error') {
      list = list.filter(f => f.status === 'error');
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(f => f.name.toLowerCase().includes(q));
  }, [filesWithStatus, filterTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="custom-modal-overlay file-list-overlay" onClick={onClose}>
      <div className="custom-modal-box file-list-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header Section */}
        <div className="file-list-header">
          <div className="file-list-header-left">
            <div className="file-list-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div className="file-list-header-titles">
              <div className="file-list-title-row">
                <h3 className="file-list-title">ไฟล์ที่เลือกทั้งหมด</h3>
                <div className="header-pills-group">
                  <span className="file-count-pill pill-total">{files.length} ไฟล์</span>
                  {successCount > 0 && (
                    <span className="file-count-pill pill-success" title={`แปลงสำเร็จ ${successCount} ไฟล์`}>
                      ✓ สำเร็จ {successCount}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="file-count-pill pill-error" title={`มีข้อผิดพลาด ${errorCount} ไฟล์`}>
                      ✕ ไม่สำเร็จ {errorCount}
                    </span>
                  )}
                </div>
              </div>
              <p className="file-list-subtitle">
                เอกสาร PDF สำหรับประมวลผลข้อมูล
                {totalSizeBytes > 0 && ` • รวม ${formatFileSize(totalSizeBytes)}`}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="file-list-close-btn" 
            onClick={onClose}
            title="ปิดหน้าต่าง (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Status Filter Tabs (Shown when files > 1 or errorCount > 0) */}
        {(files.length > 1 || errorCount > 0) && (
          <div className="file-status-tabs">
            <button
              type="button"
              className={`file-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              <span>ทั้งหมด</span>
              <span className="tab-count-badge">{files.length}</span>
            </button>
            <button
              type="button"
              className={`file-tab-btn tab-success ${filterTab === 'success' ? 'active' : ''}`}
              onClick={() => setFilterTab('success')}
            >
              <span>✓ สำเร็จ</span>
              <span className="tab-count-badge badge-success">{successCount}</span>
            </button>
            {errorCount > 0 && (
              <button
                type="button"
                className={`file-tab-btn tab-error ${filterTab === 'error' ? 'active' : ''}`}
                onClick={() => setFilterTab('error')}
              >
                <span>✕ ไม่สำเร็จ</span>
                <span className="tab-count-badge badge-error">{errorCount}</span>
              </button>
            )}
          </div>
        )}

        {/* Search Bar (Shown when files > 3) */}
        {files.length > 3 && (
          <div className="file-list-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="search-icon-svg">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              className="file-list-search-input"
              placeholder="ค้นหาชื่อไฟล์ PDF..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                type="button" 
                className="search-clear-btn" 
                onClick={() => setSearchQuery('')}
                title="ล้างคำค้นหา"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* File Cards List */}
        <div className="file-list-scroll">
          {files.length === 0 ? (
            <div className="file-list-empty-state">
              <div className="empty-state-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                  <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
              </div>
              <h4>ยังไม่ได้เลือกไฟล์</h4>
              <p>กรุณากดปุ่ม "เลือกเอกสาร PDF" หรือลากไฟล์มาวางในพื้นที่ทำงาน</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="file-list-empty-state">
              {filterTab === 'error' ? (
                <>
                  <div className="empty-state-icon success-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <h4>ไม่มีไฟล์ที่ล้มเหลว</h4>
                  <p>ทุกไฟล์ได้รับการประมวลผลสำเร็จเรียบร้อยแล้ว</p>
                </>
              ) : filterTab === 'success' ? (
                <>
                  <h4>ไม่พบไฟล์ที่ประมวลผลสำเร็จ</h4>
                  <p>โปรดตรวจสอบไฟล์ต้นฉบับหรือลองอัปโหลดใหม่อีกครั้ง</p>
                </>
              ) : (
                <>
                  <h4>ไม่พบไฟล์ที่ตรงกับ "{searchQuery}"</h4>
                  <p>ลองค้นหาด้วยคำอื่น หรือกดล้างคำค้นหา</p>
                </>
              )}
            </div>
          ) : (
            <div className="file-cards-container">
              {filteredFiles.map((item) => {
                const paddedIndex = String(item.originalIndex).padStart(2, '0');
                const isError = item.status === 'error';

                return (
                  <div 
                    key={item.name + item.originalIndex} 
                    className={`file-card-row ${isError ? 'file-card-error' : 'file-card-success'}`}
                  >
                    <div className="file-card-index">{paddedIndex}</div>
                    
                    <div className={`file-card-pdf-icon ${isError ? 'icon-error' : 'icon-success'}`} title={isError ? 'ประมวลผลไม่สำเร็จ' : 'ประมวลผลสำเร็จ'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <path d="M10 12h4"></path>
                        <path d="M10 16h4"></path>
                      </svg>
                      {isError ? (
                        <span className="file-badge-indicator badge-ind-error" title="ไม่สำเร็จ">✕</span>
                      ) : (
                        <span className="file-badge-indicator badge-ind-success" title="สำเร็จ">✓</span>
                      )}
                    </div>

                    <div className="file-card-meta">
                      <div className="file-card-name" title={item.name}>{item.name}</div>
                      
                      <div className="file-card-subinfo">
                        <span className="file-type-chip">PDF</span>
                        {item.size && <span className="file-size-text">{formatFileSize(item.size)}</span>}
                        
                        {!isError && item.recordCount > 0 && (
                          <span className="file-record-chip" title={`สกัดข้อมูลผู้รับได้ ${item.recordCount} รายการ`}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            {item.recordCount} รายการ
                          </span>
                        )}
                      </div>

                      {/* Error details if failed */}
                      {isError && (
                        <div className="file-error-notice" title={item.error}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                          <span>{item.error || 'ไม่สามารถแปลงข้อมูลได้'}</span>
                        </div>
                      )}
                    </div>

                    {/* Status Pill on the Right */}
                    <div className="file-card-status-pill-wrap">
                      {!isError ? (
                        <span className="status-badge-chip chip-success">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          สำเร็จ
                        </span>
                      ) : (
                        <span className="status-badge-chip chip-error">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                          ไม่สำเร็จ
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="file-list-footer">
          <div className="file-list-footer-stats">
            แสดง <strong>{filteredFiles.length}</strong> จากทั้งหมด <strong>{files.length}</strong> ไฟล์
            {errorCount > 0 && (
              <span className="footer-error-count-text"> (สำเร็จ {successCount}, ไม่สำเร็จ {errorCount})</span>
            )}
          </div>
          <button 
            type="button" 
            className="btn-file-list-done" 
            onClick={onClose}
          >
            <span>ปิดหน้าต่าง</span>
          </button>
        </div>
      </div>
    </div>
  );
}
