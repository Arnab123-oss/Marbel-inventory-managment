import {useMemo} from 'react';
import type {SalesBill, SlabLot, VarianceItem} from '../../types/inventory';
import {
  estimateSlabRateInr,
  formatInrCompact,
  getSalesBillLines,
} from '../../utils/branchMetrics';

interface TopProductsWidgetProps {
  salesBills: SalesBill[];
  varianceItems: VarianceItem[];
  slabs?: SlabLot[];
  onViewProducts: () => void;
}

const BAR_GRADIENTS = [
  'bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#10B981]',
  'bg-gradient-to-r from-[#0EA5E9] to-[#2563EB]',
  'bg-gradient-to-r from-[#10B981] to-[#34D399]',
  'bg-gradient-to-r from-[#8B5CF6] to-[#6366F1]',
  'bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]',
];

export function TopProductsWidget({
  salesBills,
  varianceItems,
  slabs = [],
  onViewProducts,
}: TopProductsWidgetProps) {
  const {rows, isSalesBased} = useMemo(() => {
    const activeProducts = varianceItems.filter((p) => p.enabled !== false);
    const activeSlabs = slabs.filter((s) => s.enabled !== false);
    const map = new Map<
      string,
      {itemCode: string; itemName: string; valueInr: number}
    >();

    let totalSales = 0;
    for (const bill of salesBills) {
      for (const line of getSalesBillLines(bill)) {
        const amt = Math.max(0, Number(line.amountInr) || 0);
        if (amt <= 0) continue;
        totalSales += amt;

        const normCode = (line.itemCode || '').trim().toLowerCase();
        const normName = (line.itemName || '').trim().toLowerCase();

        const matchedSlab =
          (normCode
            ? activeSlabs.find((s) => s.lotNumber.trim().toLowerCase() === normCode)
            : undefined) ||
          activeSlabs.find((s) => s.stoneName.trim().toLowerCase() === normName);

        const matchedProd = matchedSlab
          ? undefined
          : (normCode
              ? activeProducts.find((p) => p.itemCode.trim().toLowerCase() === normCode)
              : undefined) ||
            activeProducts.find((p) => p.itemName.trim().toLowerCase() === normName);

        const code =
          matchedSlab?.lotNumber ||
          matchedProd?.itemCode ||
          line.itemCode ||
          line.itemName.slice(0, 12);
        const name = matchedSlab
          ? `${matchedSlab.stoneName} · ${matchedSlab.thicknessMm}mm`
          : matchedProd?.itemName || line.itemName;
        const key = code.toLowerCase();
        const prev = map.get(key) || {itemCode: code, itemName: name, valueInr: 0};
        prev.valueInr += amt;
        map.set(key, prev);
      }
    }

    if (totalSales > 0 && map.size > 0) {
      const sorted = Array.from(map.values())
        .sort((a, b) => b.valueInr - a.valueInr)
        .slice(0, 5)
        .map((r) => ({
          ...r,
          pct: Math.round((r.valueInr / totalSales) * 100),
        }));
      return {rows: sorted, isSalesBased: true};
    }

    // Fallback to stock value if no sales bills exist yet
    const combinedStock = [
      ...activeSlabs
        .filter((s) => s.status === 'In Stock')
        .map((s) => ({
          itemCode: s.lotNumber,
          itemName: `${s.stoneName} · ${s.thicknessMm}mm`,
          valueInr: Math.round(
            Math.max(0, s.totalSqFt) * estimateSlabRateInr(s, varianceItems),
          ),
        })),
      ...activeProducts.map((p) => ({
        itemCode: p.itemCode,
        itemName: p.itemName,
        valueInr: Math.round(Math.max(0, p.physicalQty) * p.unitPriceInr),
      })),
    ];
    const totalStock = combinedStock.reduce((sum, item) => sum + item.valueInr, 0);
    const fallback = combinedStock
      .sort((a, b) => b.valueInr - a.valueInr)
      .slice(0, 5)
      .map((r) => ({
        ...r,
        pct: totalStock > 0 ? Math.round((r.valueInr / totalStock) * 100) : 0,
      }));
    return {rows: fallback, isSalesBased: false};
  }, [salesBills, varianceItems, slabs]);

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#64748B]">
        No products recorded yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between gap-3 h-full">
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <button
            key={row.itemCode}
            type="button"
            onClick={onViewProducts}
            className="w-full text-left group focus:outline-none"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#0F172A] group-hover:text-[#2563EB] truncate transition-colors">
                  {row.itemName}
                </div>
                <div className="text-[10.5px] font-mono text-[#64748B] truncate">
                  {row.itemCode} · {formatInrCompact(row.valueInr)}
                </div>
              </div>
              <span className="text-[13.5px] font-bold text-[#0F172A] tabular-nums shrink-0">
                {row.pct}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                style={{width: `${Math.max(6, Math.min(100, row.pct))}%`}}
                className={`h-full rounded-full transition-all duration-300 ${
                  BAR_GRADIENTS[idx % BAR_GRADIENTS.length]
                }`}
              />
            </div>
          </button>
        ))}
      </div>

      <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px] text-[#64748B]">
        <span>{isSalesBased ? 'Share of total sales revenue' : 'Share of stock value'}</span>
        <button
          type="button"
          onClick={onViewProducts}
          className="text-[#2563EB] font-medium hover:underline"
        >
          View all SKUs
        </button>
      </div>
    </div>
  );
}
