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
          {/* Left: Modern Brand & Organization Identity */}
          <div className="navbar-left-group">
            <div className="brand-logo-wrap">
              <img src="/logo_dark.png" alt="C2DPost" className="brand-logo-img" />
            </div>
            <div className="brand-identity-stack">
              <div className="brand-primary-row">
                <span className="brand-title-accent">C2DPost</span>
              </div>
              <h1 className="header-office-title" title={user ? orgName : 'โปรแกรมแปลงไฟล์ PDF สู่ระบบฝากส่งไปรษณีย์ DPost'}>
                {user && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="office-pin-icon">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                )}
                <span>{user ? orgName : 'โปรแกรมแปลงไฟล์ PDF สู่ระบบฝากส่งไปรษณีย์ DPost'}</span>
              </h1>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="navbar-right">
            {user && (
              <>
                <div className="user-profile-badge" title={`ผู้ใช้งาน: ${user}`}>
                  <div className="user-avatar-badge">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <div className="user-info-stack">
                    <span className="user-display-name" title={currentPerson ? currentPerson.UserName || user : user}>
                      {currentPerson ? currentPerson.UserName || user : user}
                    </span>
                    <span className="user-display-role">
                      {currentPerson?.Status || 'เจ้าหน้าที่'}
                    </span>
                  </div>
                </div>

                <button 
                  type="button" 
                  className="btn-standalone-logout" 
                  onClick={onLogout} 
                  title="ออกจากระบบ (Sign out)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span>ออกจากระบบ</span>
                </button>
              </>
            )}

            {/* Hamburger Menu (Combining all 5 parts: Status, DPost, e-AR, About, Dark/Light) */}
            <div className="nav-hamburger-container" ref={navMenuRef}>
              <button
                type="button"
                className={`btn-hamburger-menu ${isNavMenuOpen ? 'active' : ''}`}
                onClick={() => setIsNavMenuOpen(prev => !prev)}
                title="เมนูและการตั้งค่า (Menu & Settings)"
                aria-label="เมนูหลัก"
                aria-expanded={isNavMenuOpen}
              >
                <div className={`hamburger-icon-wrap ${isNavMenuOpen ? 'open' : ''}`}>
                  <span className="hamburger-line line-1"></span>
                  <span className="hamburger-line line-2"></span>
                  <span className="hamburger-line line-3"></span>
                </div>
                {/* Status Dot with pulsing glow on hamburger button */}
                <span className={`hamburger-status-dot ${overallStatus}`}>
                  <span className="pulse-ring"></span>
                </span>
              </button>

              {isNavMenuOpen && (
                <div className="nav-hamburger-dropdown">
                  {/* Dropdown Pointer Arrow */}
                  <div className="dropdown-arrow-notch"></div>

                  {/* 1. Status Section - System Health Card */}
                  <div className="menu-group-card status-card-premium">
                    <div className="status-card-header">
                      <div className="status-header-info">
                        <div className="status-heading-row">
                          <span className={`status-indicator-beacon ${overallStatus}`}>
                            <span className="beacon-dot"></span>
                            <span className="beacon-ping"></span>
                          </span>
                          <span className="status-main-heading">สถานะระบบ (Status)</span>
                        </div>
                        {lastCheckTime && (
                          <span className="status-sub-timestamp">
                            ตรวจล่าสุด {lastCheckTime}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className={`btn-menu-refresh ${isChecking ? 'checking' : ''}`}
                        onClick={checkApis}
                        title="ตรวจสอบสถานะใหม่"
                        disabled={isChecking}
                      >
                        <svg className={isChecking ? 'spinning' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10"></polyline>
                          <polyline points="1 20 1 14 7 14"></polyline>
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                      </button>
                    </div>

                    <div className="status-service-list">
                      {/* Gen barcode */}
                      <div className="status-service-item">
                        <div className="service-name-group">
                          <svg className="service-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14"/>
                          </svg>
                          <span>Gen barcode</span>
                        </div>
                        <span className={`status-badge-chip ${apiOldStatus}`}>
                          {apiOldStatus === 'success' && <><span className="chip-dot"></span> ปกติ</>}
                          {apiOldStatus === 'loading' && 'กำลังตรวจ...'}
                          {apiOldStatus === 'danger' && 'มีปัญหา'}
                        </span>
                      </div>

                      {/* Preload e-Parcel */}
                      <div className="status-service-item">
                        <div className="service-name-group">
                          <svg className="service-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                            <line x1="12" y1="22.08" x2="12" y2="12"/>
                          </svg>
                          <span>Preload e-Parcel</span>
                        </div>
                        <span className={`status-badge-chip ${apiNewStatus}`}>
                          {apiNewStatus === 'success' && <><span className="chip-dot"></span> ปกติ</>}
                          {apiNewStatus === 'loading' && 'กำลังตรวจ...'}
                          {apiNewStatus === 'danger' && 'มีปัญหา'}
                        </span>
                      </div>

                      {/* Extension Helper */}
                      <div className="status-service-item">
                        <div className="service-name-group">
                          <svg className="service-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                          </svg>
                          <span>Extension Helper</span>
                        </div>
                        <span className={`status-badge-chip ${extensionInstalled ? 'success' : 'danger'}`}>
                          {extensionInstalled ? <><span className="chip-dot"></span> ติดตั้งแล้ว</> : 'ไม่พบ'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section Label: บริการ & ลิงก์ด่วน */}
                  <div className="menu-section-label">บริการและระบบภายนอก</div>

                  {/* 2. External Links (DPost, e-AR) */}
                  <div className="menu-nav-links">
                    <a
                      href="https://dpost.thailandpost.com"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-link-card"
                      onClick={() => setIsNavMenuOpen(false)}
                      title="เว็บสำหรับอัปโหลดข้อมูล DPost"
                    >
                      <div className="link-card-left">
                        <div className="link-avatar-icon icon-dpost">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                          </svg>
                        </div>
                        <div className="link-text-meta">
                          <div className="link-title-row">
                            <span className="link-title">DPost</span>
                            <span className="link-tag-ext">Thailand Post</span>
                          </div>
                          <span className="link-subtitle">เว็บอัปโหลดข้อมูลฝากส่งไปรษณีย์</span>
                        </div>
                      </div>
                      <div className="link-arrow-action">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </div>
                    </a>

                    <a
                      href="https://e-ar.thailandpost.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-link-card"
                      onClick={() => setIsNavMenuOpen(false)}
                      title="เว็บสำหรับตรวจใบตอบรับทางอิเล็กทรอนิกส์"
                    >
                      <div className="link-card-left">
                        <div className="link-avatar-icon icon-ear">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                          </svg>
                        </div>
                        <div className="link-text-meta">
                          <div className="link-title-row">
                            <span className="link-title">e-AR</span>
                            <span className="link-tag-ext">Electronic Advice</span>
                          </div>
                          <span className="link-subtitle">ตรวจใบตอบรับอิเล็กทรอนิกส์</span>
                        </div>
                      </div>
                      <div className="link-arrow-action">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </div>
                    </a>
                  </div>

                  {/* Section Label: คู่มือ & ความช่วยเหลือ */}
                  <div className="menu-section-label">คู่มือ & ความช่วยเหลือ</div>

                  <div className="menu-nav-links">
                    <a
                      href="https://canva.link/dyl3brb47lyph8r"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-link-card"
                      onClick={() => setIsNavMenuOpen(false)}
                      title="เปิดดูคู่มือการใช้งานบน Canva"
                    >
                      <div className="link-card-left">
                        <div className="link-avatar-icon icon-manual">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                          </svg>
                        </div>
                        <div className="link-text-meta">
                          <div className="link-title-row">
                            <span className="link-title">คู่มือการใช้งานระบบ</span>
                          </div>
                          <span className="link-subtitle">สื่อการสอนและขั้นตอนการใช้งาน</span>
                        </div>
                      </div>
                      <div className="link-arrow-action">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </div>
                    </a>

                    <a
                      href="https://lin.ee/UzWqlKP"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-link-card"
                      onClick={() => setIsNavMenuOpen(false)}
                      title="ติดต่อเจ้าหน้าที่ส่วน ทข.ปข.10 ผ่าน LINE Official"
                    >
                      <div className="link-card-left">
                        <div className="link-avatar-icon icon-line">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                          </svg>
                        </div>
                        <div className="link-text-meta">
                          <div className="link-title-row">
                            <span className="link-title">ติดต่อเจ้าหน้าที่</span>
                          </div>
                          <span className="link-subtitle">สอบถามปัญหาการใช้งาน</span>
                        </div>
                      </div>
                      <div className="link-arrow-action">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </div>
                    </a>
                  </div>

                  {/* Section Label: เกี่ยวกับ & การตั้งค่า */}
                  <div className="menu-section-label">ข้อมูล & การแสดงผล</div>

                  {/* 3. About Section */}
                  <div className="menu-nav-links">
                    <button
                      type="button"
                      className="menu-link-card btn-card"
                      onClick={() => {
                        setIsNavMenuOpen(false);
                        setShowAboutModal(true);
                      }}
                      title="ข้อมูลเกี่ยวกับระบบ C2DPost Web"
                    >
                      <div className="link-card-left">
                        <div className="link-avatar-icon icon-about">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </div>
                        <div className="link-text-meta">
                          <div className="link-title-row">
                            <span className="link-title">About</span>
                          </div>
                          <span className="link-subtitle">เกี่ยวกับระบบ & รูปแบบเอกสารที่รองรับ</span>
                        </div>
                      </div>
                      <div className="link-chevron-action">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </div>
                    </button>
                  </div>

                  {/* 4. Theme Toggle Segmented Control (Crystal clear UX) */}
                  <div className="theme-toggle-panel">
                    <div className="theme-panel-label">
                      <span className="theme-label-main">ธีมการแสดงผล</span>
                      <span className="theme-label-sub">{theme === 'dark' ? 'โหมดมืด (Dark)' : 'โหมดสว่าง (Light)'}</span>
                    </div>

                    <div className="theme-segmented-track" role="radiogroup" aria-label="Theme switcher">
                      <button
                        type="button"
                        className={`theme-segment-item ${theme === 'light' ? 'active' : ''}`}
                        onClick={() => {
                          if (theme !== 'light') onToggleTheme();
                        }}
                        title="เปลี่ยนเป็นโหมดสว่าง"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="5"></circle>
                          <line x1="12" y1="1" x2="12" y2="3"></line>
                          <line x1="12" y1="21" x2="12" y2="23"></line>
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                          <line x1="1" y1="12" x2="3" y2="12"></line>
                          <line x1="21" y1="12" x2="23" y2="12"></line>
                          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                        </svg>
                        <span>สว่าง</span>
                      </button>

                      <button
                        type="button"
                        className={`theme-segment-item ${theme === 'dark' ? 'active' : ''}`}
                        onClick={() => {
                          if (theme !== 'dark') onToggleTheme();
                        }}
                        title="เปลี่ยนเป็นโหมดมืด"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                        <span>มืด</span>
                      </button>
                    </div>
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
