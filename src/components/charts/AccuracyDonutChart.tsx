import {useState} from 'react';
import type {AccuracyBreakdown} from '../../types/inventory';

interface AccuracyDonutChartProps {
  data: AccuracyBreakdown;
}

export function AccuracyDonutChart({data}: AccuracyDonutChartProps) {
  const [hoveredKey, setHoveredKey] = useState<'accurate' | 'minor' | 'major' | null>(null);

  const segments = [
    {
      key: 'accurate' as const,
      label: 'Accurate',
      count: data.accurateCount,
      pct: data.accuratePct,
      color: '#16A34A',
    },
    {
      key: 'minor' as const,
      label: 'Minor Variance',
      count: data.minorVarianceCount,
      pct: data.minorVariancePct,
      color: '#F59E0B',
    },
    {
      key: 'major' as const,
      label: 'Major Variance',
      count: data.majorVarianceCount,
      pct: data.majorVariancePct,
      color: '#EF4444',
    },
  ];

  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  // Ensure visual visibility for tiny percentages while keeping stroke accurate
  const totalPct = segments.reduce((acc, s) => acc + Math.max(s.pct, 0.8), 0);
  let cumulativeOffset = 0;

  const activeSegment = hoveredKey ? segments.find((s) => s.key === hoveredKey) : null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-2">
      <div className="relative w-[156px] h-[156px] shrink-0">
        <svg viewBox="0 0 156 156" className="w-full h-full -rotate-90" role="img" aria-label="Inventory accuracy breakdown donut chart">
          {segments.map((seg) => {
            const visualPct = Math.max(seg.pct, 1.2) / totalPct;
            const dashLength = Math.max(0, visualPct * circumference - 2.5);
            const dashOffset = -cumulativeOffset * circumference;
            cumulativeOffset += visualPct;
            const isHovered = hoveredKey === seg.key;

            return (
              <circle
                key={seg.key}
                cx="78"
                cy="78"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? 25 : 22}
                strokeDasharray={`${dashLength} ${circumference}`}
                strokeDashoffset={dashOffset}
                className="transition-all duration-200 cursor-pointer"
                opacity={hoveredKey && !isHovered ? 0.45 : 1}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          <span className="text-[20px] font-bold text-[#0F172A] tabular-nums leading-tight">
            {activeSegment ? `${activeSegment.pct.toFixed(2)}%` : `${data.accuratePct.toFixed(2)}%`}
          </span>
          <span className="text-[11px] font-medium text-[#64748B] mt-0.5 truncate max-w-[92px]">
            {activeSegment ? activeSegment.label : 'Accurate'}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-3.5">
        {segments.map((seg) => {
          const isHovered = hoveredKey === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={`w-full flex items-center justify-between text-left px-2 py-1 rounded-md transition-colors ${
                isHovered ? 'bg-slate-50' : 'hover:bg-slate-50/70'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                  style={{backgroundColor: seg.color}}
                />
                <span className="text-[13px] font-medium text-[#334155] truncate">
                  {seg.label}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-[#0F172A] tabular-nums whitespace-nowrap ml-3">
                {seg.count.toLocaleString('en-IN')} ({seg.pct.toFixed(2)}%)
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
