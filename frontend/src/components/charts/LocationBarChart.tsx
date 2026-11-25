import {useState} from 'react';
import type {LocationRow} from '../../types/inventory';
import {formatInrCompact} from '../../utils/branchMetrics';

interface LocationBarChartProps {
  locations: LocationRow[];
  selectedLocationId: string | null;
  onSelectLocation?: (location: LocationRow) => void;
}

export function LocationBarChart({
  locations,
  selectedLocationId,
  onSelectLocation,
}: LocationBarChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const valuesInr = locations.map((l) =>
    typeof l.stockValueInr === 'number'
      ? l.stockValueInr
      : Math.round(l.stockValueCr * 10000000),
  );
  const rawMax = Math.max(1000000, ...valuesInr);
  const maxAxisInr = Math.ceil(rawMax / 2500000) * 2500000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((frac) => Math.round(maxAxisInr * frac));

  return (
    <div className="pt-1 space-y-2.5">
      <div className="space-y-2.5">
        {locations.map((loc, idx) => {
          const valInr = valuesInr[idx] || 0;
          const widthPct = Math.min(100, (valInr / maxAxisInr) * 100);
          const isHovered = hoveredId === loc.id;
          const isSelected = selectedLocationId === loc.id;
          return (
            <button
              key={loc.id}
              type="button"
              onMouseEnter={() => setHoveredId(loc.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectLocation?.(loc)}
              className={`w-full grid grid-cols-[100px_1fr] items-center gap-3 text-left rounded py-0.5 transition-colors ${
                isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
              }`}
            >
              <span className="text-[12px] font-medium text-[#334155] truncate">
                {loc.name}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 h-[9px] bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isHovered || isSelected ? 'bg-[#1D4ED8]' : 'bg-[#2563EB]'
                    }`}
                    style={{width: `${widthPct}%`}}
                  />
                </div>
                <span className="text-[11px] font-semibold text-[#334155] tabular-nums whitespace-nowrap w-[66px] text-right">
                  {formatInrCompact(valInr)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* X-axis tick legend aligned under the bar area */}
      <div className="grid grid-cols-[100px_1fr] gap-3 pt-1 border-t border-slate-100">
        <div />
        <div className="flex items-center justify-between pr-[74px] text-[10px] text-[#64748B] tabular-nums">
          {ticks.map((t) => (
            <span key={t}>
              {t === 0
                ? '0'
                : t >= 10000000
                  ? `${(t / 10000000).toFixed(1)}Cr`
                  : `${Math.round(t / 100000)}L`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
