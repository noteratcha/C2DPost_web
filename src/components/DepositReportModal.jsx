import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchReceivedReport, exportDepositReportExcel, exportDepositReportPdf } from '../utils/api';
import { getDeliveryStatusInfo } from './DepositReportView';
import { formatStationWithZipcode } from '../utils/postalUtils';
import { downloadBatchEar } from '../utils/earService';
import TrackingTimelineModal from './TrackingTimelineModal';
import ThaiDateInput from './ThaiDateInput';
import './DepositReportModal.css';

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

export default function DepositReportModal({ isOpen, onClose, currentPerson, onSyncRecords }) {
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
  const lastMonthStartIso = useMemo(() => {
    const d = new Date();
    return toInputDateFormat(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);
  const lastMonthEndIso = useMemo(() => {
    const d = new Date();
    return toInputDateFormat(new Date(d.getFullYear(), d.getMonth(), 0));
  }, []);

  // Date Range state
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);

  // Pagination state (20 records per page)
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  // Data & UI states
  const [loading, setLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'received'
  const [selectedTrackingItem, setSelectedTrackingItem] = useState(null);

  // Batch e-AR download states
  const [isDownloadingEar, setIsDownloadingEar] = useState(false);
  const [earProgressText, setEarProgressText] = useState('');

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
            status_description_raw: latestEv?.status_description || trackResult.latest_status_label || r.status_description_raw,
            signature: trackResult.signature || latestEv?.signature || r.signature
          };
        }
        return r;
      });
      if (!hasChange) return prev;

      // Recalculate summary counts
      let receivedCount = 0;
      let inTransitCount = 0;
      let deliveredCount = 0;
      let returnedCount = 0;
      for (const rec of updatedRecords) {
        if (rec.status_key === 'delivered') deliveredCount++;
        else if (rec.status_key === 'returned') returnedCount++;
        else if (rec.status_key === 'in_transit') inTransitCount++;
        else if (rec.status_key === 'received') receivedCount++;
      }

      return {
        ...prev,
        records: updatedRecords,
        summary: {
          ...prev.summary,
          received_count: receivedCount,
          in_transit_count: inTransitCount,
          delivered_count: deliveredCount,
          returned_count: returnedCount
        }
      };
    });
  }, []);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      setError('');
      setSearchQuery('');
      setFilterTab('all');
      setCurrentPage(1);
      if (!reportData) {
        handleFetchReport(todayIso, todayIso);
      }
    }
  }, [isOpen, todayIso, handleFetchReport, reportData]);

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    } else if (type === 'lastMonth') {
      s = lastMonthStartIso;
      e = lastMonthEndIso;
    }
    setStartDate(s);
    setEndDate(e);
    handleFetchReport(s, e);
  };

  // Reset to default: resets date range to today, clears search query, filter tab, page, and fetches today
  const handleResetToDefault = useCallback(() => {
    setStartDate(todayIso);
    setEndDate(todayIso);
    setSearchQuery('');
    setFilterTab('all');
    setCurrentPage(1);
    setError('');
    handleFetchReport(todayIso, todayIso);
  }, [todayIso, handleFetchReport]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
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
          (r.received_date && r.received_date.includes(q)) ||
          (r.status_description_raw && r.status_description_raw.toLowerCase().includes(q)) ||
          (r.status_description && r.status_description.toLowerCase().includes(q)) ||
          (r.status_label && r.status_label.toLowerCase().includes(q))
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

  // Export handlers
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

  if (!isOpen) return null;

  const summary = reportData?.summary || {
    total_items: 0,
    total_weight: 0,
    total_fee: 0,
    received_count: 0
  };

  const deliveredCount = reportData?.records
    ? reportData.records.filter((r) => getDeliveryStatusInfo(r).key === 'delivered').length
    : (summary.delivered_count || 0);

  const inTransitCount = reportData?.records
    ? reportData.records.filter((r) => getDeliveryStatusInfo(r).key === 'in_transit').length
    : (summary.in_transit_count || 0);

  const returnedCount = reportData?.records
    ? reportData.records.filter((r) => getDeliveryStatusInfo(r).key === 'returned').length
    : (summary.returned_count || 0);

  const receivedCount = reportData?.records
    ? reportData.records.filter((r) => getDeliveryStatusInfo(r).key === 'received').length
    : (summary.received_count || 0);

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

  // Delivered items for batch e-AR
  const deliveredRecords = useMemo(() => {
    if (!reportData?.records) return [];
    return reportData.records.filter((r) => getDeliveryStatusInfo(r).key === 'delivered' && r.barcode);
  }, [reportData]);

  const handleBatchDownloadEar = async (format = 'pdf') => {
    if (!deliveredRecords || deliveredRecords.length === 0) {
      alert('ไม่พบรายการที่นำจ่ายสำเร็จสำหรับดาวน์โหลด e-AR');
      return;
    }

    setIsDownloadingEar(true);
    setEarProgressText(`กำลังเตรียมการดาวน์โหลด e-AR (0/${deliveredRecords.length})...`);

    try {
      const result = await downloadBatchEar({
        records: deliveredRecords,
        format: format,
        onProgress: (current, total, currentBcode) => {
          setEarProgressText(`กำลังรวบรวม e-AR (${current}/${total}) • ${currentBcode}`);
        }
      });
      setEarProgressText(`ดาวน์โหลด e-AR สำเร็จแล้ว (${result.count} รายการ)`);
      setTimeout(() => {
        setEarProgressText('');
      }, 4000);
    } catch (err) {
      console.error('Batch e-AR download error:', err);
      setEarProgressText('');
      if (err.code === 'EXTENSION_EAR_REQUIRED') {
        alert(
          err.details?.installed
            ? `⚠️ ต้องการส่วนขยาย C2DPost Helper v1.3.0 ขึ้นไป (ตรวจพบ v${err.details?.version || '1.2.0'})\n\nกรุณาสลับไปที่แท็บ Extensions แล้วกดปุ่ม 🔄 รีเฟรชส่วนขยาย C2DPost Helper จากนั้นรีเฟรชหน้านี้ (F5)`
            : '⚠️ กรุณาเปิดใช้งานส่วนขยาย C2DPost Helper v1.3.0 ใน Chrome เพื่อดาวน์โหลดใบตอบรับ e-AR จากไปรษณีย์ไทย'
        );
      } else {
        alert(err.message || 'เกิดข้อผิดพลาดในการดาวน์โหลด e-AR');
      }
    } finally {
      setIsDownloadingEar(false);
    }
  };

  return (
    <div className="deposit-modal-overlay" onClick={onClose}>
      <div className="deposit-modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="deposit-modal-header">
          <div className="deposit-header-left">
            <div className="deposit-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <h2 className="deposit-modal-title">รายงานสถานะไปรษณีย์ (e-Parcel Status Report)</h2>
              <p className="deposit-modal-subtitle">
                ตรวจสอบและติดตามสถานะพัสดุที่ไปรษณีย์ไทยลงรับเข้าระบบเรียลไทม์
                {currentPerson?.Organization ? ` • ${currentPerson.Organization}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="deposit-btn-close"
            onClick={onClose}
            title="ปิดหน้าต่าง (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Controls Bar: Date Range Picker & Quick Actions */}
        <div className="deposit-control-bar">
          <div className="deposit-date-range-group">
            <div className="deposit-date-item">
              <label htmlFor="modal-deposit-start-date" className="deposit-control-label">
                ตั้งแต่วันที่:
              </label>
              <ThaiDateInput
                id="modal-deposit-start-date"
                value={startDate}
                onChange={setStartDate}
                disabled={loading}
              />
            </div>

            <div className="deposit-date-item">
              <label htmlFor="modal-deposit-end-date" className="deposit-control-label">
                ถึงวันที่:
              </label>
              <ThaiDateInput
                id="modal-deposit-end-date"
                value={endDate}
                onChange={setEndDate}
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
              <button
                type="button"
                className={`btn-quick-date ${startDate === lastMonthStartIso && endDate === lastMonthEndIso ? 'active' : ''}`}
                onClick={() => handleSetQuickDate('lastMonth')}
                disabled={loading}
              >
                เดือนที่แล้ว
              </button>
            </div>
          </div>

          <div className="deposit-action-group">
            <button
              type="button"
              className="btn-reset-deposit"
              onClick={handleResetToDefault}
              disabled={loading}
              title="คืนค่าการค้นหา วันที่ และตัวกรองทั้งหมดเป็นค่าเริ่มต้น"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>คืนค่าเริ่มต้น</span>
            </button>

            <button
              type="button"
              className="btn-fetch-deposit"
              onClick={() => handleFetchReport(startDate, endDate)}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="deposit-spinner"></span>
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

        {/* Notices and Alerts */}
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

        {reportData?.api_notice && !error && (
          <div className="deposit-alert warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>
              <strong>ข้อสังเกตจากระบบ e-Parcel:</strong> {reportData.api_notice}
            </span>
          </div>
        )}

        {/* Summary Stat Cards (6 Categories) */}
        <div className="deposit-summary-cards">
          {/* 1. รับฝากแล้ว */}
          <div className="deposit-stat-box stat-cyan">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="20 12 20 22 4 22 4 12"></polyline>
                <rect x="2" y="7" width="20" height="5"></rect>
                <line x1="12" y1="22" x2="12" y2="7"></line>
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
              </svg>
            </div>
            <div className="stat-data">
              <span className="stat-label">รับฝากแล้ว</span>
              <div className="stat-number-row">
                <span className="stat-number text-blue">{receivedCount}</span>
                <span className="stat-unit">({receivedRate}%)</span>
              </div>
            </div>
          </div>

          {/* 2. อยู่ระหว่างการนำจ่าย */}
          <div className="deposit-stat-box stat-amber">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
            </div>
            <div className="stat-data">
              <span className="stat-label">อยู่ระหว่างการนำจ่าย</span>
              <div className="stat-number-row">
                <span className="stat-number text-amber">{inTransitCount}</span>
                <span className="stat-unit">({inTransitRate}%)</span>
              </div>
            </div>
          </div>

          {/* 3. นำจ่ายสำเร็จ */}
          <div className="deposit-stat-box stat-green">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div className="stat-data">
              <span className="stat-label">นำจ่ายสำเร็จ</span>
              <div className="stat-number-row">
                <span className="stat-number text-emerald">{deliveredCount}</span>
                <span className="stat-unit">({deliveredRate}%)</span>
              </div>
            </div>
          </div>

          {/* 4. ส่งคืน */}
          <div className="deposit-stat-box stat-rose">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="9 14 4 9 9 4"></polyline>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
              </svg>
            </div>
            <div className="stat-data">
              <span className="stat-label">ส่งคืน</span>
              <div className="stat-number-row">
                <span className="stat-number text-rose">{returnedCount}</span>
                <span className="stat-unit">({returnedRate}%)</span>
              </div>
            </div>
          </div>

          {/* 5. รายการทั้งหมด */}
          <div className="deposit-stat-box stat-blue">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            </div>
            <div className="stat-data">
              <span className="stat-label">รายการทั้งหมด</span>
              <div className="stat-number-row">
                <span className="stat-number">{summary.total_items}</span>
                <span className="stat-unit">ฉบับ</span>
              </div>
            </div>
          </div>

          {/* 6. ยอดรวมค่าบริการ */}
          <div className="deposit-stat-box stat-gold">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div className="stat-data">
              <span className="stat-label">ยอดรวมค่าบริการ</span>
              <div className="stat-number-row">
                <span className="stat-number text-gold">
                  {Number(summary.total_fee || 0).toLocaleString('th-TH', { 
                    minimumFractionDigits: Number(summary.total_fee || 0) % 1 === 0 ? 0 : 2, 
                    maximumFractionDigits: 2 
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Search */}
        <div className="deposit-toolbar">
          <div className="deposit-filter-tabs">
            <button
              type="button"
              className={`filter-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              ทั้งหมด ({reportData?.records?.length || 0})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${filterTab === 'received' ? 'active' : ''}`}
              onClick={() => setFilterTab('received')}
            >
              <span className="tab-dot dot-blue"></span>
              รับฝากแล้ว ({receivedCount})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${filterTab === 'in_transit' ? 'active' : ''}`}
              onClick={() => setFilterTab('in_transit')}
            >
              <span className="tab-dot dot-amber"></span>
              อยู่ระหว่างการนำจ่าย ({inTransitCount})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${filterTab === 'delivered' ? 'active' : ''}`}
              onClick={() => setFilterTab('delivered')}
            >
              <span className="tab-dot dot-green"></span>
              นำจ่ายสำเร็จ ({deliveredCount})
            </button>
            <button
              type="button"
              className={`filter-tab-btn ${filterTab === 'returned' ? 'active' : ''}`}
              onClick={() => setFilterTab('returned')}
            >
              <span className="tab-dot dot-rose"></span>
              ส่งคืน ({returnedCount})
            </button>
          </div>

          <div className="deposit-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="ค้นหาบาร์โค้ด, เลขคำขอ, หรือชื่อผู้รับ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="deposit-search-input"
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

        {/* Table Content with 20 items pagination */}
        <div className="deposit-table-container">
          <table className="deposit-data-table">
            <thead>
              <tr>
                <th className="th-center" style={{ width: '45px' }}>#</th>
                <th style={{ width: '140px' }}>หมายเลข Barcode</th>
                <th style={{ width: '130px' }}>เลขที่คำขอ</th>
                <th style={{ width: '160px' }}>ชื่อผู้รับ</th>
                <th style={{ minWidth: '180px' }}>ที่อยู่ปลายทาง</th>
                <th className="th-right" style={{ width: '85px' }}>น้ำหนัก</th>
                <th className="th-right" style={{ width: '85px' }}>ค่าบริการ</th>
                <th style={{ width: '150px' }} title="วันและเวลาของสถานะล่าสุด">วัน-เวลาล่าสุด</th>
                <th style={{ width: '130px' }} title="ที่ทำการไปรษณีย์หรือสถานที่ของสถานะล่าสุด">ปณ./สถานที่ล่าสุด</th>
                <th className="th-center" style={{ width: '125px' }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="deposit-loading-cell">
                    <span className="deposit-spinner large"></span>
                    <p>กำลังดึงข้อมูลรายงานจากไปรษณีย์ไทย...</p>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="10" className="deposit-empty-cell">
                    <div className="deposit-empty-state">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <p className="empty-title">ไม่พบรายการรับฝากสำหรับเงื่อนไขนี้</p>
                      <p className="empty-desc">
                        {searchQuery
                          ? `ไม่พบข้อมูลที่ตรงกับคำค้นหา "${searchQuery}"`
                          : `ไม่มีรายการที่ไปรษณีย์ไทยรับฝากเข้าระบบในช่วงวันที่ ${dateDisplay}`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec, idx) => {
                  const statusInfo = getDeliveryStatusInfo(rec);
                  const globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const rawDesc = String(rec.status_description_raw || rec.status_description || '').trim();
                  let tooltipText = rawDesc && rawDesc !== statusInfo.smartLabel
                    ? `[${statusInfo.label}] ${rawDesc}`
                    : statusInfo.smartLabel;

                  if (statusInfo.key === 'delivered') {
                    const sigDetail = statusInfo.hasSignature
                      ? (statusInfo.signatureName ? `ผู้ลงนาม: ${statusInfo.signatureName}` : 'มีลายเซ็นในระบบ')
                      : 'ไม่มีลายเซ็น';
                    tooltipText = `${statusInfo.smartLabel} • ${sigDetail}${rawDesc && rawDesc !== 'นำจ่ายสำเร็จ' ? ` (${rawDesc})` : ''}`;
                  }
                  return (
                    <tr key={rec.barcode || globalIdx} className={`row-status-${statusInfo.key}`}>
                      <td className="td-center text-muted">{globalIdx}</td>
                      <td>
                        {rec.barcode ? (
                          <button
                            type="button"
                            className="barcode-btn-mono"
                            onClick={() => setSelectedTrackingItem(rec)}
                            title={`คลิกเพื่อดูสถานะการตรวจสอบพัสดุ ${rec.barcode}`}
                          >
                            <span className="barcode-badge-mono">{rec.barcode}</span>
                          </button>
                        ) : (
                          <span className="barcode-badge-mono">-</span>
                        )}
                      </td>
                      <td className="inv-badge">{rec.inv_no || '-'}</td>
                      <td className="receiver-name font-medium">{rec.receiver_name}</td>
                      <td className="receiver-address text-muted" title={rec.receiver_address}>
                        {rec.receiver_address} {rec.receiver_amphur} {rec.receiver_province} {rec.receiver_zipcode}
                      </td>
                      <td className="td-right">{rec.weight ? `${rec.weight}g` : '-'}</td>
                      <td className="td-right font-medium">
                        {rec.fee !== undefined && rec.fee !== null && rec.fee !== ''
                          ? `${Number(rec.fee).toLocaleString('th-TH', { minimumFractionDigits: Number(rec.fee) % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td className="received-date text-emerald-dark">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="inline-clock-icon">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span title={`สถานะล่าสุด: ${rec.latest_date || rec.received_date}${rec.received_date ? ` (รับฝากเมื่อ: ${rec.received_date})` : ''}`}>
                          {rec.latest_date || rec.received_date}
                        </span>
                      </td>
                      <td>
                        <span 
                          className="po-badge"
                          title={`สถานที่ล่าสุด: ${formatStationWithZipcode(rec.latest_station || rec.received_postoffice, rec)}${rec.received_postoffice ? ` (ปณ.รับฝาก: ${formatStationWithZipcode(rec.received_postoffice, rec)})` : ''}`}
                        >
                          {formatStationWithZipcode(rec.latest_station || rec.received_postoffice, rec)}
                        </span>
                      </td>
                      <td className="td-center cell-status-wrapper">
                        <span 
                          className={`deposit-status-pill ${statusInfo.className}`}
                          title={tooltipText}
                        >
                          {statusInfo.icon ? (
                            <span className="status-pill-icon">{statusInfo.icon}</span>
                          ) : (
                            <span className={`status-dot dot-${statusInfo.key}`}></span>
                          )}
                          <span className="status-pill-text">{statusInfo.smartLabel}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions & Pagination */}
        <div className="deposit-modal-footer">
          <div className="footer-count-info">
            แสดง <strong>{startItemIndex} - {endItemIndex}</strong> จากทั้งหมด <strong>{filteredRecords.length}</strong> รายการ
            {totalPages > 1 && (
              <span className="footer-modal-page-info"> (หน้า {currentPage} จาก {totalPages})</span>
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
                    <span key={`modal-dots-${idx}`} className="pagination-ellipsis">…</span>
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

          <div className="footer-action-buttons">
            {/* Batch e-AR Download Button (PDF Direct) */}
            <button
              type="button"
              className="btn-footer-ear"
              onClick={() => handleBatchDownloadEar('pdf')}
              disabled={loading || isDownloadingEar || deliveredCount === 0}
              title={
                deliveredCount === 0
                  ? 'ไม่มีรายการที่นำจ่ายสำเร็จสำหรับดาวน์โหลด e-AR'
                  : `คลิกดาวน์โหลด PDF รวม e-AR (${deliveredCount} รายการ)`
              }
            >
              {isDownloadingEar ? (
                <>
                  <span className="deposit-spinner small"></span>
                  <span>{earProgressText || 'กำลังโหลด e-AR...'}</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>โหลด e-AR ({deliveredCount})</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn-export-excel"
              onClick={handleExportExcel}
              disabled={loading || isExportingExcel || isExportingPdf || filteredRecords.length === 0}
              title="ดาวน์โหลดรายงานสรุปรับฝากเป็นไฟล์ Excel (.xlsx)"
            >
              {isExportingExcel ? (
                <>
                  <span className="deposit-spinner small"></span>
                  <span>กำลังสร้าง Excel...</span>
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
              className="btn-export-pdf"
              onClick={handleExportPdf}
              disabled={loading || isExportingExcel || isExportingPdf || filteredRecords.length === 0}
              title="ดาวน์โหลดรายงานสรุปรับฝากเป็นเอกสาร PDF สำหรับลงนาม (Landscape A4)"
            >
              {isExportingPdf ? (
                <>
                  <span className="deposit-spinner small"></span>
                  <span>กำลังสร้าง PDF...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="8" y1="13" x2="16" y2="13"></line>
                    <line x1="8" y1="17" x2="16" y2="17"></line>
                  </svg>
                  <span>ส่งออก PDF</span>
                </>
              )}
            </button>

            <button type="button" className="btn-deposit-close-action" onClick={onClose}>
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      {/* Floating Progress Toast for Batch e-AR */}
      {earProgressText && (
        <div className="ear-progress-toast">
          {isDownloadingEar && <span className="deposit-spinner small"></span>}
          {!isDownloadingEar && <span>✅</span>}
          <span>{earProgressText}</span>
        </div>
      )}


      {/* Tracking Timeline Modal for Barcode click */}
      {selectedTrackingItem && (
        <TrackingTimelineModal
          isOpen={!!selectedTrackingItem}
          barcode={selectedTrackingItem.barcode}
          recInfo={{
            ...selectedTrackingItem,
            receiver: selectedTrackingItem.receiver_name,
            invNo: selectedTrackingItem.inv_no,
            receiver_address: [
              selectedTrackingItem.receiver_address,
              selectedTrackingItem.receiver_amphur ? (selectedTrackingItem.receiver_amphur.startsWith('อ.') ? selectedTrackingItem.receiver_amphur : `อ.${selectedTrackingItem.receiver_amphur}`) : '',
              selectedTrackingItem.receiver_province ? (selectedTrackingItem.receiver_province.startsWith('จ.') ? selectedTrackingItem.receiver_province : `จ.${selectedTrackingItem.receiver_province}`) : '',
              selectedTrackingItem.receiver_zipcode || ''
            ].filter(Boolean).join(' ') || selectedTrackingItem.receiver_address,
            deposit_date: selectedTrackingItem.latest_date || selectedTrackingItem.received_date,
            status_key: selectedTrackingItem.status_key,
            status_label: selectedTrackingItem.status_label || selectedTrackingItem.status_description,
            status_description_raw: selectedTrackingItem.status_description_raw
          }}
          currentPerson={currentPerson}
          onClose={() => setSelectedTrackingItem(null)}
          onTrackingUpdated={handleTrackingUpdated}
        />
      )}
    </div>
  );
}
