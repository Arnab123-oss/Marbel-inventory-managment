import {
  Check,
  FileText,
  Layers,
  MapPin,
  Package,
  Receipt,
  X,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {
  LocationRow,
  PurchaseBill,
  SalesBill,
  SlabLot,
  VarianceItem,
} from '../../types/inventory';
import {
  computeBranchBreakdown,
  estimateSlabRateInr,
  formatInrCompact,
  formatInrExact,
  getPurchaseBillLines,
  getSalesBillLines,
} from '../../utils/branchMetrics';

interface LocationDetailDrawerProps {
  location: LocationRow | null;
  items: VarianceItem[];
  slabs: SlabLot[];
  purchaseBills: PurchaseBill[];
  salesBills: SalesBill[];
  onClose: () => void;
  onReconcile: (itemId: string, newPhysicalQty: number, reason: string) => Promise<void>;
}

type DetailTab = 'products' | 'slabs' | 'purchases' | 'sales';

function formatUnitSummary(sqft: number, pcs: number, box: number): string {
  const parts: string[] = [];
  if (sqft > 0) parts.push(`${sqft.toLocaleString('en-IN')} sq. ft`);
  if (pcs > 0) parts.push(`${pcs.toLocaleString('en-IN')} pcs`);
  if (box > 0) parts.push(`${box.toLocaleString('en-IN')} box`);
  return parts.length > 0 ? parts.join(' · ') : '0 units';
}

export function LocationDetailDrawer({
  location,
  items,
  slabs,
  purchaseBills,
  salesBills,
  onClose,
  onReconcile,
}: LocationDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('products');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('Physical yard measurement verified');
  const [saving, setSaving] = useState(false);

  const breakdown = useMemo(() => {
    if (!location) return null;
    return computeBranchBreakdown(location, {
      varianceItems: items,
      slabs,
      purchaseBills,
      salesBills,
    });
  }, [location, items, slabs, purchaseBills, salesBills]);

  if (!location || !breakdown) return null;

  async function submitReconcile(itemId: string) {
    const parsed = Number(qtyInput);
    if (Number.isNaN(parsed) || parsed < 0) return;
    setSaving(true);
    try {
      await onReconcile(itemId, parsed, reasonInput);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  const {sources, net} = breakdown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${location.name} stock details`}
        className="relative z-10 w-full max-w-3xl bg-white rounded-xl border border-[#E5E9F0] shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5E9F0] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[16px] font-bold text-[#0F172A] truncate">
                  {location.name}
                </h3>
                <span className="text-[11px] font-semibold text-[#16A34A] tabular-nums">
                  {net.accuracyPct.toFixed(2)}% accurate
                </span>
              </div>
              <p className="text-[12px] text-[#64748B]">
                {location.type} · {net.skus} active SKUs &amp; lots · Auto-calculated from Products, Slabs, Purchase &amp; Sales Bills
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
            aria-label="Close branch details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Top 4 Calculated Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Net Stock Value</div>
              <div
                title={formatInrExact(net.valueInr)}
                className="mt-1 text-[16px] font-bold text-[#0F172A] tabular-nums"
              >
                {formatInrCompact(net.valueInr)}
              </div>
              <div className="text-[10.5px] text-[#64748B] font-mono tabular-nums mt-0.5">
                {formatInrExact(net.valueInr)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Slabs (sq. ft)</div>
              <div className="mt-1 text-[16px] font-bold text-[#0F172A] tabular-nums">
                {net.sqft.toLocaleString('en-IN')}
              </div>
              <div className="text-[10.5px] text-[#64748B] mt-0.5">sq. ft available</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Pieces (pcs)</div>
              <div className="mt-1 text-[16px] font-bold text-[#0F172A] tabular-nums">
                {net.pcs.toLocaleString('en-IN')}
              </div>
              <div className="text-[10.5px] text-[#64748B] mt-0.5">pcs available</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Tiles (box)</div>
              <div className="mt-1 text-[16px] font-bold text-[#0F172A] tabular-nums">
                {net.box.toLocaleString('en-IN')}
              </div>
              <div className="text-[10.5px] text-[#64748B] mt-0.5">box available</div>
            </div>
          </div>

          {/* 4-Source Auto-Calculation Breakdown */}
          <div className="rounded-xl border border-[#E5E9F0] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#FAFBFD] border-b border-[#E5E9F0] flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#0F172A]">
                Auto-Calculated Stock Breakdown (Products + Slabs + Purchase Bills − Sales Bills)
              </span>
              <span className="text-[11px] text-[#64748B] tabular-nums">
                Variances: {net.minorVariances + net.majorVariances} · Low Stock: {net.lowStock}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B] bg-white">
                    <th className="py-2 pl-4 pr-2">Source Table</th>
                    <th className="py-2 px-2 text-right">Records</th>
                    <th className="py-2 px-2">Units</th>
                    <th className="py-2 pl-2 pr-4 text-right">Value Impact (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  <tr>
                    <td className="py-2.5 pl-4 pr-2 font-medium text-[#0F172A]">
                      Active Shop Products
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#475569] tabular-nums">
                      {sources.products.count}
                    </td>
                    <td className="py-2.5 px-2 text-[#475569] tabular-nums">
                      {formatUnitSummary(
                        sources.products.sqft,
                        sources.products.pcs,
                        sources.products.box,
                      )}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                      + {formatInrExact(sources.products.valueInr)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pl-4 pr-2 font-medium text-[#0F172A]">
                      Slab Lots (In Stock)
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#475569] tabular-nums">
                      {sources.slabs.inStockCount} / {sources.slabs.count}
                    </td>
                    <td className="py-2.5 px-2 text-[#475569] tabular-nums">
                      {formatUnitSummary(sources.slabs.sqft, sources.slabs.pcs, 0)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                      + {formatInrExact(sources.slabs.valueInr)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pl-4 pr-2 font-medium text-[#15803D]">
                      Purchase Bills (Inward)
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#475569] tabular-nums">
                      {sources.purchases.count}
                    </td>
                    <td className="py-2.5 px-2 text-[#475569] tabular-nums">
                      {formatUnitSummary(
                        sources.purchases.sqft,
                        sources.purchases.pcs,
                        sources.purchases.box,
                      )}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right font-semibold text-[#16A34A] tabular-nums whitespace-nowrap">
                      + {formatInrExact(sources.purchases.valueInr)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pl-4 pr-2 font-medium text-[#DC2626]">
                      Sales Bills (Outward)
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#475569] tabular-nums">
                      {sources.sales.count}
                    </td>
                    <td className="py-2.5 px-2 text-[#475569] tabular-nums">
                      {formatUnitSummary(
                        sources.sales.sqft,
                        sources.sales.pcs,
                        sources.sales.box,
                      )}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                      − {formatInrExact(sources.sales.valueInr)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-[#F8FAFC] border-t border-[#E5E9F0] font-semibold text-[#0F172A]">
                    <td className="py-2.5 pl-4 pr-2">Net Branch Balance</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{net.skus} SKUs</td>
                    <td className="py-2.5 px-2 tabular-nums">
                      {formatUnitSummary(net.sqft, net.pcs, net.box)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right text-[13px] font-bold text-[#2563EB] tabular-nums whitespace-nowrap">
                      {formatInrExact(net.valueInr)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Interactive 4-Tab Detail Inspector */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E5E9F0] pb-2">
              {(
                [
                  {
                    id: 'products' as const,
                    label: 'Products',
                    count: breakdown.products.length,
                    icon: Package,
                  },
                  {
                    id: 'slabs' as const,
                    label: 'Slabs',
                    count: breakdown.slabs.length,
                    icon: Layers,
                  },
                  {
                    id: 'purchases' as const,
                    label: 'Purchase Bills',
                    count: breakdown.purchaseBills.length,
                    icon: FileText,
                  },
                  {
                    id: 'sales' as const,
                    label: 'Sales Bills',
                    count: breakdown.salesBills.length,
                    icon: Receipt,
                  },
                ]
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'bg-[#EEF4FF] text-[#1D63ED] border border-blue-200'
                        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    <span className="text-[11px] font-mono opacity-80">({tab.count})</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'products' && (
              <>
                {breakdown.products.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-[12.5px] text-[#64748B]">
                    No active products assigned directly to {location.name}.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {breakdown.products.map((item) => {
                      const isEditing = editingId === item.id;
                      const itemVal = Math.round(item.physicalQty * item.unitPriceInr);
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-xl border border-[#E5E9F0] bg-white space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11.5px] font-semibold text-[#2563EB]">
                                  {item.itemCode}
                                </span>
                                <span className="text-[11.5px] text-[#CBD5E1]">·</span>
                                <span className="text-[12.5px] font-semibold text-[#0F172A]">
                                  {item.itemName}
                                </span>
                              </div>
                              <div className="mt-1 text-[11.5px] text-[#64748B] tabular-nums">
                                {item.dimensions} · {item.thickness} · System:{' '}
                                {item.systemQty.toLocaleString('en-IN')} {item.unit} · Physical:{' '}
                                {item.physicalQty.toLocaleString('en-IN')} {item.unit} · Value:{' '}
                                <span className="font-semibold text-[#0F172A]">
                                  {formatInrExact(itemVal)}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[11.5px] font-semibold tabular-nums whitespace-nowrap ${
                                item.variance < 0
                                  ? 'text-[#DC2626]'
                                  : item.variance > 0
                                    ? 'text-[#16A34A]'
                                    : 'text-[#64748B]'
                              }`}
                            >
                              {item.variance > 0 ? `+${item.variance}` : item.variance}{' '}
                              {item.unit} ({item.variancePct.toFixed(2)}%)
                            </span>
                          </div>

                          {isEditing ? (
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  value={qtyInput}
                                  onChange={(e) => setQtyInput(e.target.value)}
                                  className="w-28 h-8 px-2.5 text-[12px] rounded-md border border-[#E2E8F0] tabular-nums"
                                  placeholder={`Qty (${item.unit})`}
                                />
                                <span className="text-[11.5px] font-medium text-[#64748B]">
                                  {item.unit}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={reasonInput}
                                onChange={(e) => setReasonInput(e.target.value)}
                                className="flex-1 min-w-[140px] h-8 px-2.5 text-[12px] rounded-md border border-[#E2E8F0]"
                                placeholder="Audit note"
                              />
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => submitReconcile(item.id)}
                                className="h-8 px-3 rounded-md bg-[#2563EB] text-white text-[12px] font-medium inline-flex items-center gap-1 hover:bg-[#1D4ED8]"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="h-8 px-2.5 rounded-md text-[12px] text-[#64748B] hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-[#94A3B8]">
                                {item.status} · {item.lastCountedAt}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setQtyInput(String(item.physicalQty));
                                }}
                                className="text-[12px] font-medium text-[#2563EB] hover:underline"
                              >
                                Reconcile {item.unit} count
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'slabs' && (
              <>
                {breakdown.slabs.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-[12.5px] text-[#64748B]">
                    No slab lots registered at {location.name}.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#E5E9F0] rounded-xl">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAFBFD] border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                          <th className="py-2 pl-3 pr-2">Slab ID</th>
                          <th className="py-2 px-2">Product</th>
                          <th className="py-2 px-2">Dimensions</th>
                          <th className="py-2 px-2 text-right">Area (sq. ft)</th>
                          <th className="py-2 px-2 text-right">Est. Value (₹)</th>
                          <th className="py-2 pl-2 pr-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {breakdown.slabs.map((slab) => {
                          const rate = estimateSlabRateInr(slab, items);
                          const val =
                            slab.status === 'In Stock' ? Math.round(slab.totalSqFt * rate) : 0;
                          return (
                            <tr key={slab.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 pl-3 pr-2 font-mono font-semibold text-[#2563EB] whitespace-nowrap">
                                {slab.lotNumber}
                              </td>
                              <td className="py-2.5 px-2 font-medium text-[#0F172A]">
                                {slab.stoneName} · {slab.thicknessMm}mm
                              </td>
                              <td className="py-2.5 px-2 text-[#64748B] whitespace-nowrap">
                                {slab.dimensionsFt}
                              </td>
                              <td className="py-2.5 px-2 text-right font-medium tabular-nums whitespace-nowrap">
                                {slab.totalSqFt.toLocaleString('en-IN')} sq. ft
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                                {slab.status === 'In Stock' ? formatInrExact(val) : '—'}
                              </td>
                              <td
                                className={`py-2.5 pl-2 pr-3 text-right font-medium whitespace-nowrap ${
                                  slab.status === 'In Stock'
                                    ? 'text-[#16A34A]'
                                    : 'text-[#DC2626]'
                                }`}
                              >
                                {slab.status}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {activeTab === 'purchases' && (
              <>
                {breakdown.purchaseBills.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-[12.5px] text-[#64748B]">
                    No purchase bills recorded for {location.name}.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#E5E9F0] rounded-xl">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAFBFD] border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                          <th className="py-2 pl-3 pr-2">Bill No</th>
                          <th className="py-2 px-2">Date</th>
                          <th className="py-2 px-2">Supplier</th>
                          <th className="py-2 px-2">Items</th>
                          <th className="py-2 px-2 text-right">Status</th>
                          <th className="py-2 pl-2 pr-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {breakdown.purchaseBills.map((bill) => {
                          const lines = getPurchaseBillLines(bill);
                          const billTotal = lines.reduce(
                            (sum, l) => sum + (Number(l.amountInr) || 0),
                            0,
                          );
                          return (
                            <tr key={bill.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 pl-3 pr-2 font-mono font-semibold text-[#2563EB] whitespace-nowrap">
                                {bill.billNo}
                              </td>
                              <td className="py-2.5 px-2 text-[#64748B] whitespace-nowrap">
                                {bill.dateLabel}
                              </td>
                              <td className="py-2.5 px-2 font-medium text-[#0F172A]">
                                {bill.supplierName}
                              </td>
                              <td className="py-2.5 px-2 text-[#475569]">
                                {lines.length} item{lines.length === 1 ? '' : 's'} ·{' '}
                                {lines
                                  .map((l) => `${l.qty.toLocaleString('en-IN')} ${l.unit}`)
                                  .join(', ')}
                              </td>
                              <td
                                className={`py-2.5 px-2 text-right font-medium whitespace-nowrap ${
                                  bill.status === 'Paid'
                                    ? 'text-[#16A34A]'
                                    : bill.status === 'Pending'
                                      ? 'text-[#DC2626]'
                                      : 'text-[#D97706]'
                                }`}
                              >
                                {bill.status}
                              </td>
                              <td className="py-2.5 pl-2 pr-3 text-right font-semibold text-[#16A34A] tabular-nums whitespace-nowrap">
                                + {formatInrExact(billTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {activeTab === 'sales' && (
              <>
                {breakdown.salesBills.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-[12.5px] text-[#64748B]">
                    No sales invoices dispatched from {location.name}.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#E5E9F0] rounded-xl">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAFBFD] border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                          <th className="py-2 pl-3 pr-2">Invoice No</th>
                          <th className="py-2 px-2">Date</th>
                          <th className="py-2 px-2">Customer</th>
                          <th className="py-2 px-2">Items</th>
                          <th className="py-2 px-2 text-right">Status</th>
                          <th className="py-2 pl-2 pr-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {breakdown.salesBills.map((bill) => {
                          const lines = getSalesBillLines(bill);
                          const billTotal = lines.reduce(
                            (sum, l) => sum + (Number(l.amountInr) || 0),
                            0,
                          );
                          return (
                            <tr key={bill.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 pl-3 pr-2 font-mono font-semibold text-[#2563EB] whitespace-nowrap">
                                {bill.invoiceNo}
                              </td>
                              <td className="py-2.5 px-2 text-[#64748B] whitespace-nowrap">
                                {bill.dateLabel}
                              </td>
                              <td className="py-2.5 px-2 font-medium text-[#0F172A]">
                                {bill.customerName}
                              </td>
                              <td className="py-2.5 px-2 text-[#475569]">
                                {lines.length} item{lines.length === 1 ? '' : 's'} ·{' '}
                                {lines
                                  .map((l) => `${l.qty.toLocaleString('en-IN')} ${l.unit}`)
                                  .join(', ')}
                              </td>
                              <td
                                className={`py-2.5 px-2 text-right font-medium whitespace-nowrap ${
                                  bill.status === 'Paid'
                                    ? 'text-[#16A34A]'
                                    : bill.status === 'Due'
                                      ? 'text-[#DC2626]'
                                      : 'text-[#D97706]'
                                }`}
                              >
                                {bill.status}
                              </td>
                              <td className="py-2.5 pl-2 pr-3 text-right font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                                − {formatInrExact(billTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E5E9F0] bg-[#FAFBFD] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[12px] font-medium text-[#334155]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
