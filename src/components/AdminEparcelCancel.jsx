import React, { useMemo, useState } from 'react';
import { API_BASE } from '../utils/api';
import './AdminEparcelCancel.css';

const STATE_LABEL = {
  pending: { text: 'ยังไม่รับฝาก', cls: 'state-pending' },
  received: { text: 'รับฝากแล้ว', cls: 'state-received' },
  not_found: { text: 'ไม่พบใน e-Parcel', cls: 'state-missing' },
  cancelled: { text: 'ยกเลิกแล้ว', cls: 'state-cancelled' },
};

function bangkokDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function formatIssued(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})\s*(\d{2}:\d{2})?/);
  if (!m) return ts || '-';
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}${m[4] ? ` ${m[4]}` : ''}`;
}

/**
 * Admin tool: list barcodes sent to e-Parcel (UseBarcode = yes) and cancel those
 * not yet received at the post office, on behalf of the owning agency.
 */
export default function AdminEparcelCancel({ adminUser, adminPassword, people = [] }) {
  const [startDate, setStartDate] = useState(bangkokDate(-7));
  const [endDate, setEndDate] = useState(bangkokDate(0));
  const [agency, setAgency] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState('');
  const [searched, setSearched] = useState(false);

  const agencyOptions = useMemo(() => people
    .filter(p => {
      const status = String(p.Status || '').toUpperCase();
      const uname = String(p.UserName || '');
      return uname && uname.toLowerCase() !== 'admin' && !['ADMIN', 'ADMINISTRATOR', 'POSTOFFICE'].includes(status);
    })
    .map(p => ({ value: p.UserName, label: p.Organization ? `${p.Organization} (${p.UserName})` : p.UserName })),
  [people]);

  const pendingItems = items.filter(it => it.state === 'pending');
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every(it => selected.has(it.barcode));

  const handleSearch = async () => {
    setLoading(true);
    setMessage('');
    setSelected(new Set());
    try {
      const res = await fetch(`${API_BASE}/admin/eparcel-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_username: adminUser || '',
          admin_password: adminPassword || '',
          start_date: startDate,
          end_date: endDate,
          agency
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setItems([]);
        setMessage(data.message || data.detail || `ค้นหาไม่สำเร็จ (HTTP ${res.status})`);
        return;
      }
      setItems(data.items || []);
      setSearched(true);
      const errs = (data.errors || []).length ? ` · ดึงสถานะไม่ได้บางหน่วยงาน: ${data.errors.join(', ')}` : '';
      setMessage(`พบ ${data.items.length} รายการ · ยังไม่รับฝาก ${data.pending} รายการ${errs}`);
    } catch (err) {
      setMessage(`เชื่อมต่อไม่สำเร็จ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (barcode) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(barcode)) next.delete(barcode); else next.add(barcode);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allPendingSelected ? new Set() : new Set(pendingItems.map(it => it.barcode)));
  };

  const handleCancel = async () => {
    const barcodes = items.filter(it => it.state === 'pending' && selected.has(it.barcode)).map(it => it.barcode);
    if (barcodes.length === 0) return;
    const preview = barcodes.slice(0, 10).join('\n') + (barcodes.length > 10 ? `\n... และอีก ${barcodes.length - 10} รายการ` : '');
    if (!window.confirm(`ยืนยันยกเลิกการส่งข้อมูล e-Parcel จำนวน ${barcodes.length} รายการ?\n\n${preview}\n\nการยกเลิกย้อนกลับไม่ได้`)) return;

    setCancelling(true);
    setMessage('กำลังยกเลิกรายการ...');
    try {
      const res = await fetch(`${API_BASE}/admin/cancel-eparcel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_username: adminUser || '', admin_password: adminPassword || '', barcodes })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage(data.message || data.detail || `ยกเลิกไม่สำเร็จ (HTTP ${res.status})`);
        return;
      }
      const resultMap = {};
      (data.results || []).forEach(r => { resultMap[r.barcode] = r; });
      setItems(prev => prev.map(it => {
        const r = resultMap[it.barcode];
        if (!r) return it;
        return r.success
          ? { ...it, state: 'cancelled', status_description: 'ยกเลิกโดยผู้ดูแลระบบ' }
          : { ...it, cancel_error: r.errorDetail || r.errorCode };
      }));
      setSelected(new Set());
      const failed = (data.results || []).filter(r => !r.success);
      setMessage(failed.length === 0
        ? `ยกเลิกสำเร็จ ${data.cancelled} รายการ`
        : `ยกเลิกสำเร็จ ${data.cancelled} รายการ · ไม่สำเร็จ ${failed.length} รายการ (ดูเหตุผลในตาราง)`);
    } catch (err) {
      setMessage(`เชื่อมต่อไม่สำเร็จ: ${err.message}`);
    } finally {
      setCancelling(false);
    }
  };

  const selectedCount = pendingItems.filter(it => selected.has(it.barcode)).length;

  return (
    <section className="admin-table-panel eparcel-cancel-panel">
      <div className="table-controls-bar">
        <div className="table-title-group">
          <h3 className="panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            ยกเลิกการส่งข้อมูล e-Parcel (ยังไม่รับฝาก)
          </h3>
        </div>
      </div>

      <div className="eparcel-cancel-filters">
        <label>
          <span>หน่วยงาน</span>
          <select value={agency} onChange={e => setAgency(e.target.value)}>
            <option value="">ทุกหน่วยงาน</option>
            {agencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span>ออกบาร์โค้ดตั้งแต่</span>
          <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label>
          <span>ถึง</span>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
        </label>
        <button type="button" className="btn-eparcel-search" onClick={handleSearch} disabled={loading || cancelling}>
          {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
        </button>
        <button
          type="button"
          className="btn-eparcel-cancel"
          onClick={handleCancel}
          disabled={selectedCount === 0 || cancelling || loading}
        >
          {cancelling ? 'กำลังยกเลิก...' : `ยกเลิกรายการที่เลือก${selectedCount ? ` (${selectedCount})` : ''}`}
        </button>
      </div>

      {message && <div className="eparcel-cancel-message">{message}</div>}

      <div className="admin-table-scroll">
        <table className="admin-data-table eparcel-cancel-table">
          <thead>
            <tr>
              <th className="col-check">
                <input type="checkbox" checked={allPendingSelected} disabled={pendingItems.length === 0} onChange={toggleAll} title="เลือกทุกรายการที่ยังไม่รับฝาก" />
              </th>
              <th>หมายเลข</th>
              <th>หน่วยงาน</th>
              <th>ออกบาร์โค้ด</th>
              <th>รายละเอียด</th>
              <th>สถานะ e-Parcel</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="eparcel-cancel-empty">
                  {searched ? 'ไม่พบรายการที่ส่งข้อมูล e-Parcel ในช่วงวันที่นี้' : 'เลือกหน่วยงานและช่วงวันที่ แล้วกด "ค้นหา"'}
                </td>
              </tr>
            ) : items.map(it => {
              const label = STATE_LABEL[it.state] || STATE_LABEL.not_found;
              return (
                <tr key={it.barcode} className={it.state === 'pending' && selected.has(it.barcode) ? 'selected-row' : ''}>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={selected.has(it.barcode)}
                      disabled={it.state !== 'pending'}
                      onChange={() => toggle(it.barcode)}
                    />
                  </td>
                  <td className="cell-barcode">{it.barcode}</td>
                  <td>{it.organization}</td>
                  <td className="cell-nowrap">{formatIssued(it.issued)}</td>
                  <td>{it.details || '-'}</td>
                  <td>
                    <span className={`eparcel-state ${label.cls}`}>{label.text}</span>
                    {it.status_description && it.status_description !== label.text && (
                      <div className="eparcel-state-desc">{it.status_description}</div>
                    )}
                    {it.cancel_error && <div className="eparcel-state-error">ยกเลิกไม่ได้: {it.cancel_error}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="admin-table-footer">
        <span>ยกเลิกได้เฉพาะรายการ <strong>ยังไม่รับฝาก</strong> · ระบบใช้บัญชี e-Parcel ของหน่วยงานเจ้าของบาร์โค้ด</span>
      </div>
    </section>
  );
}
