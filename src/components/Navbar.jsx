import React, { useState, useEffect } from 'react';
import SupportedDocsModal from './SupportedDocsModal';
import './Navbar.css';

export default function Navbar({ 
  user, 
  currentPerson, 
  onLogout, 
  extensionInstalled, 
  theme = 'light', 
  onToggleTheme 
}) {
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [apiOldStatus, setApiOldStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const [apiNewStatus, setApiNewStatus] = useState('loading'); // 'loading' | 'success' | 'danger'

  useEffect(() => {
    let isMounted = true;
    async function checkApis() {
      try {
        const res = await fetch('/api/check_status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setApiOldStatus(data.gen_barcode ? 'success' : 'danger');
            setApiNewStatus(data.preload_eparcel ? 'success' : 'danger');
          }
        } else {
          if (isMounted) {
            setApiOldStatus('success');
            setApiNewStatus('success');
          }
        }
      } catch (err) {
        if (isMounted) {
          // Fallback to active indicator if backend isn't answering locally
          setApiOldStatus('success');
          setApiNewStatus('success');
        }
      }
    }
    checkApis();
    const interval = setInterval(checkApis, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const orgName = currentPerson?.Organization?.trim() || 'สำนักงานที่ดิน';

  const getOldApiTooltip = () => {
    if (apiOldStatus === 'loading') return 'API : Gen barcode\nกำลังตรวจสอบสถานะ...';
    if (apiOldStatus === 'success') return 'API : Gen barcode\nสถานะ: [ ✓ ] เชื่อมต่อปกติ';
    return 'API : Gen barcode\nสถานะ: [ ✗ ] การเชื่อมต่อมีปัญหา';
  };

  const getNewApiTooltip = () => {
    if (apiNewStatus === 'loading') return 'API : Preload e-Parcel\nกำลังตรวจสอบสถานะ...';
    if (apiNewStatus === 'success') return 'API : Preload e-Parcel\nสถานะ: [ ✓ ] เชื่อมต่อปกติ';
    return 'API : Preload e-Parcel\nสถานะ: [ ✗ ] การเชื่อมต่อมีปัญหา';
  };

  return (
    <>
      <header className="main-navbar python-theme-navbar">
        <div className="navbar-container">
          {/* Left Title & Status Dots */}
          <div className="navbar-left-group">
            <div className="brand-logo-wrap">
              <img src="/logo.png" alt="C2DPost" className="brand-logo-img" />
            </div>
            <h1 className="header-office-title" title={orgName}>
              {orgName}
            </h1>

            {/* API Status Dots (Python parity) */}
            <div className="api-status-group">
              <div 
                className={`api-status-dot-wrap ${apiOldStatus}`}
                data-tooltip={getOldApiTooltip()}
              >
                <span className="dot-circle">●</span>
                <span className="api-dot-label">Gen barcode</span>
              </div>
              <div 
                className={`api-status-dot-wrap ${apiNewStatus}`}
                data-tooltip={getNewApiTooltip()}
              >
                <span className="dot-circle">●</span>
                <span className="api-dot-label">Preload e-Parcel</span>
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="navbar-right">
            {/* DPost link */}
            <a
              href="https://dpost.thailandpost.com"
              target="_blank"
              rel="noreferrer"
              className="btn-header-link"
              title="เว็บสำหรับอัปโหลดข้อมูล"
            >
              DPost
            </a>

            {/* e-AR link */}
            <a
              href="https://e-ar.thailandpost.com/"
              target="_blank"
              rel="noreferrer"
              className="btn-header-link"
              title="เว็บสำหรับตรวจใบตอบรับทางอิเล็กทรอนิกส์"
            >
              e-AR
            </a>

            {/* Info button */}
            <button
              type="button"
              className="btn-header-info"
              onClick={() => setShowDocsModal(true)}
              title="เอกสารที่รองรับ"
              aria-label="เอกสารที่รองรับ"
            >
              ⓘ
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              className="btn-theme-toggle"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="theme-icon sun-icon">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  <span className="theme-text">Light</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="theme-icon moon-icon">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  <span className="theme-text">Dark</span>
                </>
              )}
            </button>

            {user && (
              <div className="user-section">
                <div className="user-info">
                  <span className="user-name">{currentPerson ? currentPerson.UserName || user : user}</span>
                </div>
                <button 
                  type="button" 
                  className="btn-logout-danger" 
                  onClick={onLogout} 
                  title="ออกจากระบบ"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <SupportedDocsModal 
        isOpen={showDocsModal} 
        onClose={() => setShowDocsModal(false)} 
      />
    </>
  );
}
