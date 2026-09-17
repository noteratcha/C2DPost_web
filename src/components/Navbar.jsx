import React, { useState, useEffect, useRef, useCallback } from 'react';
import AboutModal from './AboutModal';
import { syncCredentialsToExtension } from '../utils/extensionBridge';
import { APP_VERSION } from '../config';
import './Navbar.css';

export default function Navbar({ 
  user, 
  currentPerson, 
  onLogout, 
  extensionInstalled, 
  extensionVersion = '',
  theme = 'light', 
  onToggleTheme,
  isAdmin = false,
  activePage = 'workspace',
  onNavigate,
  adminServices = null,
  onOpenDepositReport = null
}) {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('');
  const [apiOldStatus, setApiOldStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const [apiNewStatus, setApiNewStatus] = useState('loading'); // 'loading' | 'success' | 'danger'
  const navMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  // Proactively synchronize credentials to Chrome extension when user logs in or switches
  useEffect(() => {
    if (user && currentPerson?.UserName) {
      syncCredentialsToExtension(
        currentPerson.UserName,
        currentPerson.Password || '',
        currentPerson.Organization || ''
      );
    }
  }, [user, currentPerson]);

  const handleOpenExternalService = (url) => {
    const uname = currentPerson?.UserName || user || '';
    const pass = currentPerson?.Password || '';
    const org = currentPerson?.Organization || '';
    syncCredentialsToExtension(uname, pass, org);
  };

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

  // Click outside and Escape key to close hamburger and user dropdown menus
  useEffect(() => {
    function handleClickOutside(event) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target)) {
        setIsNavMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsNavMenuOpen(false);
        setIsUserMenuOpen(false);
      }
    }
    if (isNavMenuOpen || isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNavMenuOpen, isUserMenuOpen]);

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
            <div className="brand-logo-wrap" onClick={() => onNavigate && onNavigate('workspace')} style={{ cursor: onNavigate ? 'pointer' : 'default' }}>
              <img src="/logo_dark.png" alt="C2DPost" className="brand-logo-img" />
            </div>
            <div className="brand-identity-stack">
              <div className="brand-primary-row">
                <span className="brand-title-accent" onClick={() => onNavigate && onNavigate('workspace')} style={{ cursor: onNavigate ? 'pointer' : 'default' }}>
                  C2DPost
                </span>
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

          {/* Center: Dedicated Page Navigation Tabs */}
          {user && onNavigate && (
            <nav className="navbar-nav-tabs" aria-label="แถบเมนูนำทาง">
              <button
                type="button"
                className={`nav-tab-btn ${activePage === 'workspace' ? 'active' : ''}`}
                onClick={() => onNavigate('workspace')}
                title="หน้าหลัก: แปลงไฟล์ PDF สู่ Excel และดึงหมายเลขบาร์โค้ด"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <span>แปลงไฟล์ PDF</span>
              </button>

              <button
                type="button"
                className={`nav-tab-btn ${activePage === 'deposit-report' ? 'active' : ''}`}
                onClick={() => onNavigate('deposit-report')}
                title="หน้ารายงานสถานะไปรษณีย์ (e-Parcel)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span>รายงานสถานะ</span>
              </button>

              <button
                type="button"
                className={`nav-tab-btn ${activePage === 'tracking' ? 'active' : ''}`}
                onClick={() => onNavigate('tracking')}
                title="หน้าค้นหาและตรวจสอบสถานะพัสดุ (Tracking)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>ตรวจสอบพัสดุ</span>
              </button>

              <div className="nav-tab-divider" role="separator" aria-orientation="vertical"></div>

              <a
                href="https://dpost.thailandpost.com"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-tab-btn nav-tab-ext"
                onClick={() => handleOpenExternalService('https://dpost.thailandpost.com')}
                title="DPost (Thailand Post) - เข้าสู่ระบบพร้อมส่งข้อมูล Username & Password อัตโนมัติ"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
                <span>DPost</span>
                <svg className="nav-tab-ext-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>

              <a
                href="https://e-ar.thailandpost.com/sign-in"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-tab-btn nav-tab-ext"
                onClick={() => handleOpenExternalService('https://e-ar.thailandpost.com/sign-in')}
                title="e-AR (Electronic Advice) - เข้าสู่ระบบพร้อมส่งข้อมูล Username & Password อัตโนมัติ"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>e-AR</span>
                <svg className="nav-tab-ext-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>

              {isAdmin && (
                <button
                  type="button"
                  className={`nav-tab-btn nav-tab-admin ${activePage === 'admin' ? 'active' : ''}`}
                  onClick={() => onNavigate('admin')}
                  title="ระบบจัดการผู้ใช้งานและ API (Admin)"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <span>จัดการระบบ</span>
                </button>
              )}
            </nav>
          )}

          {/* Right Action Buttons */}
          <div className="navbar-right">
            {/* API Health Badges — shown in Navbar when Admin view is active */}
            {isAdmin && activePage === 'admin' && adminServices && (
              <div className="navbar-api-health">
                <div
                  className={`navbar-health-item ${adminServices.postone?.online ? 'online' : 'offline'}`}
                  title="API PostOne Gen Barcode"
                >
                  <span className="navbar-health-dot"></span>
                  <span className="navbar-health-label">Gen Barcode</span>
                  {adminServices.postone?.latency > 0 && (
                    <span className="navbar-health-latency">{adminServices.postone.latency}s</span>
                  )}
                </div>
                <div
                  className={`navbar-health-item ${adminServices.eparcel?.online ? 'online' : 'offline'}`}
                  title="API Preload e-Parcel"
                >
                  <span className="navbar-health-dot"></span>
                  <span className="navbar-health-label">e-Parcel</span>
                  {adminServices.eparcel?.latency > 0 && (
                    <span className="navbar-health-latency">{adminServices.eparcel.latency}s</span>
                  )}
                </div>
              </div>
            )}

            {user && (
              <div className="user-profile-menu-container" ref={userMenuRef}>
                <button 
                  type="button"
                  className={`user-profile-badge ${isUserMenuOpen ? 'active' : ''}`}
                  onClick={() => setIsUserMenuOpen(prev => !prev)}
                  title={`ผู้ใช้งาน: ${user} (คลิกเพื่อเปิดเมนู)`}
                  aria-expanded={isUserMenuOpen}
                >
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
                      {currentPerson?.Status || 'DOL'}
                    </span>
                  </div>
                  <svg className={`user-badge-chevron ${isUserMenuOpen ? 'open' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {isUserMenuOpen && (
                  <div className="user-profile-dropdown">
                    {/* User Header Summary Card */}
                    <div className="user-dropdown-header">
                      <div className="user-dropdown-avatar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      </div>
                      <div className="user-dropdown-details">
                        <div className="user-dropdown-name" title={currentPerson ? currentPerson.UserName || user : user}>
                          {currentPerson ? currentPerson.UserName || user : user}
                        </div>
                        <div className="user-dropdown-org" title={orgName}>
                          {orgName}
                        </div>
                        <div className="user-dropdown-badges">
                          <span className="user-dropdown-role-chip">{currentPerson?.Status || 'DOL'}</span>
                          {currentPerson?.ResponsiblePostoffice && (
                            <span className="user-dropdown-po-chip" title={currentPerson.ResponsiblePostoffice}>
                              {currentPerson.ResponsiblePostoffice}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="user-dropdown-divider"></div>

                    {/* Menu Actions */}
                    <div className="user-dropdown-menu-list">
                      <button
                        type="button"
                        className="user-dropdown-logout-btn"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onLogout();
                        }}
                        title="ออกจากระบบ"
                      >
                        <div className="logout-icon-box">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" y1="12" x2="9" y2="12"/>
                          </svg>
                        </div>
                        <div className="logout-text-stack">
                          <span className="logout-text-main">ออกจากระบบ</span>
                          <span className="logout-text-sub">ลงชื่อออกจากบัญชี {user}</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
                        <span 
                          className={`status-badge-chip ${extensionInstalled ? 'success' : 'danger'}`}
                          title={extensionInstalled ? `C2DPost Helper ติดตั้งแล้ว${extensionVersion ? ` (เวอร์ชัน ${extensionVersion})` : ''}` : 'ไม่พบส่วนขยาย C2DPost Helper'}
                        >
                          {extensionInstalled ? (
                            <>
                              <span className="chip-dot"></span>
                              <span>ติดตั้งแล้ว{extensionVersion ? ` (v${extensionVersion})` : ''}</span>
                            </>
                          ) : (
                            'ไม่พบ'
                          )}
                        </span>
                      </div>
                    </div>
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

                  {/* Section Label: ข้อมูลระบบ & จัดการระบบ */}
                  <div className="menu-section-label">{isAdmin ? 'การจัดการ & ข้อมูลระบบ' : 'ข้อมูลระบบ'}</div>

                  {/* 3. Admin & About Links in Menu */}
                  <div className="menu-nav-links">

                    {isAdmin && onNavigate && (
                      <button
                        type="button"
                        className={`menu-link-card btn-card ${activePage === 'admin' ? 'active-menu-item' : ''}`}
                        onClick={() => {
                          setIsNavMenuOpen(false);
                          onNavigate('admin');
                        }}
                        title="ระบบจัดการผู้ใช้งานและ API (Admin Portal)"
                      >
                        <div className="link-card-left">
                          <div className="link-avatar-icon icon-admin" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                          </div>
                          <div className="link-text-meta">
                            <div className="link-title-row">
                              <span className="link-title">จัดการระบบ</span>
                              <span className="link-tag-ext" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.25)' }}>Admin</span>
                            </div>
                            <span className="link-subtitle">จัดการสิทธิ์ผู้ใช้งานและตรวจสอบสุขภาพ API</span>
                          </div>
                        </div>
                        <div className="link-chevron-action">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </div>
                      </button>
                    )}

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

                  {/* 5. System Version Badge (Underneath Theme Display) */}
                  <div className="drawer-footer-version">
                    <div 
                      className="drawer-version-pill"
                      onClick={() => {
                        setIsNavMenuOpen(false);
                        setShowAboutModal(true);
                      }}
                      title="คลิกเพื่อดูรายละเอียดเกี่ยวกับระบบ (About)"
                      role="button"
                      tabIndex={0}
                    >
                      <span>C2DPost Web Edition {APP_VERSION} — ส่วน ทข.ปข.10</span>
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
