import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchReceivedReport, exportDepositReportExcel, exportDepositReportPdf } from '../utils/api';
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

export default function DepositReportModal({ isOpen, onClose, currentPerson }) {
  // Today's date in YYYY-MM-DD
  const todayIso = useMemo(() => toInputDateFormat(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [loading, setLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'received'

  // Fetch report function
  const handleFetchReport = useCallback(async (dateToFetch) => {
    const targetIso = dateToFetch || selectedDate;
    if (!targetIso) {
      setError('กรุณาเลือกวันที่ต้องการตรวจสอบ');
      return;
    }

    const apiDate = toApiDateFormat(targetIso);
    setLoading(true);
    setError('');

    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const result = await fetchReceivedReport({
        date: apiDate,
        username,
        password
      });

      if (result.success) {
        setReportData(result);
      } else {
        setError(result.message || 'ไม่สามารถดึงข้อมูลรายงานได้');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, currentPerson]);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      setError('');
      setSearchQuery('');
      setFilterTab('all');
      // If we haven't fetched today's report yet, trigger automatic initial fetch
      if (!reportData) {
        handleFetchReport(todayIso);
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

  // Quick date shortcuts
  const handleSetQuickDate = (type) => {
    const d = new Date();
    if (type === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    const iso = toInputDateFormat(d);
    setSelectedDate(iso);
    handleFetchReport(iso);
  };

  // Filtered records based on search and tab
  const filteredRecords = useMemo(() => {
    if (!reportData || !reportData.records) return [];
    let list = reportData.records;

    if (filterTab === 'received') {
      list = list.filter((r) => r.status === '1' || r.status_description.includes('รับฝาก'));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.barcode && r.barcode.toLowerCase().includes(q)) ||
          (r.inv_no && r.inv_no.toLowerCase().includes(q)) ||
          (r.receiver_name && r.receiver_name.toLowerCase().includes(q)) ||
          (r.receiver_address && r.receiver_address.toLowerCase().includes(q)) ||
          (r.received_postoffice && r.received_postoffice.toLowerCase().includes(q))
      );
    }

    return list;
  }, [reportData, filterTab, searchQuery]);

  // Export handlers
  const handleExportExcel = async () => {
    if (!filteredRecords || filteredRecords.length === 0) return;
    setIsExportingExcel(true);
    setError('');
    try {
      await exportDepositReportExcel({
        records: filteredRecords,
        summary: reportData?.summary || {},
        date: toApiDateFormat(selectedDate),
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
        date: toApiDateFormat(selectedDate),
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

  const successRate = summary.total_items > 0
    ? Math.round((summary.received_count / summary.total_items) * 100)
    : 0;

  // Format weight
  const displayWeight = summary.total_weight >= 1000
    ? `${(summary.total_weight / 1000).toFixed(2)} กก.`
    : `${summary.total_weight.toLocaleString()} กรัม`;

  return (
    <div className="deposit-modal-overlay" onClick={onClose}>
      <div className="deposit-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="deposit-modal-header">
          <div className="deposit-header-info">
            <div className="deposit-icon-pill">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <h3 className="deposit-modal-title">รายงานการรับฝากไปรษณีย์ (Deposit Report)</h3>
              <p className="deposit-modal-subtitle">
                ตรวจสอบสถานะรายการจดหมาย/พัสดุที่ไปรษณีย์ไทยสแกนยืนยันรับฝากเข้าระบบ e-Parcel แล้ว
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

        {/* Controls Bar: Date Picker & Quick Actions */}
        <div className="deposit-control-bar">
          <div className="deposit-date-group">
            <label htmlFor="deposit-date-picker" className="deposit-control-label">
              เลือกวันที่นำส่ง:
            </label>
            <input
              id="deposit-date-picker"
              type="date"
              className="deposit-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={loading}
            />
            <div className="deposit-quick-date-btns">
              <button
                type="button"
                className={`btn-quick-date ${selectedDate === todayIso ? 'active' : ''}`}
                onClick={() => handleSetQuickDate('today')}
                disabled={loading}
              >
                วันนี้
              </button>
              <button
                type="button"
                className="btn-quick-date"
                onClick={() => handleSetQuickDate('yesterday')}
                disabled={loading}
              >
                เมื่อวาน
              </button>
            </div>
          </div>

          <div className="deposit-action-group">
            <button
              type="button"
              className="btn-fetch-deposit"
              onClick={() => handleFetchReport()}
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
                  <span>ดึงข้อมูลรับฝาก</span>
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
              <strong>ข้อสังเกตจากระบบ e-Parcel:</strong> {reportData.api_notice} (ระบบอาจแสดงข้อมูลจำลองหรือข้อมูลสำรองเนื่องจากข้อจำกัด IP)
            </span>
          </div>
        )}

        {reportData?.is_mock && !error && (
          <div className="deposit-alert info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>
              <strong>โหมดสาธิต (Demo Mode):</strong> กำลังแสดงชุดข้อมูลจำลองสำหรับวันที่ {reportData.date} ของ สำนักงานที่ดินเรณูนคร
            </span>
          </div>
        )}

        {/* Executive Stat Cards */}
        <div className="deposit-stat-grid">
          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <span className="stat-card-label">รายการทั้งหมด</span>
              <div className="stat-card-value">
                <strong>{summary.total_items.toLocaleString()}</strong>
                <span className="stat-card-unit">ฉบับ</span>
              </div>
            </div>
          </div>

          <div className="deposit-stat-card highlight-success">
            <div className="stat-card-icon icon-green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div className="stat-card-content">
              <span className="stat-card-label">รับฝากสำเร็จ</span>
              <div className="stat-card-value">
                <strong className="text-emerald">{summary.received_count.toLocaleString()}</strong>
                <span className="stat-card-unit">({successRate}%)</span>
              </div>
            </div>
          </div>

          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <span className="stat-card-label">ยอดรวมค่าบริการ</span>
              <div className="stat-card-value">
                <strong>฿{summary.total_fee.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>

          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-purple">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
            </div>
            <div className="stat-card-content">
              <span className="stat-card-label">น้ำหนักรวม</span>
              <div className="stat-card-value">
                <strong>{displayWeight}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: Search and Filter Tabs */}
        <div className="deposit-table-toolbar">
          <div className="deposit-filter-tabs">
            <button
              type="button"
              className={`deposit-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              ทั้งหมด ({summary.total_items})
            </button>
            <button
              type="button"
              className={`deposit-tab-btn ${filterTab === 'received' ? 'active' : ''}`}
              onClick={() => setFilterTab('received')}
            >
              🟢 รับฝากแล้ว ({summary.received_count})
            </button>
          </div>

          <div className="deposit-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="deposit-search-icon">
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
                className="deposit-btn-clear-search"
                onClick={() => setSearchQuery('')}
                title="ล้างคำค้นหา"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="deposit-table-container">
          <table className="deposit-data-table">
            <thead>
              <tr>
                <th className="th-center" style={{ width: '45px' }}>#</th>
                <th style={{ width: '140px' }}>หมายเลข Barcode</th>
                <th style={{ width: '130px' }}>เลขที่คำขอ</th>
                <th style={{ width: '160px' }}>ชื่อผู้รับ</th>
                <th style={{ minWidth: '180px' }}>ที่อยู่ปลายทาง</th>
                <th style={{ width: '150px' }}>วัน-เวลารับฝาก</th>
                <th style={{ width: '120px' }}>ปณ.รับฝาก</th>
                <th className="th-right" style={{ width: '85px' }}>น้ำหนัก</th>
                <th className="th-right" style={{ width: '85px' }}>ค่าบริการ</th>
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
                        {reportData?.summary?.total_items === 0
                          ? `ไม่มีประวัติการรับฝากเข้าระบบในวันที่ ${toApiDateFormat(selectedDate)}`
                          : 'ไม่พบรายการที่ตรงกับคำค้นหา ลองเปลี่ยนคำค้นหาหรือเปลี่ยนแท็บ'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => (
                  <tr key={rec.seq || rec.barcode}>
                    <td className="td-center text-muted">{rec.seq}</td>
                    <td>
                      <span className="barcode-badge-mono">{rec.barcode}</span>
                    </td>
                    <td className="inv-badge">{rec.inv_no || '-'}</td>
                    <td className="receiver-name font-medium">{rec.receiver_name}</td>
                    <td className="receiver-address text-muted" title={rec.receiver_address}>
                      {rec.receiver_address} {rec.receiver_amphur} {rec.receiver_province} {rec.receiver_zipcode}
                    </td>
                    <td className="received-date text-emerald-dark">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="inline-clock-icon">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>{rec.received_date}</span>
                    </td>
                    <td>
                      <span className="po-badge">{rec.received_postoffice || '-'}</span>
                    </td>
                    <td className="td-right">{rec.weight ? `${rec.weight}g` : '-'}</td>
                    <td className="td-right font-medium">
                      {rec.fee ? `฿${rec.fee.toFixed(2)}` : '-'}
                    </td>
                    <td className="td-center">
                      <span className="deposit-status-pill success">
                        <span className="status-dot"></span>
                        <span>{rec.status_description || 'รับฝากแล้ว'}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="deposit-modal-footer">
          <div className="footer-count-info">
            แสดง <strong>{filteredRecords.length}</strong> จากทั้งหมด <strong>{summary.total_items}</strong> รายการ (วันที่ {toApiDateFormat(selectedDate)})
          </div>

          <div className="footer-action-buttons">
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
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span>📊 ส่งออก Excel</span>
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
                    <circle cx="10" cy="13" r="2"></circle>
                    <path d="m20 17-1.5-1.5"></path>
                  </svg>
                  <span>📄 ส่งออก PDF</span>
                </>
              )}
            </button>

            <button type="button" className="btn-deposit-close-action" onClick={onClose}>
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
