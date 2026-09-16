import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTrackingHistory } from '../utils/api';
import './TrackingInquiryView.css';

/**
 * Classifies tracking event into canonical status
 */
function getCardStatusInfo(latestEvent) {
  if (!latestEvent) {
    return {
      key: 'in_transit',
      label: 'รอรับฝาก / อยู่ระหว่างนำส่ง',
      badgeClass: 'in-transit',
      dotClass: 'dot-amber'
    };
  }

  const desc = (latestEvent.status_description || '').trim();
  const code = String(latestEvent.status || '').trim();

  // 1. Delivered / นำจ่ายสำเร็จ
  if (
    /นำจ่ายถึงผู้รับแล้ว|นําจ่ายถึงผู้รับแล้ว|ถึงผู้รับแล้ว|นำจ่ายสำเร็จ|นําจ่ายสำเร็จ|ผู้รับได้รับ|จัดส่งสำเร็จ|ส่งมอบเรียบร้อย|ส่งถึงผู้รับแล้ว|นำจ่ายเรียบร้อย/i.test(desc) ||
    code === '4' || code === '501' || latestEvent.status_key === 'delivered'
  ) {
    return {
      key: 'delivered',
      label: 'นำจ่ายสำเร็จ',
      badgeClass: 'delivered',
      dotClass: 'dot-green',
      rawDesc: desc
    };
  }

  // 2. Returned / ส่งคืน
  if (
    /ส่งคืน|คืนต้นทาง|ส่งคืนผู้ส่ง|ตีกลับ|ไม่สามารถส่งมอบ|ไม่สามารถนำจ่าย|คืนสู่ผู้ฝาก/i.test(desc) ||
    ['502', '503', '401', '402'].includes(code) || latestEvent.status_key === 'returned'
  ) {
    return {
      key: 'returned',
      label: 'ส่งคืน',
      badgeClass: 'returned',
      dotClass: 'dot-rose',
      rawDesc: desc
    };
  }

  // 3. Received / รับฝากแล้ว
  if (
    code === '1' || code === '001' ||
    /รับฝากเข้าระบบ|รับฝากแล้ว|^รับฝาก$/i.test(desc) || latestEvent.status_key === 'received'
  ) {
    return {
      key: 'received',
      label: 'รับฝากแล้ว',
      badgeClass: 'received',
      dotClass: 'dot-blue',
      rawDesc: desc
    };
  }

  // 4. Default: In transit / อยู่ระหว่างการนำจ่าย
  return {
    key: 'in_transit',
    label: 'อยู่ระหว่างการนำจ่าย',
    badgeClass: 'in-transit',
    dotClass: 'dot-amber',
    rawDesc: desc
  };
}

export default function TrackingInquiryView({ currentPerson, records = [], initialBarcode = '', onSwitchToWorkspace }) {
  const [barcodeInput, setBarcodeInput] = useState(initialBarcode || '');
  const [searchItems, setSearchItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedCards, setExpandedCards] = useState({});

  // Available barcodes from current session workspace
  const availableBarcodes = useMemo(() => {
    return records
      .filter((r) => r.BARCODE_NO && String(r.BARCODE_NO).trim())
      .map((r) => ({
        barcode: String(r.BARCODE_NO).trim().toUpperCase(),
        name: r.RECEIVER || r.RECEIVER_NAME || r.FULL_NAME || '-',
        invNo: r.INV_NO || r.LAND_NO || r.REF_NO || ''
      }));
  }, [records]);

  // Parse multiline barcodes from textarea input
  const parsedBarcodes = useMemo(() => {
    const rawList = barcodeInput
      .split(/[\r\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length >= 8);
    return Array.from(new Set(rawList));
  }, [barcodeInput]);

  const toggleCardExpand = (barcode) => {
    setExpandedCards((prev) => ({
      ...prev,
      [barcode]: !prev[barcode]
    }));
  };

  const expandAllCards = () => {
    const next = {};
    searchItems.forEach((item) => {
      next[item.barcode] = true;
    });
    setExpandedCards(next);
  };

  const collapseAllCards = () => {
    setExpandedCards({});
  };

  const handleSearch = useCallback(async (customList) => {
    const targetList = customList || parsedBarcodes;
    if (!targetList || targetList.length === 0) {
      setError('กรุณาระบุหมายเลขบาร์โค้ดอย่างน้อย 1 หมายเลข (ใส่ได้หลายบรรทัด เช่น EF193867005TH)');
      return;
    }

    setLoading(true);
    setError('');
    // Reset expanded state so cards stay collapsed by default as requested
    setExpandedCards({});

    // Initialize placeholder cards
    const initialItems = targetList.map((bcode) => {
      const matched = availableBarcodes.find((a) => a.barcode === bcode);
      return {
        barcode: bcode,
        matchedRecord: matched,
        loading: true,
        error: null,
        trackData: null,
        events: [],
        latestEvent: null,
        statusInfo: null
      };
    });
    setSearchItems(initialItems);

    const username = currentPerson?.UserName || '';
    const password = currentPerson?.Password || '';

    try {
      const results = await Promise.allSettled(
        targetList.map(async (bcode) => {
          try {
            const res = await fetchTrackingHistory({ barcode: bcode, username, password });
            return {
              barcode: bcode,
              success: res.success,
              data: res,
              error: res.success ? null : (res.message || 'ไม่พบประวัติสถานะ')
            };
          } catch (err) {
            return {
              barcode: bcode,
              success: false,
              data: null,
              error: err.message || 'เชื่อมต่อระบบไม่สำเร็จ'
            };
          }
        })
      );

      const updated = initialItems.map((item, idx) => {
        const settled = results[idx];
        if (settled.status === 'fulfilled') {
          const { success, data, error: itemErr } = settled.value;
          if (success && data) {
            const evs = data.events || [];
            const sorted = [...evs].sort((a, b) => (a.seq || 0) - (b.seq || 0));
            const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
            const sInfo = getCardStatusInfo(latest);
            return {
              ...item,
              loading: false,
              trackData: data,
              events: sorted,
              latestEvent: latest,
              statusInfo: sInfo,
              error: null
            };
          } else {
            return {
              ...item,
              loading: false,
              error: itemErr || 'ไม่พบประวัติสถานะสำหรับหมายเลขนี้'
            };
          }
        } else {
          return {
            ...item,
            loading: false,
            error: settled.reason?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล'
          };
        }
      });

      setSearchItems(updated);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการค้นหา');
    } finally {
      setLoading(false);
    }
  }, [parsedBarcodes, availableBarcodes, currentPerson]);

  // Initial trigger
  useEffect(() => {
    if (initialBarcode && searchItems.length === 0) {
      setBarcodeInput(initialBarcode);
      handleSearch([initialBarcode]);
    } else if (availableBarcodes.length > 0 && searchItems.length === 0 && !barcodeInput) {
      const firstBcode = availableBarcodes[0].barcode;
      setBarcodeInput(firstBcode);
      handleSearch([firstBcode]);
    }
  }, [initialBarcode, availableBarcodes, searchItems.length, barcodeInput, handleSearch]);

  // Summary counts across searched items
  const summary = useMemo(() => {
    let delivered = 0;
    let inTransit = 0;
    let returned = 0;
    let received = 0;
    searchItems.forEach((item) => {
      if (item.statusInfo) {
        if (item.statusInfo.key === 'delivered') delivered++;
        else if (item.statusInfo.key === 'returned') returned++;
        else if (item.statusInfo.key === 'received') received++;
        else inTransit++;
      }
    });
    return {
      total: searchItems.length,
      delivered,
      inTransit,
      returned,
      received
    };
  }, [searchItems]);

  const addBarcodeToInput = (bcode) => {
    const existing = barcodeInput.trim();
    if (!existing) {
      setBarcodeInput(bcode);
    } else {
      const currentList = existing.split(/[\r\n,;]+/).map((s) => s.trim().toUpperCase());
      if (!currentList.includes(bcode)) {
        setBarcodeInput(`${existing}\n${bcode}`);
      }
    }
  };

  const addAllWorkspaceBarcodes = () => {
    const all = availableBarcodes.map((a) => a.barcode).join('\n');
    setBarcodeInput(all);
  };

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
                ตรวจสอบประวัติและไทม์ไลน์สถานะการนำส่งพัสดุจริงจากระบบ e-Parcel ไปรษณีย์ไทย (รองรับค้นหาทีละหลายหมายเลข)
              </p>
            </div>
          </div>
        </div>

        {/* Multiline Search Input Card */}
        <div className="tracking-search-card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="tracking-search-form-multiline"
          >
            <div className="tracking-input-wrap-multiline">
              <div className="tracking-textarea-header">
                <label htmlFor="tracking-textarea" className="tracking-textarea-label">
                  <span>ระบุหรือวางหมายเลขบาร์โค้ด (ใส่ได้หลายบรรทัด)</span>
                  {parsedBarcodes.length > 0 && (
                    <span className="barcode-counter-badge">
                      ตรวจพบ {parsedBarcodes.length} หมายเลข
                    </span>
                  )}
                </label>
                {barcodeInput && (
                  <button
                    type="button"
                    className="btn-clear-textarea"
                    onClick={() => {
                      setBarcodeInput('');
                      setError('');
                    }}
                  >
                    ล้างข้อความ
                  </button>
                )}
              </div>

              <textarea
                id="tracking-textarea"
                className="tracking-barcode-textarea"
                rows={3}
                placeholder="พิมพ์หรือวางหมายเลข Barcode 13 หลัก (ใส่ได้หลายบรรทัด บรรทัดละ 1 หมายเลข หรือคั่นด้วยเครื่องหมายจุลภาค เช่น EF193867005TH, BC414110979TH)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                autoFocus
              />
            </div>

            <div className="tracking-search-actions-bar">
              <button
                type="submit"
                className="btn-search-tracking"
                disabled={loading || parsedBarcodes.length === 0}
              >
                {loading ? (
                  <>
                    <span className="spinner-small"></span>
                    <span>กำลังค้นหา {parsedBarcodes.length} หมายเลข...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <span>ค้นหาสถานะ ({parsedBarcodes.length > 0 ? `${parsedBarcodes.length} หมายเลข` : '0 หมายเลข'})</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick select from current workspace */}
          {availableBarcodes.length > 0 && (
            <div className="tracking-quick-barcodes">
              <div className="quick-barcodes-header">
                <span className="quick-barcodes-label">รายการในงานปัจจุบัน ({availableBarcodes.length} รายการ):</span>
                {availableBarcodes.length > 1 && (
                  <button
                    type="button"
                    className="btn-add-all-quick"
                    onClick={addAllWorkspaceBarcodes}
                    title="ใส่หมายเลขทั้งหมดในงานปัจจุบันลงในช่องค้นหา"
                  >
                    + ใส่ทั้งหมด ({availableBarcodes.length} หมายเลข)
                  </button>
                )}
              </div>
              <div className="quick-barcodes-list">
                {availableBarcodes.map((item) => {
                  const isAdded = parsedBarcodes.includes(item.barcode);
                  return (
                    <button
                      key={item.barcode}
                      type="button"
                      className={`btn-quick-barcode ${isAdded ? 'active' : ''}`}
                      onClick={() => addBarcodeToInput(item.barcode)}
                      title={`คลิกเพื่อใส่หมายเลข: ${item.name} (${item.invNo})`}
                    >
                      <span className="quick-bcode">{item.barcode}</span>
                      <span className="quick-name">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Global Alert Notice */}
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

        {/* Results Header & Summary Stats */}
        {searchItems.length > 0 && (
          <div className="tracking-results-control-bar">
            <div className="results-summary-info">
              <span className="results-count-title">
                ผลการตรวจสอบ <strong>{searchItems.length}</strong> รายการ
              </span>
              <div className="results-summary-chips">
                {summary.delivered > 0 && (
                  <span className="summary-chip chip-delivered">
                    <span className="chip-dot dot-green"></span>
                    นำจ่ายสำเร็จ: {summary.delivered}
                  </span>
                )}
                {summary.inTransit > 0 && (
                  <span className="summary-chip chip-transit">
                    <span className="chip-dot dot-amber"></span>
                    อยู่ระหว่างนำจ่าย: {summary.inTransit}
                  </span>
                )}
                {summary.returned > 0 && (
                  <span className="summary-chip chip-returned">
                    <span className="chip-dot dot-rose"></span>
                    ส่งคืน: {summary.returned}
                  </span>
                )}
                {summary.received > 0 && (
                  <span className="summary-chip chip-received">
                    <span className="chip-dot dot-blue"></span>
                    รับฝากแล้ว: {summary.received}
                  </span>
                )}
              </div>
            </div>

            <div className="results-expand-actions">
              <button
                type="button"
                className="btn-toggle-all-cards"
                onClick={expandAllCards}
                title="คลิกเพื่อกางดูรายละเอียดประวัติของทุกหมายเลข"
              >
                เปิดทั้งหมด
              </button>
              <button
                type="button"
                className="btn-toggle-all-cards"
                onClick={collapseAllCards}
                title="คลิกเพื่อย่อแสดงเฉพาะสถานะล่าสุดของทุกหมายเลข"
              >
                ย่อทั้งหมด
              </button>
            </div>
          </div>
        )}

        {/* Render List of Barcode Result Cards */}
        {searchItems.length > 0 && (
          <div className="tracking-cards-list">
            {searchItems.map((item, index) => {
              const isExpanded = !!expandedCards[item.barcode];
              const { barcode, matchedRecord, loading: itemLoading, error: itemErr, events, latestEvent, statusInfo } = item;

              const latestDatetime = latestEvent?.datetime || '';
              const latestLocation = latestEvent?.location || '';

              return (
                <div key={barcode} className={`tracking-accordion-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
                  {/* Clickable Card Header */}
                  <div
                    className="tracking-card-header"
                    onClick={() => toggleCardExpand(barcode)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    title={isExpanded ? 'คลิกเพื่อย่อซ่อนประวัติ' : 'คลิกเพื่อกางดูไทม์ไลน์ประวัติทั้งหมด'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleCardExpand(barcode);
                      }
                    }}
                  >
                    <div className="card-header-left">
                      {/* Chevron expand/collapse indicator */}
                      <span className={`accordion-chevron ${isExpanded ? 'open' : ''}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </span>

                      <span className="card-seq-badge">#{index + 1}</span>

                      <div className="card-barcode-info">
                        <div className="card-barcode-line">
                          <span className="result-barcode-mono">{barcode}</span>
                          {matchedRecord && (
                            <span className="matched-receiver-name">
                              {matchedRecord.name}
                              {matchedRecord.invNo && ` (${matchedRecord.invNo})`}
                            </span>
                          )}
                        </div>

                        <div className="card-meta-line">
                          {latestDatetime && (
                            <span className="result-latest-badge" title="วันและเวลาปรับปรุงสถานะล่าสุด">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              {latestDatetime}
                            </span>
                          )}
                          {latestLocation && (
                            <span className="result-location-badge" title="ที่ทำการไปรษณีย์ล่าสุด">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                              </svg>
                              {latestLocation}
                            </span>
                          )}
                          {events.length > 0 && (
                            <span className="result-events-count" title="จำนวนจุดเช็กพอยต์ทั้งหมด">
                              {events.length} เหตุการณ์
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="card-header-right">
                      {itemLoading ? (
                        <span className="item-loading-badge">
                          <span className="spinner-small"></span> กำลังตรวจสอบ...
                        </span>
                      ) : itemErr ? (
                        <span className="status-pill returned" title={itemErr}>
                          <span className="status-dot dot-rose"></span> ไม่พบข้อมูล
                        </span>
                      ) : statusInfo ? (
                        <div className="card-status-pill-group">
                          <span className={`status-pill ${statusInfo.badgeClass}`} title={statusInfo.rawDesc || statusInfo.label}>
                            <span className={`status-dot ${statusInfo.dotClass}`}></span>
                            {statusInfo.label}
                          </span>
                          {statusInfo.rawDesc && statusInfo.rawDesc !== statusInfo.label && !statusInfo.label.includes(statusInfo.rawDesc) && (
                            <div
                              className={`status-subtext ${/บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(statusInfo.rawDesc) ? 'status-subtext-alert' : 'status-subtext-transit'}`}
                              title={`สถานะละเอียด: ${statusInfo.rawDesc}`}
                            >
                              {/บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(statusInfo.rawDesc) && <span className="status-subtext-icon">⚠️</span>}
                              <span>{statusInfo.rawDesc}</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Expandable Stepper Timeline */}
                  {isExpanded && (
                    <div className="tracking-card-expanded-body">
                      {itemLoading ? (
                        <div className="tracking-loading-state">
                          <span className="spinner-medium"></span>
                          <p>กำลังดึงประวัติสถานะจริงจาก Web Service ไปรษณีย์ไทย...</p>
                        </div>
                      ) : itemErr ? (
                        <div className="tracking-alert error" style={{ margin: '1rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                          <span>{itemErr}</span>
                        </div>
                      ) : events.length === 0 ? (
                        <div className="tracking-empty-state">
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                          <p className="empty-title">ไม่พบรายการประวัติสถานะ</p>
                          <p className="empty-desc">
                            อาจเป็นเพราะหมายเลขบาร์โค้ดยังไม่ถูกนำส่งเข้าระบบ หรือเพิ่งสร้างเลขยังไม่ได้ผ่านการสแกนรับฝาก
                          </p>
                        </div>
                      ) : (
                        <div className="tracking-stepper">
                          {events.map((ev, evIndex) => {
                            const isLast = evIndex === events.length - 1;
                            const isRec = `${ev.status_description || ''} ${ev.status || ''}`.includes('รับฝาก');

                            return (
                              <div key={evIndex} className={`stepper-item ${isLast ? 'latest' : ''}`}>
                                <div className="stepper-rail">
                                  <div className={`stepper-dot ${isRec ? 'dot-success' : isLast ? 'dot-active' : ''}`}>
                                    {isRec ? '✓' : evIndex + 1}
                                  </div>
                                  {!isLast && <div className="stepper-line"></div>}
                                </div>

                                <div className="stepper-content">
                                  <div className="stepper-status-row">
                                    <span className="stepper-status-desc">{ev.status_description}</span>
                                    {ev.status_label && (
                                      <span className={`stepper-badge-status ${ev.status_key || 'in_transit'}`}>
                                        {ev.status_label}
                                      </span>
                                    )}
                                    {isRec && <span className="stepper-tag-rec">รับฝากแล้ว</span>}
                                    {isLast && <span className="stepper-tag-latest">ล่าสุด</span>}
                                  </div>

                                  <div className="stepper-meta-row">
                                    {ev.datetime && (
                                      <span className="stepper-meta-item datetime" title="วันและเวลารับฝาก / ปรับปรุงสถานะ">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                          <line x1="16" y1="2" x2="16" y2="6"></line>
                                          <line x1="8" y1="2" x2="8" y2="6"></line>
                                          <line x1="3" y1="10" x2="21" y2="10"></line>
                                        </svg>
                                        <span className="datetime-text">{ev.datetime}</span>
                                      </span>
                                    )}
                                    {ev.location && (
                                      <span className="stepper-meta-item location" title="สถานที่ / ที่ทำการ">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                          <circle cx="12" cy="10" r="3"></circle>
                                        </svg>
                                        <span>{ev.location}</span>
                                      </span>
                                    )}
                                    {ev.signature && (
                                      <span className="stepper-meta-item signature" title="ผู้ลงนาม">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                          <circle cx="12" cy="7" r="4"></circle>
                                        </svg>
                                        <span>ผู้ลงนาม: {ev.signature}</span>
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
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}
