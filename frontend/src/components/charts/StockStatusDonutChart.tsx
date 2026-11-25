import {useState} from 'react';
import type {StockStatusBreakdown} from '../../types/inventory';

interface StockStatusDonutChartProps {
  data: StockStatusBreakdown;
  activeStatus: string;
  onSelectStatus?: (status: 'All' | 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Overstock') => void;
}

export function StockStatusDonutChart({
  data,
  activeStatus,
  onSelectStatus,
}: StockStatusDonutChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const segments = [
    {
      key: 'In Stock' as const,
      label: 'In Stock',
      count: data.inStockCount,
      pct: data.inStockPct,
      color: '#16A34A',
    },
    {
      key: 'Low Stock' as const,
      label: 'Low Stock',
      count: data.lowStockCount,
      pct: data.lowStockPct,
      color: '#F59E0B',
    },
    {
      key: 'Out of Stock' as const,
      label: 'Out of Stock',
      count: data.outOfStockCount,
      pct: data.outOfStockPct,
      color: '#EF4444',
    },
    {
      key: 'Overstock' as const,
      label: 'Overstock',
      count: data.overstockCount,
      pct: data.overstockPct,
      color: '#2563EB',
    },
  ];

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const totalVisual = segments.reduce((acc, s) => acc + Math.max(s.pct, 2.2), 0);
  let cumulative = 0;

  const activeSeg = segments.find((s) => s.key === (hoveredKey || activeStatus));

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-2">
      <div className="relative w-[156px] h-[156px] shrink-0">
        <svg viewBox="0 0 156 156" className="w-full h-full -rotate-90" role="img" aria-label="Stock status breakdown donut chart">
          {segments.map((seg) => {
            const visualFrac = Math.max(seg.pct, 2.2) / totalVisual;
            const dashLength = Math.max(0, visualFrac * circumference - 2.5);
            const dashOffset = -cumulative * circumference;
            cumulative += visualFrac;
            const isHighlighted =
              hoveredKey === seg.key || (activeStatus !== 'All' && activeStatus === seg.key);
            const isDimmed =
              (hoveredKey !== null && hoveredKey !== seg.key) ||
              (hoveredKey === null && activeStatus !== 'All' && activeStatus !== seg.key);

            return (
              <circle
                key={seg.key}
                cx="78"
                cy="78"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHighlighted ? 25 : 22}
                strokeDasharray={`${dashLength} ${circumference}`}
                strokeDashoffset={dashOffset}
                className="transition-all duration-200 cursor-pointer"
                opacity={isDimmed ? 0.35 : 1}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() =>
                  onSelectStatus?.(activeStatus === seg.key ? 'All' : seg.key)
                }
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          <span className="text-[20px] font-bold text-[#0F172A] tabular-nums leading-tight">
            {activeSeg ? activeSeg.count.toLocaleString('en-IN') : data.totalItems.toLocaleString('en-IN')}
          </span>
          <span className="text-[11px] font-medium text-[#64748B] mt-0.5 truncate max-w-[96px]">
            {activeSeg ? activeSeg.label : 'Total Items'}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {segments.map((seg) => {
          const isSelected = activeStatus === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => onSelectStatus?.(isSelected ? 'All' : seg.key)}
              className={`w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md transition-colors ${
                isSelected
                  ? 'bg-blue-50/80 ring-1 ring-blue-200'
                  : 'hover:bg-slate-50'
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
                {seg.count.toLocaleString('en-IN')} ({seg.pct.toFixed(1)}%)
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
