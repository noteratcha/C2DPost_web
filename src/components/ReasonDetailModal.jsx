import React, { useState, useEffect, useMemo } from 'react';
import { exportReasonExcel } from '../utils/api';
import { formatStationWithZipcode } from '../utils/postalUtils';
import TrackingTimelineModal from './TrackingTimelineModal';
import './ReasonDetailModal.css';

/**
 * Popup listing the parcels behind a dashboard reason card
 * (สาเหตุการส่งคืน / สาเหตุการนำจ่ายไม่สำเร็จ) with reason filter chips and Excel export.
 *
 * @param {'return'|'delivery_failed'} reasonType
 * @param {string} initialReason - reason row that was clicked ('' = all reasons)
 * @param {Array} items - reason parcels of this type
 */
export default function ReasonDetailModal({
  isOpen,
  onClose,
  reasonType,
  title,
  items = [],
  initialReason = '',
  dateDisplay = '',
  currentPerson
}) {
  const [activeReason, setActiveReason] = useState(initialReason);
  const [searchText, setSearchText] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [trackingItem, setTrackingItem] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveReason(initialReason);
    setSearchText('');
    setExportError('');
  }, [isOpen, initialReason]);

  // Esc closes this popup (but not while the timeline modal on top is open)
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !trackingItem) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, trackingItem]);

  const reasonChips = useMemo(() => {
    const counts = {};
    items.forEach((it) => {
      const key = it.reason || '-';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = activeReason ? items.filter((it) => (it.reason || '-') === activeReason) : items;
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter((it) =>
        [it.barcode, it.inv_no, it.receiver_name, it.receiver_address, it.receiver_province, it.latest_station]
          .some((v) => v && String(v).toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, activeReason, searchText]);

  if (!isOpen) return null;

  const isReturn = reasonType === 'return';

  const handleExport = async () => {
    if (filteredItems.length === 0) return;
    setIsExporting(true);
    setExportError('');
    try {
      await exportReasonExcel({
        items: filteredItems,
        title,
        reasonType,
        reason: activeReason,
        date: dateDisplay,
        organization: currentPerson?.Organization || ''
      });
    } catch (err) {
      setExportError(err.message || 'ไม่สามารถดาวน์โหลดไฟล์ Excel ได้');
    } finally {
      setIsExporting(false);
    }
  };

  const formatAddress = (it) =>
    [
      it.receiver_address,
      it.receiver_amphur ? (it.receiver_amphur.startsWith('อ.') ? it.receiver_amphur : `อ.${it.receiver_amphur}`) : '',
      it.receiver_province ? (it.receiver_province.startsWith('จ.') ? it.receiver_province : `จ.${it.receiver_province}`) : '',
      it.receiver_zipcode
    ].filter(Boolean).join(' ');

  return (
    <div className="reason-modal-overlay" onClick={onClose}>
      <div
        className={`reason-modal-box ${isReturn ? 'is-return' : 'is-failed'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="reason-modal-header">
          <div className="reason-modal-title-group">
            <div className={`stat-card-icon ${isReturn ? 'icon-returned' : 'icon-transit'} dash-mini-icon`}>
              {isReturn ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="9 14 4 9 9 4"></polyline>
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              )}
            </div>
            <div className="reason-modal-title-text">
              <h3>{title}</h3>
              <span className="reason-modal-sub">
                {dateDisplay ? `ช่วงวันที่ ${dateDisplay} • ` : ''}ทั้งหมด {items.length} รายการ
              </span>
            </div>
          </div>
          <button type="button" className="reason-modal-close" onClick={onClose} title="ปิด (Esc)">
            ✕
          </button>
        </div>

        {/* Reason chips + search */}
        <div className="reason-modal-toolbar">
          <div className="reason-chip-row">
            <button
              type="button"
              className={`reason-chip ${activeReason === '' ? 'active' : ''}`}
              onClick={() => setActiveReason('')}
            >
              ทุกสาเหตุ <span className="reason-chip-count">{items.length}</span>
            </button>
            {reasonChips.map((c) => (
              <button
                type="button"
                key={c.reason}
                className={`reason-chip ${activeReason === c.reason ? 'active' : ''}`}
                onClick={() => setActiveReason(c.reason)}
              >
                {c.reason} <span className="reason-chip-count">{c.count}</span>
              </button>
            ))}
          </div>
          <div className="reason-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ค้นหาบาร์โค้ด, เลขคำขอ, ชื่อผู้รับ..."
            />
          </div>
        </div>

        {/* List */}
        <div className="reason-modal-body">
          {filteredItems.length === 0 ? (
            <div className="reason-modal-empty">ไม่พบรายการ</div>
          ) : (
            <table className="reason-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th>หมายเลข Barcode</th>
                  <th>ผู้รับ / ที่อยู่</th>
                  <th>สาเหตุ</th>
                  <th>ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => (
                  <tr key={`${it.barcode}-${idx}`}>
                    <td className="col-idx">{idx + 1}</td>
                    <td className="col-barcode">
                      {it.barcode ? (
                        <button
                          type="button"
                          className="table-barcode-btn"
                          onClick={() => setTrackingItem(it)}
                          title={`ดูไทม์ไลน์สถานะ ${it.barcode}`}
                        >
                          <span className="table-barcode-pill">{it.barcode}</span>
                        </button>
                      ) : '-'}
                      {it.inv_no && <div className="reason-inv">{it.inv_no}</div>}
                    </td>
                    <td className="col-receiver">
                      <div className="reason-receiver-name">{it.receiver_name || '-'}</div>
                      <div className="reason-receiver-addr">{formatAddress(it) || '-'}</div>
                    </td>
                    <td className="col-reason">
                      <span className={`reason-pill ${isReturn ? 'pill-return' : 'pill-failed'}`}>{it.reason || '-'}</span>
                    </td>
                    <td className="col-latest">
                      <div>{it.latest_date || '-'}</div>
                      {it.latest_station && (
                        <div className="reason-station">{formatStationWithZipcode(it.latest_station, it)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="reason-modal-footer">
          <span className="reason-modal-count">
            แสดง <strong>{filteredItems.length}</strong> จาก {items.length} รายการ
            {activeReason ? ` • ${activeReason}` : ''}
          </span>
          {exportError && <span className="reason-modal-error">{exportError}</span>}
          <button
            type="button"
            className="btn-reason-excel"
            onClick={handleExport}
            disabled={isExporting || filteredItems.length === 0}
            title="ดาวน์โหลดรายการที่แสดงอยู่เป็นไฟล์ Excel"
          >
            {isExporting ? (
              <>
                <span className="spinner-small"></span>
                <span>กำลังสร้างไฟล์...</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>ดาวน์โหลด Excel ({filteredItems.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {trackingItem && (
        <div onClick={(e) => e.stopPropagation()}>
          <TrackingTimelineModal
            isOpen={!!trackingItem}
            barcode={trackingItem.barcode}
            recInfo={{
              ...trackingItem,
              receiver: trackingItem.receiver_name,
              invNo: trackingItem.inv_no,
              receiver_address: formatAddress(trackingItem),
              status_key: trackingItem.status_key,
              status_label: trackingItem.status_label,
              status_description_raw: trackingItem.status_description_raw
            }}
            currentPerson={currentPerson}
            onClose={() => setTrackingItem(null)}
          />
        </div>
      )}
    </div>
  );
}
