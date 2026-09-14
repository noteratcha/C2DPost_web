import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTrackingHistory } from '../utils/api';
import './TrackingInquiryView.css';

export default function TrackingInquiryView({ currentPerson, records = [], initialBarcode = '', onSwitchToWorkspace }) {
  const [barcodeInput, setBarcodeInput] = useState(initialBarcode || '');
  const [searchedBarcode, setSearchedBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackData, setTrackData] = useState(null);

  // Available barcodes from current session workspace
  const availableBarcodes = useMemo(() => {
    return records
      .filter((r) => r.BARCODE_NO && String(r.BARCODE_NO).trim())
      .map((r) => ({
        barcode: String(r.BARCODE_NO).trim(),
        name: r.RECEIVER || r.RECEIVER_NAME || r.FULL_NAME || '-',
        invNo: r.INV_NO || r.LAND_NO || r.REF_NO || ''
      }));
  }, [records]);

  const handleSearch = useCallback(async (bcode) => {
    const target = (bcode || barcodeInput).trim();
    if (!target) {
      setError('กรุณาระบุหมายเลขบาร์โค้ด 13 หลัก');
      return;
    }
    setSearchedBarcode(target);
    setLoading(true);
    setError('');
    setTrackData(null);

    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const result = await fetchTrackingHistory({ barcode: target, username, password });
      if (result.success) {
        setTrackData(result);
      } else {
        setError(result.message || 'ไม่พบประวัติสถานะสำหรับหมายเลขนี้');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  }, [barcodeInput, currentPerson]);

  // Initial search if initialBarcode provided or available barcodes exist
  useEffect(() => {
    if (initialBarcode && initialBarcode !== searchedBarcode) {
      setBarcodeInput(initialBarcode);
      handleSearch(initialBarcode);
    } else if (availableBarcodes.length > 0 && !searchedBarcode && !initialBarcode) {
      setBarcodeInput(availableBarcodes[0].barcode);
      handleSearch(availableBarcodes[0].barcode);
    }
  }, [initialBarcode, availableBarcodes, searchedBarcode, handleSearch]);

  const events = trackData?.events || [];
  const sortedEvents = [...events].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const hasReceived = sortedEvents.some((ev) => {
    const text = `${ev.status_description || ''} ${ev.status || ''}`;
    return text.includes('รับฝาก') || ['1', '001', 'p001', '2'].includes(String(ev.status || '').toLowerCase());
  });

  return (
    <main className="tracking-page-main python-layout-main">
      <div className="tracking-page-container python-container">

        {/* Page Top Header Banner */}
        <div className="tracking-page-header-card">
          <div className="tracking-page-title-group">
            <div className="tracking-page-icon-badge">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <polyline points="8 8 11 8 13 13 16 13"></polyline>
              </svg>
            </div>
            <div>
              <h2 className="tracking-page-title">ติดตามสถานะพัสดุ (Tracking Inquiry)</h2>
              <p className="tracking-page-subtitle">
                ตรวจสอบประวัติและไทม์ไลน์สถานะการนำส่งพัสดุจริงจากระบบ e-Parcel ไปรษณีย์ไทย
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

        {/* Search Input Card */}
        <div className="tracking-search-card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="tracking-search-form"
          >
            <div className="tracking-input-wrap">
              <svg className="tracking-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                className="tracking-barcode-input"
                placeholder="พิมพ์หรือวางหมายเลข Barcode 13 หลัก (เช่น EF193867005TH, BC414110979TH)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                autoFocus
              />
              {barcodeInput && (
                <button
                  type="button"
                  className="btn-clear-barcode"
                  onClick={() => setBarcodeInput('')}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn-search-tracking"
              disabled={loading || !barcodeInput.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner-small"></span>
                  <span>กำลังค้นหา...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>ค้นหาสถานะ</span>
                </>
              )}
            </button>
          </form>

          {/* Quick select from current workspace */}
          {availableBarcodes.length > 0 && (
            <div className="tracking-quick-barcodes">
              <span className="quick-barcodes-label">รายการในงานปัจจุบัน:</span>
              <div className="quick-barcodes-list">
                {availableBarcodes.map((item) => (
                  <button
                    key={item.barcode}
                    type="button"
                    className={`btn-quick-barcode ${searchedBarcode === item.barcode ? 'active' : ''}`}
                    onClick={() => {
                      setBarcodeInput(item.barcode);
                      handleSearch(item.barcode);
                    }}
                    title={`${item.name} (${item.invNo})`}
                  >
                    <span className="quick-bcode">{item.barcode}</span>
                    <span className="quick-name">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notices */}
        {error && (
          <div className="tracking-alert error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {trackData?.api_notice && (
          <div className="tracking-alert info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>{trackData.api_notice}</span>
          </div>
        )}

        {/* Timeline Result Card */}
        {searchedBarcode && (
          <div className="tracking-result-card">
            <div className="tracking-result-header">
              <div className="result-barcode-group">
                <span className="result-label">ผลการตรวจสอบหมายเลข</span>
                <span className="result-barcode-mono">{searchedBarcode}</span>
              </div>
              <div className="result-status-badge">
                {hasReceived ? (
                  <span className="badge-received">
                    <span className="badge-dot-green"></span>
                    รับฝากเข้าระบบแล้ว
                  </span>
                ) : (
                  <span className="badge-pending">
                    <span className="badge-dot-amber"></span>
                    รอรับฝาก / อยู่ระหว่างนำส่ง
                  </span>
                )}
              </div>
            </div>

            <div className="tracking-timeline-body">
              {loading ? (
                <div className="tracking-loading-state">
                  <span className="spinner-medium"></span>
                  <p>กำลังดึงประวัติสถานะจริงจาก Web Service ไปรษณีย์ไทย...</p>
                </div>
              ) : sortedEvents.length === 0 ? (
                <div className="tracking-empty-state">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <p className="empty-title">ไม่พบประวัติสถานะพัสดุ</p>
                  <p className="empty-desc">
                    อาจเป็นเพราะหมายเลขบาร์โค้ดยังไม่ถูกนำส่งเข้าระบบ หรือเพิ่งสร้างเลขยังไม่ได้ผ่านการสแกนรับฝาก
                  </p>
                </div>
              ) : (
                <div className="tracking-stepper">
                  {sortedEvents.map((ev, index) => {
                    const isFirst = index === 0;
                    const isLast = index === sortedEvents.length - 1;
                    const isRec = `${ev.status_description || ''} ${ev.status || ''}`.includes('รับฝาก');

                    return (
                      <div key={index} className={`stepper-item ${isLast ? 'latest' : ''}`}>
                        <div className="stepper-rail">
                          <div className={`stepper-dot ${isRec ? 'dot-success' : isLast ? 'dot-active' : ''}`}>
                            {isRec ? '✓' : index + 1}
                          </div>
                          {!isLast && <div className="stepper-line"></div>}
                        </div>

                        <div className="stepper-content">
                          <div className="stepper-status-row">
                            <span className="stepper-status-desc">{ev.status_description}</span>
                            {isRec && <span className="stepper-tag-rec">รับฝากแล้ว</span>}
                            {isLast && <span className="stepper-tag-latest">ล่าสุด</span>}
                          </div>

                          <div className="stepper-meta-row">
                            {ev.datetime && (
                              <span className="stepper-meta-item">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                {ev.datetime}
                              </span>
                            )}
                            {ev.location && (
                              <span className="stepper-meta-item">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                  <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                {ev.location}
                              </span>
                            )}
                            {ev.signature && (
                              <span className="stepper-meta-item">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                  <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                ผู้ลงนาม: {ev.signature}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
