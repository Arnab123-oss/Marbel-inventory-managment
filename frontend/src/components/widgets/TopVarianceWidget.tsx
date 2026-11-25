import {ArrowRight} from 'lucide-react';
import type {VarianceItem} from '../../types/inventory';

interface TopVarianceWidgetProps {
  items: VarianceItem[];
  onSelectItem: (item: VarianceItem) => void;
  onViewAll: () => void;
}

export function TopVarianceWidget({
  items,
  onSelectItem,
  onViewAll,
}: TopVarianceWidgetProps) {
  const topFive = items.slice(0, 5);

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse text-left min-w-[460px]">
          <thead>
            <tr className="border-b border-[#E5E9F0] text-[10.5px] font-medium text-[#64748B]">
              <th className="py-2 pr-2">Code</th>
              <th className="py-2 px-2">Stone / Tile</th>
              <th className="py-2 px-2">Branch</th>
              <th className="py-2 px-2 text-right">System Qty</th>
              <th className="py-2 px-2 text-right">Physical Qty</th>
              <th className="py-2 px-2 text-right">Variance</th>
              <th className="py-2 pl-2 text-right">Var %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9] text-[11.5px]">
            {topFive.map((item) => {
              const isNeg = item.variance < 0;
              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-2 font-mono text-[11px] font-medium text-[#0F172A] whitespace-nowrap">
                    {item.itemCode}
                  </td>
                  <td className="py-2.5 px-2 text-[#334155] truncate max-w-[125px]">
                    {item.itemName}
                  </td>
                  <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                    {item.locationName}
                  </td>
                  <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums whitespace-nowrap">
                    {item.systemQty.toLocaleString('en-IN')} {item.unit}
                  </td>
                  <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums whitespace-nowrap">
                    {item.physicalQty.toLocaleString('en-IN')} {item.unit}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-right font-medium tabular-nums whitespace-nowrap ${
                      isNeg ? 'text-[#DC2626]' : item.variance > 0 ? 'text-[#16A34A]' : 'text-[#64748B]'
                    }`}
                  >
                    {item.variance > 0 ? `+${item.variance}` : item.variance} {item.unit}
                  </td>
                  <td
                    className={`py-2.5 pl-2 text-right font-medium tabular-nums whitespace-nowrap ${
                      isNeg ? 'text-[#DC2626]' : item.variance > 0 ? 'text-[#16A34A]' : 'text-[#64748B]'
                    }`}
                  >
                    {item.variancePct > 0
                      ? `+${item.variancePct.toFixed(2)}%`
                      : `${item.variancePct.toFixed(2)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={onViewAll}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] w-fit transition-colors"
      >
        <span>View all inventory units &amp; variances</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
