import {useId, useMemo, useState} from 'react';
import type {SalesBill} from '../../types/inventory';
import {formatInrExact, getSalesBillLines} from '../../utils/branchMetrics';

interface SalesTrendChartProps {
  salesBills: SalesBill[];
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseDateIso(dateLabel?: string, dateIso?: string): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) {
    return dateIso.trim();
  }
  if (dateLabel) {
    const trimmed = dateLabel.trim();
    if (/^today$/i.test(trimmed)) return new Date().toISOString().slice(0, 10);
    const dmy = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (dmy) {
      const mIdx = MONTHS_SHORT.findIndex(
        (m) => m.toLowerCase() === dmy[2].toLowerCase(),
      );
      if (mIdx >= 0) {
        return `${dmy[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function formatDayMonth(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const mon = MONTHS_SHORT[Math.max(0, Math.min(11, Number(m[2]) - 1))];
  return `${Number(m[3])} ${mon}`;
}

function formatAxisTick(val: number): string {
  if (val === 0) return '0';
  if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (val >= 1000) return `${Math.round(val / 1000)}K`;
  return String(Math.round(val));
}

export function SalesTrendChart({salesBills}: SalesTrendChartProps) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    const map = new Map<string, {iso: string; label: string; salesInr: number; count: number}>();
    for (const bill of salesBills) {
      const iso = parseDateIso(bill.dateLabel, bill.dateIso);
      const total = getSalesBillLines(bill).reduce(
        (sum, l) => sum + Math.max(0, Number(l.amountInr) || 0),
        0,
      );
      const existing = map.get(iso) || {
        iso,
        label: formatDayMonth(iso),
        salesInr: 0,
        count: 0,
      };
      existing.salesInr += total;
      existing.count += 1;
      map.set(iso, existing);
    }

    const sorted = Array.from(map.values()).sort((a, b) => a.iso.localeCompare(b.iso));
    return sorted;
  }, [salesBills]);

  const width = 440;
  const height = 172;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  if (series.length === 0) {
    return (
      <div className="h-[172px] flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-[#64748B]">
        No sales invoices recorded yet. Create a sales invoice to see the sales trend.
      </div>
    );
  }

  const maxVal = Math.max(100000, ...series.map((s) => s.salesInr));
  const step = maxVal >= 5000000 ? 1000000 : maxVal >= 1000000 ? 500000 : 100000;
  const yMax = Math.ceil(maxVal / step) * step;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  const getX = (idx: number) =>
    padLeft + (series.length === 1 ? plotW / 2 : (idx / (series.length - 1)) * plotW);
  const getY = (val: number) => padTop + plotH - (val / (yMax || 1)) * plotH;

  const coords = series.map((pt, idx) => ({
    ...pt,
    x: getX(idx),
    y: getY(pt.salesInr),
  }));

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    coords.length === 1
      ? ''
      : `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const maxLabels = 6;
  const labelStride = Math.max(1, Math.ceil(coords.length / maxLabels));
  const hovered = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[176px] overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + Y-axis labels */}
        {yTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#EDF2F7"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-[#64748B] text-[10px] font-mono tabular-nums"
              >
                {formatAxisTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Vertical subtle gridlines */}
        {coords.map((c, idx) =>
          idx % labelStride === 0 || idx === coords.length - 1 ? (
            <line
              key={`v-${c.iso}`}
              x1={c.x}
              x2={c.x}
              y1={padTop}
              y2={padTop + plotH}
              stroke="#F1F5F9"
              strokeWidth="1"
            />
          ) : null,
        )}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {/* Trend line */}
        {coords.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Hover crosshair */}
        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={padTop}
            y2={padTop + plotH}
            stroke="#93C5FD"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Data points & hit zones */}
        {coords.map((c, idx) => {
          const isHovered = hoverIdx === idx;
          return (
            <g key={c.iso}>
              <circle
                cx={c.x}
                cy={c.y}
                r={isHovered ? 4.8 : 3}
                fill={isHovered ? '#FFFFFF' : '#2563EB'}
                stroke="#2563EB"
                strokeWidth={isHovered ? 2.5 : 0}
                className="transition-all duration-150"
              />
              <rect
                x={c.x - Math.max(18, plotW / (coords.length * 2))}
                y={padTop}
                width={Math.max(36, plotW / coords.length)}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            </g>
          );
        })}

        {/* X-axis labels */}
        {coords.map((c, idx) =>
          idx % labelStride === 0 || idx === coords.length - 1 ? (
            <text
              key={`x-${c.iso}`}
              x={c.x}
              y={height - 6}
              textAnchor={
                coords.length === 1
                  ? 'middle'
                  : idx === 0
                    ? 'start'
                    : idx === coords.length - 1
                      ? 'end'
                      : 'middle'
              }
              className="fill-[#64748B] text-[10px]"
            >
              {c.label}
            </text>
          ) : null,
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-1 z-20 rounded-lg border border-slate-200 bg-[#0F172A] text-white px-2.5 py-1.5 shadow-md text-[11px]"
          style={{
            left: `${Math.min(68, Math.max(8, (hovered.x / width) * 100 - 12))}%`,
          }}
        >
          <div className="text-slate-300">
            {hovered.label} · {hovered.count} {hovered.count === 1 ? 'invoice' : 'invoices'}
          </div>
          <div className="font-semibold font-mono tabular-nums text-white mt-0.5">
            {formatInrExact(hovered.salesInr)}
          </div>
        </div>
      )}
    </div>
  );
}
