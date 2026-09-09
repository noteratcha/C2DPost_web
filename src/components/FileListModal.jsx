import React from 'react';
import './FileListModal.css';

export default function FileListModal({ isOpen, onClose, files = [] }) {
  if (!isOpen) return null;

  return (
    <div className="custom-modal-overlay" onClick={onClose}>
      <div className="custom-modal-box file-list-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div className="modal-title-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <h3>ไฟล์ที่เลือกทั้งหมด ({files.length} ไฟล์)</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>×</button>
        </div>

        <div className="file-list-scroll">
          {files.length === 0 ? (
            <div className="empty-file-list">ยังไม่ได้เลือกไฟล์</div>
          ) : (
            <ol className="selected-files-ol">
              {files.map((file, idx) => {
                const name = typeof file === 'string' ? file : (file.name || `file_${idx+1}.pdf`);
                return (
                  <li key={idx} className="file-item-row">
                    <span className="file-item-num">{idx + 1}.</span>
                    <span className="file-item-name" title={name}>{name}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-ok" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
