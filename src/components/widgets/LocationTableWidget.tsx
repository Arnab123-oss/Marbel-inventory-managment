import {ArrowUpDown, Search} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {LocationRow} from '../../types/inventory';
import {formatInrCompact, formatInrExact} from '../../utils/branchMetrics';

interface LocationTableWidgetProps {
  locations: LocationRow[];
  selectedLocationId: string | null;
  onViewLocation: (loc: LocationRow) => void;
}

type SortField =
  | 'name'
  | 'totalItems'
  | 'sqftQty'
  | 'pcsQty'
  | 'boxQty'
  | 'stockValueCr'
  | 'inventoryAccuracyPct';

function getLocValueInr(loc: LocationRow): number {
  return typeof loc.stockValueInr === 'number'
    ? loc.stockValueInr
    : Math.round(loc.stockValueCr * 10000000);
}

export function LocationTableWidget({
  locations,
  selectedLocationId,
  onViewLocation,
}: LocationTableWidgetProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('stockValueCr');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? locations.filter((l) => l.name.toLowerCase().includes(q))
      : locations;

    return [...list].sort((a, b) => {
      if (sortField === 'stockValueCr') {
        const diff = getLocValueInr(a) - getLocValueInr(b);
        return sortAsc ? diff : -diff;
      }
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc
        ? Number(valA) - Number(valB)
        : Number(valB) - Number(valA);
    });
  }, [locations, search, sortField, sortAsc]);

  const totals = useMemo(() => {
    const totalItems = filtered.reduce((s, l) => s + l.totalItems, 0);
    const totalSqft = filtered.reduce((s, l) => s + l.sqftQty, 0);
    const totalPcs = filtered.reduce((s, l) => s + l.pcsQty, 0);
    const totalBox = filtered.reduce((s, l) => s + l.boxQty, 0);
    const totalValueInr = filtered.reduce((s, l) => s + getLocValueInr(l), 0);
    const weightedAcc =
      totalItems > 0
        ? filtered.reduce((s, l) => s + l.inventoryAccuracyPct * l.totalItems, 0) /
          totalItems
        : filtered.length > 0
          ? filtered.reduce((s, l) => s + l.inventoryAccuracyPct, 0) / filtered.length
          : 100;
    const minor = filtered.reduce((s, l) => s + l.minorVarianceItems, 0);
    const major = filtered.reduce((s, l) => s + l.majorVarianceItems, 0);
    const low = filtered.reduce((s, l) => s + l.lowStockItems, 0);
    return {
      totalItems,
      totalSqft,
      totalPcs,
      totalBox,
      totalValueInr,
      weightedAcc,
      minor,
      major,
      low,
    };
  }, [filtered]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'name');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-[260px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Branch"
            className="w-full h-8 pl-8 pr-3 text-[12px] rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-[12px] font-medium text-blue-600 hover:underline whitespace-nowrap"
          >
            Clear search
          </button>
        )}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse text-left min-w-[760px]">
          <thead>
            <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
              <th className="py-2.5 pr-3">
                <button
                  type="button"
                  onClick={() => handleSort('name')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A]"
                >
                  Branch
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('totalItems')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                >
                  SKUs
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('sqftQty')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                >
                  Slabs (sq. ft)
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('pcsQty')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                >
                  Pieces (pcs)
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('boxQty')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                >
                  Tiles (box)
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('stockValueCr')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                >
                  Stock Value (₹)
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('inventoryAccuracyPct')}
                  className="inline-flex items-center gap-1 hover:text-[#0F172A] ml-auto"
                >
                  Accuracy
                </button>
              </th>
              <th className="py-2.5 px-2 text-right">Variances</th>
              <th className="py-2.5 px-2 text-right">Low Stock</th>
              <th className="py-2.5 pl-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-[#64748B]">
                  No branches match &ldquo;{search}&rdquo;.
                </td>
              </tr>
            ) : (
              filtered.map((loc) => {
                const isSelected = selectedLocationId === loc.id;
                const valInr = getLocValueInr(loc);
                return (
                  <tr
                    key={loc.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2.5 pr-3 font-medium">
                      <button
                        type="button"
                        onClick={() => onViewLocation(loc)}
                        className="text-[#2563EB] hover:text-[#1D4ED8] hover:underline whitespace-nowrap"
                      >
                        {loc.name}
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums">
                      {loc.totalItems.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums whitespace-nowrap">
                      {loc.sqftQty.toLocaleString('en-IN')} sq. ft
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums whitespace-nowrap">
                      {loc.pcsQty.toLocaleString('en-IN')} pcs
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums whitespace-nowrap">
                      {loc.boxQty.toLocaleString('en-IN')} box
                    </td>
                    <td
                      title={formatInrExact(valInr)}
                      className="py-2.5 px-2 text-right text-[#0F172A] font-medium tabular-nums whitespace-nowrap"
                    >
                      {formatInrCompact(valInr)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] font-medium tabular-nums">
                      {loc.inventoryAccuracyPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums">
                      {loc.minorVarianceItems + loc.majorVarianceItems}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#0F172A] tabular-nums">
                      {loc.lowStockItems}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onViewLocation(loc)}
                        className="px-2.5 py-1 text-[11px] font-medium text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded transition-colors whitespace-nowrap"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-[#E5E9F0] bg-[#FAFBFD] text-[12px] font-semibold text-[#0F172A]">
                <td className="py-2.5 pr-3">Total</td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.totalItems.toLocaleString('en-IN')}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                  {totals.totalSqft.toLocaleString('en-IN')} sq. ft
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                  {totals.totalPcs.toLocaleString('en-IN')} pcs
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                  {totals.totalBox.toLocaleString('en-IN')} box
                </td>
                <td
                  title={formatInrExact(totals.totalValueInr)}
                  className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap"
                >
                  {formatInrCompact(totals.totalValueInr)}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.weightedAcc.toFixed(2)}%
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.minor + totals.major}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">{totals.low}</td>
                <td className="py-2.5 pl-2 text-right text-[#94A3B8]">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
