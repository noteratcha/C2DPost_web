import React, { useEffect, useMemo, useRef, useState } from 'react';
import './DailyStatusChart.css';

// Stack order bottom -> top. Delivered (green) and returned (red) are never adjacent
// (validated: green/red adjacency fails deutan CVD separation).
const SERIES = [
  { key: 'delivered', label: 'นำจ่ายสำเร็จ', cls: 's-delivered' },
  { key: 'received', label: 'รับฝากแล้ว', cls: 's-received' },
  { key: 'in_transit', label: 'อยู่ระหว่างการนำจ่าย', cls: 's-transit' },
  { key: 'returned', label: 'ส่งคืน', cls: 's-returned' },
  { key: 'pending', label: 'Pending (รอฝากส่ง)', cls: 's-pending' },
];
const LEGEND_ORDER = ['pending', 'received', 'in_transit', 'delivered', 'returned'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function parseDay(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const y = +m[3] > 2400 ? +m[3] - 543 : +m[3];
    return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  }
  return null;
}
const dayKey = (d) => d.toISOString().slice(0, 10);

// Round tick step (1/2/5 x 10^n) giving ~4 intervals; axis max is a whole number of steps
function niceScale(maxValue) {
  const raw = Math.max(1, maxValue) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
  const max = Math.max(step * 2, Math.ceil(Math.max(1, maxValue) / step) * step);
  const ticks = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { max, ticks };
}

/**
 * Stacked daily bar chart: parcels per deposit day, split by status.
 * days: [{date:'YYYY-MM-DD', received, in_transit, delivered, returned, total}]
 */
export default function DailyStatusChart({ days = [], startDate, endDate }) {
  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);

  // Fill the card width (bars keep a minimum slot; narrow screens scroll horizontally)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showTable]);

  const series = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.date, d]));
    let start = parseDay(startDate) || (days[0] && parseDay(days[0].date));
    let end = parseDay(endDate) || (days.length && parseDay(days[days.length - 1].date));
    if (!start || !end) return [];
    if (end < start) [start, end] = [end, start];
    const out = [];
    for (let d = new Date(start), n = 0; d <= end && n < 400; d.setUTCDate(d.getUTCDate() + 1), n++) {
      const k = dayKey(d);
      const row = byDay.get(k) || {};
      out.push({
        date: k,
        dateObj: new Date(d),
        pending: row.pending || 0,
        received: row.received || 0,
        in_transit: row.in_transit || 0,
        delivered: row.delivered || 0,
        returned: row.returned || 0,
        total: row.total || 0,
      });
    }
    return out;
  }, [days, startDate, endDate]);

  const totals = useMemo(() => {
    const t = { pending: 0, received: 0, in_transit: 0, delivered: 0, returned: 0, total: 0 };
    series.forEach((d) => SERIES.forEach((s) => { t[s.key] += d[s.key]; }));
    t.total = t.pending + t.received + t.in_transit + t.delivered + t.returned;
    return t;
  }, [series]);

  if (!series.length || totals.total === 0) return null;

  // Geometry
  const W = Math.max(boxWidth || 640, series.length * 30);
  const H = 300;
  const M = { top: 26, right: 12, bottom: 44, left: 40 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const { max: yMax, ticks } = niceScale(Math.max(...series.map((d) => d.total), 1));
  const slot = plotW / series.length;
  const barW = Math.max(4, Math.min(36, slot * 0.62));
  const y = (v) => M.top + plotH - (v / yMax) * plotH;
  const showTotals = barW >= 12;
  const labelEvery = Math.ceil(48 / slot); // date labels ~40px wide: never overlap
  const GAP = 2; // surface gap between stacked segments

  const fmtDay = (d) => `${d.dateObj.getUTCDate()} ${TH_MONTHS[d.dateObj.getUTCMonth()]}`;

  const onMove = (d, i, e) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ d, i, x: e.clientX - box.left, y: e.clientY - box.top, w: box.width });
  };

  return (
    <div className="dash-section-card daily-chart-card">
      <div className="dash-section-title-row">
        <div className="dash-section-title-group">
          <h3 className="dash-section-title">จำนวนพัสดุรายวัน (ตามวันที่รับฝาก{totals.pending > 0 ? ' / วันที่ส่งข้อมูลสำหรับ Pending' : ''})</h3>
          <span className="dash-section-sub">รวม {totals.total.toLocaleString('th-TH')} ชิ้น · {series.length} วัน</span>
        </div>
        <button type="button" className="daily-chart-toggle" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'แสดงกราฟ' : 'แสดงตาราง'}
        </button>
      </div>

      <div className="daily-chart-legend" role="list">
        {LEGEND_ORDER.filter((k) => k !== 'pending' || totals.pending > 0).map((k) => {
          const s = SERIES.find((x) => x.key === k);
          return (
            <span key={k} className="daily-legend-item" role="listitem">
              <span className={`daily-legend-swatch ${s.cls}`} aria-hidden="true"></span>
              {s.label}
              <strong>{totals[k].toLocaleString('th-TH')}</strong>
            </span>
          );
        })}
      </div>

      {showTable ? (
        <div className="daily-chart-table-wrap">
          <table className="daily-chart-table">
            <thead>
              <tr>
                <th>วันที่</th>
                {LEGEND_ORDER.map((k) => <th key={k}>{SERIES.find((s) => s.key === k).label}</th>)}
                <th>รวม</th>
              </tr>
            </thead>
            <tbody>
              {series.filter((d) => d.total > 0).map((d) => (
                <tr key={d.date}>
                  <td>{fmtDay(d)} {d.dateObj.getUTCFullYear() + 543}</td>
                  {LEGEND_ORDER.map((k) => <td key={k}>{d[k]}</td>)}
                  <td><strong>{d.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="daily-chart-frame" ref={wrapRef} onMouseLeave={() => setHover(null)}>
        <div className="daily-chart-scroll" ref={scrollRef}>
          <svg
            className="daily-chart-svg"
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            role="img"
            aria-label={`กราฟแท่งจำนวนพัสดุรายวัน รวม ${totals.total} ชิ้น`}
          >
            {/* grid + y axis */}
            {ticks.map((t) => (
              <g key={t}>
                <line className="daily-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
                <text className="daily-axis" x={M.left - 8} y={y(t) + 4} textAnchor="end">{t}</text>
              </g>
            ))}

            {series.map((d, i) => {
              const cx = M.left + slot * i + slot / 2;
              const x = cx - barW / 2;
              let acc = 0;
              const segs = SERIES.filter((s) => d[s.key] > 0);
              return (
                <g key={d.date} className={hover && hover.i === i ? 'daily-bar is-hover' : 'daily-bar'}>
                  {segs.map((s, si) => {
                    const y0 = y(acc);
                    acc += d[s.key];
                    const y1 = y(acc);
                    const isTop = si === segs.length - 1;
                    const top = y1 + (si > 0 ? 0 : 0);
                    const h = Math.max(1, y0 - y1 - (si > 0 ? GAP : 0));
                    const r = isTop ? Math.min(4, barW / 2, h) : 0;
                    // rounded top only on the top segment; flat at the baseline side
                    const path = r
                      ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`
                      : `M${x},${top + h} V${top} H${x + barW} V${top + h} Z`;
                    return <path key={s.key} className={`daily-seg ${s.cls}`} d={path} />;
                  })}
                  {showTotals && d.total > 0 && (
                    <text className="daily-total" x={cx} y={y(d.total) - 6} textAnchor="middle">{d.total}</text>
                  )}
                  {i % labelEvery === 0 && (
                    <text className="daily-axis" x={cx} y={H - M.bottom + 18} textAnchor="middle">{fmtDay(d)}</text>
                  )}
                  {/* hit target: full slot height, wider than the bar */}
                  <rect
                    className="daily-hit"
                    x={M.left + slot * i}
                    y={M.top}
                    width={slot}
                    height={plotH}
                    onMouseMove={(e) => onMove(d, i, e)}
                  />
                </g>
              );
            })}
            <line className="daily-baseline" x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} />
          </svg>
        </div>

          {hover && (
            <div
              className="daily-tooltip"
              style={{ left: hover.x + 214 > hover.w ? hover.x - 210 : hover.x + 14, top: Math.max(4, Math.min(hover.y - 150, 120)) }}
            >
              <div className="daily-tt-title">{fmtDay(hover.d)} {hover.d.dateObj.getUTCFullYear() + 543}</div>
              {LEGEND_ORDER.map((k) => {
                const s = SERIES.find((x) => x.key === k);
                return (
                  <div key={k} className="daily-tt-row">
                    <span><span className={`daily-legend-swatch ${s.cls}`}></span>{s.label}</span>
                    <strong>{hover.d[k]}</strong>
                  </div>
                );
              })}
              <div className="daily-tt-row daily-tt-total"><span>รวม</span><strong>{hover.d.total}</strong></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
