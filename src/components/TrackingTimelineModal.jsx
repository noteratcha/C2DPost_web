import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchTrackingHistory } from '../utils/api';
import { formatStationWithZipcode } from '../utils/postalUtils';
import { openEarWithBarcode } from '../utils/extensionBridge';
import { fetchEarDetailsClient, openEarWithTrackingPdf } from '../utils/earService';
import './TrackingTimelineModal.css';

export default function TrackingTimelineModal({ isOpen, barcode, recInfo, currentPerson, onClose, onOpenTrackingPage, onTrackingUpdated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackData, setTrackData] = useState(null);
  const [clientEarData, setClientEarData] = useState(null);
  const [earLoading, setEarLoading] = useState(false);
  const [openingEarPdf, setOpeningEarPdf] = useState(false);
  const [selectedSigModal, setSelectedSigModal] = useState(null);

  const timelineBodyRef = useRef(null);
  const latestStepRef = useRef(null);

  const handleFetch = useCallback(async (bcode) => {
    if (!bcode) return;
    setLoading(true);
    setError('');
    setTrackData(null);
    setClientEarData(null);
    setEarLoading(false);
    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const result = await fetchTrackingHistory({ barcode: bcode, username, password });
      if (result.success) {
        setTrackData(result);
        if (onTrackingUpdated) {
          onTrackingUpdated(bcode, result);
        }
        // Fetch client-side e-AR details if parcel is delivered
        const hasDelivered = (result.events || []).some(ev => {
          const desc = (ev.status_description || '').replace(/ํา/g, 'ำ');
          return ev.status_key === 'delivered' || 
            String(ev.status) === '4' || 
            String(ev.status) === '501' || 
            /นำจ่ายถึงผู้รับ|นำจ่ายสำเร็จ|ผู้รับได้รับ|จัดส่งสำเร็จ/i.test(desc);
        });
        if (hasDelivered) {
          setEarLoading(true);
          fetchEarDetailsClient(bcode).then(earRes => {
            if (earRes && earRes.has_ear) {
              setClientEarData(earRes);
            }
          }).catch(err => {
            console.warn('Client e-AR fetch error:', err);
          }).finally(() => {
            setEarLoading(false);
          });
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

  const events = trackData?.events || [];
  // chronological: oldest first
  const sortedEvents = [...events].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const latestEvent = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1] : null;
  const latestDatetime = trackData?.latest_datetime || latestEvent?.datetime || '';

  // Auto-scroll to latest status on initial display and whenever data updates
  useEffect(() => {
    if (!loading && sortedEvents.length > 0 && isOpen) {
      const scrollToLatest = (behavior = 'smooth') => {
        if (latestStepRef.current) {
          latestStepRef.current.scrollIntoView({ behavior, block: 'end' });
        } else if (timelineBodyRef.current) {
          timelineBodyRef.current.scrollTo({
            top: timelineBodyRef.current.scrollHeight,
            behavior
          });
        }
      };

      // Immediate fast positioning followed by smooth follow-up after images/layout finish
      const t1 = setTimeout(() => scrollToLatest('auto'), 40);
      const t2 = setTimeout(() => scrollToLatest('smooth'), 220);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [loading, sortedEvents.length, clientEarData, isOpen]);

  const [copied, setCopied] = useState(false);
  const handleCopyBarcode = useCallback(() => {
    if (!barcode) return;
    navigator.clipboard?.writeText(barcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [barcode]);

  const handleOpenEarPdf = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (openingEarPdf || !barcode) return;
    setOpeningEarPdf(true);
    try {
      await openEarWithTrackingPdf({
        barcode,
        events: sortedEvents,
        matchedRecord: recInfo,
        clientEar: clientEarData,
        trackData: trackData,
        downloadedAt: ''
      });
    } catch (err) {
      console.error('Failed to open e-AR with tracking:', err);
      alert(`ไม่สามารถเปิดเอกสาร e-AR ได้: ${err.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setOpeningEarPdf(false);
    }
  };

  const statusInfo = useMemo(() => {
    // Check if description represents a delivery exception/issue
    const checkException = (desc) => {
      if (!desc) return null;
      const normalized = desc.replace(/ํา/g, 'ำ');
      const isEx = /บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่มีเลขที่|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(normalized);
      return isEx ? desc : null;
    };

    if (!latestEvent) {
      const rKey = recInfo?.status_key;
      const rLabel = recInfo?.status_label;
      const rawDesc = recInfo?.status_description_raw || '';
      const exceptionDesc = checkException(rawDesc);

      if (exceptionDesc) {
        return {
          key: 'exception',
          label: `นำจ่ายไม่สำเร็จ (${exceptionDesc})`,
          badgeClass: 'exception',
          dotClass: 'dot-amber',
          isException: true,
          rawDesc
        };
      }
      if (rKey === 'delivered' || rLabel === 'นำจ่ายสำเร็จ') {
        return {
          key: 'delivered',
          label: 'นำจ่ายสำเร็จ',
          badgeClass: 'delivered',
          dotClass: 'dot-green',
          isException: false,
          rawDesc
        };
      }
      if (rKey === 'returned' || rLabel === 'ส่งคืน') {
        return {
          key: 'returned',
          label: 'ส่งคืนต้นทาง',
          badgeClass: 'returned',
          dotClass: 'dot-rose',
          isException: false,
          rawDesc
        };
      }
      return {
        key: 'in_transit',
        label: rLabel || 'อยู่ระหว่างการนำส่ง',
        badgeClass: 'in-transit',
        dotClass: 'dot-amber',
        isException: false,
        rawDesc
      };
    }

    const rawDesc = latestEvent.status_description || '';
    const descNormalized = rawDesc.replace(/ํา/g, 'ำ');
    const exceptionDesc = checkException(descNormalized);

    const isDelivered = latestEvent.status_key === 'delivered' || 
      String(latestEvent.status) === '4' || 
      String(latestEvent.status) === '501' || 
      /นำจ่ายถึงผู้รับ|นำจ่ายสำเร็จ|ผู้รับได้รับ|จัดส่งสำเร็จ/i.test(descNormalized);

    if (isDelivered) {
      const rawSig = String(latestEvent.signature || trackData?.signature || recInfo?.signature || '').trim();
      const hasSig = Boolean(
        (rawSig && rawSig !== '-' && !/^(ไม่มี|ไม่พบ|null|undefined)$/i.test(rawSig)) ||
        latestEvent.signature_image ||
        earInfo?.signature_image ||
        clientEarData?.signature_image
      );
      return {
        key: 'delivered',
        label: hasSig ? 'นำจ่ายสำเร็จ ✍️' : 'นำจ่ายสำเร็จ',
        hasSignature: hasSig,
        signatureName: rawSig,
        badgeClass: 'delivered',
        dotClass: 'dot-green',
        isException: false,
        rawDesc
      };
    }

    if (exceptionDesc) {
      return {
        key: 'exception',
        label: `นำจ่ายไม่สำเร็จ (${exceptionDesc})`,
        badgeClass: 'exception',
        dotClass: 'dot-amber',
        isException: true,
        rawDesc
      };
    }

    if (latestEvent.status_key === 'returned' || /ส่งคืน|ตีกลับ/i.test(descNormalized)) {
      return {
        key: 'returned',
        label: 'ส่งคืนต้นทาง',
        badgeClass: 'returned',
        dotClass: 'dot-rose',
        isException: false,
        rawDesc
      };
    }

    return {
      key: 'in_transit',
      label: 'อยู่ระหว่างการนำจ่าย',
      badgeClass: 'in-transit',
      dotClass: 'dot-amber',
      isException: false,
      rawDesc
    };
  }, [latestEvent, recInfo]);

  const receiverName = recInfo?.receiver || recInfo?.receiver_name || recInfo?.RECEIVER || '';
  const invNo = recInfo?.invNo || recInfo?.inv_no || recInfo?.INV_NO || recInfo?.['REF NO'] || '';

  // Construct comprehensive receiver address
  const receiverAddress = useMemo(() => {
    if (!recInfo) return '';
    if (recInfo.fullAddress) return String(recInfo.fullAddress).trim();
    const baseAddr = String(recInfo.receiver_address || recInfo.address || recInfo.RECEIVER_ADDRESS || recInfo.cusAdd || '').trim();
    const amphur = String(recInfo.receiver_amphur || recInfo.amphur || recInfo.RECEIVER_AMPHUR || '').trim();
    const province = String(recInfo.receiver_province || recInfo.province || recInfo.RECEIVER_PROVINCE || '').trim();
    const zipcode = String(recInfo.receiver_zipcode || recInfo.zipcode || recInfo.RECEIVER_ZIPCODE || '').trim();

    const parts = [baseAddr];
    if (amphur && !baseAddr.includes(amphur)) {
      parts.push(amphur.startsWith('อ.') ? amphur : `อ.${amphur}`);
    }
    if (province && !baseAddr.includes(province)) {
      parts.push(province.startsWith('จ.') ? province : `จ.${province}`);
    }
    if (zipcode && !baseAddr.includes(zipcode)) {
      parts.push(zipcode);
    }
    return parts.filter(Boolean).join(' ').trim();
  }, [recInfo]);

  // Early return ต้องอยู่หลัง hooks ทั้งหมดเสมอ (ไม่งั้นละเมิด Rules of Hooks — บั๊ก #15)
  if (!isOpen) return null;

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
              <div className="track-modal-title-row">
                <h3 className="track-modal-title">ประวัติสถานะรายชิ้น</h3>
                <span className="track-title-badge">Tracking Timeline</span>
              </div>
              <p className="track-modal-subtitle">
                ไทม์ไลน์การนำส่งพัสดุจากระบบ e-Parcel ไปรษณีย์ไทย
              </p>
            </div>
          </div>
          <button type="button" className="track-btn-close" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            ✕
          </button>
        </div>

        {/* Barcode Summary Card (Structured 2-Tier Layout) */}
        <div className="track-summary-card">
          <div className="track-summary-top">
            <div className="track-summary-barcode-box">
              <span className="track-summary-label">หมายเลข Barcode</span>
              <div className="track-barcode-row">
                <span className="track-barcode-mono">{barcode || '-'}</span>
                {barcode && (
                  <button
                    type="button"
                    className={`btn-copy-barcode ${copied ? 'copied' : ''}`}
                    onClick={handleCopyBarcode}
                    title="คัดลอกหมายเลขพัสดุ"
                  >
                    {copied ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>คัดลอกแล้ว</span>
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>คัดลอก</span>
                      </>
                    )}
                  </button>
                )}
                {latestDatetime && (
                  <span className="track-update-badge" title="เวลาอัปเดตสถานะล่าสุดจาก e-Parcel">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>อัปเดต: {latestDatetime}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Permanent Anchored Status Badge (Top-Right) */}
            <div className="track-summary-status-box">
              <span className={`status-pill ${statusInfo.badgeClass}`} title={statusInfo.rawDesc || statusInfo.label}>
                {statusInfo.isException ? (
                  <span className="status-pill-icon">⚠️</span>
                ) : (
                  <span className={`status-dot ${statusInfo.dotClass}`}></span>
                )}
                <span className="status-pill-text">{statusInfo.label}</span>
              </span>
            </div>
          </div>

          {/* Bottom Tier: Recipient & Reference Information Banner */}
          {(receiverName || invNo || receiverAddress) && (
            <div className="track-summary-recipient-row">
              {receiverName && (
                <div className="track-recipient-pill" title={`ผู้รับตามจ่าหน้า: ${receiverName}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span className="recipient-label">ผู้รับ:</span>
                  <span className="recipient-value">{receiverName}</span>
                </div>
              )}
              {invNo && (
                <div className="track-ref-pill" title={`เลขที่อ้างอิง: ${invNo}`}>
                  <span className="ref-label">เลขที่อ้างอิง:</span>
                  <span className="ref-value">{invNo}</span>
                </div>
              )}
              {receiverAddress && (
                <div className="track-address-pill" title={`ที่อยู่ผู้รับ: ${receiverAddress}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <span className="address-label">ที่อยู่:</span>
                  <span className="address-value">{receiverAddress}</span>
                </div>
              )}
            </div>
          )}
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
        <div className="track-timeline-body" ref={timelineBodyRef}>
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
                const descNormalized = (ev.status_description || '').replace(/ํา/g, 'ำ');

                const isReceived = _isReceivedText(`${ev.status_description || ''} ${ev.status || ''}`) ||
                  ['1', '001', 'p001'].includes(String(ev.status || '').toLowerCase());

                const isDelivered = ev.status_key === 'delivered' || 
                  String(ev.status) === '4' || 
                  String(ev.status) === '501' || 
                  /นำจ่ายถึงผู้รับ|นำจ่ายสำเร็จ|ผู้รับได้รับ|จัดส่งสำเร็จ/i.test(descNormalized);

                const isException = /บ้านปิด|ออกใบแจ้ง|ไม่ชัดเจน|ไม่มีเลขบ้าน|ไม่มีเลขที่|ไม่ยอมรับ|ไม่มีผู้รับ|ไม่มารับตามกำหนด|รอจ่าย|ย้าย|เสียหาย|ระงับ|คืน/i.test(descNormalized);

                const isReturned = ev.status_key === 'returned' || /ส่งคืน|ตีกลับ/i.test(descNormalized);

                // Determine step marker dot and class
                // Rule: Checkmark (✓) is strictly displayed ONLY for the latest status (isLast)
                let dotContent;
                let dotClass = '';
                let itemClass = '';

                if (isLast) {
                  if (isDelivered) {
                    dotContent = '✓';
                    dotClass = 'delivered';
                    itemClass = 'delivered-step';
                  } else if (isException) {
                    dotContent = '⚠️';
                    dotClass = 'exception';
                    itemClass = 'exception-step';
                  } else if (isReturned) {
                    dotContent = '↩';
                    dotClass = 'returned';
                    itemClass = 'returned-step';
                  } else if (isReceived) {
                    dotContent = '✓';
                    dotClass = 'received';
                    itemClass = 'received-step';
                  } else {
                    dotContent = '🚚';
                    dotClass = 'in-transit-active';
                    itemClass = 'in-transit-step';
                  }
                } else {
                  // Past steps: ALWAYS show numeric sequence (1, 2, 3...), NEVER show checkmark
                  dotContent = idx + 1;
                  dotClass = 'normal';
                  itemClass = isException ? 'exception-step-past' : 'normal-step';
                }

                return (
                  <li
                    key={ev.seq || idx}
                    ref={isLast ? latestStepRef : null}
                    className={`track-step-item ${isLast ? 'last' : ''} ${itemClass}`}
                  >
                    <div className="track-step-marker">
                      <span className={`track-step-dot ${dotClass}`}>
                        {isLast && (isException || dotClass === 'in-transit-active') && (
                          <span className="track-step-pulse-ring"></span>
                        )}
                        {dotContent}
                      </span>
                      {!isLast && <span className={`track-step-line ${isException ? 'line-amber' : ''} ${isDelivered ? 'line-emerald' : ''}`}></span>}
                    </div>
                    <div className="track-step-content">
                      <div className="track-step-head">
                        <span className={`track-step-title ${isDelivered ? 'text-emerald' : isException ? 'text-amber' : isReturned ? 'text-rose' : ''}`}>
                          {ev.status_description || 'อัปเดตสถานะ'}
                        </span>
                        {isException && (
                          <span className="track-badge-pill warning">ข้อยกเว้น: {ev.status_description}</span>
                        )}
                        {isDelivered && (
                          <span className="track-badge-pill success">นำจ่ายสำเร็จ</span>
                        )}
                        {isReturned && (
                          <span className="track-badge-pill danger">ส่งคืนต้นทาง</span>
                        )}
                        {isReceived && !isDelivered && !isException && !isReturned && (
                          !(ev.status_description || '').includes('รับฝากแล้ว') && (
                            <span className="track-badge-pill teal">รับฝากแล้ว</span>
                          )
                        )}
                        {isLast && !isDelivered && !isException && !isReturned && !isReceived && (
                          <span className="track-badge-pill active">สถานะล่าสุด</span>
                        )}
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
                        (() => {
                          if (earLoading) {
                            return (
                              <div className="track-step-ear-box" style={{ padding: '0.65rem 0.85rem', background: '#f0fdf4', border: '1px dashed #10b981' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem', color: '#047857' }}>
                                  <span className="track-spinner small" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#059669' }}></span>
                                  <span>กำลังโหลดภาพลายเซ็นและข้อมูลผู้รับจากระบบ e-AR...</span>
                                </div>
                              </div>
                            );
                          }

                          const earInfo = clientEarData || ev.ear_info || trackData?.ear_info;
                          const sigImg = clientEarData?.signature_image || ev.signature_image || earInfo?.signature_image;
                          const rel = clientEarData?.relationship || ev.relationship || earInfo?.relationship;
                          const officer = clientEarData?.delivery_officer || ev.delivery_officer || earInfo?.delivery_officer;
                          const earPdfUrl = clientEarData?.blob_url || earInfo?.pdf_url || `/api/reports/ear-pdf?barcode=${encodeURIComponent(barcode)}`;

                          if (sigImg || rel || earInfo?.has_ear) {
                            return (
                              <div className="track-step-ear-box">
                                <div className="ear-box-header">
                                  <span className="ear-box-title">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                      <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                                      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                                      <path d="M2 2l7.586 7.586"></path>
                                    </svg>
                                    หลักฐานการลงนาม (ระบบ e-AR)
                                  </span>
                                  {earInfo?.has_ear && (
                                    <button
                                      type="button"
                                      className="ear-box-pdf-btn"
                                      title="เปิดดูใบตอบรับ e-AR พร้อมประวัติสถานะการนำส่ง (PDF 2 หน้า)"
                                      disabled={openingEarPdf}
                                      onClick={handleOpenEarPdf}
                                    >
                                      {openingEarPdf ? (
                                        <>
                                          <span className="track-spinner small" style={{ width: '12px', height: '12px', borderWidth: '2px', display: 'inline-block' }}></span>
                                          <span>กำลังสร้าง PDF 2 หน้า...</span>
                                        </>
                                      ) : (
                                        <>📄 ดูใบตอบรับ e-AR (PDF) ↗</>
                                      )}
                                    </button>
                                  )}
                                </div>

                                <div className="ear-box-body">
                                  {sigImg && (
                                    <div 
                                      className="ear-sig-thumb-wrap" 
                                      onClick={() => setSelectedSigModal({ img: sigImg, rel, officer, barcode })}
                                      title="คลิกเพื่อดูภาพลายเซ็นขนาดใหญ่"
                                    >
                                      <img src={sigImg} alt="ลายมือชื่อผู้รับ" className="ear-sig-thumb-img" />
                                      <span className="ear-sig-thumb-hint">🔍 ดูรูปใหญ่</span>
                                    </div>
                                  )}

                                  <div className="ear-sig-details">
                                    {rel && (
                                      <div className="ear-detail-row">
                                        <span className="ear-detail-label">ความสัมพันธ์:</span>
                                        <span className="ear-detail-badge">{rel}</span>
                                      </div>
                                    )}
                                    {officer && (
                                      <div className="ear-detail-row">
                                        <span className="ear-detail-label">จนท.นำจ่าย:</span>
                                        <span className="ear-detail-val">{officer}</span>
                                      </div>
                                    )}
                                    {ev.signature && (
                                      <div className="ear-detail-row">
                                        <span className="ear-detail-label">ชื่อผู้รับ:</span>
                                        <span className="ear-detail-val font-semibold">{ev.signature}</span>
                                      </div>
                                    )}
                                    {!sigImg && (
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
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="track-step-signature" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }} title={ev.signature ? `ชื่อผู้รับจริง: ${ev.signature}` : 'ไม่พบข้อมูล signature ในระบบ e-Parcel / ลายเซ็นอยู่ในระบบ e-AR'}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
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

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.76rem', color: '#64748b' }}>
                                <button
                                  type="button"
                                  style={{
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    padding: '0.2rem 0.5rem',
                                    fontSize: '0.74rem',
                                    color: '#047857',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}
                                  onClick={() => {
                                    setEarLoading(true);
                                    fetchEarDetailsClient(barcode, true).then(earRes => {
                                      if (earRes && earRes.has_ear) {
                                        setClientEarData(earRes);
                                      }
                                    }).finally(() => {
                                      setEarLoading(false);
                                    });
                                  }}
                                  title="กดเพื่อส่งคำขอเชื่อมต่อดึงภาพลายเซ็น e-AR อีกครั้ง"
                                >
                                  🔄 ลองดึงภาพลายเซ็น e-AR อีกครั้ง
                                </button>
                                <span>(ต้องใช้ส่วนเสริม C2DPost Helper v1.3.0)</span>
                              </div>
                            </div>
                          );
                        })()
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
              <div className="track-event-counter-pill">
                <span className="counter-count">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="9 11 12 14 22 4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                  {sortedEvents.length} เหตุการณ์
                </span>
                <span className="counter-divider">•</span>
                <span className="counter-latest">
                  ล่าสุด: <strong>{sortedEvents[sortedEvents.length - 1]?.status_description || '-'}</strong>
                </span>
              </div>
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
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Signature Zoom */}
      {selectedSigModal && (
        <div className="ear-lightbox-overlay" onClick={() => setSelectedSigModal(null)}>
          <div className="ear-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ear-lightbox-header">
              <span className="ear-lightbox-title">✍️ ภาพลายมือชื่อผู้รับ ({selectedSigModal.barcode})</span>
              <button 
                type="button" 
                className="ear-lightbox-close" 
                onClick={() => setSelectedSigModal(null)}
                title="ปิดหน้าต่างภาพขยาย"
              >
                ✕
              </button>
            </div>
            <div className="ear-lightbox-img-wrap">
              <img src={selectedSigModal.img} alt="ภาพลายมือชื่อผู้รับจริง" className="ear-lightbox-img" />
            </div>
            <div className="ear-lightbox-meta">
              {selectedSigModal.rel && (
                <div><strong>ความสัมพันธ์:</strong> {selectedSigModal.rel}</div>
              )}
              {selectedSigModal.officer && (
                <div><strong>เจ้าหน้าที่นำจ่าย:</strong> {selectedSigModal.officer}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function _isReceivedText(text) {
  return (text || '').includes('รับฝาก');
}