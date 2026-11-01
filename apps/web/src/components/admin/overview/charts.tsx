import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SERIES, compact } from './chart-utils';

// Small, dependency-free SVG charts for the admin overview. Thin marks, recessive axes, a hover /
// focus tooltip on every mark, and a table twin for each chart (see the overview's "Table" toggles).

// Sequential blue (light → dark) for magnitude; empty cells use the neutral track.
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const EMPTY_CELL = '#f1f1ee';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const MUTED = '#898781';
const BAR_MAX = 24;
const RADIUS = 4;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean ticks from 0 up to just above the max. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(Math.round(value * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Column path: 4px rounded data-end, square at the baseline. */
function columnPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(RADIUS, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div className="ov-tip" role="status" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  );
}

export interface ColumnDatum {
  key: string;
  /** Axis label. */
  label: string;
  /** Longer label for the tooltip. */
  title: string;
  value: number;
  /** Extra tooltip rows, e.g. order counts. */
  extra?: string[];
}

/** One-series column chart (sales by hour or day). */
export function ColumnChart({ data, format, height = 220, color = SERIES.blue, ariaLabel }: {
  data: ColumnDatum[];
  format: (value: number) => string;
  height?: number;
  color?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const left = 44;
  const bottom = 24;
  const top = 8;
  const plotW = Math.max(0, width - left - 4);
  const plotH = height - bottom - top;
  const max = Math.max(...data.map(d => d.value), 0);
  const ticks = niceTicks(max);
  const top_ = ticks[ticks.length - 1] || 1;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(BAR_MAX, band - 2));
  // Label every nth column so axis labels never collide.
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));
  const y = (value: number) => top + plotH - (value / top_) * plotH;
  const focusable = data.length <= 31;

  const show = (d: ColumnDatum, index: number) => {
    setActive(d.key);
    setTip({
      x: Math.min(Math.max(left + band * index + band / 2, 70), width - 70),
      y: Math.max(0, y(d.value) - 8),
      content: (
        <>
          <strong>{format(d.value)}</strong>
          <span>{d.title}</span>
          {d.extra?.map(line => <span key={line}>{line}</span>)}
        </>
      ),
    });
  };

  return (
    <div ref={ref} className="ov-chart" style={{ height }} onPointerLeave={() => { setTip(null); setActive(null); }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={left} x2={width} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(tick)}</text>
            </g>
          ))}
          {data.map((d, index) => {
            const x = left + band * index + (band - barW) / 2;
            const h = Math.max(0, y(0) - y(d.value));
            return (
              <g key={d.key}>
                {h > 0 && <path d={columnPath(x, y(d.value), barW, h)} fill={color} opacity={active && active !== d.key ? 0.55 : 1} />}
                {index % every === 0 && (
                  <text x={left + band * index + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={MUTED}>{d.label}</text>
                )}
                {/* The whole band is the hit target, not just the painted bar. */}
                <rect
                  x={left + band * index}
                  y={top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={focusable ? 0 : undefined}
                  aria-label={`${d.title}: ${format(d.value)}`}
                  onPointerMove={() => show(d, index)}
                  onFocus={() => show(d, index)}
                  onBlur={() => { setTip(null); setActive(null); }}
                  style={{ outline: 'none', cursor: 'default' }}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Weekday × hour heatmap (one sequential hue). */
export function Heatmap({ grid, rowLabels, hours, ariaLabel }: { grid: number[][]; rowLabels: string[]; hours: number[]; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const left = 38;
  const top = 18;
  const cellGap = 2;
  const cellW = hours.length ? Math.max(10, (width - left) / hours.length) : 0;
  const cellH = 24;
  const height = top + rowLabels.length * cellH;
  const max = Math.max(1, ...grid.flat());
  const colorFor = (value: number) => (value === 0 ? EMPTY_CELL : RAMP[Math.min(RAMP.length - 1, Math.floor((value / max) * (RAMP.length - 1e-9)))]);
  const every = Math.max(1, Math.ceil(hours.length / Math.max(1, Math.floor((width - left) / 32))));

  return (
    <div ref={ref} className="ov-chart" style={{ height }} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {hours.map((hour, col) =>
            col % every === 0 ? (
              <text key={hour} x={left + col * cellW + cellW / 2} y={11} textAnchor="middle" fontSize={11} fill={MUTED}>{hour}</text>
            ) : null,
          )}
          {rowLabels.map((label, row) => (
            <g key={label}>
              <text x={left - 6} y={top + row * cellH + cellH / 2} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED}>{label}</text>
              {hours.map((hour, col) => {
                const value = grid[row]?.[hour] ?? 0;
                const show = () =>
                  setTip({
                    x: Math.min(Math.max(left + col * cellW + cellW / 2, 70), width - 70),
                    y: top + row * cellH - 4,
                    content: <><strong>{value} order{value === 1 ? '' : 's'}</strong><span>{label} {hour}:00–{hour}:59</span></>,
                  });
                return (
                  <rect
                    key={hour}
                    x={left + col * cellW + cellGap / 2}
                    y={top + row * cellH + cellGap / 2}
                    width={cellW - cellGap}
                    height={cellH - cellGap}
                    rx={3}
                    fill={colorFor(value)}
                    onPointerMove={show}
                    tabIndex={value > 0 ? 0 : undefined}
                    onFocus={show}
                    onBlur={() => setTip(null)}
                    aria-label={`${label} ${hour}:00, ${value} orders`}
                    style={{ outline: 'none' }}
                  />
                );
              })}
            </g>
          ))}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Scale legend for the heatmap. */
export function RampLegend({ max }: { max: number }) {
  return (
    <div className="ov-ramp" aria-hidden="true">
      <span style={{ marginRight: 4 }}>0</span>
      <span className="ov-ramp-cell" style={{ background: EMPTY_CELL }} />
      {RAMP.map(color => <span key={color} className="ov-ramp-cell" style={{ background: color }} />)}
      <span>{max}</span>
      <span className="ov-ramp-label">orders in that hour</span>
    </div>
  );
}

/** Two-part 100% bar (pickup vs delivery) with a 2px surface gap and a legend. */
export function SplitBar({ parts, format }: { parts: { label: string; value: number; color: string; detail: string }[]; format: (value: number) => string }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = parts.filter(part => part.value > 0);
  const gap = 2;
  const usable = Math.max(0, width - gap * Math.max(0, shown.length - 1));
  let x = 0;
  return (
    <div>
      <div ref={ref} className="ov-chart" style={{ height: 28 }} onPointerLeave={() => setTip(null)}>
        {width > 0 && (
          <svg width={width} height={28} role="img" aria-label={parts.map(part => `${part.label} ${format(part.value)}`).join(', ')}>
            {total === 0 ? (
              <rect x={0} y={4} width={width} height={20} rx={RADIUS} fill={EMPTY_CELL} />
            ) : (
              shown.map((part, index) => {
                const w = (part.value / total) * usable;
                const segment = { x, w };
                x += w + gap;
                const first = index === 0;
                const last = index === shown.length - 1;
                const r = RADIUS;
                const d = `M${segment.x + (first ? r : 0)},4H${segment.x + segment.w - (last ? r : 0)}${last ? `Q${segment.x + segment.w},4 ${segment.x + segment.w},${4 + r}V${24 - r}Q${segment.x + segment.w},24 ${segment.x + segment.w - r},24` : `V24`}H${segment.x + (first ? r : 0)}${first ? `Q${segment.x},24 ${segment.x},${24 - r}V${4 + r}Q${segment.x},4 ${segment.x + r},4` : `V4`}Z`;
                return (
                  <path
                    key={part.label}
                    d={d}
                    fill={part.color}
                    tabIndex={0}
                    aria-label={`${part.label}: ${part.detail}`}
                    onPointerMove={() => setTip({ x: Math.min(Math.max(segment.x + segment.w / 2, 80), width - 80), y: 0, content: <><strong>{format(part.value)}</strong><span>{part.label} · {part.detail}</span></> })}
                    onFocus={() => setTip({ x: Math.min(Math.max(segment.x + segment.w / 2, 80), width - 80), y: 0, content: <><strong>{format(part.value)}</strong><span>{part.label} · {part.detail}</span></> })}
                    onBlur={() => setTip(null)}
                    style={{ outline: 'none' }}
                  />
                );
              })
            )}
          </svg>
        )}
        <Tooltip tip={tip} />
      </div>
      <ul className="ov-legend">
        {parts.map(part => (
          <li key={part.label}>
            <span className="ov-swatch" style={{ background: part.color }} />
            <span>{part.label}</span>
            <strong>{total ? Math.round((part.value / total) * 100) : 0}%</strong>
            <span className="ov-muted">{part.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars with the value at the tip (best sellers). */
export function RankBars({ rows, format }: { rows: { key: string; label: string; sub?: string | null; value: number; extra: string }[]; format: (value: number) => string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <ol className="ov-rank">
      {rows.map((row, index) => (
        <li key={row.key} title={`${row.label}: ${format(row.value)} · ${row.extra}`}>
          <span className="ov-rank-n">{index + 1}</span>
          <span className="ov-rank-name">
            {row.label}
            {row.sub && <small>{row.sub}</small>}
          </span>
          <span className="ov-rank-bar">
            <span className="ov-rank-fill" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
          <span className="ov-rank-value">{format(row.value)}</span>
          <span className="ov-rank-extra">{row.extra}</span>
        </li>
      ))}
    </ol>
  );
}
