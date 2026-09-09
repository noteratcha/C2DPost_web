import React from 'react';
import { APP_VERSION } from '../config';
import './AboutModal.css';

export default function AboutModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="custom-modal-overlay" onClick={onClose}>
      <div className="custom-modal-box about-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon-header info">
          <div className="icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <h3>เกี่ยวกับระบบ (About)</h3>
          <div className="about-version-badge">
            <span>C2DPost Web Edition {APP_VERSION} — ส่วน ทข.ปข.10</span>
          </div>
        </div>

        <div className="modal-body-content">
          <div className="about-section">
            <h4 className="about-section-title">เอกสารที่รองรับการแปลงไฟล์:</h4>
            <ul className="doc-type-list">
              <li>
                <span className="bullet-dot"></span>
                <strong>ท.ด. 38</strong>
                <span className="doc-desc">(คำขอรังวัดแบ่งแยกในนามเดิม)</span>
              </li>
              <li>
                <span className="bullet-dot"></span>
                <strong>ท.ด. 81</strong>
                <span className="doc-desc">(คำขอรังวัดรวมโฉนด)</span>
              </li>
              <li>
                <span className="bullet-dot"></span>
                <strong>ออกโฉนดที่ดิน</strong>
                <span className="doc-desc">(คำขอรังวัดออกโฉนด)</span>
              </li>
            </ul>
          </div>

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
