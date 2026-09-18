import React, { useState, useEffect, useRef } from 'react';
import './ThaiDateInput.css';

/**
 * Convert ISO date string (YYYY-MM-DD) to Thai DD/MM/YYYY (วัน/เดือน/ปี)
 */
export function isoToDmy(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const parts = isoStr.trim().split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d) {
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  return isoStr;
}

/**
 * Convert DD/MM/YYYY (or DD-MM-YYYY) to ISO (YYYY-MM-DD)
 * Supports typing either CE year (e.g. 2026) or BE year (e.g. 2569)
 */
export function dmyToIso(dmyStr) {
  if (!dmyStr || typeof dmyStr !== 'string') return '';
  const clean = dmyStr.trim().replace(/[^0-9/.-]/g, '');
  const parts = clean.split(/[/.-]/);
  if (parts.length === 3) {
    let [d, m, y] = parts;
    if (d.length === 4 && y.length <= 2) {
      // Handled if user typed YYYY/MM/DD
      [y, m, d] = parts;
    }
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    let year = parseInt(y, 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return '';
    if (month < 1 || month > 12) return '';
    if (day < 1 || day > 31) return '';

    // Convert Buddhist Era to Christian Era if entered > 2400
    if (year > 2400) {
      year -= 543;
    }

    if (year < 1900 || year > 2100) return '';

    const isoYear = String(year).padStart(4, '0');
    const isoMonth = String(month).padStart(2, '0');
    const isoDay = String(day).padStart(2, '0');
    return `${isoYear}-${isoMonth}-${isoDay}`;
  }
  return '';
}

export default function ThaiDateInput({
  id,
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = 'วว/ดด/ปปปป'
}) {
  const [inputText, setInputText] = useState(() => isoToDmy(value));
  const nativeInputRef = useRef(null);

  // Sync displayed text whenever parent value updates (e.g. quick date buttons)
  useEffect(() => {
    setInputText(isoToDmy(value));
  }, [value]);

  const handleTextChange = (e) => {
    const text = e.target.value;
    setInputText(text);

    // If fully typed 10 characters (DD/MM/YYYY), attempt immediate sync
    if (text.length >= 8) {
      const parsedIso = dmyToIso(text);
      if (parsedIso && parsedIso !== value) {
        onChange(parsedIso);
      }
    }
  };

  const handleBlur = () => {
    const parsedIso = dmyToIso(inputText);
    if (parsedIso) {
      onChange(parsedIso);
      setInputText(isoToDmy(parsedIso));
    } else {
      // Revert to current valid value if invalid text was typed
      setInputText(isoToDmy(value));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  const handleNativeDateChange = (e) => {
    const newIso = e.target.value;
    if (newIso) {
      onChange(newIso);
      setInputText(isoToDmy(newIso));
    }
  };

  return (
    <div className={`thai-date-input-wrap ${disabled ? 'disabled' : ''} ${className}`}>
      {/* 1. Visible formatted date input displaying DD/MM/YYYY (วัน/เดือน/ปี) */}
      <input
        id={id}
        type="text"
        className="thai-date-display-input"
        value={inputText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        title="ระบุวันที่ในรูปแบบ วัน/เดือน/ปี (เช่น 18/09/2026)"
      />

      {/* 2. Calendar picker action button with native date input overlay */}
      <div className="thai-date-picker-btn-wrap" title="คลิกเพื่อเลือกวันที่จากปฏิทิน">
        <div className="thai-date-picker-icon-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>

        {/* Native HTML5 date input transparent overlay over the calendar icon */}
        <input
          ref={nativeInputRef}
          type="date"
          className="thai-date-native-overlay"
          value={value || ''}
          onChange={handleNativeDateChange}
          disabled={disabled}
          tabIndex={-1}
          aria-label="เลือกวันที่จากปฏิทิน"
        />
      </div>
    </div>
  );
}
