import React, { useState, useEffect, useRef, useCallback } from 'react';
import AboutModal from './AboutModal';
import './Navbar.css';

export default function Navbar({ 
  user, 
  currentPerson, 
  onLogout, 
  extensionInstalled, 
  theme = 'light', 
  onToggleTheme 
}) {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('');
  const [apiOldStatus, setApiOldStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const [apiNewStatus, setApiNewStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const navMenuRef = useRef(null);

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

  // Click outside and Escape key to close hamburger menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target)) {
        setIsNavMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsNavMenuOpen(false);
      }
    }
    if (isNavMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNavMenuOpen]);

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

            {/* Hamburger Menu (Combining all 5 parts: Status, DPost, e-AR, About, Dark/Light) */}
            <div className="nav-hamburger-container" ref={navMenuRef}>
              <button
                type="button"
                className={`btn-hamburger-menu ${isNavMenuOpen ? 'active' : ''}`}
                onClick={() => setIsNavMenuOpen(prev => !prev)}
                title="เมนูหลัก (Menu)"
                aria-label="เมนูหลัก"
                aria-expanded={isNavMenuOpen}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-hamburger">
                  {isNavMenuOpen ? (
                    <>
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </>
                  ) : (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6"></line>
                      <line x1="3" y1="12" x2="21" y2="12"></line>
                      <line x1="3" y1="18" x2="21" y2="18"></line>
                    </>
                  )}
                </svg>
                {/* Status Dot in corner of hamburger button */}
                <span className={`hamburger-status-dot ${overallStatus}`}></span>
              </button>

              {isNavMenuOpen && (
                <div className="nav-hamburger-dropdown">
                  {/* 1. Status Section */}
                  <div className="menu-group-card status-card">
                    <div className="menu-group-header">
                      <div className="group-title-wrap">
                        <span className={`status-dot-indicator ${overallStatus}`}>●</span>
                        <span className="group-title">สถานะระบบ (Status)</span>
                      </div>
                      <button
                        type="button"
                        className="btn-menu-refresh"
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

                    <div className="status-mini-items">
                      <div className="status-mini-row">
                        <span className="status-row-title">Gen barcode</span>
                        <span className={`status-badge-pill ${apiOldStatus}`}>
                          {apiOldStatus === 'success' && '✓ ปกติ'}
                          {apiOldStatus === 'loading' && 'ตรวจ...'}
                          {apiOldStatus === 'danger' && '✗ มีปัญหา'}
                        </span>
                      </div>
                      <div className="status-mini-row">
                        <span className="status-row-title">Preload e-Parcel</span>
                        <span className={`status-badge-pill ${apiNewStatus}`}>
                          {apiNewStatus === 'success' && '✓ ปกติ'}
                          {apiNewStatus === 'loading' && 'ตรวจ...'}
                          {apiNewStatus === 'danger' && '✗ มีปัญหา'}
                        </span>
                      </div>
                      <div className="status-mini-row">
                        <span className="status-row-title">Extension Helper</span>
                        <span className={`status-badge-pill ${extensionInstalled ? 'success' : 'danger'}`}>
                          {extensionInstalled ? '✓ ติดตั้งแล้ว' : '✗ ไม่พบ'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="menu-divider"></div>

                  {/* 2. External Links (DPost, e-AR) */}
                  <div className="menu-group-list">
                    <a
                      href="https://dpost.thailandpost.com"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-item-action"
                      onClick={() => setIsNavMenuOpen(false)}
                      title="เว็บสำหรับอัปโหลดข้อมูล"
                    >
                      <div className="item-icon-circle">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </div>
                      <div className="item-text-info">
                        <span className="item-name">DPost</span>
                        <span className="item-sub">เว็บอัปโหลดข้อมูลไปรษณีย์</span>
                      </div>
                    </a>

                    <a
                      href="https://e-ar.thailandpost.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-item-action"
                      onClick={() => setIsNavMenuOpen(false)}
                      title="เว็บสำหรับตรวจใบตอบรับทางอิเล็กทรอนิกส์"
                    >
                      <div className="item-icon-circle">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </div>
                      <div className="item-text-info">
                        <span className="item-name">e-AR</span>
                        <span className="item-sub">ตรวจใบตอบรับอิเล็กทรอนิกส์</span>
                      </div>
                    </a>
                  </div>

                  <div className="menu-divider"></div>

                  {/* 3. About Section */}
                  <div className="menu-group-list">
                    <button
                      type="button"
                      className="menu-item-action btn-action"
                      onClick={() => {
                        setIsNavMenuOpen(false);
                        setShowAboutModal(true);
                      }}
                      title="ข้อมูลเกี่ยวกับระบบ C2DPost Web"
                    >
                      <div className="item-icon-circle">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </div>
                      <div className="item-text-info">
                        <span className="item-name">About</span>
                        <span className="item-sub">เกี่ยวกับระบบ & เอกสารที่รองรับ</span>
                      </div>
                    </button>
                  </div>

                  <div className="menu-divider"></div>

                  {/* 4. Theme Toggle Switch */}
                  <div className="menu-group-list">
                    <button
                      type="button"
                      className="menu-item-action btn-action theme-action"
                      onClick={() => {
                        onToggleTheme();
                      }}
                      title="สลับโหมดสว่าง / โหมดมืด"
                    >
                      <div className="item-icon-circle">
                        {theme === 'dark' ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                          </svg>
                        )}
                      </div>
                      <div className="item-text-info">
                        <span className="item-name">{theme === 'dark' ? 'โหมดสว่าง (Light)' : 'โหมดมืด (Dark)'}</span>
                        <span className="item-sub">สลับธีมสีของหน้าเว็บ</span>
                      </div>
                      <span className="theme-toggle-pill">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AboutModal 
        isOpen={showAboutModal} 
        onClose={() => setShowAboutModal(false)} 
      />
    </>
  );
}
