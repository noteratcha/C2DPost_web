import React, { useState, useEffect, useMemo } from 'react';
import './FileListModal.css';

export default function FileListModal({ isOpen, onClose, files = [] }) {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
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

  // Filter files by search term
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase().trim();
    return files.filter((f) => {
      const name = typeof f === 'string' ? f : (f.name || '');
      return name.toLowerCase().includes(q);
    });
  }, [files, searchQuery]);

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
                <span className="file-count-pill">{files.length} ไฟล์</span>
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
              <h4>ไม่พบไฟล์ที่ตรงกับ "{searchQuery}"</h4>
              <p>ลองค้นหาด้วยคำอื่น หรือกดล้างคำค้นหา</p>
            </div>
          ) : (
            <div className="file-cards-container">
              {filteredFiles.map((file, idx) => {
                const name = typeof file === 'string' ? file : (file.name || `file_${idx + 1}.pdf`);
                const size = typeof file === 'object' && file.size ? formatFileSize(file.size) : null;
                const originalIndex = files.indexOf(file) + 1;
                const paddedIndex = String(originalIndex > 0 ? originalIndex : idx + 1).padStart(2, '0');

                return (
                  <div key={idx} className="file-card-row">
                    <div className="file-card-index">{paddedIndex}</div>
                    
                    <div className="file-card-pdf-icon" title="เอกสาร PDF">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <path d="M10 12h4"></path>
                        <path d="M10 16h4"></path>
                      </svg>
                    </div>

                    <div className="file-card-meta">
                      <div className="file-card-name" title={name}>{name}</div>
                      <div className="file-card-subinfo">
                        <span className="file-type-chip">PDF</span>
                        {size && <span className="file-size-text">{size}</span>}
                      </div>
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
