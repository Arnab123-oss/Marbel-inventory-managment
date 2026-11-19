import {Check, MapPin, X} from 'lucide-react';
import {useState} from 'react';
import type {LocationRow, VarianceItem} from '../../types/inventory';

interface LocationDetailDrawerProps {
  location: LocationRow | null;
  items: VarianceItem[];
  onClose: () => void;
  onReconcile: (itemId: string, newPhysicalQty: number, reason: string) => Promise<void>;
}

export function LocationDetailDrawer({
  location,
  items,
  onClose,
  onReconcile,
}: LocationDetailDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('Physical yard measurement verified');
  const [saving, setSaving] = useState(false);

  if (!location) return null;

  const locationItems = items.filter((i) => i.locationId === location.id);

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="relative z-10 w-full max-w-[540px] bg-white h-full border-l border-[#E5E9F0] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E5E9F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-[#0F172A]">{location.name}</h3>
              <p className="text-[12px] text-[#64748B]">
                {location.type} · Last audit: {location.lastAuditAt}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close branch details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Stock Value</div>
              <div className="mt-1 text-[15px] font-bold text-[#0F172A] tabular-nums">
                ₹ {location.stockValueCr.toFixed(2)} Cr
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Slabs (sq. ft)</div>
              <div className="mt-1 text-[15px] font-bold text-[#0F172A] tabular-nums">
                {location.sqftQty.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Pieces (pcs)</div>
              <div className="mt-1 text-[15px] font-bold text-[#0F172A] tabular-nums">
                {location.pcsQty.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
              <div className="text-[11px] text-[#64748B]">Tiles (box)</div>
              <div className="mt-1 text-[15px] font-bold text-[#0F172A] tabular-nums">
                {location.boxQty.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[13px] font-semibold text-[#0F172A]">
                Marble, Granite &amp; Tile SKUs at {location.name}
              </h4>
              <span className="text-[11.5px] text-[#64748B] tabular-nums">
                Accuracy: {location.inventoryAccuracyPct.toFixed(2)}%
              </span>
            </div>

            {locationItems.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-[12.5px] text-[#64748B]">
                All marble and tile lots at {location.name} are reconciled within tolerance.
              </div>
            ) : (
              <div className="space-y-3">
                {locationItems.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-[#E5E9F0] bg-white space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11.5px] font-semibold text-[#0F172A]">
                              {item.itemCode}
                            </span>
                            <span className="text-[11.5px] text-[#64748B]">·</span>
                            <span className="text-[12.5px] font-medium text-[#334155]">
                              {item.itemName}
                            </span>
                          </div>
                          <div className="mt-1 text-[11.5px] text-[#64748B] tabular-nums">
                            {item.finish} · {item.thickness} · System:{' '}
                            {item.systemQty.toLocaleString('en-IN')} {item.unit} · Physical:{' '}
                            {item.physicalQty.toLocaleString('en-IN')} {item.unit}
                          </div>
                        </div>
                        <span
                          className={`text-[12px] font-semibold tabular-nums whitespace-nowrap ${
                            item.variance < 0
                              ? 'text-[#DC2626]'
                              : item.variance > 0
                                ? 'text-[#16A34A]'
                                : 'text-[#64748B]'
                          }`}
                        >
                          {item.variance > 0 ? `+${item.variance}` : item.variance} {item.unit} (
                          {item.variancePct.toFixed(2)}%)
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
                            {item.lastCountedAt}
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
          </div>
        </div>
      </aside>
    </div>
  );
}
