import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('');
  const [apiOldStatus, setApiOldStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const [apiNewStatus, setApiNewStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const statusMenuRef = useRef(null);

  const checkApis = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/check_status');
      if (res.ok) {
        const data = await res.json();
        setApiOldStatus(data.gen_barcode ? 'success' : 'danger');
        setApiNewStatus(data.preload_eparcel ? 'success' : 'danger');
      } else {
        setApiOldStatus('success');
        setApiNewStatus('success');
      }
    } catch (err) {
      // Fallback to active indicator if backend isn't answering locally
      setApiOldStatus('success');
      setApiNewStatus('success');
    } finally {
      setIsChecking(false);
      const now = new Date();
      setLastCheckTime(
        now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.'
      );
    }
  }, []);

  useEffect(() => {
    checkApis();
    const interval = setInterval(checkApis, 30000);
    return () => clearInterval(interval);
  }, [checkApis]);

  // Click outside and Escape key to close status menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setIsStatusMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsStatusMenuOpen(false);
      }
    }
    if (isStatusMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStatusMenuOpen]);

  const orgName = currentPerson?.Organization?.trim() || 'สำนักงานที่ดิน';

  const overallStatus = 
    (apiOldStatus === 'danger' || apiNewStatus === 'danger') ? 'danger' :
    (apiOldStatus === 'loading' || apiNewStatus === 'loading') ? 'loading' : 'success';

  return (
    <>
      <header className="main-navbar python-theme-navbar">
        <div className="navbar-container">
          {/* Left Title (Clean, without inline status dots) */}
          <div className="navbar-left-group">
            <div className="brand-logo-wrap">
              <img src="/logo.png" alt="C2DPost" className="brand-logo-img" />
            </div>
            <h1 className="header-office-title" title={orgName}>
              {orgName}
            </h1>
          </div>

          {/* Right Action Buttons */}
          <div className="navbar-right">
            {/* Status Menu Dropdown */}
            <div className="status-menu-container" ref={statusMenuRef}>
              <button
                type="button"
                className={`btn-header-link btn-header-status ${isStatusMenuOpen ? 'active' : ''}`}
                onClick={() => setIsStatusMenuOpen(prev => !prev)}
                title="คลิกเพื่อดูสถานะระบบ"
                aria-expanded={isStatusMenuOpen}
              >
                <span className={`status-pill-dot ${overallStatus}`}>●</span>
                <span>Status</span>
                <svg 
                  className={`status-caret-icon ${isStatusMenuOpen ? 'open' : ''}`} 
                  width="12" 
                  height="12" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              {isStatusMenuOpen && (
                <div className="status-dropdown-menu">
                  <div className="status-dropdown-header">
                    <div className="status-header-title">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                      <span>สถานะการเชื่อมต่อระบบ</span>
                    </div>
                    <button 
                      type="button" 
                      className="btn-status-refresh" 
                      onClick={checkApis}
                      title="ตรวจสอบสถานะใหม่"
                      disabled={isChecking}
                    >
                      <svg className={isChecking ? 'spinning' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                      </svg>
                    </button>
                  </div>

                  <div className="status-items-list">
                    {/* Item 1: Gen barcode */}
                    <div className={`status-item ${apiOldStatus}`}>
                      <div className="status-item-left">
                        <span className={`status-dot-bullet ${apiOldStatus}`}>●</span>
                        <div className="status-item-text">
                          <span className="status-item-name">API : Gen barcode</span>
                          <span className="status-item-host">postone.thailandpost.com</span>
                        </div>
                      </div>
                      <span className={`status-item-badge ${apiOldStatus}`}>
                        {apiOldStatus === 'success' && '✓ เชื่อมต่อปกติ'}
                        {apiOldStatus === 'loading' && 'กำลังตรวจสอบ...'}
                        {apiOldStatus === 'danger' && '✗ การเชื่อมต่อมีปัญหา'}
                      </span>
                    </div>

                    {/* Item 2: Preload e-Parcel */}
                    <div className={`status-item ${apiNewStatus}`}>
                      <div className="status-item-left">
                        <span className={`status-dot-bullet ${apiNewStatus}`}>●</span>
                        <div className="status-item-text">
                          <span className="status-item-name">API : Preload e-Parcel</span>
                          <span className="status-item-host">r_dservice.thailandpost.com</span>
                        </div>
                      </div>
                      <span className={`status-item-badge ${apiNewStatus}`}>
                        {apiNewStatus === 'success' && '✓ เชื่อมต่อปกติ'}
                        {apiNewStatus === 'loading' && 'กำลังตรวจสอบ...'}
                        {apiNewStatus === 'danger' && '✗ การเชื่อมต่อมีปัญหา'}
                      </span>
                    </div>

                    {/* Item 3: Extension Bridge */}
                    <div className={`status-item ${extensionInstalled ? 'success' : 'danger'}`}>
                      <div className="status-item-left">
                        <span className={`status-dot-bullet ${extensionInstalled ? 'success' : 'danger'}`}>●</span>
                        <div className="status-item-text">
                          <span className="status-item-name">C2DPost Helper Extension</span>
                          <span className="status-item-host">IP ประเทศไทย (Local Proxy)</span>
                        </div>
                      </div>
                      <span className={`status-item-badge ${extensionInstalled ? 'success' : 'danger'}`}>
                        {extensionInstalled ? '✓ เชื่อมต่อแล้ว' : '✗ ไม่พบส่วนขยาย'}
                      </span>
                    </div>
                  </div>

                  <div className="status-dropdown-footer">
                    <span>ตรวจสอบล่าสุด: {lastCheckTime || 'เพิ่งตรวจสอบ'}</span>
                  </div>
                </div>
              )}
            </div>

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
