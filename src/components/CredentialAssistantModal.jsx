import { useState, useEffect } from 'react';
import './CredentialAssistantModal.css';

export default function CredentialAssistantModal({
  isOpen,
  onClose,
  service = 'dpost', // 'dpost' | 'ear'
  currentPerson,
  extensionInstalled = true,
  onReopen
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const isDPost = service === 'dpost';
  const serviceName = isDPost ? 'DPost' : 'e-AR';
  const serviceDesc = isDPost 
    ? 'ระบบอัปโหลดข้อมูลฝากส่งไปรษณีย์ (Thailand Post DPost)'
    : 'ระบบตรวจสอบใบตอบรับอิเล็กทรอนิกส์ (Thailand Post e-AR)';
  const targetUrl = isDPost 
    ? 'https://dpost.thailandpost.com'
    : 'https://e-ar.thailandpost.com/sign-in';

  const username = currentPerson?.UserName || '';
  const password = currentPerson?.Password || '';

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyUser = async () => {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(username);
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleCopyPass = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="credential-modal-backdrop" onClick={onClose}>
      <div 
        className="credential-modal-dialog" 
        onClick={(e) => e.stopPropagation()}
        role="dialog" 
        aria-modal="true"
        aria-labelledby="cred-modal-title"
      >
        {/* Header with service styling */}
        <div className={`credential-modal-header ${isDPost ? 'header-dpost' : 'header-ear'}`}>
          <div className="cred-header-icon-box">
            {isDPost ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            )}
          </div>
          <div className="cred-header-text">
            <div className="cred-badge-service">เชื่อมต่อบริการภายนอก</div>
            <h2 id="cred-modal-title" className="cred-header-title">ข้อมูลเข้าสู่ระบบ {serviceName}</h2>
            <p className="cred-header-sub">{serviceDesc}</p>
          </div>
          <button 
            type="button" 
            className="cred-btn-close" 
            onClick={onClose}
            title="ปิดหน้าต่าง (Esc)"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="credential-modal-body">
          {/* Extension Auto-fill Status Card */}
          {extensionInstalled ? (
            <div className="cred-status-card status-active">
              <div className="cred-status-icon-wrap">
                <span className="cred-status-pulse"></span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div className="cred-status-content">
                <strong>ระบบช่วยกรอกอัตโนมัติ (Auto-fill) พร้อมทำงาน</strong>
                <p>ส่วนขยาย C2DPost Helper v1.1.0 จะช่วยนำ Username และ Password ไปกรอกในหน้าเว็บ {serviceName} ในแท็บใหม่ให้อัตโนมัติ</p>
              </div>
            </div>
          ) : (
            <div className="cred-status-card status-guide">
              <div className="cred-status-icon-wrap guide-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div className="cred-status-content">
                <strong>คัดลอกข้อมูลเพื่อวางในหน้า {serviceName}</strong>
                <p>กดปุ่มคัดลอกด้านล่างเพื่อนำไปวาง หรือติดตั้งส่วนขยาย C2DPost Helper เพื่อให้ระบบกรอกอัตโนมัติทุกครั้ง</p>
              </div>
            </div>
          )}

          {/* Credentials Display & Copy Row */}
          <div className="cred-fields-grid">
            {/* Username Field */}
            <div className="cred-field-card">
              <div className="cred-field-meta">
                <label htmlFor="cred-display-user" className="cred-field-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>ชื่อผู้ใช้งาน (Username)</span>
                </label>
                <span className="cred-field-tag">ไปรษณีย์ไทย</span>
              </div>
              <div className="cred-input-action-group">
                <input 
                  id="cred-display-user"
                  type="text" 
                  readOnly 
                  value={username} 
                  className="cred-readonly-input"
                  onClick={(e) => e.target.select()}
                />
                <button 
                  type="button" 
                  className={`btn-cred-copy ${copiedUser ? 'copied' : ''}`}
                  onClick={handleCopyUser}
                  title="คัดลอกชื่อผู้ใช้"
                >
                  {copiedUser ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span>คัดลอก</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Password Field */}
            <div className="cred-field-card">
              <div className="cred-field-meta">
                <label htmlFor="cred-display-pass" className="cred-field-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <span>รหัสผ่าน (Password)</span>
                </label>
                <button
                  type="button"
                  className="cred-btn-toggle-eye"
                  onClick={() => setShowPassword(prev => !prev)}
                  title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                      <span>ซ่อน</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      <span>ดูรหัส</span>
                    </>
                  )}
                </button>
              </div>
              <div className="cred-input-action-group">
                <input 
                  id="cred-display-pass"
                  type={showPassword ? 'text' : 'password'} 
                  readOnly 
                  value={password} 
                  className="cred-readonly-input font-mono"
                  onClick={(e) => e.target.select()}
                />
                <button 
                  type="button" 
                  className={`btn-cred-copy ${copiedPass ? 'copied' : ''}`}
                  onClick={handleCopyPass}
                  title="คัดลอกรหัสผ่าน"
                >
                  {copiedPass ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span>คัดลอก</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="credential-modal-footer">
          <button 
            type="button" 
            className="cred-btn-secondary" 
            onClick={onClose}
          >
            ปิดหน้าต่าง
          </button>

          <a 
            href={targetUrl} 
            target="_blank" 
            rel="noreferrer"
            className="cred-btn-primary"
            onClick={() => {
              if (onReopen) onReopen();
            }}
          >
            <span>เปิดหน้า {serviceName} ในแท็บใหม่</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
