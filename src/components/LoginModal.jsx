import { useState } from 'react';
import RegistrationModal from './RegistrationModal';
import './LoginModal.css';

export default function LoginModal({ onLogin, people = [], loading = false, error = false }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setAuthError('');

    const u = username.trim();
    const p = password;

    if (!u || !p) {
      setAuthError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }

    setSubmitting(true);

    // Look up in people list from Google Sheets
    const matched = people.find(
      (person) =>
        (person.UserName || '').trim().toLowerCase() === u.toLowerCase() &&
        (person.Password || '') === p
    );

    if (matched) {
      const status = (matched.Status || '').trim().toUpperCase();
      if (status === 'DOL' || status === 'ADMIN' || status === 'ADMINISTRATOR') {
        onLogin(matched.UserName, matched);
      } else {
        setAuthError('คุณไม่มีสิทธิ์เข้าถึงระบบ (Status ไม่ใช่ DOL หรือ ADMIN)');
      }
    } else {
      setAuthError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }

    setSubmitting(false);
  };

  return (
    <div className="login-modal-overlay">
      <div className="login-wrapper">
        <div className="login-modal-card">
          <div className="login-brand">
            <img src="/logo.png" alt="C2DPost Logo" className="login-logo-img" />
            <h2 className="login-title-green">C2DPost Login</h2>
          </div>

          {error && (
            <div className="login-alert error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ไม่สามารถเชื่อมต่อฐานข้อมูล Google Sheets ได้ กรุณารีเฟรชหน้าเว็บ
            </div>
          )}

          {authError && (
            <div className="login-alert error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="login-username">Username (ชื่อผู้ใช้งาน)</label>
              <div className="input-wrap">
                <input
                  id="login-username"
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password (รหัสผ่าน)</label>
              <div className="input-wrap password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-toggle-pwd"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-submit-login"
              disabled={loading || submitting}
            >
              {loading ? 'กำลังโหลดข้อมูลสิทธิ์...' : submitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* Links Row matching Python app */}
          <div className="login-links-row">
            <button
              type="button"
              className="login-link-btn"
              onClick={() => setShowRegister(true)}
            >
              ลงทะเบียนขอสิทธิ์การใช้งาน
            </button>
            <span className="login-link-sep">|</span>
            <a
              href="https://canva.link/dyl3brb47lyph8r"
              target="_blank"
              rel="noopener noreferrer"
              className="login-link-btn"
            >
              คู่มือการใช้งาน
            </a>
            <span className="login-link-sep">|</span>
            <a
              href="https://lin.ee/UzWqlKP"
              target="_blank"
              rel="noopener noreferrer"
              className="login-link-btn"
            >
              ติดต่อเจ้าหน้าที่
            </a>
          </div>
        </div>
      </div>

      {/* Registration Modal */}
      <RegistrationModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
      />
    </div>
  );
}
