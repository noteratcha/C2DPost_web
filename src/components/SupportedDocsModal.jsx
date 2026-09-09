import React from 'react';
import './SupportedDocsModal.css';

export default function SupportedDocsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="custom-modal-overlay" onClick={onClose}>
      <div className="custom-modal-box supported-docs-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon-header info">
          <div className="icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <h3>เอกสารที่รองรับ</h3>
        </div>

        <div className="modal-body-content">
          <p className="lead-text">ระบบปัจจุบันรองรับการแปลงไฟล์ประเภท:</p>
          <ul className="doc-type-list">
            <li>
              <span className="bullet-dot"></span>
              <strong>ท.ด. 38</strong>
            </li>
            <li>
              <span className="bullet-dot"></span>
              <strong>ท.ด. 81</strong>
            </li>
            <li>
              <span className="bullet-dot"></span>
              <strong>ออกโฉนดที่ดิน</strong>
            </li>
          </ul>
        </div>

        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-ok" onClick={onClose}>
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}
