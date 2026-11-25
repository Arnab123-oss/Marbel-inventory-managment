import {useId, useState} from 'react';
import type {TrendPoint} from '../../types/inventory';

interface TrendLineChartProps {
  points: TrendPoint[];
  metric: 'valueCr' | 'accuracyPct';
  strokeColor: string;
  yMin: number;
  yMax: number;
  yTicks: number[];
  formatYTick: (val: number) => string;
  formatTooltipVal: (val: number) => string;
}

export function TrendLineChart({
  points,
  metric,
  strokeColor,
  yMin,
  yMax,
  yTicks,
  formatYTick,
  formatTooltipVal,
}: TrendLineChartProps) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 440;
  const height = 166;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 26;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  if (points.length === 0) {
    return (
      <div className="h-[166px] flex items-center justify-center text-xs text-slate-400">
        No trend data available
      </div>
    );
  }

  const getX = (idx: number) =>
    padLeft + (points.length === 1 ? plotW / 2 : (idx / (points.length - 1)) * plotW);

  const getY = (val: number) => {
    const clamped = Math.min(yMax, Math.max(yMin, val));
    const ratio = (clamped - yMin) / (yMax - yMin || 1);
    return padTop + plotH - ratio * plotH;
  };

  const coords = points.map((pt, idx) => ({
    x: getX(idx),
    y: getY(pt[metric]),
    date: pt.date,
    val: pt[metric],
  }));

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(
    padTop + plotH
  ).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  // Pick evenly spaced X-axis labels matching screenshot rhythm (1 Apr, 6 Apr, 11 Apr, etc.)
  const labelIndices = new Set<number>([0, 3, 6, 9, 12, points.length - 1]);
  const hovered = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[170px] overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines + Y-axis labels */}
        {yTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-[#64748B] text-[10px] tabular-nums"
              >
                {formatYTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Trend line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover crosshair */}
        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={padTop}
            y2={padTop + plotH}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Data point circles + invisible larger hit areas */}
        {coords.map((c, idx) => {
          const isHovered = hoverIdx === idx;
          return (
            <g key={c.date}>
              <circle
                cx={c.x}
                cy={c.y}
                r={isHovered ? 4.5 : 2.5}
                fill={isHovered ? '#FFFFFF' : strokeColor}
                stroke={strokeColor}
                strokeWidth={isHovered ? 2.5 : 0}
                className="transition-all duration-150"
              />
              <rect
                x={c.x - plotW / (points.length * 2)}
                y={padTop}
                width={plotW / points.length}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            </g>
          );
        })}

        {/* X-axis date ticks */}
        {coords.map((c, idx) =>
          labelIndices.has(idx) ? (
            <text
              key={c.date}
              x={c.x}
              y={height - 6}
              textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
              className="fill-[#64748B] text-[10px]"
            >
              {c.date}
            </text>
          ) : null,
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-1 z-20 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm text-xs"
          style={{
            left: `${Math.min(76, Math.max(8, (hovered.x / width) * 100 - 10))}%`,
          }}
        >
          <div className="text-[11px] text-[#64748B]">{hovered.date}</div>
          <div className="font-semibold text-[#0F172A] tabular-nums">
            {formatTooltipVal(hovered.val)}
          </div>
        </div>
      )}
    </div>
  );
}
