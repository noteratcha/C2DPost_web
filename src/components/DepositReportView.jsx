import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchReceivedReport, exportDepositReportExcel, exportDepositReportPdf, batchFetchTracking } from '../utils/api';
import TrackingTimelineModal from './TrackingTimelineModal';
import './DepositReportView.css';

const DEPOSIT_REPORT_CACHE_KEY = 'c2dpost_deposit_report_cache';

function getCachedDepositState() {
  try {
    const raw = sessionStorage.getItem(DEPOSIT_REPORT_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error reading deposit report cache:', err);
    return null;
  }
}

function setCachedDepositState(data) {
  try {
    sessionStorage.setItem(DEPOSIT_REPORT_CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Error writing deposit report cache:', err);
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

/**
 * Normalizes raw postal status into one of 3 canonical categories:
 * 1. 'delivered' -> นำจ่ายสำเร็จ
 * 2. 'returned' -> ส่งคืน
 * 3. 'in_transit' -> อยู่ระหว่างการนำจ่าย (All other intermediate statuses)
 */
export function getDeliveryStatusInfo(item) {
  if (!item) return { key: 'in_transit', label: 'อยู่ระหว่างการนำจ่าย', className: 'in-transit' };

  if (item.status_key === 'delivered' || item.status_label === 'นำจ่ายสำเร็จ') {
    return { key: 'delivered', label: 'นำจ่ายสำเร็จ', className: 'delivered' };
  }
  if (item.status_key === 'returned' || item.status_label === 'ส่งคืน') {
    return { key: 'returned', label: 'ส่งคืน', className: 'returned' };
  }
  if (item.status_key === 'received' || item.status_label === 'รับฝากแล้ว') {
    return { key: 'received', label: 'รับฝากแล้ว', className: 'received' };
  }
  if (item.status_key === 'in_transit' || item.status_label === 'อยู่ระหว่างการนำจ่าย') {
    return { key: 'in_transit', label: 'อยู่ระหว่างการนำจ่าย', className: 'in-transit' };
  }

  const desc = (item.status_description_raw || item.status_description || item.statusDescription || '').trim();
  const code = String(item.status || item.statusCode || '').trim();

  // 1. นำจ่ายสำเร็จ
  if (/นำจ่ายสำเร็จ|ผู้รับได้รับเรียบร้อย|จัดส่งสำเร็จ|ส่งมอบเรียบร้อย|ส่งถึงผู้รับแล้ว/i.test(desc) || code === '501' || code.toLowerCase() === 'delivered') {
    return { key: 'delivered', label: 'นำจ่ายสำเร็จ', className: 'delivered' };
  }
  // 2. ส่งคืน
  if (/ส่งคืน|คืนต้นทาง|ส่งคืนผู้ส่ง|ตีกลับ|ไม่สามารถส่งมอบ|ไม่สามารถนำจ่าย/i.test(desc) || ['502', '503', '401', '402'].includes(code) || code.toLowerCase() === 'returned') {
    return { key: 'returned', label: 'ส่งคืน', className: 'returned' };
  }
  // 3. รับฝากแล้ว (initial deposit checkpoint)
  if (code === '1' || code === '001' || code.toLowerCase() === 'received' || /รับฝาก/i.test(desc)) {
    return { key: 'received', label: 'รับฝากแล้ว', className: 'received' };
  }
  // 4. สถานะอื่นๆ ทั้งหมด เป็น อยู่ระหว่างการนำจ่าย
  return { key: 'in_transit', label: 'อยู่ระหว่างการนำจ่าย', className: 'in-transit' };
}

export default function DepositReportView({ currentPerson, onSyncRecords, onSwitchToWorkspace, onOpenTrackingPage }) {
  // Date shortcut calculations
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

  // Retrieve cached state if available
  const cachedState = useMemo(() => getCachedDepositState(), []);

  // Date Range state (restored from cache if available)
  const [startDate, setStartDate] = useState(() => cachedState?.startDate || todayIso);
  const [endDate, setEndDate] = useState(() => cachedState?.endDate || todayIso);

  // Pagination state (20 records per page)
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(() => cachedState?.currentPage || 1);

  // Data & UI states
  const [loading, setLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(() => cachedState?.reportData || null);
  const [searchQuery, setSearchQuery] = useState(() => cachedState?.searchQuery || '');
  const [filterTab, setFilterTab] = useState(() => cachedState?.filterTab || 'all');
  const [selectedTrackingItem, setSelectedTrackingItem] = useState(null);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // Handle live tracking update from modal when viewed
  const handleTrackingUpdated = useCallback((bcode, trackResult) => {
    if (!bcode || !trackResult) return;
    setReportData((prev) => {
      if (!prev || !prev.records) return prev;
      let hasChange = false;
      const updatedRecords = prev.records.map((r) => {
        if (r.barcode === bcode) {
          hasChange = true;
          const evs = trackResult.events || [];
          const latestEv = evs.length > 0 ? evs[evs.length - 1] : null;
          return {
            ...r,
            latest_date: trackResult.latest_datetime || latestEv?.datetime || r.latest_date,
            latest_station: trackResult.latest_location || latestEv?.location || r.latest_station,
            status_key: trackResult.latest_status_key || latestEv?.status_key || r.status_key,
            status_label: trackResult.latest_status_label || latestEv?.status_label || r.status_label,
            status_description: trackResult.latest_status_label || latestEv?.status_label || r.status_description,
            status_description_raw: latestEv?.status_description || trackResult.latest_status_label || r.status_description_raw
          };
        }
        return r;
      });

      if (!hasChange) return prev;

      const delivered_count = updatedRecords.filter((r) => r.status_key === 'delivered').length;
      const in_transit_count = updatedRecords.filter((r) => r.status_key === 'in_transit').length;
      const returned_count = updatedRecords.filter((r) => r.status_key === 'returned').length;
      const received_count = updatedRecords.filter((r) => r.status_key === 'received').length;

      return {
        ...prev,
        summary: {
          ...prev.summary,
          delivered_count,
          in_transit_count,
          returned_count,
          received_count
        },
        records: updatedRecords
      };
    });
  }, []);

  // Batch sync latest status for all items in the report
  const handleSyncAllTracking = useCallback(async () => {
    if (!reportData?.records || reportData.records.length === 0) return;
    const barcodes = reportData.records.map((r) => r.barcode).filter(Boolean);
    if (barcodes.length === 0) return;

    setSyncingTracking(true);
    setSyncProgress(`กำลังซิงก์สถานะ ${barcodes.length} รายการ...`);
    setError('');

    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const result = await batchFetchTracking({ barcodes, username, password });
      
      if (result.success && result.results) {
        const resultMap = result.results;
        setReportData((prev) => {
          if (!prev || !prev.records) return prev;
          const updatedRecords = prev.records.map((r) => {
            const match = resultMap[r.barcode];
            if (match) {
              return {
                ...r,
                latest_date: match.latest_date || r.latest_date,
                latest_station: match.latest_station || r.latest_station,
                status_key: match.status_key || r.status_key,
                status_label: match.status_label || r.status_label,
                status_description: match.status_label || r.status_description,
                status_description_raw: match.status_description_raw || r.status_description_raw
              };
            }
            return r;
          });

          const delivered_count = updatedRecords.filter((r) => r.status_key === 'delivered').length;
          const in_transit_count = updatedRecords.filter((r) => r.status_key === 'in_transit').length;
          const returned_count = updatedRecords.filter((r) => r.status_key === 'returned').length;
          const received_count = updatedRecords.filter((r) => r.status_key === 'received').length;

          return {
            ...prev,
            summary: {
              ...prev.summary,
              delivered_count,
              in_transit_count,
              returned_count,
              received_count
            },
            records: updatedRecords
          };
        });
      }
    } catch (err) {
      setError(`ไม่สามารถซิงก์สถานะล่าสุดได้: ${err.message || err}`);
    } finally {
      setSyncingTracking(false);
      setSyncProgress('');
    }
  }, [reportData, currentPerson]);

  // Persist state to sessionStorage whenever key fields change
  useEffect(() => {
    setCachedDepositState({
      startDate,
      endDate,
      reportData,
      searchQuery,
      filterTab,
      currentPage,
      updatedAt: Date.now()
    });
  }, [startDate, endDate, reportData, searchQuery, filterTab, currentPage]);

  // Fetch report function (accepts start & end dates)
  const handleFetchReport = useCallback(async (startToFetch, endToFetch) => {
    const sIso = startToFetch || startDate;
    const eIso = endToFetch || endDate || sIso;

    if (!sIso || !eIso) {
      setError('กรุณาเลือกช่วงวันที่ต้องการตรวจสอบ');
      return;
    }

    const apiStartDate = toApiDateFormat(sIso);
    const apiEndDate = toApiDateFormat(eIso);
    setLoading(true);
    setError('');

    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const result = await fetchReceivedReport({
        date: apiStartDate,
        endDate: apiEndDate,
        username,
        password
      });

      if (result.success) {
        setReportData(result);
        if (onSyncRecords && Array.isArray(result.records) && result.records.length > 0) {
          onSyncRecords(result.records);
        }
      } else {
        setError(result.message || 'ไม่สามารถดึงข้อมูลรายงานได้');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, currentPerson, onSyncRecords]);

  // Initial load: Only fetch if we DO NOT have cached data already!
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // If we already restored valid reportData from cache, DO NOT re-fetch today's empty report!
    if (cachedState && cachedState.reportData) {
      return;
    }

    // First time opening without cache -> fetch today's report
    handleFetchReport(todayIso, todayIso);
  }, [todayIso, handleFetchReport, cachedState]);

  // Quick date shortcuts handler
  const handleSetQuickDate = (type) => {
    let s = todayIso;
    let e = todayIso;
    if (type === 'yesterday') {
      s = yesterdayIso;
      e = yesterdayIso;
    } else if (type === 'last7days') {
      s = last7DaysIso;
      e = todayIso;
    } else if (type === 'thisMonth') {
      s = monthStartIso;
      e = todayIso;
    }
    setStartDate(s);
    setEndDate(e);
    handleFetchReport(s, e);
  };

  // Reset pagination to page 1 whenever filters change (skip initial mount to preserve restored page)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCurrentPage(1);
  }, [startDate, endDate, searchQuery, filterTab]);

  // Filtered records based on search and tab
  const filteredRecords = useMemo(() => {
    if (!reportData || !reportData.records) return [];
    let list = reportData.records;

    if (filterTab === 'delivered') {
      list = list.filter((r) => getDeliveryStatusInfo(r).key === 'delivered');
    } else if (filterTab === 'in_transit') {
      list = list.filter((r) => getDeliveryStatusInfo(r).key === 'in_transit');
    } else if (filterTab === 'returned') {
      list = list.filter((r) => getDeliveryStatusInfo(r).key === 'returned');
    } else if (filterTab === 'received') {
      list = list.filter((r) => getDeliveryStatusInfo(r).key === 'received');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.barcode && r.barcode.toLowerCase().includes(q)) ||
          (r.inv_no && r.inv_no.toLowerCase().includes(q)) ||
          (r.receiver_name && r.receiver_name.toLowerCase().includes(q)) ||
          (r.receiver_address && r.receiver_address.toLowerCase().includes(q)) ||
          (r.latest_station && r.latest_station.toLowerCase().includes(q)) ||
          (r.received_postoffice && r.received_postoffice.toLowerCase().includes(q)) ||
          (r.latest_date && r.latest_date.includes(q)) ||
          (r.received_date && r.received_date.includes(q))
      );
    }

    return list;
  }, [reportData, filterTab, searchQuery]);

  // Total pages and clamping
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Paginated records (20 items per page)
  const paginatedRecords = useMemo(() => {
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    return filteredRecords.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredRecords, currentPage, PAGE_SIZE]);

  // Page index numbers for table footer
  const startItemIndex = filteredRecords.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItemIndex = Math.min(currentPage * PAGE_SIZE, filteredRecords.length);

  // Pagination navigation buttons list
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [totalPages, currentPage]);

  // Date display label
  const dateDisplay = useMemo(() => {
    if (reportData?.date_display) return reportData.date_display;
    const sApi = toApiDateFormat(startDate);
    const eApi = toApiDateFormat(endDate);
    return sApi === eApi ? sApi : `${sApi} ถึง ${eApi}`;
  }, [reportData, startDate, endDate]);

  // Export handlers (exports all filtered records for the date range)
  const handleExportExcel = async () => {
    if (!filteredRecords || filteredRecords.length === 0) return;
    setIsExportingExcel(true);
    setError('');
    try {
      await exportDepositReportExcel({
        records: filteredRecords,
        summary: reportData?.summary || {},
        date: dateDisplay,
        organization: currentPerson?.Organization || 'สำนักงานที่ดิน'
      });
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (!filteredRecords || filteredRecords.length === 0) return;
    setIsExportingPdf(true);
    setError('');
    try {
      await exportDepositReportPdf({
        records: filteredRecords,
        summary: reportData?.summary || {},
        date: dateDisplay,
        organization: currentPerson?.Organization || 'สำนักงานที่ดิน'
      });
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการส่งออกไฟล์ PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const summary = reportData?.summary || {
    total_items: 0,
    total_weight: 0,
    total_fee: 0,
    received_count: 0
  };

  const deliveredCount = summary.delivered_count !== undefined
    ? summary.delivered_count
    : (reportData?.records?.filter((r) => getDeliveryStatusInfo(r).key === 'delivered').length || 0);

  const inTransitCount = summary.in_transit_count !== undefined
    ? summary.in_transit_count
    : (reportData?.records?.filter((r) => getDeliveryStatusInfo(r).key === 'in_transit').length || 0);

  const returnedCount = summary.returned_count !== undefined
    ? summary.returned_count
    : (reportData?.records?.filter((r) => getDeliveryStatusInfo(r).key === 'returned').length || 0);

  const receivedCount = summary.received_count !== undefined
    ? summary.received_count
    : (reportData?.records?.filter((r) => getDeliveryStatusInfo(r).key === 'received').length || 0);

  const receivedRate = summary.total_items > 0
    ? Math.round((receivedCount / summary.total_items) * 100)
    : 0;

  const inTransitRate = summary.total_items > 0
    ? Math.round((inTransitCount / summary.total_items) * 100)
    : 0;

  const deliveredRate = summary.total_items > 0
    ? Math.round((deliveredCount / summary.total_items) * 100)
    : 0;

  const returnedRate = summary.total_items > 0
    ? Math.round((returnedCount / summary.total_items) * 100)
    : 0;

  return (
    <main className="deposit-page-main python-layout-main">
      <div className="deposit-page-container python-container">
        
        {/* Page Top Header Banner */}
        <div className="deposit-page-header-card">
          <div className="deposit-page-title-group">
            <div className="deposit-page-icon-badge">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <h2 className="deposit-page-title">รายงานสถานะไปรษณีย์ (e-Parcel Status Report)</h2>
              <p className="deposit-page-subtitle">
                ตรวจสอบและติดตามสถานะรายการพัสดุที่ไปรษณีย์ไทยลงรับเข้าระบบ e-Parcel แล้วแบบเรียลไทม์
                {currentPerson?.Organization ? ` • ${currentPerson.Organization}` : ''}
              </p>
            </div>
          </div>

          {onSwitchToWorkspace && (
            <button
              type="button"
              className="btn-back-to-workspace"
              onClick={onSwitchToWorkspace}
              title="กลับไปยังหน้าแปลงไฟล์เอกสาร"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>กลับหน้าแปลงไฟล์</span>
            </button>
          )}
        </div>

        {/* Controls Bar: Date Range Picker & Quick Actions */}
        <div className="deposit-control-card">
          <div className="deposit-date-range-group">
            <div className="deposit-date-item">
              <label htmlFor="deposit-start-date" className="deposit-control-label">
                ตั้งแต่วันที่:
              </label>
              <input
                id="deposit-start-date"
                type="date"
                className="deposit-date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>

            <span className="deposit-date-sep">ถึง</span>

            <div className="deposit-date-item">
              <label htmlFor="deposit-end-date" className="deposit-control-label">
                ถึงวันที่:
              </label>
              <input
                id="deposit-end-date"
                type="date"
                className="deposit-date-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="deposit-quick-date-btns">
              <button
                type="button"
                className={`btn-quick-date ${startDate === todayIso && endDate === todayIso ? 'active' : ''}`}
                onClick={() => handleSetQuickDate('today')}
                disabled={loading}
              >
                วันนี้
              </button>
              <button
                type="button"
                className={`btn-quick-date ${startDate === yesterdayIso && endDate === yesterdayIso ? 'active' : ''}`}
                onClick={() => handleSetQuickDate('yesterday')}
                disabled={loading}
              >
                เมื่อวาน
              </button>
              <button
                type="button"
                className={`btn-quick-date ${startDate === last7DaysIso && endDate === todayIso ? 'active' : ''}`}
                onClick={() => handleSetQuickDate('last7days')}
                disabled={loading}
              >
                7 วันล่าสุด
              </button>
              <button
                type="button"
                className={`btn-quick-date ${startDate === monthStartIso && endDate === todayIso ? 'active' : ''}`}
                onClick={() => handleSetQuickDate('thisMonth')}
                disabled={loading}
              >
                เดือนนี้
              </button>
            </div>
          </div>

          <div className="deposit-action-btns">
            <button
              type="button"
              className="btn-fetch-report"
              onClick={() => handleFetchReport(startDate, endDate)}
              disabled={loading || syncingTracking}
            >
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
            {reportData?.records?.length > 0 && (
              <button
                type="button"
                className="btn-sync-tracking"
                onClick={handleSyncAllTracking}
                disabled={loading || syncingTracking}
                title="ดึงสถานะนำจ่ายและจุดเช็คพอยต์ล่าสุดของทุกหมายเลขจากระบบไปรษณีย์ไทย"
              >
                {syncingTracking ? (
                  <>
                    <span className="spinner-small"></span>
                    <span>{syncProgress || 'กำลังซิงก์...'}</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <polyline points="1 20 1 14 7 14"></polyline>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    <span>ซิงก์สถานะล่าสุด ({reportData.records.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Alerts & Notices */}
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

        {reportData?.api_notice && (
          <div className="deposit-alert info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>{reportData.api_notice}</span>
          </div>
        )}

        {/* Summary Stats Cards (6 Categories) */}
        <div className="deposit-stats-grid">
          {/* 1. รับฝากแล้ว */}
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-received-deposit">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="20 12 20 22 4 22 4 12"></polyline>
                <rect x="2" y="7" width="20" height="5"></rect>
                <line x1="12" y1="22" x2="12" y2="7"></line>
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">รับฝากแล้ว</div>
              <div className="stat-value text-blue">
                {receivedCount}{' '}
                <span className="stat-unit">({receivedRate}%)</span>
              </div>
            </div>
          </div>

          {/* 2. อยู่ระหว่างการนำจ่าย */}
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-transit">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">อยู่ระหว่างการนำจ่าย</div>
              <div className="stat-value text-amber">
                {inTransitCount}{' '}
                <span className="stat-unit">({inTransitRate}%)</span>
              </div>
            </div>
          </div>

          {/* 3. นำจ่ายสำเร็จ */}
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-delivered">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">นำจ่ายสำเร็จ</div>
              <div className="stat-value text-emerald">
                {deliveredCount}{' '}
                <span className="stat-unit">({deliveredRate}%)</span>
              </div>
            </div>
          </div>

          {/* 4. ส่งคืน */}
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-returned">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="9 14 4 9 9 4"></polyline>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">ส่งคืน</div>
              <div className="stat-value text-rose">
                {returnedCount}{' '}
                <span className="stat-unit">({returnedRate}%)</span>
              </div>
            </div>
          </div>

          {/* 5. รายการทั้งหมด */}
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-total">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">รายการทั้งหมด</div>
              <div className="stat-value">
                {summary.total_items} <span className="stat-unit">ฉบับ</span>
              </div>
            </div>
          </div>

          {/* 6. ยอดรวมค่าบริการ */}
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-fee">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">ยอดรวมค่าบริการ</div>
              <div className="stat-value text-gold">
                ฿{summary.total_fee.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Data Table Section Card */}
        <div className="deposit-table-card">
          <div className="deposit-table-toolbar">
            <div className="deposit-filter-tabs">
              <button
                type="button"
                className={`btn-filter-tab ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                ทั้งหมด ({reportData?.records?.length || 0})
              </button>
              <button
                type="button"
                className={`btn-filter-tab ${filterTab === 'received' ? 'active' : ''}`}
                onClick={() => setFilterTab('received')}
              >
                <span className="dot-blue"></span>
                รับฝากแล้ว ({receivedCount})
              </button>
              <button
                type="button"
                className={`btn-filter-tab ${filterTab === 'in_transit' ? 'active' : ''}`}
                onClick={() => setFilterTab('in_transit')}
              >
                <span className="dot-amber"></span>
                อยู่ระหว่างการนำจ่าย ({inTransitCount})
              </button>
              <button
                type="button"
                className={`btn-filter-tab ${filterTab === 'delivered' ? 'active' : ''}`}
                onClick={() => setFilterTab('delivered')}
              >
                <span className="dot-green"></span>
                นำจ่ายสำเร็จ ({deliveredCount})
              </button>
              <button
                type="button"
                className={`btn-filter-tab ${filterTab === 'returned' ? 'active' : ''}`}
                onClick={() => setFilterTab('returned')}
              >
                <span className="dot-rose"></span>
                ส่งคืน ({returnedCount})
              </button>
            </div>

            <div className="deposit-search-wrap">
              <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                className="deposit-search-input"
                placeholder="ค้นหาบาร์โค้ด, เลขคำขอ, หรือชื่อผู้รับ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn-clear-search"
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="deposit-table-scroll">
            <table className="deposit-data-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '150px' }}>หมายเลข Barcode</th>
                  <th style={{ width: '130px' }}>เลขที่คำขอ</th>
                  <th style={{ width: '160px' }}>ชื่อผู้รับ</th>
                  <th>ที่อยู่ปลายทาง</th>
                  <th style={{ width: '140px', textAlign: 'center' }} title="วันและเวลาของสถานะล่าสุด">วัน-เวลาล่าสุด</th>
                  <th style={{ width: '120px', textAlign: 'center' }} title="ที่ทำการไปรษณีย์หรือสถานที่ของสถานะล่าสุด">ปณ./สถานที่ล่าสุด</th>
                  <th style={{ width: '80px', textAlign: 'right' }}>น้ำหนัก</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>ค่าบริการ</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="table-loading-cell">
                      <div className="loading-spinner-wrap">
                        <span className="spinner-medium"></span>
                        <p>กำลังดึงข้อมูลรายงานจากไปรษณีย์ไทย e-Parcel...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="table-empty-cell">
                      <div className="empty-state-wrap">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                          <line x1="8" y1="21" x2="16" y2="21"></line>
                          <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                        <p className="empty-title">ไม่พบรายการพัสดุรับฝาก</p>
                        <p className="empty-desc">
                          {searchQuery
                            ? `ไม่พบข้อมูลที่ตรงกับคำค้นหา "${searchQuery}"`
                            : `ไม่มีรายการที่ไปรษณีย์ไทยรับฝากเข้าระบบในช่วงวันที่ ${dateDisplay}`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((item, idx) => {
                    const statusInfo = getDeliveryStatusInfo(item);
                    const globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;
                    const tooltipText = item.status_description_raw && item.status_description_raw !== statusInfo.label
                      ? `${statusInfo.label} (${item.status_description_raw})`
                      : statusInfo.label;
                    return (
                      <tr key={item.barcode || globalIdx} className={`row-status-${statusInfo.key}`}>
                        <td style={{ textAlign: 'center' }}>{globalIdx}</td>
                        <td>
                          {item.barcode ? (
                            <button
                              type="button"
                              className="table-barcode-btn"
                              onClick={() => setSelectedTrackingItem(item)}
                              title={`คลิกเพื่อดูสถานะการตรวจสอบพัสดุ ${item.barcode}`}
                            >
                              <span className="table-barcode-pill">{item.barcode}</span>
                              <svg className="barcode-track-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                              </svg>
                            </button>
                          ) : (
                            <span className="table-barcode-pill">-</span>
                          )}
                        </td>
                        <td>{item.inv_no || '-'}</td>
                        <td className="cell-receiver-name">{item.receiver_name || '-'}</td>
                        <td className="cell-address">
                          {item.receiver_address}{' '}
                          {item.receiver_amphur ? `อ.${item.receiver_amphur}` : ''}{' '}
                          {item.receiver_province ? `จ.${item.receiver_province}` : ''}{' '}
                          {item.receiver_zipcode || ''}
                        </td>
                        <td style={{ textAlign: 'center' }} className="cell-timestamp">
                          {item.latest_date || item.received_date ? (
                            <div 
                              className="timestamp-badge"
                              title={`สถานะล่าสุด: ${item.latest_date || item.received_date}${item.received_date ? `\n(รับฝากเมื่อ: ${item.received_date})` : ''}`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              <span>{item.latest_date || item.received_date}</span>
                            </div>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td 
                          style={{ textAlign: 'center' }}
                          title={`สถานที่ล่าสุด: ${item.latest_station || item.received_postoffice || '-'}${item.received_postoffice ? `\n(ปณ.รับฝาก: ${item.received_postoffice})` : ''}`}
                        >
                          {item.latest_station || item.received_postoffice || '-'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {item.weight ? `${item.weight}g` : '-'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="cell-fee">
                          {item.fee !== undefined ? `฿${item.fee.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span 
                            className={`status-pill ${statusInfo.className}`}
                            title={tooltipText}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Bar: Pagination & Actions */}
          <div className="deposit-table-footer">
            <div className="footer-records-count">
              แสดง <strong>{startItemIndex} - {endItemIndex}</strong> จากทั้งหมด <strong>{filteredRecords.length}</strong> รายการ
              {totalPages > 1 && (
                <span className="footer-page-indicator"> (หน้า {currentPage} จาก {totalPages})</span>
              )}
            </div>

            {totalPages > 1 && (
              <div className="deposit-pagination-controls">
                <button
                  type="button"
                  className="btn-pagination prev"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="หน้าก่อนหน้า"
                >
                  ‹ ก่อนหน้า
                </button>

                <div className="pagination-page-numbers">
                  {pageNumbers.map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={`btn-pagination-page ${currentPage === p ? 'active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="btn-pagination next"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="หน้าถัดไป"
                >
                  ถัดไป ›
                </button>
              </div>
            )}

            <div className="deposit-footer-actions">
              <button
                type="button"
                className="btn-footer-excel"
                onClick={handleExportExcel}
                disabled={isExportingExcel || filteredRecords.length === 0}
              >
                {isExportingExcel ? (
                  <>
                    <span className="spinner-small"></span>
                    <span>กำลังส่งออก Excel...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="8" y1="13" x2="16" y2="13"></line>
                      <line x1="8" y1="17" x2="16" y2="17"></line>
                    </svg>
                    <span>ส่งออก Excel</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-footer-pdf"
                onClick={handleExportPdf}
                disabled={isExportingPdf || filteredRecords.length === 0}
              >
                {isExportingPdf ? (
                  <>
                    <span className="spinner-small"></span>
                    <span>กำลังส่งออก PDF...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <span>ส่งออก PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Tracking Timeline Modal for clicked barcode */}
      {selectedTrackingItem && (
        <TrackingTimelineModal
          isOpen={!!selectedTrackingItem}
          barcode={selectedTrackingItem.barcode}
          recInfo={{
            receiver: selectedTrackingItem.receiver_name,
            invNo: selectedTrackingItem.inv_no,
            receiver_address: selectedTrackingItem.receiver_address,
            deposit_date: selectedTrackingItem.latest_date || selectedTrackingItem.received_date,
            status_key: selectedTrackingItem.status_key,
            status_label: selectedTrackingItem.status_label || selectedTrackingItem.status_description,
            status_description_raw: selectedTrackingItem.status_description_raw
          }}
          currentPerson={currentPerson}
          onClose={() => setSelectedTrackingItem(null)}
          onTrackingUpdated={handleTrackingUpdated}
          onOpenTrackingPage={onOpenTrackingPage ? () => {
            const bcode = selectedTrackingItem.barcode;
            setSelectedTrackingItem(null);
            onOpenTrackingPage(bcode);
          } : undefined}
        />
      )}
    </main>
  );
}
