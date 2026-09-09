import React, { useState, useEffect, useRef } from 'react';
import './RegistrationModal.css';

const SCRIPT_REGISTER_URL = 'https://script.google.com/macros/s/AKfycbwulS3437Gqf8tM_5pjYQhPfcSqcUNwM-PoKxjzw4cWL5FRCszE7VFDUKFuHEGYQg/exec';
const POSTOFFICE_CSV_URL = 'https://docs.google.com/spreadsheets/d/12tt2MBVqBRMzoqfCjskt_Aft-SUGVMs7uH1Endp2cQI/export?format=csv';

let postOfficeCache = null;

export default function RegistrationModal({ isOpen, onClose }) {
  // Section 1: ข้อมูลการเข้าสู่ระบบ
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errUser, setErrUser] = useState('');
  const [errPass, setErrPass] = useState('');
  const [verifyingApi, setVerifyingApi] = useState(false);
  const [apiVerified, setApiVerified] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState({ text: '', type: '' }); // 'success' | 'fail' | 'error' | 'info'

  // Section 2: ข้อมูลหน่วยงาน
  const [organization, setOrganization] = useState('');
  const [errOrg, setErrOrg] = useState('');
  const [email, setEmail] = useState('');
  const [errEmail, setErrEmail] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [errZip, setErrZip] = useState('');
  const [postoffice, setPostoffice] = useState('');
  const [poFound, setPoFound] = useState(false);

  // Section 3: ข้อมูลผู้ประสานงาน
  const [contactCount, setContactCount] = useState(1); // 1, 2, or 3
  const [contact1, setContact1] = useState('');
  const [errContact1, setErrContact1] = useState('');
  const [tel1, setTel1] = useState('');
  const [errTel1, setErrTel1] = useState('');
  const [contact2, setContact2] = useState('');
  const [tel2, setTel2] = useState('');
  const [errTel2, setErrTel2] = useState('');
  const [contact3, setContact3] = useState('');
  const [tel3, setTel3] = useState('');
  const [errTel3, setErrTel3] = useState('');

  // Section 4: ข้อตกลงและเงื่อนไขทางกฎหมาย (PDPA)
  const [chkPdpa, setChkPdpa] = useState(false);

  // Submit Feedback & State
  const [submitting, setSubmitting] = useState(false);
  const [btnSubmitText, setBtnSubmitText] = useState('ลงทะเบียน');
  const [lblMsg, setLblMsg] = useState({ text: '', type: '' });
  const [countdown, setCountdown] = useState(null);
  const countdownTimerRef = useRef(null);

  // Reset or clear state on open/close
  useEffect(() => {
    if (!isOpen) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setCountdown(null);
      setLblMsg({ text: '', type: '' });
      setBtnSubmitText('ลงทะเบียน');
    }
  }, [isOpen]);

  // Validation: English letters, numbers, and allowed symbols
  const validateEng = (val) => {
    return /^[a-zA-Z0-9.@$%&!<>?*/\\\[\]{}#_\-=+]*$/.test(val);
  };

  const handleUsernameChange = (val) => {
    setUsername(val);
    if (val && !validateEng(val)) {
      setErrUser('❌ รองรับเฉพาะภาษาอังกฤษ ตัวเลข และสัญลักษณ์');
    } else {
      setErrUser('');
    }
    setVerifyStatus({ text: '', type: '' });
    setLblMsg({ text: '', type: '' });
  };

  const handlePasswordChange = (val) => {
    setPassword(val);
    if (val && !validateEng(val)) {
      setErrPass('❌ รองรับเฉพาะภาษาอังกฤษ ตัวเลข และสัญลักษณ์');
    } else {
      setErrPass('');
    }
    setVerifyStatus({ text: '', type: '' });
    setLblMsg({ text: '', type: '' });
  };

  // Section 1: Verify API Auth (Thailand Post addItems service)
  const handleVerifyApi = async () => {
    const u = username.trim();
    const p = password.trim();

    if (!u || !p) {
      setVerifyStatus({ text: '⚠️ กรุณาระบุรหัสผู้ใช้งานและรหัสผ่านก่อน', type: 'error' });
      return;
    }

    setVerifyingApi(true);
    setVerifyStatus({ text: 'กำลังทดสอบ...', type: 'info' });

    try {
      const res = await fetch('/api/verify_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();

      if (data.valid) {
        setApiVerified(true);
        setVerifyStatus({ text: '✅ ตรวจสอบ Username และ Password ถูกต้อง', type: 'success' });
      } else {
        setApiVerified(false);
        setVerifyStatus({ text: '❌ Username หรือ Password ไม่ถูกต้อง', type: 'fail' });
      }
    } catch (err) {
      console.error('Verify error:', err);
      // Fallback: If backend is offline or static mode, check via direct POST or notification
      setVerifyStatus({ text: '⚠️ เชื่อมต่อ API ล้มเหลว โปรดลองใหม่', type: 'error' });
    } finally {
      setVerifyingApi(false);
    }
  };

  // Section 2: Email validation
  const handleEmailChange = (val) => {
    setEmail(val);
    if (val && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)) {
      setErrEmail('❌ รูปแบบอีเมลไม่ถูกต้อง');
    } else {
      setErrEmail('');
    }
    setLblMsg({ text: '', type: '' });
  };

  // Section 2: Zipcode query from Google Sheets CSV
  const handleZipChange = async (val) => {
    const clean = val.replace(/\D/g, '').slice(0, 5);
    setZipcode(clean);
    setLblMsg({ text: '', type: '' });

    if (clean.length > 0 && clean.length < 5) {
      setErrZip('❌ รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
      setPostoffice('');
      setPoFound(false);
    } else if (clean.length === 5) {
      setErrZip('');
      setPostoffice('กำลังค้นหาข้อมูล...');
      try {
        if (!postOfficeCache) {
          const res = await fetch(POSTOFFICE_CSV_URL);
          const text = await res.text();
          const map = {};
          for (let line of text.split('\n')) {
            const cols = line.split(',');
            if (cols.length >= 3) {
              const zip = (cols[0] || '').trim();
              const name = (cols[2] || cols[1] || '').trim();
              if (zip && !map[zip]) map[zip] = name;
            }
          }
          postOfficeCache = map;
        }

        if (postOfficeCache[clean]) {
          setPostoffice(postOfficeCache[clean]);
          setPoFound(true);
          setErrZip('');
        } else {
          setPostoffice('');
          setPoFound(false);
          setErrZip('❌ ไม่พบรหัสไปรษณีย์นี้ในฐานข้อมูล');
        }
      } catch (e) {
        console.error(e);
        setPostoffice('');
        setPoFound(false);
        setErrZip('❌ ไม่พบรหัสไปรษณีย์นี้ในฐานข้อมูล');
      }
    } else {
      setErrZip('');
      setPostoffice('');
      setPoFound(false);
    }
  };

  // Section 3: Telephone validation
  const handleTelChange = (setter, errSetter) => (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setter(val);
    setLblMsg({ text: '', type: '' });
    if (val && val.length < 10) {
      errSetter('❌ กรุณาระบุให้ครบ 10 หลัก');
    } else {
      errSetter('');
    }
  };

  // Submit button enabled state: matches Python validate_submit_btn
  // "if self.entry_org.cget('state') == 'normal' and self.chk_pdpa.cget('state') == 'normal' and self.chk_pdpa.get() == 1"
  const isSubmitBtnEnabled = apiVerified && poFound && chkPdpa && !submitting && !countdown;

  // Submit Handler: matches Python gui.py submit_form() exactly
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLblMsg({ text: '', type: '' });

    if (!poFound || !postoffice || postoffice === 'กำลังค้นหาข้อมูล...') {
      setLblMsg({ text: '⚠️ กรุณาระบุรหัสไปรษณีย์ให้ถูกต้อง', type: 'error' });
      return;
    }

    if (!chkPdpa) {
      setLblMsg({ text: '⚠️ กรุณายอมรับเงื่อนไขทางกฎหมายและการคุ้มครองข้อมูลส่วนบุคคล', type: 'error' });
      return;
    }

    // Required fields check
    let hasEmpty = false;
    if (!username.trim()) { setErrUser('⚠️ กรุณากรอก Username'); hasEmpty = true; }
    if (!password.trim()) { setErrPass('⚠️ กรุณากรอก Password'); hasEmpty = true; }
    if (!organization.trim()) { setErrOrg('border-red'); hasEmpty = true; } else { setErrOrg(''); }
    if (!email.trim()) { setErrEmail('❌ รูปแบบอีเมลไม่ถูกต้อง'); hasEmpty = true; }
    if (!zipcode.trim() || zipcode.length < 5) { setErrZip('❌ รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'); hasEmpty = true; }
    if (!contact1.trim()) { setErrContact1('border-red'); hasEmpty = true; } else { setErrContact1(''); }
    if (!tel1.trim() || tel1.length < 10) { setErrTel1('❌ กรุณาระบุให้ครบ 10 หลัก'); hasEmpty = true; }

    if (hasEmpty) {
      setLblMsg({ text: '⚠️ กรุณากรอกข้อมูลให้ครบถ้วนในช่องที่มีดอกจัน', type: 'error' });
      return;
    }

    // Check red borders / format errors
    if (errUser || errPass || errEmail || errZip || errTel1 || errTel2 || errTel3) {
      setLblMsg({ text: '⚠️ ข้อมูลบางช่องยังไม่ถูกต้อง กรุณาแก้ไขช่องที่เป็นสีแดง', type: 'error' });
      return;
    }

    setSubmitting(true);
    setBtnSubmitText('กำลังส่งข้อมูล...');

    const payload = {
      username: username.trim(),
      password: password.trim(),
      email: email.trim(),
      organization: organization.trim(),
      zipcode: zipcode.trim(),
      postoffice: postoffice.trim(),
      contact1: contact1.trim(),
      tel1: tel1.trim(),
      contact2: contact2.trim(),
      tel2: tel2.trim(),
      contact3: contact3.trim(),
      tel3: tel3.trim(),
      pdpa: chkPdpa ? 'Yes' : 'No'
    };

    try {
      // 1. Send via backend API to handle redirects and duplicate check
      const res = await fetch('/api/register_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.result === 'SUCCESS' || data.success) {
        handleSuccess();
      } else if (data.error === 'duplicate_username' || (data.message && data.message.includes('Username นี้'))) {
        handleDuplicate();
      } else {
        handleFail(data.message || 'การลงทะเบียนล้มเหลว');
      }
    } catch (err) {
      console.warn('Backend proxy failed, attempting fallback direct POST:', err);
      // Fallback: Direct submit to Google Apps Script (no-cors)
      try {
        const formData = new URLSearchParams(payload);
        await fetch(SCRIPT_REGISTER_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });
        handleSuccess();
      } catch (fallbackErr) {
        console.error(fallbackErr);
        handleFail(`การเชื่อมต่อล้มเหลว: ${fallbackErr.message || fallbackErr}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = () => {
    setBtnSubmitText('ลองใหม่อีกครั้ง');
    setLblMsg({ text: '❌ Username นี้ มีการลงทะเบียนแล้ว', type: 'error' });
    setErrUser('❌ Username นี้ มีการลงทะเบียนแล้ว');
  };

  const handleFail = (errorMsg) => {
    setBtnSubmitText('ลองใหม่อีกครั้ง');
    setLblMsg({ text: `❌ เกิดข้อผิดพลาดในการส่งข้อมูล: ${errorMsg}`, type: 'error' });
  };

  const handleSuccess = () => {
    setBtnSubmitText('ส่งข้อมูลเสร็จสิ้น');
    // Clear fields
    setUsername('');
    setPassword('');
    setOrganization('');
    setEmail('');
    setZipcode('');
    setPostoffice('');
    setContact1('');
    setTel1('');
    setContact2('');
    setTel2('');
    setContact3('');
    setTel3('');

    let count = 10;
    setCountdown(count);
    setLblMsg({
      text: `✅ ลงทะเบียนขอสิทธิ์การใช้งาน C2DPost สำเร็จ!\n(ปิดหน้าต่างอัตโนมัติใน ${count} วินาที)`,
      type: 'success'
    });

    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        onClose();
      } else {
        setCountdown(count);
        setLblMsg({
          text: `✅ ลงทะเบียนขอสิทธิ์การใช้งาน C2DPost สำเร็จ!\n(ปิดหน้าต่างอัตโนมัติใน ${count} วินาที)`,
          type: 'success'
        });
      }
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="reg-modal-overlay" onClick={onClose}>
      <div className="reg-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="reg-modal-header">
          <h2 className="reg-title-main">ลงทะเบียนขอสิทธิ์การใช้งาน C2DPost</h2>
          <button type="button" className="reg-btn-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="reg-modal-scroll">
          <form onSubmit={handleSubmit} className="reg-form-container">
            {/* Section 1: ข้อมูลการเข้าสู่ระบบ */}
            <div className="reg-box-section">
              <div className="reg-sec-header">
                <h3>ข้อมูลการเข้าสู่ระบบ</h3>
              </div>
              <div className="reg-sec-content">
                <div className="reg-row">
                  <div className="reg-field">
                    <label htmlFor="reg-username">Username (ชื่อผู้ใช้งาน) *</label>
                    <input
                      id="reg-username"
                      type="text"
                      className={`reg-input ${errUser ? 'border-red' : ''}`}
                      placeholder="(ชื่อผู้ใช้งาน ที่ได้รับจากไปรษณีย์)"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      disabled={apiVerified}
                    />
                    {errUser && <span className="reg-err-text">{errUser}</span>}
                  </div>
                  <div className="reg-field">
                    <label htmlFor="reg-password">Password (รหัสผ่าน) *</label>
                    <div className="reg-input-pwd-wrap">
                      <input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        className={`reg-input ${errPass ? 'border-red' : ''}`}
                        placeholder="(รหัสผ่าน ที่ได้รับจากไปรษณีย์)"
                        value={password}
                        onChange={(e) => handlePasswordChange(e.target.value)}
                        disabled={apiVerified}
                      />
                      <button
                        type="button"
                        className="reg-pwd-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? '🔒' : '👁'}
                      </button>
                    </div>
                    {errPass && <span className="reg-err-text">{errPass}</span>}
                  </div>
                </div>

                {/* Verify API Auth Row */}
                <div className="reg-verify-row">
                  <button
                    id="reg-btn-verify"
                    type="button"
                    className={`reg-btn-verify ${apiVerified ? 'verified' : ''}`}
                    onClick={handleVerifyApi}
                    disabled={verifyingApi || apiVerified || !username || !password}
                  >
                    {verifyingApi ? 'กำลังทดสอบ...' : 'ตรวจสอบ'}
                  </button>
                  {verifyStatus.text && (
                    <span className={`reg-verify-status ${verifyStatus.type}`}>
                      {verifyStatus.text}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: ข้อมูลหน่วยงาน (LOCKED until Section 1 passes) */}
            <div className={`reg-box-section ${!apiVerified ? 'section-locked' : ''}`}>
              <div className="reg-sec-header">
                <h3>ข้อมูลหน่วยงาน</h3>
                {!apiVerified && <span className="locked-pill">โปรดตรวจสอบข้อมูลล็อกอินก่อน</span>}
              </div>
              <div className="reg-sec-content">
                <div className="reg-field">
                  <label htmlFor="reg-org">ชื่อ สำนักงาน/หน่วยงาน แบบเต็ม (ไม่ระบุตัวย่อ) *</label>
                  <input
                    id="reg-org"
                    type="text"
                    className={`reg-input ${errOrg}`}
                    value={organization}
                    onChange={(e) => {
                      setOrganization(e.target.value);
                      if (e.target.value) setErrOrg('');
                      setLblMsg({ text: '', type: '' });
                    }}
                    disabled={!apiVerified}
                  />
                </div>

                <div className="reg-field">
                  <label htmlFor="reg-email">Email (อีเมล) *</label>
                  <input
                    id="reg-email"
                    type="email"
                    className={`reg-input ${errEmail ? 'border-red' : ''}`}
                    placeholder="(เช่น example@domain.com)"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    disabled={!apiVerified}
                  />
                  {errEmail && <span className="reg-err-text">{errEmail}</span>}
                </div>

                <div className="reg-row">
                  <div className="reg-field">
                    <label htmlFor="reg-zip">รหัสไปรษณีย์ของที่ทำการที่เลือกใช้บริการ *</label>
                    <input
                      id="reg-zip"
                      type="text"
                      className={`reg-input ${errZip ? 'border-red' : ''}`}
                      maxLength={5}
                      value={zipcode}
                      onChange={(e) => handleZipChange(e.target.value)}
                      disabled={!apiVerified}
                    />
                    {errZip && <span className="reg-err-text">{errZip}</span>}
                  </div>
                  <div className="reg-field">
                    <label htmlFor="reg-po">ชื่อที่ทำการ *</label>
                    <input
                      id="reg-po"
                      type="text"
                      className="reg-input readonly-input"
                      value={postoffice}
                      readOnly
                      disabled={true}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: ข้อมูลผู้ประสานงาน (LOCKED until Zipcode resolved) */}
            <div className={`reg-box-section ${!poFound ? 'section-locked' : ''}`}>
              <div className="reg-sec-header">
                <h3>ข้อมูลผู้ประสานงาน</h3>
                {!poFound && <span className="locked-pill">โปรดระบุรหัสไปรษณีย์ถูกต้องก่อน</span>}
              </div>
              <div className="reg-sec-content">
                {/* Person 1 (Required) */}
                <div className="reg-row">
                  <div className="reg-field">
                    <label htmlFor="reg-contact1">ผู้ประสานงานหลัก *</label>
                    <input
                      id="reg-contact1"
                      type="text"
                      className={`reg-input ${errContact1}`}
                      value={contact1}
                      onChange={(e) => {
                        setContact1(e.target.value);
                        if (e.target.value) setErrContact1('');
                        setLblMsg({ text: '', type: '' });
                      }}
                      disabled={!poFound}
                    />
                  </div>
                  <div className="reg-field">
                    <label htmlFor="reg-tel1">เบอร์โทร *</label>
                    <input
                      id="reg-tel1"
                      type="text"
                      className={`reg-input ${errTel1 ? 'border-red' : ''}`}
                      placeholder="(09XXXXXXXX)"
                      value={tel1}
                      onChange={handleTelChange(setTel1, setErrTel1)}
                      disabled={!poFound}
                    />
                    {errTel1 && <span className="reg-err-text">{errTel1}</span>}
                  </div>
                </div>

                {/* Person 2 (Optional, revealed on click) */}
                {contactCount >= 2 && (
                  <div className="reg-row">
                    <div className="reg-field">
                      <label htmlFor="reg-contact2">ผู้ประสานงานคนที่ 2</label>
                      <input
                        id="reg-contact2"
                        type="text"
                        className="reg-input"
                        value={contact2}
                        onChange={(e) => setContact2(e.target.value)}
                        disabled={!poFound}
                      />
                    </div>
                    <div className="reg-field">
                      <label htmlFor="reg-tel2">เบอร์โทร</label>
                      <input
                        id="reg-tel2"
                        type="text"
                        className={`reg-input ${errTel2 ? 'border-red' : ''}`}
                        placeholder="(09XXXXXXXX)"
                        value={tel2}
                        onChange={handleTelChange(setTel2, setErrTel2)}
                        disabled={!poFound}
                      />
                      {errTel2 && <span className="reg-err-text">{errTel2}</span>}
                    </div>
                  </div>
                )}

                {/* Person 3 (Optional, revealed on click) */}
                {contactCount >= 3 && (
                  <div className="reg-row">
                    <div className="reg-field">
                      <label htmlFor="reg-contact3">ผู้ประสานงานคนที่ 3</label>
                      <input
                        id="reg-contact3"
                        type="text"
                        className="reg-input"
                        value={contact3}
                        onChange={(e) => setContact3(e.target.value)}
                        disabled={!poFound}
                      />
                    </div>
                    <div className="reg-field">
                      <label htmlFor="reg-tel3">เบอร์โทร</label>
                      <input
                        id="reg-tel3"
                        type="text"
                        className={`reg-input ${errTel3 ? 'border-red' : ''}`}
                        placeholder="(09XXXXXXXX)"
                        value={tel3}
                        onChange={handleTelChange(setTel3, setErrTel3)}
                        disabled={!poFound}
                      />
                      {errTel3 && <span className="reg-err-text">{errTel3}</span>}
                    </div>
                  </div>
                )}

                {/* Add Contact Button (Hidden once 3 contacts are reached) */}
                {contactCount < 3 && (
                  <button
                    id="reg-btn-add-contact"
                    type="button"
                    className="reg-btn-add-contact"
                    onClick={() => setContactCount((prev) => prev + 1)}
                    disabled={!poFound}
                  >
                    + เพิ่มผู้ประสานงาน
                  </button>
                )}
              </div>
            </div>

            {/* Section 4: ข้อตกลงและเงื่อนไข PDPA (LOCKED until Zipcode resolved) */}
            <div className={`reg-box-pdpa ${!poFound ? 'section-locked' : ''}`}>
              <div className="pdpa-header">
                การรับรองและเงื่อนไขทางกฎหมาย * (กรุณาอ่านและยอมรับ)
              </div>
              <div className="pdpa-content-box">
                <label className="pdpa-checkbox-label" htmlFor="reg-chk-pdpa">
                  <input
                    id="reg-chk-pdpa"
                    type="checkbox"
                    className="pdpa-checkbox"
                    checked={chkPdpa}
                    onChange={(e) => {
                      setChkPdpa(e.target.checked);
                      setLblMsg({ text: '', type: '' });
                    }}
                    disabled={!poFound}
                  />
                  <div className="pdpa-full-text">
                    <p>ข้าพเจ้าได้อ่าน เข้าใจ และยอมรับข้อตกลงการใช้งานระบบ C2DPost โดยมีเงื่อนไขดังนี้:</p>
                    <ol>
                      <li>จะใช้เพื่อการปฏิบัติงานของหน่วยงานเท่านั้น และจะรักษารหัสผ่านไว้เป็นความลับ</li>
                      <li>รับรองว่าข้อมูลส่วนบุคคลของประชาชน (เช่น ชื่อ-นามสกุล และที่อยู่) เป็นข้อมูลที่ได้มาโดยชอบด้วยกฎหมาย</li>
                      <li>ยินยอมให้ระบบทำการเก็บรวบรวม ประมวลผล และแสดงผลข้อมูลดังกล่าวเพื่อใช้จัดเตรียมข้อมูลไปรษณีย์ โดยข้าพเจ้าจะปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) อย่างเคร่งครัด</li>
                      <li>รับทราบและยินยอมให้ระบบเก็บบันทึกประวัติการใช้งาน ข้อมูลจราจรทางคอมพิวเตอร์ (Log) และประวัติการทำธุรกรรม เพื่อใช้ตรวจสอบและรักษาความปลอดภัยตาม พ.ร.บ. ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์</li>
                      <li>รับรองว่าข้าพเจ้าได้รับมอบหมายให้เป็นตัวแทนของหน่วยงาน ในการรับทราบและให้ความยินยอมตามเงื่อนไขทางกฎหมายนี้</li>
                    </ol>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons: Left: ลงทะเบียน, Right: ยกเลิก */}
            <div className="reg-actions-row">
              <button
                id="reg-btn-submit"
                type="submit"
                className="reg-btn-submit"
                disabled={!isSubmitBtnEnabled}
              >
                {btnSubmitText}
              </button>
              <button
                id="reg-btn-cancel"
                type="button"
                className="reg-btn-cancel"
                onClick={onClose}
              >
                ยกเลิก
              </button>
            </div>

            {/* Status Message (lbl_msg) below buttons, matching Python */}
            {lblMsg.text && (
              <div className={`reg-lbl-msg ${lblMsg.type}`}>
                {lblMsg.text}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
