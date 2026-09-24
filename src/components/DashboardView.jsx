import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchDashboardReport } from '../utils/api';
import ThaiDateInput from './ThaiDateInput';
import { THAILAND_VIEWBOX, THAILAND_PROVINCES } from '../data/thailandMapData';
import './DashboardView.css';

const DASHBOARD_CACHE_KEY = 'c2dpost_dashboard_cache';

function getCachedDashboardState() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error reading dashboard cache:', err);
    return null;
  }
}

function setCachedDashboardState(data) {
  try {
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Error writing dashboard cache:', err);
  }
}

// Helper: Format Date object to YYYY-MM-DD for <input type="date">
function toInputDateFormat(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Convert YYYY-MM-DD to DD/MM/YYYY for Thailand Post API
function toApiDateFormat(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Normalize a province name for matching against the map dataset
function normalizeProvinceName(name) {
  const s = String(name || '');
  let norm = s.replace(/[\sฯ.]+/g, '').toLowerCase();
  if (norm === 'กทม' || norm === 'กรุงเทพ' || norm === 'bangkok') norm = 'กรุงเทพมหานคร';
  return norm;
}

// Legend-based success-rate coloring
function successColor(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '#9aa6b2';
  if (rate >= 90) return '#22c55e';
  if (rate >= 70) return '#84cc16';
  if (rate >= 50) return '#f59e0b';
  if (rate >= 20) return '#f97316';
  return '#ef4444';
}

// Helper: Format percentage value to 2 decimal places
function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return Number(val).toFixed(2);
}

// Rate badge background color (translucent pill)
function getRateBgColor(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return 'rgba(148, 163, 184, 0.18)';
  if (rate >= 90) return 'rgba(34, 197, 94, 0.22)';
  if (rate >= 70) return 'rgba(132, 204, 22, 0.22)';
  if (rate >= 50) return 'rgba(245, 158, 11, 0.22)';
  if (rate >= 20) return 'rgba(249, 115, 22, 0.22)';
  return 'rgba(239, 68, 68, 0.25)';
}

// Rate text color
function getRateTextColor(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '#cbd5e1';
  if (rate >= 90) return '#4ade80';
  if (rate >= 70) return '#a3e635';
  if (rate >= 50) return '#fbbf24';
  if (rate >= 20) return '#fb923c';
  return '#f87171';
}

// Progress bar gradient
function getRateGradient(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '#94a3b8';
  if (rate >= 90) return 'linear-gradient(90deg, #10b981, #22c55e)';
  if (rate >= 70) return 'linear-gradient(90deg, #65a30d, #84cc16)';
  if (rate >= 50) return 'linear-gradient(90deg, #d97706, #f59e0b)';
  if (rate >= 20) return 'linear-gradient(90deg, #ea580c, #f97316)';
  return 'linear-gradient(90deg, #dc2626, #ef4444)';
}

export default function DashboardView({ currentPerson, onSwitchToWorkspace }) {
  const AUTO_FETCH = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autofetch') === '1',
    []
  );
  const todayIso = useMemo(() => toInputDateFormat(new Date()), []);
  const yesterdayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toInputDateFormat(d);
  }, []);
  const last7DaysIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toInputDateFormat(d);
  }, []);
  const monthStartIso = useMemo(() => {
    const d = new Date();
    return toInputDateFormat(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);
  const lastMonthStartIso = useMemo(() => {
    const d = new Date();
    return toInputDateFormat(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);
  const lastMonthEndIso = useMemo(() => {
    const d = new Date();
    return toInputDateFormat(new Date(d.getFullYear(), d.getMonth(), 0));
  }, []);

  const cachedState = useMemo(() => getCachedDashboardState(), []);

  // เฉพาะที่หน้านี้: ตัวกรองค่าเริ่มต้นคือ "เดือนนี้" (monthStartIso -> todayIso)
  const defaultStartDate = useMemo(() => {
    if (cachedState?.startDate && cachedState.startDate !== todayIso) {
      return cachedState.startDate;
    }
    return monthStartIso;
  }, [cachedState, todayIso, monthStartIso]);

  const defaultEndDate = useMemo(() => {
    return cachedState?.endDate || todayIso;
  }, [cachedState, todayIso]);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(() => cachedState?.data || null);
  const [lockedProvince, setLockedProvince] = useState(null);
  const [hoveredProvince, setHoveredProvince] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    flipX: false,
    flipY: false,
    province: null,
    stat: null,
    rate: null
  });
  const mapWrapRef = useRef(null);

  useEffect(() => {
    setCachedDashboardState({ startDate, endDate, data, updatedAt: Date.now() });
  }, [startDate, endDate, data]);

  const handleFetchReport = useCallback(async (startToFetch, endToFetch) => {
    const sIso = startToFetch || startDate;
    const eIso = endToFetch || endDate || sIso;
    if (!sIso || !eIso) {
      setError('กรุณาเลือกช่วงวันที่ต้องการดูสถิติ');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const isDemoMode =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('demo') === '1';
      // In demo mode use the special 'demo' account so the backend serves sample data.
      const username = isDemoMode ? 'demo' : (currentPerson?.UserName || '');
      const password = isDemoMode ? '' : (currentPerson?.Password || '');
      const result = await fetchDashboardReport({
        date: toApiDateFormat(sIso),
        endDate: toApiDateFormat(eIso),
        username,
        password
      });
      if (result && result.success) {
        setData(result);
        setLockedProvince(null);
        setHoveredProvince(null);
      } else {
        setData(null);
        setError((result && result.message) || 'ไม่พบข้อมูลสำหรับช่วงวันที่ที่เลือก');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, currentPerson]);

  const handleSetQuickDate = useCallback((kind) => {
    let s = todayIso;
    let e = todayIso;
    if (kind === 'today') { s = todayIso; e = todayIso; }
    else if (kind === 'yesterday') { s = yesterdayIso; e = yesterdayIso; }
    else if (kind === 'last7days') { s = last7DaysIso; e = todayIso; }
    else if (kind === 'thisMonth') { s = monthStartIso; e = todayIso; }
    else if (kind === 'lastMonth') { s = lastMonthStartIso; e = lastMonthEndIso; }
    setStartDate(s);
    setEndDate(e);
    // อัปเดตข้อมูลอัตโนมัติทันทีที่คลิกเลือกช่วงเวลา
    handleFetchReport(s, e);
  }, [todayIso, yesterdayIso, last7DaysIso, monthStartIso, lastMonthStartIso, lastMonthEndIso, handleFetchReport]);

  // อัปเดตข้อมูลอัตโนมัติเมื่อเปิดหน้านี้ (เริ่มต้นที่ "เดือนนี้")
  const hasAutoFetchedRef = useRef(false);
  useEffect(() => {
    const isDemoMode =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '1';

    if (hasAutoFetchedRef.current) return;
    if (!currentPerson && !isDemoMode && !AUTO_FETCH) return;

    hasAutoFetchedRef.current = true;
    handleFetchReport(startDate, endDate);
  }, [currentPerson, AUTO_FETCH, startDate, endDate, handleFetchReport]);

  const summary = data?.summary || {
    total_items: 0,
    delivered_count: 0,
    failed_count: 0,
    received_count: 0,
    in_transit_count: 0,
    pending_count: 0,
    delivered_pct_of_concluded: 0,
    failed_pct_of_concluded: 0,
    total_fee: 0
  };
  const reasons = Array.isArray(data?.reasons) ? data.reasons : [];
  const provinces = Array.isArray(data?.provinces) ? data.provinces : [];

  // Build lookup from normalized province name -> stats
  const provinceStatsByKey = useMemo(() => {
    const map = {};
    for (const p of provinces) {
      map[normalizeProvinceName(p.province)] = p;
    }
    return map;
  }, [provinces]);

  const provinceCount = provinces.length;

  // Active province for detail panel (locked takes priority, fallback to hovered)
  const activeProvinceName = lockedProvince || hoveredProvince;
  const activeProvinceDetail = useMemo(() => {
    if (!activeProvinceName) return null;
    const found = provinceStatsByKey[normalizeProvinceName(activeProvinceName)];
    if (found) return found;
    return {
      province: activeProvinceName,
      count: 0,
      delivered: 0,
      failed: 0,
      received: 0,
      in_transit: 0,
      success_rate: null
    };
  }, [activeProvinceName, provinceStatsByKey]);

  const lockedProvinceObj = useMemo(() => {
    if (!lockedProvince) return null;
    return THAILAND_PROVINCES.find(
      (p) => normalizeProvinceName(p.name) === normalizeProvinceName(lockedProvince)
    ) || null;
  }, [lockedProvince]);

  const handleToggleLockProvince = useCallback((provinceName) => {
    if (!provinceName) return;
    setLockedProvince((prev) => {
      if (prev && normalizeProvinceName(prev) === normalizeProvinceName(provinceName)) {
        return null;
      }
      return provinceName;
    });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!mapWrapRef.current) return;
    const rect = mapWrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const flipX = x + 265 > rect.width;
    const flipY = y + 215 > rect.height;
    setTooltip((prev) => {
      if (!prev.visible) return prev;
      return { ...prev, x, y, flipX, flipY };
    });
  }, []);

  const handleProvinceMouseEnter = useCallback((prov, e) => {
    setHoveredProvince(prov.name);
    const stat = provinceStatsByKey[normalizeProvinceName(prov.name)] || null;
    const rate = stat ? Number(stat.success_rate) : null;

    let x = 0;
    let y = 0;
    let flipX = false;
    let flipY = false;
    if (mapWrapRef.current) {
      const rect = mapWrapRef.current.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      flipX = x + 265 > rect.width;
      flipY = y + 215 > rect.height;
    }
    setTooltip({
      visible: true,
      x,
      y,
      flipX,
      flipY,
      province: prov.name,
      stat,
      rate
    });
  }, [provinceStatsByKey]);

  const handleProvinceMouseLeave = useCallback(() => {
    setHoveredProvince(null);
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleMapContainerMouseLeave = useCallback(() => {
    setHoveredProvince(null);
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const rawReturnReasons = data?.return_reasons;
  const rawDeliveryFailedReasons = data?.delivery_failed_reasons;

  const {
    returnReasons,
    deliveryFailedReasons,
    totalReturnReasonsCount,
    totalDeliveryFailedReasonsCount
  } = useMemo(() => {
    if (Array.isArray(rawReturnReasons) && Array.isArray(rawDeliveryFailedReasons)) {
      const totRet = rawReturnReasons.reduce((acc, r) => acc + (r.count || 0), 0);
      const totFail = rawDeliveryFailedReasons.reduce((acc, r) => acc + (r.count || 0), 0);
      return {
        returnReasons: rawReturnReasons,
        deliveryFailedReasons: rawDeliveryFailedReasons,
        totalReturnReasonsCount: totRet,
        totalDeliveryFailedReasonsCount: totFail
      };
    }

    // Fallback if data was cached or returned in legacy format
    const retList = [];
    const failList = [];
    let totRet = 0;
    let totFail = 0;

    for (const r of reasons) {
      const reasonName = r.reason || '';
      const isDeliveryAttempt = /บ้านปิด|ออกใบแจ้ง|ผู้รับไม่อยู่|ติดต่อไม่ได้|ไม่มารับตามกำหนด|จ่าหน้าไม่ชัดเจน|ขอรับ ณ/i.test(reasonName);
      if (isDeliveryAttempt) {
        failList.push(r);
        totFail += (r.count || 0);
      } else {
        retList.push(r);
        totRet += (r.count || 0);
      }
    }

    return {
      returnReasons: retList.map(r => ({
        ...r,
        pct: totRet > 0 ? (r.count * 100 / totRet) : 0
      })),
      deliveryFailedReasons: failList.map(r => ({
        ...r,
        pct: totFail > 0 ? (r.count * 100 / totFail) : 0
      })),
      totalReturnReasonsCount: totRet,
      totalDeliveryFailedReasonsCount: totFail
    };
  }, [rawReturnReasons, rawDeliveryFailedReasons, reasons]);

  const totalItems = summary.total_items || 0;
  const receivedCount = summary.received_count || 0;
  const inTransitCount = summary.in_transit_count || 0;
  const deliveredCount = summary.delivered_count || 0;
  const returnedCount = summary.failed_count || 0;
  const totalFee = summary.total_fee || 0;

  const receivedRate = totalItems > 0 ? ((receivedCount / totalItems) * 100).toFixed(2) : '0.00';
  const inTransitRate = totalItems > 0 ? ((inTransitCount / totalItems) * 100).toFixed(2) : '0.00';
  const deliveredRate = totalItems > 0 ? ((deliveredCount / totalItems) * 100).toFixed(2) : '0.00';
  const returnedRate = totalItems > 0 ? ((returnedCount / totalItems) * 100).toFixed(2) : '0.00';

  const statCards = [
    // 1. รับฝากแล้ว
    {
      label: 'รับฝากแล้ว',
      value: receivedCount,
      unit: `(${receivedRate}%)`,
      valueColorClass: 'text-blue',
      className: 'icon-received-deposit',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="20 12 20 22 4 22 4 12"></polyline>
          <rect x="2" y="7" width="20" height="5"></rect>
          <line x1="12" y1="22" x2="12" y2="7"></line>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
        </svg>
      )
    },
    // 2. อยู่ระหว่างการนำจ่าย
    {
      label: 'อยู่ระหว่างการนำจ่าย',
      value: inTransitCount,
      unit: `(${inTransitRate}%)`,
      valueColorClass: 'text-amber',
      className: 'icon-transit',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="1" y="3" width="15" height="13"></rect>
          <polygon points="16 8 20 8 23 11 23 16 16 8"></polygon>
          <circle cx="5.5" cy="18.5" r="2.5"></circle>
          <circle cx="18.5" cy="18.5" r="2.5"></circle>
        </svg>
      )
    },
    // 3. นำจ่ายสำเร็จ
    {
      label: 'นำจ่ายสำเร็จ',
      value: deliveredCount,
      unit: `(${deliveredRate}%)`,
      valueColorClass: 'text-emerald',
      className: 'icon-delivered',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      )
    },
    // 4. ส่งคืน
    {
      label: 'ส่งคืน',
      value: returnedCount,
      unit: `(${returnedRate}%)`,
      valueColorClass: 'text-rose',
      className: 'icon-returned',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="9 14 4 9 9 4"></polyline>
          <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
        </svg>
      )
    },
    // 5. รายการทั้งหมด
    {
      label: 'รายการทั้งหมด',
      value: totalItems,
      unit: 'ฉบับ',
      valueColorClass: '',
      className: 'icon-total',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
        </svg>
      )
    },
    // 6. ยอดรวมค่าบริการ
    {
      label: 'ยอดรวมค่าบริการ',
      value: Number(totalFee || 0).toLocaleString('th-TH', {
        minimumFractionDigits: Number(totalFee || 0) % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
      }),
      unit: '',
      valueColorClass: 'text-gold',
      className: 'icon-fee',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="12" y1="1" x2="12" y2="23"></line>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      )
    }
  ];

  return (
    <main className="deposit-page-main">
      <div className="deposit-page-container">

        {/* Page Header */}
        <div className="deposit-page-header-card">
          <div className="deposit-page-title-group">
            <div className="deposit-page-icon-badge">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
                <line x1="3" y1="20" x2="21" y2="20"></line>
              </svg>
            </div>
            <div>
              <h2 className="deposit-page-title">สถิติ</h2>
              <p className="deposit-page-subtitle">
                สรุปผลการรับฝากและการนำจ่าย ดูอัตราสำเร็จ/ไม่สำเร็จ และสาเหตุการส่งคืนตามจังหวัด
                {currentPerson?.Organization ? ` • ${currentPerson.Organization}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="deposit-control-card">
          <div className="deposit-date-range-group">
            <div className="deposit-date-item">
              <label htmlFor="dash-start-date" className="deposit-control-label">ตั้งแต่วันที่:</label>
              <ThaiDateInput id="dash-start-date" value={startDate} onChange={setStartDate} disabled={loading} />
            </div>
            <div className="deposit-date-item">
              <label htmlFor="dash-end-date" className="deposit-control-label">ถึงวันที่:</label>
              <ThaiDateInput id="dash-end-date" value={endDate} onChange={setEndDate} disabled={loading} />
            </div>
            <div className="deposit-quick-date-btns">
              <button type="button" className={`btn-quick-date ${startDate === todayIso && endDate === todayIso ? 'active' : ''}`} onClick={() => handleSetQuickDate('today')} disabled={loading}>วันนี้</button>
              <button type="button" className={`btn-quick-date ${startDate === yesterdayIso && endDate === yesterdayIso ? 'active' : ''}`} onClick={() => handleSetQuickDate('yesterday')} disabled={loading}>เมื่อวาน</button>
              <button type="button" className={`btn-quick-date ${startDate === last7DaysIso && endDate === todayIso ? 'active' : ''}`} onClick={() => handleSetQuickDate('last7days')} disabled={loading}>7 วันล่าสุด</button>
              <button type="button" className={`btn-quick-date ${startDate === monthStartIso && endDate === todayIso ? 'active' : ''}`} onClick={() => handleSetQuickDate('thisMonth')} disabled={loading}>เดือนนี้</button>
              <button type="button" className={`btn-quick-date ${startDate === lastMonthStartIso && endDate === lastMonthEndIso ? 'active' : ''}`} onClick={() => handleSetQuickDate('lastMonth')} disabled={loading}>เดือนที่แล้ว</button>
            </div>
          </div>
          <div className="deposit-control-actions">
            <button
              type="button"
              className="btn-reset-deposit"
              onClick={() => {
                setStartDate(monthStartIso);
                setEndDate(todayIso);
                setError('');
                handleFetchReport(monthStartIso, todayIso);
              }}
              disabled={loading}
              title="คืนค่าเป็นเดือนนี้"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>คืนค่าเริ่มต้น</span>
            </button>
            <button type="button" className="btn-fetch-report" onClick={() => handleFetchReport(startDate, endDate)} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner-small"></span>
                  <span>กำลังดึงข้อมูล...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>อัปเดตข้อมูล</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="deposit-alert error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}
        {data?.api_notice && !/no receive product|no data/i.test(data.api_notice) && (
          <div className="deposit-alert info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>{data.api_notice}</span>
          </div>
        )}

        {loading && !data && (
          <div className="dash-empty dash-loading-state">
            <span className="spinner-medium"></span>
            <p>กำลังดึงข้อมูลสถิติประจำเดือนนี้...</p>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="dash-empty">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
              <line x1="3" y1="20" x2="21" y2="20"></line>
            </svg>
            <p>เลือกช่วงวันที่แล้วกด “อัปเดตข้อมูล” เพื่อดูสถิติการนำจ่ายและแผนที่รายจังหวัด</p>
          </div>
        )}

        {data && (
          <>
            {/* 1. Summary Stat Cards */}
            <div className="deposit-stats-grid">
              {statCards.map((card, i) => (
                <div className="deposit-stat-card" key={i}>
                  <div className={`stat-card-icon ${card.className}`}>{card.icon}</div>
                  <div className="stat-card-content">
                    <div className="stat-label">{card.label}</div>
                    <div className={`stat-value ${card.valueColorClass || ''}`}>
                      {card.value}
                      {card.unit ? (
                        <>
                          {' '}
                          <span className="stat-unit">{card.unit}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 2. Map + Province ranking layout */}
            <div className="dash-map-layout">
              <div className="dash-section-card dash-map-card">
                <div className="dash-section-title-row">
                  <div className="dash-section-title-group">
                    <h3 className="dash-section-title">แผนที่อัตราการนำจ่ายสำเร็จตามจังหวัด</h3>
                    <span className="dash-section-sub">
                      ครอบคลุม {provinceCount} จังหวัด{data?.is_mock ? ' • ข้อมูลตัวอย่าง (Demo)' : ''}
                    </span>
                  </div>
                </div>
                <div className="dash-map-body">
                  <div
                    className="dash-map-svg-wrap"
                    ref={mapWrapRef}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMapContainerMouseLeave}
                  >
                    <svg
                      viewBox={`${THAILAND_VIEWBOX.x} ${THAILAND_VIEWBOX.y} ${THAILAND_VIEWBOX.width} ${THAILAND_VIEWBOX.height}`}
                      className="dash-map-svg"
                      role="img"
                      aria-label="แผนที่ประเทศไทยแสดงอัตราการนำจ่ายสำเร็จรายจังหวัด"
                    >
                      <g>
                        {THAILAND_PROVINCES.map((prov) => {
                          const stat = provinceStatsByKey[normalizeProvinceName(prov.name)] || null;
                          const rate = stat ? Number(stat.success_rate) : null;
                          const isLocked = lockedProvince && normalizeProvinceName(lockedProvince) === normalizeProvinceName(prov.name);
                          const isHovered = hoveredProvince && normalizeProvinceName(hoveredProvince) === normalizeProvinceName(prov.name);
                          return (
                            <path
                              key={prov.name}
                              d={prov.d}
                              fill={successColor(rate)}
                              stroke="#ffffff"
                              strokeWidth="0.8"
                              className={`dash-map-prov ${isLocked ? 'locked' : isHovered ? 'hovered' : ''}`}
                              onMouseEnter={(e) => handleProvinceMouseEnter(prov, e)}
                              onMouseLeave={handleProvinceMouseLeave}
                              onClick={() => handleToggleLockProvince(prov.name)}
                            />
                          );
                        })}
                        {/* Pinned/Locked province highlight overlay outline */}
                        {lockedProvinceObj && (
                          <path
                            d={lockedProvinceObj.d}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="3.2"
                            strokeLinejoin="round"
                            className="dash-map-prov-locked-ring"
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    </svg>

                    {/* Rich Custom Floating Tooltip */}
                    {tooltip.visible && tooltip.province && (
                      <div
                        className="dash-map-rich-tooltip"
                        style={{
                          left: `${tooltip.x}px`,
                          top: `${tooltip.y}px`,
                          transform: `translate(${tooltip.flipX ? '-108%' : '14px'}, ${tooltip.flipY ? '-105%' : '14px'})`
                        }}
                      >
                        <div className="dash-tt-header">
                          <div className="dash-tt-title">
                            <span className="dash-tt-pin">📍</span>
                            <span className="dash-tt-name">{tooltip.province}</span>
                          </div>
                          <div
                            className="dash-tt-rate-pill"
                            style={{
                              backgroundColor: getRateBgColor(tooltip.rate),
                              color: getRateTextColor(tooltip.rate)
                            }}
                          >
                            {tooltip.rate !== null && !isNaN(tooltip.rate)
                              ? `${formatPct(tooltip.rate)}% สำเร็จ`
                              : 'ไม่มีข้อมูล'}
                          </div>
                        </div>

                        {tooltip.stat && tooltip.stat.count > 0 ? (
                          <div className="dash-tt-body">
                            {/* Progress bar */}
                            <div className="dash-tt-progress-track">
                              <div
                                className="dash-tt-progress-bar"
                                style={{
                                  width: `${Math.min(100, Math.max(0, tooltip.rate || 0))}%`,
                                  background: getRateGradient(tooltip.rate)
                                }}
                              />
                            </div>

                            {/* Stats 2x2 grid */}
                            <div className="dash-tt-metrics">
                              <div className="dash-tt-metric">
                                <span className="dash-tt-metric-label"><span className="dot t-blue"></span> รับฝาก</span>
                                <strong className="dash-tt-metric-value">{tooltip.stat.received ?? 0}</strong>
                              </div>
                              <div className="dash-tt-metric">
                                <span className="dash-tt-metric-label"><span className="dot t-amber"></span> นำจ่าย</span>
                                <strong className="dash-tt-metric-value">{tooltip.stat.in_transit ?? 0}</strong>
                              </div>
                              <div className="dash-tt-metric">
                                <span className="dash-tt-metric-label"><span className="dot t-green"></span> สำเร็จ</span>
                                <strong className="dash-tt-metric-value text-emerald">{tooltip.stat.delivered ?? 0}</strong>
                              </div>
                              <div className="dash-tt-metric">
                                <span className="dash-tt-metric-label"><span className="dot t-red"></span> ส่งคืน</span>
                                <strong className="dash-tt-metric-value text-rose">{tooltip.stat.failed ?? 0}</strong>
                              </div>
                            </div>

                            <div className="dash-tt-total">
                              <span>รวมพัสดุทั้งหมด</span>
                              <strong>{tooltip.stat.count} ฉบับ</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="dash-tt-empty">
                            <span>ยังไม่มีรายการจัดส่งในจังหวัดนี้</span>
                          </div>
                        )}

                        {/* Footer Action Hint */}
                        <div className="dash-tt-footer">
                          {lockedProvince && normalizeProvinceName(lockedProvince) === normalizeProvinceName(tooltip.province) ? (
                            <span className="dash-tt-action-hint is-locked">
                              🔓 คลิกเพื่อปลดล็อคข้อมูล
                            </span>
                          ) : (
                            <span className="dash-tt-action-hint">
                              🔒 คลิกเพื่อล็อคข้อมูลจังหวัดนี้
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="dash-map-legend">
                      <div className="dash-legend-title">อัตราสำเร็จ</div>
                      <div className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#22c55e' }}></span> 90%+</div>
                      <div className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#84cc16' }}></span> 70–89%</div>
                      <div className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#f59e0b' }}></span> 50–69%</div>
                      <div className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#f97316' }}></span> 20–49%</div>
                      <div className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#ef4444' }}></span> &lt;20%</div>
                      <div className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#9aa6b2' }}></span> ไม่มีข้อมูล</div>
                    </div>
                  </div>

                  <div className="dash-province-detail">
                    {activeProvinceDetail ? (
                      <div className={`dash-province-detail-inner ${lockedProvince ? 'is-locked' : ''}`}>
                        <div className="dash-pd-name-row">
                          <div className="dash-pd-name">
                            <strong>{activeProvinceDetail.province}</strong>
                          </div>
                          <div className="dash-pd-rate-wrap">
                            {activeProvinceDetail.success_rate != null ? (
                              <span className={`dash-pd-rate-pill ${activeProvinceDetail.success_rate >= 70 ? 'good' : activeProvinceDetail.success_rate >= 50 ? 'mid' : 'bad'}`}>
                                {formatPct(activeProvinceDetail.success_rate)}% สำเร็จ
                              </span>
                            ) : (
                              <span className="dash-pd-rate-pill muted">ไม่มีข้อมูล</span>
                            )}
                            {lockedProvince && (
                              <button
                                type="button"
                                className="dash-pd-close-btn"
                                onClick={() => setLockedProvince(null)}
                                title="ปลดล็อคการแสดงผล"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="dash-pd-stats">
                          <div className="dash-pd-stat"><span className="dot t-blue"></span> รับฝากแล้ว <strong>{activeProvinceDetail.received ?? 0}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-amber"></span> อยู่ระหว่างการนำจ่าย <strong>{activeProvinceDetail.in_transit ?? 0}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-green"></span> สำเร็จ <strong>{activeProvinceDetail.delivered ?? 0}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-red"></span> ส่งคืน <strong>{activeProvinceDetail.failed ?? 0}</strong></div>
                          <div className="dash-pd-stat total"><span className="dot t-slate"></span> รวมทั้งหมด <strong>{activeProvinceDetail.count ?? 0}</strong></div>
                        </div>
                      </div>
                    ) : (
                      <div className="dash-pd-placeholder">
                        <div className="dash-pd-placeholder-icon">🗺️</div>
                        <div className="dash-pd-placeholder-title">เลือกดูข้อมูลจังหวัด</div>
                        <div>เลื่อนเมาส์ชี้บนแผนที่เพื่อดูสรุป หรือคลิกที่จังหวัดเพื่อล็อคข้อมูล</div>
                        <span className="dash-pd-hint">สามารถคลิกเลือกจากตารางจัดอันดับด้านขวาได้เช่นกัน</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="dash-section-card dash-ranking-card">
                <div className="dash-section-title-row">
                  <div className="dash-section-title-group">
                    <h3 className="dash-section-title">จัดอันดับจังหวัด ({provinceCount})</h3>
                  </div>
                </div>
                <div className="dash-ranking-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>จังหวัด</th>
                        <th className="ta-r">รวม</th>
                        <th className="ta-r">รับฝากแล้ว</th>
                        <th className="ta-r">อยู่ระหว่างการนำจ่าย</th>
                        <th className="ta-r">สำเร็จ</th>
                        <th className="ta-r">ส่งคืน</th>
                        <th className="ta-r">%สำเร็จ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provinces.map((p) => {
                        const isLocked = lockedProvince && normalizeProvinceName(lockedProvince) === normalizeProvinceName(p.province);
                        const isHovered = hoveredProvince && normalizeProvinceName(hoveredProvince) === normalizeProvinceName(p.province);
                        const rate = p.success_rate == null ? '' : `${formatPct(p.success_rate)}%`;
                        return (
                          <tr
                            key={p.province}
                            className={`dash-table-row ${isLocked ? 'locked-row' : isHovered ? 'hovered-row' : ''}`}
                            onClick={() => handleToggleLockProvince(p.province)}
                            onMouseEnter={() => setHoveredProvince(p.province)}
                            onMouseLeave={() => setHoveredProvince(null)}
                            title={isLocked ? 'คลิกเพื่อปลดล็อค' : 'คลิกเพื่อล็อคข้อมูลจังหวัดนี้'}
                          >
                            <td className="ta-l">
                              <span className="dash-row-prov-name">
                                {isLocked && <span className="dash-row-lock-icon">🔒</span>}
                                {p.province}
                              </span>
                            </td>
                            <td className="ta-r">{p.count}</td>
                            <td className="ta-r">{p.received ?? 0}</td>
                            <td className="ta-r">{p.in_transit ?? 0}</td>
                            <td className="ta-r">{p.delivered}</td>
                            <td className="ta-r">{p.failed}</td>
                            <td className="ta-r">
                              {p.success_rate == null ? <span className="muted">-</span> : (
                                <span className={p.success_rate >= 70 ? 'rate-good' : p.success_rate >= 50 ? 'rate-mid' : 'rate-bad'}>{rate}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {provinces.length === 0 && (
                        <tr><td colSpan="7" className="dash-section-empty">ไม่มีข้อมูล</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 3. Reasons Cards (Separated into Return Reasons and Delivery Failed Reasons) */}
            <div className="dash-reasons-container">
              {/* Card 1: สาเหตุการส่งคืน */}
              <div className="dash-section-card dash-reasons-card dash-return-card">
                <div className="dash-section-title-row">
                  <div className="dash-section-title-group">
                    <div className="stat-card-icon icon-returned dash-mini-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 className="dash-section-title">สาเหตุการส่งคืน</h3>
                      <span className="dash-section-sub">
                        {totalReturnReasonsCount > 0
                          ? `พบสาเหตุการส่งคืนทั้งหมด ${totalReturnReasonsCount} รายการ (${summary.failed_count ?? totalReturnReasonsCount} พัสดุส่งคืน)`
                          : 'ไม่พบรายการพัสดุส่งคืน'}
                      </span>
                    </div>
                  </div>
                </div>
                {returnReasons.length === 0 ? (
                  <div className="dash-section-empty">
                    <p>ไม่พบรายการพัสดุส่งคืนในช่วงวันที่ที่เลือก</p>
                  </div>
                ) : (
                  <div className="dash-reasons-list">
                    {returnReasons.map((r) => {
                      const pct = totalReturnReasonsCount > 0
                        ? (r.count * 100 / totalReturnReasonsCount)
                        : (Number(r.pct) || 0);
                      return (
                        <div className="dash-reason-row dash-return-row" key={r.reason}>
                          <div className="dash-reason-top">
                            <div className="dash-reason-name">
                              <span className="dash-reason-dot dot-return"></span>
                              <span>{r.reason}</span>
                            </div>
                            <div className="dash-reason-nums">
                              <span className="dash-reason-count">{r.count} <span className="stat-unit">รายการ</span></span>
                              <span className="dash-reason-pct-chip chip-return">{formatPct(pct)}%</span>
                            </div>
                          </div>
                          <div className="dash-reason-bar-track">
                            <div
                              className={`dash-reason-bar bar-return ${r.count > 0 ? 'has' : ''}`}
                              style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Card 2: สาเหตุการนำจ่ายไม่สำเร็จ */}
              <div className="dash-section-card dash-reasons-card dash-failed-card">
                <div className="dash-section-title-row">
                  <div className="dash-section-title-group">
                    <div className="stat-card-icon icon-transit dash-mini-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
                    <div>
                      <h3 className="dash-section-title">สาเหตุการนำจ่ายไม่สำเร็จ</h3>
                      <span className="dash-section-sub">
                        {totalDeliveryFailedReasonsCount > 0
                          ? `พบสาเหตุทั้งหมด ${totalDeliveryFailedReasonsCount} รายการ (${summary.in_transit_count ?? totalDeliveryFailedReasonsCount} พัสดุอยู่ระหว่างนำจ่าย)`
                          : 'ไม่พบรายการนำจ่ายไม่สำเร็จ'}
                      </span>
                    </div>
                  </div>
                </div>
                {deliveryFailedReasons.length === 0 ? (
                  <div className="dash-section-empty">
                    <p>ไม่พบรายการนำจ่ายไม่สำเร็จในช่วงวันที่ที่เลือก</p>
                  </div>
                ) : (
                  <div className="dash-reasons-list">
                    {deliveryFailedReasons.map((r) => {
                      const pct = totalDeliveryFailedReasonsCount > 0
                        ? (r.count * 100 / totalDeliveryFailedReasonsCount)
                        : (Number(r.pct) || 0);
                      return (
                        <div className="dash-reason-row dash-failed-row" key={r.reason}>
                          <div className="dash-reason-top">
                            <div className="dash-reason-name">
                              <span className="dash-reason-dot dot-failed"></span>
                              <span>{r.reason}</span>
                            </div>
                            <div className="dash-reason-nums">
                              <span className="dash-reason-count">{r.count} <span className="stat-unit">รายการ</span></span>
                              <span className="dash-reason-pct-chip chip-failed">{formatPct(pct)}%</span>
                            </div>
                          </div>
                          <div className="dash-reason-bar-track">
                            <div
                              className={`dash-reason-bar bar-failed ${r.count > 0 ? 'has' : ''}`}
                              style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}