import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../utils/api';
import './PostofficePendingCard.css';

function formatIssued(ts, withTime = true) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})\s*(\d{2}:\d{2})?/);
  if (!m) return ts || '-';
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}${withTime && m[4] ? ` ${m[4]}` : ''}`;
}

function daysAgo(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const issued = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const now = new Date(Date.now() + 7 * 3600 * 1000); // Thai date
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - issued) / 86400000);
}

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"></circle>
    <polyline points="12 7 12 12 15 14"></polyline>
  </svg>
);

const Chevron = ({ open }) => (
  <svg className={`po-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

/**
 * Post office accounts: parcels that registered agencies sent to e-Parcel
 * but have not deposited at the counter yet (last 30 days).
 */
export default function PostofficePendingCard({
  currentPerson, refreshKey = 0, agencyFilter = '', onLoaded, onShowInTable,
  endpoint = 'postoffice', // 'postoffice' (all agencies of the post office) | 'agency' (own parcels)
  hideWhenEmpty = false
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openAgency, setOpenAgency] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/${endpoint === 'agency' ? 'agency' : 'postoffice'}/pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentPerson?.UserName || '', password: currentPerson?.Password || '', days: 30 })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || json.detail || `HTTP ${res.status}`);
      setData(json);
      if (onLoaded) onLoaded(json);
    } catch (err) {
      setError(`ดึงรายการรอฝากส่งไม่สำเร็จ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentPerson?.UserName, currentPerson?.Password, onLoaded, endpoint]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const allAgencies = data?.by_agency || [];
  // agencyFilter is the organization name selected in the page-wide filter
  const agencies = agencyFilter ? allAgencies.filter((a) => a.organization === agencyFilter) : allAgencies;
  const shownPending = agencies.reduce((sum, a) => sum + a.pending, 0);
  const itemsOf = (agency) => (data?.items || []).filter((it) => it.agency === agency);

  // Auto-cancel policy: pending longer than N days is cancelled by the nightly job
  const cancelAfter = data?.auto_cancel_after_days || 30;
  const warnFrom = data?.auto_cancel_warn_days || 25;
  const cancelIn = (age) => (age === null ? null : Math.max(0, cancelAfter + 1 - age));
  const nearCancel = (data?.items || []).filter((it) => {
    const age = daysAgo(it.issued);
    return age !== null && age >= warnFrom && (!agencyFilter || it.organization === agencyFilter);
  }).length;

  // A single agency is opened automatically
  const isOpen = (a) => openAgency === a.agency || (agencies.length === 1 && openAgency !== `closed:${a.agency}`);
  const toggle = (a) => setOpenAgency(isOpen(a) ? `closed:${a.agency}` : a.agency);

  if (hideWhenEmpty && data && !error && shownPending === 0) return null;

  return (
    <section className="po-pending-card">
      {/* Header */}
      <div className="po-pending-head">
        <div className="po-pending-head-left">
          <div className="po-pending-icon"><ClockIcon /></div>
          <div className="po-pending-titles">
            <h3 className="po-pending-title">พัสดุรอการฝากส่ง</h3>
            <p className="po-pending-sub">
              ส่งข้อมูล e-Parcel แล้วแต่ยังไม่นำมาฝากที่ ปณ. · ค้างเกิน {cancelAfter} วันระบบจะยกเลิกอัตโนมัติ
              {data && !data.auto_cancel_live && ' (ช่วงทดลอง: ยังไม่ยกเลิกจริง)'}
            </p>
          </div>
        </div>
        <div className="po-pending-head-right">
          {loading && data && <span className="po-pending-checking"><span className="po-spinner"></span>กำลังตรวจสอบ</span>}
          {nearCancel > 0 && (
            <span className="po-near-cancel" title={`ค้างตั้งแต่ ${warnFrom} วันขึ้นไป`}>ใกล้ถูกยกเลิก {nearCancel} ชิ้น</span>
          )}
          {data && (
            <span className={`po-pending-total ${shownPending ? '' : 'is-zero'}`}>
              <strong>{shownPending.toLocaleString('th-TH')}</strong> ชิ้น
            </span>
          )}
          {onShowInTable && shownPending > 0 && (
            <button type="button" className="po-pending-btn" onClick={onShowInTable} title="แสดงรายการ Pending ในช่วงวันที่ที่เลือกในตารางด้านล่าง">
              ดูในตาราง
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {error ? (
        <div className="po-pending-error">{error}</div>
      ) : !data ? (
        <div className="po-pending-state"><span className="po-spinner"></span>กำลังตรวจสอบสถานะกับระบบไปรษณีย์...</div>
      ) : agencies.length === 0 ? (
        <div className="po-pending-state is-ok">
          <span className="po-ok-dot">✓</span>
          {agencyFilter ? 'หน่วยงานนี้ไม่มีพัสดุค้างฝากส่ง' : `ไม่มีพัสดุค้างฝากส่ง (${data.agencies_registered} หน่วยงานที่ลงทะเบียน)`}
        </div>
      ) : (
        <div className="po-pending-list">
          {agencies.map((a) => {
            const age = daysAgo(a.oldest);
            const open = isOpen(a);
            const items = open ? itemsOf(a.agency) : [];
            return (
              <div key={a.agency} className={`po-agency-row ${open ? 'is-open' : ''}`}>
                <button type="button" className="po-agency-summary" onClick={() => toggle(a)} aria-expanded={open}>
                  <span className="po-agency-name">{a.organization}</span>
                  <span className="po-agency-meta">
                    ออกบาร์โค้ด {formatIssued(a.oldest, false)}
                    {formatIssued(a.oldest, false) !== formatIssued(a.latest, false) && ` – ${formatIssued(a.latest, false)}`}
                  </span>
                  {age !== null && age >= 1 && (
                    <span className={`po-age-badge ${age >= warnFrom ? 'is-critical' : age >= 3 ? 'is-late' : ''}`}>ค้าง {age} วัน</span>
                  )}
                  <span className="po-count-pill">{a.pending} ชิ้น</span>
                  <Chevron open={open} />
                </button>

                {open && (
                  <div className="po-items-scroll">
                    <table className="deposit-data-table po-items-table">
                      <thead>
                        <tr>
                          <th className="col-no">#</th>
                          <th>หมายเลข Barcode</th>
                          <th>ออกบาร์โค้ด</th>
                          <th>ผู้รับ / ที่อยู่</th>
                          <th>ยกเลิกอัตโนมัติ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => (
                          <tr key={it.barcode}>
                            <td className="col-no">{idx + 1}</td>
                            <td><span className="table-barcode-pill">{it.barcode}</span></td>
                            <td className="col-date">{formatIssued(it.issued)}</td>
                            <td className="col-details">{it.details || '-'}</td>
                            <td className="col-cancel">
                              {(() => {
                                const age = daysAgo(it.issued);
                                const left = cancelIn(age);
                                if (left === null) return '-';
                                if (age >= warnFrom) {
                                  return <span className="po-cancel-badge">{left === 0 ? 'คืนนี้' : `อีก ${left} วัน`}</span>;
                                }
                                return <span className="po-cancel-muted">อีก {left} วัน</span>;
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {data.errors?.length > 0 && (
            <div className="po-pending-error">ตรวจสถานะไม่ได้บางหน่วยงาน: {data.errors.join(', ')}</div>
          )}
        </div>
      )}
    </section>
  );
}
