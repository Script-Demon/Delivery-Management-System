import { useLayoutEffect, useRef, useState } from 'react';

/** Track an element's rendered width so SVG text stays at its real pixel size. */
function useWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Rect whose top corners are rounded and bottom sits flat on the baseline. */
function topRounded(x, y, w, h, r = 4) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Vertical (optionally stacked) bar chart with a per-column hover tooltip.
 * series: [{ key, label, color }] — bottom-to-top stacking order.
 */
export function BarChart({ data, series, xKey = 'day', formatX = (v) => v, formatY = (v) => v, height = 220, labelEvery = 1 }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth(640);
  const pad = { top: 8, right: 4, bottom: 24, left: 40 };
  const innerW = W - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const totals = data.map((d) => series.reduce((s, k) => s + (Number(d[k.key]) || 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const slot = innerW / data.length;
  const barW = Math.max(4, Math.min(28, slot * 0.62));
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const GAP = 2;

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={pad.left - 8} y={y(t) + 4} textAnchor="end">{formatY(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.left + slot * i + slot / 2;
          let acc = 0;
          const segs = series
            .map((s) => ({ ...s, v: Number(d[s.key]) || 0 }))
            .filter((s) => s.v > 0);
          return (
            <g key={d[xKey]}>
              <rect
                className="hit"
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={innerH}
                onMouseEnter={() => setHover(i)}
              />
              {segs.map((s, j) => {
                const y0 = y(acc);
                acc += s.v;
                const y1 = y(acc);
                // 2px surface gap between stacked segments.
                const h = Math.max(0, y0 - y1 - (j > 0 ? GAP : 0));
                const isTop = j === segs.length - 1;
                return isTop ? (
                  <path key={s.key} d={topRounded(cx - barW / 2, y1, barW, h)} fill={s.color} pointerEvents="none" />
                ) : (
                  <rect key={s.key} x={cx - barW / 2} y={y1} width={barW} height={h} fill={s.color} pointerEvents="none" />
                );
              })}
              {i % labelEvery === 0 && (
                <text className="tick" x={cx} y={height - 6} textAnchor="middle">{formatX(d[xKey])}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(totals[hover]) / height) * 100}%` }}>
          <div className="t-title">{formatX(data[hover][xKey], true)}</div>
          {[...series].reverse().map((s) => (
            <div className="t-row" key={s.key}>
              <span className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.label}</span>
              <b>{formatY(data[hover][s.key] || 0)}</b>
            </div>
          ))}
          {series.length > 1 && <div className="t-row"><span>Total</span><b>{formatY(totals[hover])}</b></div>}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a ranked breakdown; values are always labeled. */
export function HBars({ items, format = (v) => v }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div>
      {items.map((i) => (
        <div className="hbar-row" key={i.label} title={`${i.label}: ${format(i.value)}`}>
          <span className="secondary" style={{ textTransform: 'capitalize' }}>{i.label}</span>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></div>
          <span className="num" style={{ textAlign: 'right' }}>{format(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

export const shortDay = (iso, long) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', long ? { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' } : { timeZone: 'UTC', day: 'numeric', month: 'short' });
