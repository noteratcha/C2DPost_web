import React, { useState } from 'react';
import { detectBrowserName } from '../utils/browserEnv';
import './ExtensionGate.css';
import './BrowserGate.css';

const SITE_URL = 'https://c2dpost-web.vercel.app/';
const CHROME_DOWNLOAD_URL = 'https://www.google.com/chrome/';

/**
 * Full-screen page shown on desktop browsers that are not Google Chrome.
 * The system needs the C2DPost Helper extension from the Chrome Web Store.
 */
export default function BrowserGate() {
  const [copied, setCopied] = useState(false);
  const browserName = detectBrowserName();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin + '/' : SITE_URL;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
    } catch {
      // Fallback for browsers without async clipboard permission
      const input = document.createElement('input');
      input.value = siteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="gate-screen">
      <div className="gate-card browser-gate-card">
        <img src="/logo.png" alt="C2DPost" className="browser-gate-logo" />

        <div className="browser-gate-icon" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill="#ffffff" />
            <path d="M24 2a22 22 0 0 1 19.05 11H24a11 11 0 0 0-9.53 5.5L6.95 5.98A21.94 21.94 0 0 1 24 2z" fill="#ea4335" />
            <path d="M43.05 13A22 22 0 0 1 24 46l9.53-16.5A11 11 0 0 0 33.53 18.5 10.9 10.9 0 0 0 24 13z" fill="#fbbc04" />
            <path d="M24 46A22 22 0 0 1 6.95 5.98l9.52 16.5A11 11 0 0 0 33.53 29.5z" fill="#34a853" />
            <circle cx="24" cy="24" r="8.5" fill="#4285f4" stroke="#ffffff" strokeWidth="3" />
          </svg>
        </div>

        <h2 className="browser-gate-title">กรุณาเปิดเว็บไซต์นี้ด้วย Google Chrome</h2>
        <p className="browser-gate-desc">
          ระบบ C2DPost ต้องใช้งานร่วมกับส่วนขยาย <strong>C2DPost Helper</strong> ซึ่งติดตั้งได้บน Google Chrome เท่านั้น
        </p>

        <div className="browser-gate-detected">
          เบราว์เซอร์ที่ใช้อยู่ตอนนี้: <strong>{browserName}</strong>
        </div>

        <ol className="browser-gate-steps">
          <li>คัดลอกลิงก์ด้านล่าง</li>
          <li>เปิดโปรแกรม <strong>Google Chrome</strong> (ถ้ายังไม่มี กดดาวน์โหลดได้ที่ปุ่มด้านล่าง)</li>
          <li>วางลิงก์ในช่องที่อยู่ของ Chrome แล้วกด Enter</li>
        </ol>

        <div className="browser-gate-link-row">
          <code className="browser-gate-url">{siteUrl}</code>
          <button type="button" className="btn-browser-gate-copy" onClick={handleCopy}>
            {copied ? '✓ คัดลอกแล้ว' : 'คัดลอกลิงก์'}
          </button>
        </div>

        <a
          className="btn-browser-gate-download"
          href={CHROME_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          ดาวน์โหลด Google Chrome
        </a>

        {/* One-time setup so users never land here again */}
        <div className="browser-gate-setup">
          <div className="browser-gate-setup-title">ครั้งต่อไปไม่ต้องคัดลอกลิงก์ (ทำครั้งเดียว)</div>

          <details className="browser-gate-details" open>
            <summary>วิธีที่ 1: ตั้ง Google Chrome เป็นเบราว์เซอร์เริ่มต้น</summary>
            <p className="browser-gate-note">
              ลิงก์ที่คลิกจาก LINE อีเมล หรือเอกสาร จะเปิดด้วย Chrome โดยอัตโนมัติ
            </p>

            {isWindows && (
              <a className="btn-browser-gate-settings" href="ms-settings:defaultapps">
                เปิดหน้าตั้งค่า "แอปเริ่มต้น" ของ Windows
              </a>
            )}

            <div className="browser-gate-os">
              <div className="browser-gate-os-name">Windows 11</div>
              <ol>
                <li>กดปุ่มด้านบน หรือไปที่ <strong>Start → Settings → Apps → Default apps</strong></li>
                <li>พิมพ์ค้นหา <strong>Google Chrome</strong> ในช่องค้นหาแอป แล้วคลิกเลือก</li>
                <li>กดปุ่ม <strong>Set default</strong> (ตั้งค่าเริ่มต้น) ที่ด้านบนของหน้า</li>
              </ol>
            </div>

            <div className="browser-gate-os">
              <div className="browser-gate-os-name">Windows 10</div>
              <ol>
                <li>กดปุ่มด้านบน หรือไปที่ <strong>Start → Settings → Apps → Default apps</strong></li>
                <li>ที่หัวข้อ <strong>Web browser</strong> คลิกไอคอน Microsoft Edge</li>
                <li>เลือก <strong>Google Chrome</strong> จากรายการ</li>
              </ol>
            </div>

            <div className="browser-gate-os">
              <div className="browser-gate-os-name">หรือตั้งจากใน Chrome</div>
              <ol>
                <li>เปิด Chrome → เมนู <strong>⋮</strong> (มุมขวาบน) → <strong>Settings</strong> (การตั้งค่า)</li>
                <li>เลือก <strong>Default browser</strong> (เบราว์เซอร์เริ่มต้น) → กด <strong>Make default</strong> (ตั้งเป็นค่าเริ่มต้น)</li>
              </ol>
            </div>

            {isMac && (
              <div className="browser-gate-os">
                <div className="browser-gate-os-name">macOS</div>
                <ol>
                  <li><strong>System Settings → Desktop &amp; Dock</strong></li>
                  <li>ที่ <strong>Default web browser</strong> เลือก <strong>Google Chrome</strong></li>
                </ol>
              </div>
            )}
          </details>

          <details className="browser-gate-details">
            <summary>วิธีที่ 2: สร้างไอคอน C2DPost บนเดสก์ท็อป (เปิดด้วย Chrome เสมอ)</summary>
            <ol>
              <li>เปิดเว็บไซต์นี้ใน <strong>Google Chrome</strong></li>
              <li>เมนู <strong>⋮</strong> → <strong>Cast, save, and share</strong> (บันทึกและแชร์) → <strong>Create shortcut...</strong> (สร้างทางลัด)</li>
              <li>ตั้งชื่อ <strong>C2DPost</strong> แล้วกด <strong>Create</strong> (สร้าง)</li>
              <li>ครั้งต่อไปดับเบิลคลิกไอคอน C2DPost บนเดสก์ท็อปได้เลย</li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
