import { useState, useEffect } from 'react';
import { checkExtensionInstalled, subscribeExtensionReady } from '../utils/extensionBridge';
import './ExtensionGate.css';

export default function ExtensionGate({ onUnlocked, theme = 'light', onToggleTheme }) {
  const [checking, setChecking] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);

  useEffect(() => {
    // 1. Initial check
    checkExtensionInstalled(1200).then((isOk) => {
      setInstalled(isOk);
      setChecking(false);
      if (isOk && onUnlocked) onUnlocked();
    });

    // 2. Continuous subscription (fires when extension is installed while page is open)
    const unsubscribe = subscribeExtensionReady(() => {
      setInstalled(true);
      if (onUnlocked) onUnlocked();
    });

    // 3. Periodic polling every 2 seconds
    const interval = setInterval(() => {
      if (!installed) {
        checkExtensionInstalled(500).then((isOk) => {
          if (isOk) {
            setInstalled(true);
            if (onUnlocked) onUnlocked();
          }
        });
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [installed, onUnlocked]);

  const handleManualCheck = async () => {
    setManualCheckLoading(true);
    const isOk = await checkExtensionInstalled(1500);
    setInstalled(isOk);
    setManualCheckLoading(false);
    if (isOk && onUnlocked) onUnlocked();
  };

  if (checking) {
    return (
      <div className="gate-screen">
        <div className="gate-card checking-card">
          <div className="gate-spinner"></div>
          <h2>กำลังตรวจสอบระบบ C2DPost Helper...</h2>
          <p>กรุณารอสักครู่ ระบบกำลังตรวจจับการเชื่อมต่อกับส่วนขยายบราวเซอร์</p>
        </div>
      </div>
    );
  }

  if (installed) {
    return null; // Unlocked!
  }

  return (
    <div className="gate-screen">
      <div className="gate-card">
        {onToggleTheme && (
          <button 
            type="button" 
            className="gate-theme-toggle" 
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง (Light Mode)' : 'เปลี่ยนเป็นธีมมืด (Dark Mode)'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        )}

        <div className="gate-badge-lock">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <div className="gate-header">
          <span className="gate-tag">จำเป็นต้องติดตั้งส่วนขยาย</span>
          <h1>ติดตั้ง C2DPost Helper ก่อนเข้าใช้งาน</h1>
          <p>
            เนื่องจากระบบดึงหมายเลขบาร์โค้ดของไปรษณีย์ไทย (PostOne) กำหนดให้ต้องเชื่อมต่อด้วย <strong>IP ประเทศไทย</strong> 
            ระบบจึงจำเป็นต้องให้ท่านติดตั้งส่วนขยาย Chrome Extension ขนาดเล็กนี้ เพื่อให้เครื่องของท่านเป็นตัวกลางดึงหมายเลขบาร์โค้ดได้อย่างสมบูรณ์
          </p>
        </div>

        <div className="gate-actions-container">
          {/* Option 1: Chrome Web Store (Official) */}
          <div className="action-card official-store">
            <div className="action-card-header">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="store-icon">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="4"/>
                <line x1="21.17" y1="8" x2="12" y2="8"/>
                <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
                <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
              </svg>
              <div>
                <strong>ทางเลือกที่ 1: Chrome Web Store (ทางการ)</strong>
                <p>คลิกเดียวติดตั้งลง Chrome ได้เลย (เปิดใช้งานทันทีหลัง Google อนุมัติ)</p>
              </div>
            </div>
            <a 
              href="https://chromewebstore.google.com/detail/cdkmibacceaacdiopcekkmfifaocapgk" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-store-link"
            >
              ดูหน้าส่วนขยายบน Chrome Web Store
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>

          {/* Option 2: Immediate ZIP Install */}
          <div className="action-card zip-install">
            <div className="action-card-header">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="zip-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <div>
                <strong>ทางเลือกที่ 2: ติดตั้งผ่านไฟล์ .ZIP (ไม่ต้องรออนุมัติ)</strong>
                <p>ดาวน์โหลดและติดตั้งในโหมดนักพัฒนา ใช้งานได้ทันทีในปัจจุบัน</p>
              </div>
            </div>
            <a 
              href="/c2dpost-extension.zip" 
              download="c2dpost-extension.zip"
              className="btn-download-ext"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              ดาวน์โหลดไฟล์ C2DPost Helper (.zip)
            </a>
          </div>
        </div>

        <div className="gate-steps">
          <h3>วิธีติดตั้งผ่านไฟล์ .ZIP ใน 3 ขั้นตอน:</h3>
          <div className="steps-grid">
            <div className="step-item">
              <div className="step-num">1</div>
              <div className="step-content">
                <strong>ดาวน์โหลดและแตกไฟล์</strong>
                <p>กดปุ่มดาวน์โหลดไฟล์ .ZIP ด้านบน แล้วทำการ <em>แตกไฟล์ (Extract ZIP)</em> ไว้ในโฟลเดอร์ที่สะดวก (เช่น Desktop หรือ Documents)</p>
              </div>
            </div>

            <div className="step-item">
              <div className="step-num">2</div>
              <div className="step-content">
                <strong>เปิดหน้าจัดการส่วนขยายของ Chrome</strong>
                <p>
                  เปิดแท็บใหม่ใน Google Chrome ไปที่ <code>chrome://extensions</code> แล้วเปิดสวิตช์ <strong>"โหมดนักพัฒนา" (Developer mode)</strong> ที่มุมบนขวา
                </p>
                <button 
                  type="button" 
                  className="btn-copy-link"
                  onClick={() => {
                    navigator.clipboard?.writeText('chrome://extensions');
                    alert('คัดลอก chrome://extensions แล้ว! นำไปวางในช่อง URL ของแท็บใหม่ได้เลยครับ');
                  }}
                >
                  📋 คัดลอกลิงก์ chrome://extensions
                </button>
              </div>
            </div>

            <div className="step-item">
              <div className="step-num">3</div>
              <div className="step-content">
                <strong>โหลดโฟลเดอร์ส่วนขยาย</strong>
                <p>
                  กดปุ่ม <strong>"โหลดส่วนขยายที่คลายการบีบอัดแล้ว" (Load unpacked)</strong> ที่มุมบนซ้าย แล้วเลือกโฟลเดอร์ที่แตกไฟล์ไว้
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="gate-footer">
          <button 
            type="button" 
            className="btn-recheck"
            onClick={handleManualCheck}
            disabled={manualCheckLoading}
          >
            {manualCheckLoading ? (
              <>
                <span className="btn-spinner"></span> กำลังตรวจสอบ...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                ติดตั้งเสร็จแล้ว คลิกเพื่อตรวจสอบอีกครั้ง
              </>
            )}
          </button>
          <div className="auto-detect-hint">
            <span className="pulse-dot"></span>
            ระบบกำลังตรวจจับอัตโนมัติ ทันทีที่ติดตั้งเสร็จหน้านี้จะเปิดให้อัตโนมัติทันที
          </div>
        </div>
      </div>
    </div>
  );
}
