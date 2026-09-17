import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTrackingHistory } from '../utils/api';
import { formatStationWithZipcode } from '../utils/postalUtils';
import { openEarWithBarcode } from '../utils/extensionBridge';
import './TrackingTimelineModal.css';

export default function TrackingTimelineModal({ isOpen, barcode, recInfo, currentPerson, onClose, onOpenTrackingPage, onTrackingUpdated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackData, setTrackData] = useState(null);

  const handleFetch = useCallback(async (bcode) => {
    if (!bcode) return;
    setLoading(true);
    setError('');
    setTrackData(null);
    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const result = await fetchTrackingHistory({ barcode: bcode, username, password });
      if (result.success) {
        setTrackData(result);
        if (onTrackingUpdated) {
          onTrackingUpdated(bcode, result);
        }
      } else {
        setError(result.message || 'ไม่สามารถดึงประวัติสถานะได้');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  }, [currentPerson, onTrackingUpdated]);

  useEffect(() => {
    if (isOpen && barcode) {
      handleFetch(barcode);
    }
  }, [isOpen, barcode, handleFetch]);

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

  if (!isOpen) return null;

  const events = trackData?.events || [];
  // chronological: oldest first
  const sortedEvents = [...events].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const latestEvent = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1] : null;
  const latestDatetime = trackData?.latest_datetime || latestEvent?.datetime || '';

  const statusInfo = useMemo(() => {
    if (!latestEvent) {
      const rKey = recInfo?.status_key;
      const rLabel = recInfo?.status_label;
      if (rKey === 'delivered' || rLabel === 'นำจ่ายสำเร็จ') {
        return {
          key: 'delivered',
          label: 'นำจ่ายสำเร็จ',
          badgeClass: 'delivered',
          dotClass: 'dot-green',
          rawDesc: recInfo?.status_description_raw
        };
      }
      if (rKey === 'returned' || rLabel === 'ส่งคืน') {
        return {
          key: 'returned',
          label: 'ส่งคืน',
          badgeClass: 'returned',
          dotClass: 'dot-rose',
          rawDesc: recInfo?.status_description_raw
        };
      }
      return {
        key: 'in_transit',
        label: rLabel || 'รอรับฝาก / อยู่ระหว่างนำส่ง',
        badgeClass: 'in-transit',
        dotClass: 'dot-amber',
        rawDesc: recInfo?.status_description_raw
      };
    }
    const key = latestEvent.status_key || 'in_transit';
    if (key === 'delivered') {
      return {
        key: 'delivered',
        label: 'นำจ่ายสำเร็จ',
        badgeClass: 'delivered',
        dotClass: 'dot-green',
        rawDesc: latestEvent.status_description
      };
    }
    if (key === 'returned') {
      return {
        key: 'returned',
        label: 'ส่งคืน',
        badgeClass: 'returned',
        dotClass: 'dot-rose',
        rawDesc: latestEvent.status_description
      };
    }
    return {
      key: 'in_transit',
      label: 'อยู่ระหว่างการนำจ่าย',
      badgeClass: 'in-transit',
      dotClass: 'dot-amber',
      rawDesc: latestEvent.status_description
    };
  }, [latestEvent, recInfo]);

  const receiverName = recInfo?.receiver || recInfo?.receiver_name || recInfo?.RECEIVER || '';
  const invNo = recInfo?.invNo || recInfo?.inv_no || recInfo?.INV_NO || recInfo?.['REF NO'] || '';

  return (
    <div className="track-modal-overlay" onClick={onClose}>
      <div className="track-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="track-modal-header">
          <div className="track-header-info">
            <div className="track-icon-pill">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <polyline points="8 8 11 8 13 13 16 13"></polyline>
              </svg>
            </div>
            <div>
              <h3 className="track-modal-title">ประวัติสถานะรายชิ้น (Tracking Timeline)</h3>
              <p className="track-modal-subtitle">
                ไทม์ไลน์การนำส่งพัสดุจากระบบ e-Parcel ไปรษณีย์ไทย
              </p>
            </div>
          </div>
          <button type="button" className="track-btn-close" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            ✕
          </button>
        </div>

        {/* Barcode Summary */}
        <div className="track-summary-bar">
          <div className="track-summary-barcode">
            <span className="track-summary-label">หมายเลข Barcode</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span className="track-barcode-mono">{barcode || '-'}</span>
              {latestDatetime && (
                <span className="result-latest-badge" style={{ fontSize: '0.78rem', padding: '0.15rem 0.5rem' }}>
                  อัปเดต: {latestDatetime}
                </span>
              )}
            </div>
          </div>
          {(receiverName || invNo) && (
            <div className="track-summary-receiver">
              <span className="track-summary-label">ผู้รับ / เลขที่อ้างอิง</span>
              <span className="track-summary-value">
                {receiverName || '-'} {invNo ? `(${invNo})` : ''}
              </span>
            </div>
          )}
          <div className="track-summary-status">
            <span className={`status-pill ${statusInfo.badgeClass}`} title={statusInfo.rawDesc || statusInfo.label}>
              <span className={`status-dot ${statusInfo.dotClass}`}></span>
              {statusInfo.label}
            </span>
            {statusInfo.rawDesc && statusInfo.rawDesc !== statusInfo.label && !statusInfo.label.includes(statusInfo.rawDesc) && (
              <div 
                className={`status-subtext ${/บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(statusInfo.rawDesc) ? 'status-subtext-alert' : 'status-subtext-transit'}`}
                style={{ marginTop: '0.35rem', justifyContent: 'flex-end' }}
                title={`สถานะละเอียด: ${statusInfo.rawDesc}`}
              >
                {/บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(statusInfo.rawDesc) && <span className="status-subtext-icon">⚠️</span>}
                <span>{statusInfo.rawDesc}</span>
              </div>
            )}
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="track-alert error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {trackData?.api_notice && !error && (
          <div className="track-alert warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>
              <strong>ข้อสังเกตจากระบบ e-Parcel:</strong> {trackData.api_notice} (ระบบอาจแสดงข้อมูลจำลองหรือข้อมูลสำรองเนื่องจากข้อจำกัด IP)
            </span>
          </div>
        )}

        {trackData?.is_mock && !error && (
          <div className="track-alert info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>
              <strong>โหมดสาธิต (Demo Mode):</strong> กำลังแสดงไทม์ไลน์จำลองของหมายเลข {barcode}
            </span>
          </div>
        )}

        {/* Timeline Stepper */}
        <div className="track-timeline-body">
          {loading ? (
            <div className="track-loading-state">
              <span className="track-spinner large"></span>
              <p>กำลังดึงประวัติสถานะจากไปรษณีย์ไทย...</p>
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="track-empty-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <p className="track-empty-title">ไม่พบข้อมูลประวัติสถานะ</p>
              <p className="track-empty-desc">อาจยังไม่มีข้อมูลในระบบ หรือหมายเลขบาร์โค้ดไม่ถูกต้อง</p>
            </div>
          ) : (
            <ol className="track-stepper-list">
              {sortedEvents.map((ev, idx) => {
                const isLast = idx === sortedEvents.length - 1;
                const isReceived = _isReceivedText(`${ev.status_description || ''} ${ev.status || ''}`) ||
                  ['1', '001', 'p001'].includes(String(ev.status || '').toLowerCase());
                const isDelivered = ev.status_key === 'delivered' || 
                  String(ev.status) === '4' || 
                  String(ev.status) === '501' || 
                  (ev.status_description || '').includes('นำจ่ายถึงผู้รับ') || 
                  (ev.status_description || '').includes('นำจ่ายสำเร็จ') ||
                  (ev.status_description || '').includes('ผู้รับได้รับ');

                return (
                  <li key={ev.seq || idx} className={`track-step-item ${isLast ? 'last' : ''} ${isReceived ? 'received' : ''} ${isDelivered ? 'delivered' : ''}`}>
                    <div className="track-step-marker">
                      <span className={`track-step-dot ${isReceived || isDelivered ? 'ok' : ''}`}>
                        {isReceived || isDelivered ? '✓' : idx + 1}
                      </span>
                      {!isLast && <span className="track-step-line"></span>}
                    </div>
                    <div className="track-step-content">
                      <div className="track-step-head">
                        <span className={`track-step-title ${isReceived || isDelivered ? 'text-emerald' : ''}`}>
                          {ev.status_description || 'อัปเดตสถานะ'}
                        </span>
                        {isReceived && <span className="track-received-badge">รับฝากแล้ว</span>}
                        {isDelivered && <span className="track-received-badge delivered-badge">นำจ่ายสำเร็จ</span>}
                      </div>
                      <div className="track-step-datetime">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>{ev.datetime || '-'}</span>
                      </div>
                      {ev.location && (
                        <div className="track-step-location" title="ที่ทำการไปรษณีย์ / สถานที่">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                          </svg>
                          <span>{formatStationWithZipcode(ev.location, recInfo)}</span>
                        </div>
                      )}
                      {isDelivered && receiverName && (
                        <div className="track-step-receiver" title={`ผู้รับตามจ่าหน้า: ${receiverName}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                          <span><strong className="step-field-label">ผู้รับตามจ่าหน้า:</strong> {receiverName}</span>
                        </div>
                      )}
                      {isDelivered ? (
                        <div className="track-step-signature" title={ev.signature ? `ชื่อผู้รับจริง: ${ev.signature}` : 'ไม่พบข้อมูล signature ในระบบ e-Parcel / ลายเซ็นอยู่ในระบบ e-AR'}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                            <path d="M2 2l7.586 7.586"></path>
                          </svg>
                          {ev.signature ? (
                            <span><strong className="step-field-label">ชื่อผู้รับจริง:</strong> <span className="sig-name">{ev.signature}</span></span>
                          ) : (
                            <span>
                              <strong className="step-field-label">ชื่อผู้รับจริง:</strong>{' '}
                              <span className="sig-hint">(ไม่พบข้อมูล signature ในระบบ e-Parcel / ตรวจสอบลายเซ็นใน e-AR)</span>{' '}
                              <a
                                href={`https://e-ar.thailandpost.com/ear#barcode=${encodeURIComponent(barcode)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="sig-ear-link"
                                title="คลิกเพื่อเปิดระบบ e-AR และค้นหาภาพลายเซ็นอัตโนมัติ"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openEarWithBarcode(barcode);
                                }}
                              >
                                ดูภาพลายเซ็นใน e-AR ↗
                              </a>
                            </span>
                          )}
                        </div>
                      ) : (
                        ev.signature && (
                          <div className="track-step-signature" title={`ผู้ลงนาม: ${ev.signature}`}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span><strong className="step-field-label">ผู้ลงนาม:</strong> {ev.signature}</span>
                          </div>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="track-modal-footer">
          <div className="track-footer-info">
            {trackData && !loading && (
              <>
                แสดง <strong>{sortedEvents.length}</strong> เหตุการณ์ • ล่าสุด: “
                <strong>{sortedEvents[sortedEvents.length - 1]?.status_description || '-'}</strong>”
              </>
            )}
          </div>
          <div className="track-footer-actions">
            <button
              type="button"
              className="btn-track-refresh"
              onClick={() => handleFetch(barcode)}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="track-spinner small"></span>
                  <span>กำลังโหลด...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  <span>รีเฟรชสถานะ</span>
                </>
              )}
            </button>
            {onOpenTrackingPage && (
              <button
                type="button"
                className="btn-track-fullpage"
                onClick={() => {
                  onClose();
                  onOpenTrackingPage(barcode);
                }}
                title="เปิดในหน้าค้นหาและติดตามสถานะพัสดุแบบเต็มจอ"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                <span>เปิดหน้าตรวจสอบเต็มจอ</span>
              </button>
            )}
            <button type="button" className="btn-track-close" onClick={onClose}>
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function _isReceivedText(text) {
  return (text || '').includes('รับฝาก');
}