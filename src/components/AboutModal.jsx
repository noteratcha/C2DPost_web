import React from 'react';
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
            <span>C2DPost Web Edition v2026.0909.2008 — ส่วน ทข.ปข.10</span>
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

          <div className="about-links-section">
            <a 
              href="https://canva.link/dyl3brb47lyph8r" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="about-link-pill"
              title="เปิดดูคู่มือการใช้งานบน Canva"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              <span>คู่มือการใช้งานระบบ (Canva)</span>
            </a>
            <a 
              href="https://lin.ee/UzWqlKP" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="about-link-pill"
              title="ติดต่อเจ้าหน้าที่ส่วน ทข.ปข.10 ผ่าน LINE Official"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              <span>ติดต่อเจ้าหน้าที่ (LINE Official)</span>
            </a>
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
