import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../utils/api';
import './PostofficePendingCard.css';

function formatIssued(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})\s*(\d{2}:\d{2})?/);
  if (!m) return ts || '-';
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}${m[4] ? ` ${m[4]}` : ''}`;
}

function daysAgo(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const issued = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const now = new Date(Date.now() + 7 * 3600 * 1000); // Thai date
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - issued) / 86400000);
}

/**
 * Post office accounts: parcels that registered agencies sent to e-Parcel
 * but have not deposited at the counter yet (last 30 days).
 */
export default function PostofficePendingCard({ currentPerson, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openAgency, setOpenAgency] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/postoffice/pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentPerson?.UserName || '', password: currentPerson?.Password || '', days: 30 })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || json.detail || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(`ดึงรายการรอฝากส่งไม่สำเร็จ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentPerson?.UserName, currentPerson?.Password]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const agencies = data?.by_agency || [];
  const itemsOf = (agency) => (data?.items || []).filter((it) => it.agency === agency);

  return (
    <div className="dash-section-card po-pending-card">
      <div className="dash-section-title-row">
        <div className="dash-section-title-group">
          <h3 className="dash-section-title">พัสดุรอการฝากส่ง</h3>
          <span className="dash-section-sub">
            ส่งข้อมูล e-Parcel แล้ว แต่ยังไม่นำมาฝากที่ ปณ. · ออกบาร์โค้ดใน 30 วันล่าสุด
          </span>
        </div>
        <button type="button" className="po-pending-refresh" onClick={load} disabled={loading}>
          {loading ? 'กำลังตรวจสอบ...' : 'ตรวจสอบใหม่'}
        </button>
      </div>

      {error && <div className="po-pending-error">{error}</div>}

      {!error && (loading && !data ? (
        <div className="po-pending-empty">กำลังตรวจสอบสถานะกับระบบไปรษณีย์...</div>
      ) : data && (
        <>
          <div className="po-pending-summary">
            <div className="po-pending-hero">
              <span className="po-pending-num">{data.pending.toLocaleString('th-TH')}</span>
              <span className="po-pending-unit">ชิ้น รอฝากส่ง</span>
            </div>
            <div className="po-pending-meta">
              จาก {agencies.length} หน่วยงาน (ลงทะเบียนกับ ปณ. นี้ทั้งหมด {data.agencies_registered} หน่วยงาน)
            </div>
          </div>

          {agencies.length === 0 ? (
            <div className="po-pending-empty">ไม่มีพัสดุค้างฝากส่ง ✓</div>
          ) : (
            <div className="po-pending-table-wrap">
              <table className="po-pending-table">
                <thead>
                  <tr>
                    <th>หน่วยงาน</th>
                    <th className="num">รอฝากส่ง (ชิ้น)</th>
                    <th>ออกบาร์โค้ดเก่าสุด</th>
                    <th>ล่าสุด</th>
                    <th aria-label="รายละเอียด"></th>
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((a) => {
                    const age = daysAgo(a.oldest);
                    const isOpen = openAgency === a.agency;
                    return (
                      <React.Fragment key={a.agency}>
                        <tr className={isOpen ? 'is-open' : ''}>
                          <td className="org">{a.organization}</td>
                          <td className="num"><strong>{a.pending}</strong></td>
                          <td>
                            {formatIssued(a.oldest)}
                            {age !== null && age >= 1 && (
                              <span className={`po-age ${age >= 3 ? 'is-late' : ''}`}>{age} วันแล้ว</span>
                            )}
                          </td>
                          <td>{formatIssued(a.latest)}</td>
                          <td className="act">
                            <button type="button" className="po-pending-toggle" onClick={() => setOpenAgency(isOpen ? '' : a.agency)}>
                              {isOpen ? 'ซ่อน' : 'ดูรายการ'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="po-pending-detail-row">
                            <td colSpan={5}>
                              <ol className="po-pending-items">
                                {itemsOf(a.agency).map((it) => (
                                  <li key={it.barcode}>
                                    <span className="bc">{it.barcode}</span>
                                    <span className="when">{formatIssued(it.issued)}</span>
                                    <span className="who">{it.details || '-'}</span>
                                  </li>
                                ))}
                              </ol>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data.errors?.length > 0 && (
            <div className="po-pending-error">ตรวจสถานะไม่ได้บางหน่วยงาน: {data.errors.join(', ')}</div>
          )}
        </>
      ))}
    </div>
  );
}
