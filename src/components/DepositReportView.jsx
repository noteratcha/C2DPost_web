import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchReceivedReport, exportDepositReportExcel, exportDepositReportPdf } from '../utils/api';
import './DepositReportView.css';

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

export default function DepositReportView({ currentPerson, onSyncRecords, onSwitchToWorkspace }) {
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
  const [syncNotice, setSyncNotice] = useState('');

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
    setSyncNotice('');

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

  // Initial load
  useEffect(() => {
    handleFetchReport(todayIso);
  }, [todayIso, handleFetchReport]);

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

  // Sync to workspace
  const handleTriggerSync = () => {
    if (!reportData || !reportData.records || reportData.records.length === 0) {
      alert('ไม่มีข้อมูลในรายงานสำหรับซิงก์');
      return;
    }
    if (onSyncRecords) {
      onSyncRecords(reportData.records);
      setSyncNotice(`ซิงก์ผลรับฝาก ${reportData.records.length} รายการ กับตารางแปลงไฟล์หลักเรียบร้อยแล้ว`);
      setTimeout(() => setSyncNotice(''), 4000);
    }
  };

  // Filtered records based on search and tab
  const filteredRecords = useMemo(() => {
    if (!reportData || !reportData.records) return [];
    let list = reportData.records;

    if (filterTab === 'received') {
      list = list.filter((r) => r.status === '1' || r.status === '2' || (r.status_description && r.status_description.includes('รับฝาก')));
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

  const summary = reportData?.summary || {
    total_items: 0,
    total_weight: 0,
    total_fee: 0,
    received_count: 0
  };

  const successRate = summary.total_items > 0
    ? Math.round((summary.received_count / summary.total_items) * 100)
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
              <h2 className="deposit-page-title">รายงานการรับฝากไปรษณีย์ (e-Parcel Deposit Report)</h2>
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

        {/* Controls Bar: Date Picker & Quick Actions */}
        <div className="deposit-control-card">
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

          <div className="deposit-action-btns">
            <button
              type="button"
              className="btn-fetch-report"
              onClick={() => handleFetchReport(selectedDate)}
              disabled={loading}
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
                  <span>ดึงข้อมูลรับฝาก</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Alerts & Notices */}
        {syncNotice && (
          <div className="deposit-alert success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>{syncNotice}</span>
          </div>
        )}

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

        {/* Summary Stats Cards */}
        <div className="deposit-stats-grid">
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

          <div className="deposit-stat-card">
            <div className="stat-card-icon icon-received">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div className="stat-card-content">
              <div className="stat-label">รับฝากสำเร็จ</div>
              <div className="stat-value text-emerald">
                {summary.received_count}{' '}
                <span className="stat-unit">({successRate}%)</span>
              </div>
            </div>
          </div>

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
                <span className="dot-green"></span>
                รับฝากแล้ว ({summary.received_count})
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
                  <th style={{ width: '140px', textAlign: 'center' }}>วัน-เวลารับฝาก</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>ปณ.รับฝาก</th>
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
                            : `ไม่มีรายการที่ไปรษณีย์ไทยรับฝากเข้าระบบในวันที่ ${toApiDateFormat(selectedDate)}`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item, idx) => {
                    const isReceived = item.status === '1' || item.status === '2' || (item.status_description && item.status_description.includes('รับฝาก'));
                    return (
                      <tr key={item.barcode || idx} className={isReceived ? 'row-received' : ''}>
                        <td style={{ textAlign: 'center' }}>{item.seq || idx + 1}</td>
                        <td>
                          <span className="table-barcode-pill">{item.barcode}</span>
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
                          {item.received_date ? (
                            <div className="timestamp-badge">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              <span>{item.received_date}</span>
                            </div>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>{item.received_postoffice || '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {item.weight ? `${item.weight}g` : '-'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="cell-fee">
                          {item.fee !== undefined ? `฿${item.fee.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`status-pill ${isReceived ? 'received' : 'pending'}`}>
                            {isReceived ? 'รับฝากเข้าระบบแล้ว' : (item.status_description || 'รอรับฝาก')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Bar: Actions & Summary */}
          <div className="deposit-table-footer">
            <div className="footer-records-count">
              แสดง <strong>{filteredRecords.length}</strong> จากทั้งหมด <strong>{summary.total_items}</strong> รายการ (วันที่ {toApiDateFormat(selectedDate)})
            </div>

            <div className="deposit-footer-actions">
              {onSyncRecords && (
                <button
                  type="button"
                  className="btn-footer-sync"
                  onClick={handleTriggerSync}
                  disabled={loading || filteredRecords.length === 0}
                  title="นำผลรับฝากไปไฮไลต์และอัปเดตสถานะในตารางแปลงไฟล์หน้าแรก"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  <span>ซิงก์กับตารางหลัก</span>
                </button>
              )}

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
    </main>
  );
}
