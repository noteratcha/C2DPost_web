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

// Legende-based success-rate coloring
function successColor(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '#9aa6b2';
  if (rate >= 90) return '#22c55e';
  if (rate >= 70) return '#84cc16';
  if (rate >= 50) return '#f59e0b';
  if (rate >= 20) return '#f97316';
  return '#ef4444';
}

const STATUS_META = {
  delivered: { label: 'นำจ่ายสำเร็จ', className: 'dash-badge-success' },
  returned: { label: 'ส่งคืน / ไม่สำเร็จ', className: 'dash-badge-danger' },
  received: { label: 'รับฝากแล้ว', className: 'dash-badge-info' },
  in_transit: { label: 'อยู่ระหว่างการนำจ่าย', className: 'dash-badge-warn' },
  pending: { label: 'อยู่ระหว่างการนำจ่าย', className: 'dash-badge-warn' }
};

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

  const [startDate, setStartDate] = useState(() => cachedState?.startDate || todayIso);
  const [endDate, setEndDate] = useState(() => cachedState?.endDate || todayIso);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(() => cachedState?.data || null);
  const [selectedProvince, setSelectedProvince] = useState(null);

  // Parcels sub-list filters
  const [parcelTab, setParcelTab] = useState('all');
  const [parcelSearch, setParcelSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setCachedDashboardState({ startDate, endDate, data, updatedAt: Date.now() });
  }, [startDate, endDate, data]);

  // Dev/testing hook: auto-fetch today's report when ?autofetch=1 (headless smoke)
  const startedAutoFetch = useRef(false);
  useEffect(() => {
    if (AUTO_FETCH && !startedAutoFetch.current && currentPerson) {
      startedAutoFetch.current = true;
      handleFetchReport(startDate, endDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [AUTO_FETCH, currentPerson]);

  const handleSetQuickDate = useCallback((kind) => {
    if (kind === 'today') { setStartDate(todayIso); setEndDate(todayIso); }
    else if (kind === 'yesterday') { setStartDate(yesterdayIso); setEndDate(yesterdayIso); }
    else if (kind === 'last7days') { setStartDate(last7DaysIso); setEndDate(todayIso); }
    else if (kind === 'thisMonth') { setStartDate(monthStartIso); setEndDate(todayIso); }
    else if (kind === 'lastMonth') { setStartDate(lastMonthStartIso); setEndDate(lastMonthEndIso); }
  }, [todayIso, yesterdayIso, last7DaysIso, monthStartIso, lastMonthStartIso, lastMonthEndIso]);

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
        setSelectedProvince(null);
        setCurrentPage(1);
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

  const summary = data?.summary || {
    total_items: 0,
    delivered_count: 0,
    failed_count: 0,
    received_count: 0,
    in_transit_count: 0,
    pending_count: 0,
    delivered_pct_of_concluded: 0,
    failed_pct_of_concluded: 0
  };
  const reasons = Array.isArray(data?.reasons) ? data.reasons : [];
  const provinces = Array.isArray(data?.provinces) ? data.provinces : [];
  const parcels = Array.isArray(data?.parcels) ? data.parcels : [];

  // Build lookup from normalized province name -> stats
  const provinceStatsByKey = useMemo(() => {
    const map = {};
    for (const p of provinces) {
      map[normalizeProvinceName(p.province)] = p;
    }
    return map;
  }, [provinces]);

  const provinceCount = provinces.length;

  // Selected province detail lookup (by raw name)
  const selectedProvinceDetail = useMemo(() => {
    if (!selectedProvince) return null;
    return provinceStatsByKey[normalizeProvinceName(selectedProvince)] || null;
  }, [selectedProvince, provinceStatsByKey]);

  // Filtered parcels
  const filteredParcels = useMemo(() => {
    let list = parcels;
    if (parcelTab !== 'all') {
      list = list.filter((r) => r.status_key === parcelTab);
    }
    const q = (parcelSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        String(r.barcode || '').toLowerCase().includes(q) ||
        String(r.receiver_name || '').toLowerCase().includes(q) ||
        String(r.receiver_province || '').toLowerCase().includes(q))
      ;
    }
    return list;
  }, [parcels, parcelTab, parcelSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredParcels.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedParcels = useMemo(() => {
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    return filteredParcels.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredParcels, currentPage]);

  const dateDisplay = data?.date_display || (startDate === endDate
    ? toApiDateFormat(startDate)
    : `${toApiDateFormat(startDate)} ถึง ${toApiDateFormat(endDate)}`);

  const statCards = [
    {
      label: 'รับฝาก (ทั้งหมด)',
      value: summary.total_items,
      unit: '',
      className: 'dash-stat-blue',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      )
    },
    {
      label: 'รับฝากแล้ว',
      value: summary.received_count,
      unit: ` (${summary.received_pct_of_total ?? 0}% ของทั้งหมด)`,
      className: 'dash-stat-blue',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
        </svg>
      )
    },
    {
      label: 'อยู่ระหว่างการนำจ่าย',
      value: summary.in_transit_count,
      unit: ` (${summary.in_transit_pct_of_total ?? 0}% ของทั้งหมด)`,
      className: 'dash-stat-warn',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      )
    },
    {
      label: 'นำจ่ายสำเร็จ',
      value: summary.delivered_count,
      unit: ` (${summary.delivered_pct_of_concluded ?? 0}% ของที่สรุปผล)`,
      className: 'dash-stat-success',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
      )
    },
    {
      label: 'ส่งคืน / ไม่สำเร็จ',
      value: summary.failed_count,
      unit: ` (${summary.failed_pct_of_concluded ?? 0}% ของที่สรุปผล)`,
      className: 'dash-stat-danger',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M18 6L6 18"></path>
          <path d="M6 6l12 12"></path>
        </svg>
      )
    }
  ];

  return (
    <main className="dash-page-main python-layout-main">
      <div className="dash-page-container python-container">

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
              <h2 className="deposit-page-title">สถิติการนำจ่าย &amp; แผนที่รายจังหวัด</h2>
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
            <button type="button" className="btn-reset-deposit" onClick={() => { setStartDate(todayIso); setEndDate(todayIso); setError(''); }} disabled={loading} title="คืนค่าวันที่เป็นวันนี้">
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
        {data?.api_notice && (
          <div className="deposit-alert info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>{data.api_notice}</span>
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
            {/* Summary Stat Cards */}
            <div className="deposit-stats-grid">
              {statCards.map((card, i) => (
                <div className="deposit-stat-card" key={i}>
                  <div className={`stat-card-icon ${card.className}`}>{card.icon}</div>
                  <div className="stat-card-content">
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-value">
                      {card.value} <span className="stat-unit">{card.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Failure Reasons */}
            <div className="dash-section-card">
              <div className="dash-section-title-row">
                <h3 className="dash-section-title">สาเหตุการส่งคืน / นำจ่ายไม่สำเร็จ</h3>
                <span className="dash-section-sub">(สรุปผลแล้ว {summary.concluded_count ?? 0} รายการ)</span>
              </div>
              {reasons.length === 0 ? (
                <div className="dash-section-empty">ไม่มีรายการส่งคืนในข้อมูลที่เลือก</div>
              ) : (
                <div className="dash-reasons-list">
                  {reasons.map((r) => (
                    <div className="dash-reason-row" key={r.reason}>
                      <div className="dash-reason-top">
                        <div className="dash-reason-name">{r.reason}</div>
                        <div className="dash-reason-nums">
                          <span className="dash-reason-count">{r.count}</span>
                          <span className="dash-reason-pct">{r.pct_of_failed}%</span>
                        </div>
                      </div>
                      <div className="dash-reason-bar-track">
                        <div className={`dash-reason-bar ${r.count > 0 ? 'has' : ''}`} style={{ width: `${Math.min(100, Math.max(4, r.pct_of_failed))}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Map + Province ranking */}
            <div className="dash-map-layout">
              <div className="dash-section-card dash-map-card">
                <div className="dash-section-title-row">
                  <h3 className="dash-section-title">แผนที่อัตราการนำจ่ายสำเร็จตามจังหวัด</h3>
                  <span className="dash-section-sub">
                    ครอบคลุม {provinceCount} จังหวัด{data?.is_mock ? ' • ข้อมูลตัวอย่าง (Demo)' : ''}
                  </span>
                </div>
                <div className="dash-map-body">
                  <div className="dash-map-svg-wrap" onMouseLeave={() => setSelectedProvince(null)}>
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
                          const selected = selectedProvince && normalizeProvinceName(selectedProvince) === normalizeProvinceName(prov.name);
                          return (
                            <path
                              key={prov.name}
                              d={prov.d}
                              fill={successColor(rate)}
                              stroke="#ffffff"
                              strokeWidth="0.8"
                              className={`dash-map-prov ${selected ? 'selected' : ''}`}
                              onMouseEnter={() => setSelectedProvince(prov.name)}
                              onClick={() => setSelectedProvince(prov.name)}
                            >
                              <title>{`${prov.name}: ${stat ? `สำเร็จ ${stat.success_rate}% (รวม ${stat.count}, อยู่ระหว่างการนำจ่าย ${stat.in_transit ?? 0}, รับฝากแล้ว ${stat.received ?? 0}, สำเร็จ ${stat.delivered}, ส่งคืน ${stat.failed})` : 'ไม่มีข้อมูล'}`}</title>
                            </path>
                          );
                        })}
                      </g>
                    </svg>
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
                    {selectedProvinceDetail ? (
                      <div className="dash-province-detail-inner">
                        <div className="dash-pd-name">
                          <strong>{selectedProvinceDetail.province}</strong>
                          {selectedProvinceDetail.province !== provinces.find((p) => p.province === selectedProvinceDetail.province)?.province ? '' : ''}
                        </div>
                        <div className="dash-pd-rate">
                          อัตราสำเร็จ <span className={selectedProvinceDetail.success_rate == null ? 'muted' : selectedProvinceDetail.success_rate >= 50 ? 'good' : 'bad'}>{selectedProvinceDetail.success_rate == null ? 'ไม่มีข้อมูล' : `${selectedProvinceDetail.success_rate}%`}</span>
                        </div>
                        <div className="dash-pd-stats">
                          <div className="dash-pd-stat"><span className="dot t-blue"></span> รับฝากแล้ว <strong>{selectedProvinceDetail.received ?? 0}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-amber"></span> อยู่ระหว่างการนำจ่าย <strong>{selectedProvinceDetail.in_transit ?? 0}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-green"></span> สำเร็จ <strong>{selectedProvinceDetail.delivered}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-red"></span> ส่งคืน <strong>{selectedProvinceDetail.failed}</strong></div>
                          <div className="dash-pd-stat"><span className="dot t-slate"></span> รวม <strong>{selectedProvinceDetail.count}</strong></div>
                        </div>
                      </div>
                    ) : (
                      <div className="dash-pd-placeholder">
                        เลื่อนเมาส์หรือคลิกบนแผนที่เพื่อดูรายละเอียดรายจังหวัด
                        <br />
                        <span className="dash-pd-hint">สามารถลากเมาส์คลุมได้ (แผนที่สูง — ใช้ scroll บนช่วงแผนที่)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="dash-section-card dash-ranking-card">
                <div className="dash-section-title-row">
                  <h3 className="dash-section-title">จัดอันดับจังหวัด ({provinceCount})</h3>
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
                        const rate = p.success_rate == null ? '' : `${p.success_rate}%`;
                        return (
                          <tr
                            key={p.province}
                            className={selectedProvince && normalizeProvinceName(selectedProvince) === normalizeProvinceName(p.province) ? 'selected-row' : ''}
                            onClick={() => setSelectedProvince(p.province)}
                          >
                            <td className="ta-l">{p.province}</td>
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

            {/* Parcels detail */}
            <div className="dash-section-card">
              <div className="dash-section-title-row dash-section-title-row-wrap">
                <h3 className="dash-section-title">รายการพัสดุ ({parcels.length} รายการ{data?.parcels_truncated ? ' — แสดงบางส่วน' : ''})</h3>
                <div className="dash-parcel-controls">
                  <div className="dash-parcel-tabs">
                    {[['all', 'ทั้งหมด'], ['received', 'รับฝากแล้ว'], ['in_transit', 'อยู่ระหว่างการนำจ่าย'], ['delivered', 'สำเร็จ'], ['returned', 'ส่งคืน']].map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        className={`btn-quick-date ${parcelTab === key ? 'active' : ''}`}
                        onClick={() => { setParcelTab(key); setCurrentPage(1); }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    className="dash-parcel-search"
                    placeholder="ค้นหาบาร์โค้ด / ชื่อ / จังหวัด"
                    value={parcelSearch}
                    onChange={(e) => { setParcelSearch(e.target.value); setCurrentPage(1); }}
                  />
                </div>
              </div>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th className="ta-l">ลำดับ</th>
                      <th className="ta-l">บาร์โค้ด</th>
                      <th className="ta-l">ผู้รับ</th>
                      <th className="ta-l">จังหวัด</th>
                      <th className="ta-l">สถานะ</th>
                      <th className="ta-l">สาเหตุ (ถ้าส่งคืน)</th>
                      <th className="ta-l">จุดที่ระบุล่าสุด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedParcels.map((p) => (
                      <tr key={p.seq}>
                        <td className="ta-l muted">{p.seq}</td>
                        <td className="ta-l">{p.barcode}</td>
                        <td className="ta-l">{p.receiver_name || '-'}</td>
                        <td className="ta-l">{p.receiver_province || '-'}</td>
                        <td className="ta-l">
                          <span className={`dash-badge ${STATUS_META[p.status_key]?.className || 'dash-badge-warn'}`}>
                            {STATUS_META[p.status_key]?.label || p.status_label || 'อยู่ระหว่างการนำจ่าย'}
                          </span>
                        </td>
                        <td className="ta-l">{p.reason || '-'}</td>
                        <td className="ta-l">{p.latest_station || p.latest_date || '-'}</td>
                      </tr>
                    ))}
                    {paginatedParcels.length === 0 && (
                      <tr><td colSpan="7" className="dash-section-empty">ไม่มีรายการที่ตรงตามเงื่อนไข</td></tr>
                    )}
                  </tbody>
                </table>
                {filteredParcels.length > PAGE_SIZE && (
                  <div className="dash-pagination">
                    <button
                      type="button"
                      className="btn-quick-date"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="dash-page-info">หน้า {currentPage} / {totalPages}</span>
                    <button
                      type="button"
                      className="btn-quick-date"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      ถัดไป
                    </button>
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