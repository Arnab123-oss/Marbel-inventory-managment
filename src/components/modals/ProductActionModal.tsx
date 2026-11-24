import {
  ArrowLeftRight,
  Clock,
  Edit3,
  Eye,
  PackageCheck,
  ShoppingCart,
  SlidersHorizontal,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  compressImageFileToDataUrl,
  DEFAULT_PRODUCT_IMAGE,
  resolveProductImage,
} from '../../constants/assets';
import type {
  LocationRow,
  ProductHistoryEntry,
  SlabLot,
  StoneCategory,
  VarianceItem,
} from '../../types/inventory';

export type ActionModalMode = 'view' | 'edit' | 'history';

export type ActionModalTarget =
  | {kind: 'product'; item: VarianceItem}
  | {kind: 'slab'; slab: SlabLot};

interface ProductActionModalProps {
  target: ActionModalTarget | null;
  initialMode: ActionModalMode;
  locations: LocationRow[];
  history: ProductHistoryEntry[];
  onClose: () => void;
  onUpdateProduct: (
    itemId: string,
    payload: {
      itemName: string;
      dimensions: string;
      category: StoneCategory;
      finish: VarianceItem['finish'];
      thickness: string;
      locationId: string;
      unitPriceInr: number;
      imageUrl?: string;
    },
  ) => Promise<void>;
  onUpdateSlabLot: (
    slabId: string,
    payload: {
      stoneName: string;
      category: StoneCategory;
      dimensionsFt: string;
      slabCountPcs: number;
      totalSqFt: number;
      thicknessMm: number;
      branchName: string;
      finish: SlabLot['finish'];
      status: SlabLot['status'];
    },
  ) => Promise<void>;
}

const CATEGORIES: StoneCategory[] = [
  'Marble',
  'Granite',
  'Tiles',
  'Adhesives',
  'Onyx & Quartz',
];

export function ProductActionModal({
  target,
  initialMode,
  locations,
  history,
  onClose,
  onUpdateProduct,
  onUpdateSlabLot,
}: ProductActionModalProps) {
  const [mode, setMode] = useState<ActionModalMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Product edit fields
  const [pName, setPName] = useState('');
  const [pDims, setPDims] = useState('');
  const [pCat, setPCat] = useState<StoneCategory>('Marble');
  const [pFinish, setPFinish] = useState<VarianceItem['finish']>('Polished');
  const [pThick, setPThick] = useState('');
  const [pLocId, setPLocId] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pImageUrl, setPImageUrl] = useState('');
  const editFileRef = useRef<HTMLInputElement | null>(null);

  // Slab edit fields
  const [sStone, setSStone] = useState('');
  const [sCat, setSCat] = useState<StoneCategory>('Marble');
  const [sDims, setSDims] = useState('');
  const [sPcs, setSPcs] = useState('1');
  const [sSqft, setSSqft] = useState('50');
  const [sThick, setSThick] = useState('18');
  const [sBranch, setSBranch] = useState('');
  const [sFinish, setSFinish] = useState<SlabLot['finish']>('Polished');
  const [sStatus, setSStatus] = useState<SlabLot['status']>('In Stock');

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg(null);
    if (!target) return;
    if (target.kind === 'product') {
      const it = target.item;
      setPName(it.itemName);
      setPDims(it.dimensions);
      setPCat(it.category);
      setPFinish(it.finish);
      setPThick(it.thickness);
      setPLocId(it.locationId);
      setPPrice(String(it.unitPriceInr));
      setPImageUrl(it.imageUrl || '');
    } else {
      const sl = target.slab;
      setSStone(sl.stoneName);
      setSCat(sl.category);
      setSDims(sl.dimensionsFt);
      setSPcs(String(sl.slabCountPcs));
      setSSqft(String(sl.totalSqFt));
      setSThick(String(sl.thicknessMm));
      setSBranch(sl.branchName);
      setSFinish(sl.finish);
      setSStatus(sl.status);
    }
  }, [target, initialMode]);

  const itemHistory = useMemo(() => {
    if (!target) return [];
    const targetId = target.kind === 'product' ? target.item.id : target.slab.id;
    const targetCode =
      target.kind === 'product' ? target.item.itemCode : target.slab.lotNumber;
    return history.filter(
      (h) => h.itemId === targetId || h.itemCode === targetCode,
    );
  }, [target, history]);

  if (!target) return null;

  const title =
    target.kind === 'product' ? target.item.itemName : target.slab.stoneName;
  const code =
    target.kind === 'product' ? target.item.itemCode : target.slab.lotNumber;
  const category =
    target.kind === 'product' ? target.item.category : target.slab.category;

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErrorMsg(null);
    setSaving(true);
    try {
      if (target.kind === 'product') {
        await onUpdateProduct(target.item.id, {
          itemName: pName.trim(),
          dimensions: pDims.trim(),
          category: pCat,
          finish: pFinish,
          thickness: pThick.trim(),
          locationId: pLocId,
          unitPriceInr: Number(pPrice) || target.item.unitPriceInr,
          imageUrl: pImageUrl,
        });
      } else {
        await onUpdateSlabLot(target.slab.id, {
          stoneName: sStone.trim(),
          category: sCat,
          dimensionsFt: sDims.trim(),
          slabCountPcs: Number(sPcs) || 1,
          totalSqFt: Number(sSqft) || 1,
          thicknessMm: Number(sThick) || 18,
          branchName: sBranch,
          finish: sFinish,
          status: sStatus,
        });
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl bg-white rounded-xl border border-[#E5E9F0] shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#E5E9F0] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={resolveProductImage(
                target.kind === 'product' ? target.item.imageUrl : target.slab.imageUrl,
              )}
              alt={title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
              }}
              className="w-12 h-12 rounded-lg object-cover border border-[#E5E9F0] bg-slate-50 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11.5px] font-mono text-[#2563EB] font-semibold">
                <span>{code}</span>
                <span className="text-[#CBD5E1]">·</span>
                <span className="font-sans text-[#64748B] font-medium">
                  {category}
                </span>
              </div>
              <h3 className="text-[17px] font-bold text-[#0F172A] truncate mt-0.5">
                {title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-3 pb-0 border-b border-[#E5E9F0] flex items-center gap-5 bg-[#FAFBFD]">
          {(
            [
              {id: 'view', label: 'View Details', Icon: Eye},
              {id: 'edit', label: 'Edit Info', Icon: Edit3},
              {id: 'history', label: `History (${itemHistory.length})`, Icon: Clock},
            ] as const
          ).map(({id, label, Icon}) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`pb-3 text-[12.5px] font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                mode === id
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {mode === 'view' && target.kind === 'product' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
                  <div className="text-[11px] font-medium text-[#64748B]">
                    System Stock
                  </div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A] tabular-nums">
                    {target.item.systemQty.toLocaleString('en-IN')}{' '}
                    <span className="text-[12px] font-medium text-[#64748B]">
                      {target.item.unit}
                    </span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#64748B]">
                    From Purchase Bills − Sales Bills
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
                  <div className="text-[11px] font-medium text-[#64748B]">
                    Physical Stock
                  </div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A] tabular-nums">
                    {target.item.physicalQty.toLocaleString('en-IN')}{' '}
                    <span className="text-[12px] font-medium text-[#64748B]">
                      {target.item.unit}
                    </span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#64748B]">
                    Updated by Sales &amp; Yard Count
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
                  <div className="text-[11px] font-medium text-[#64748B]">
                    Variance (Physical − System)
                  </div>
                  <div
                    className={`mt-1 text-[18px] font-bold tabular-nums ${
                      target.item.variance < 0
                        ? 'text-[#DC2626]'
                        : target.item.variance > 0
                          ? 'text-[#16A34A]'
                          : 'text-[#0F172A]'
                    }`}
                  >
                    {target.item.variance > 0
                      ? `+${target.item.variance.toLocaleString('en-IN')}`
                      : target.item.variance.toLocaleString('en-IN')}{' '}
                    <span className="text-[12px] font-medium">
                      {target.item.unit}
                    </span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#64748B] tabular-nums">
                    {target.item.variancePct > 0 ? '+' : ''}
                    {target.item.variancePct.toFixed(2)}% difference
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-4 pt-2 border-t border-[#F1F5F9] text-[12.5px]">
                <div>
                  <div className="text-[11px] text-[#64748B]">SKU Code</div>
                  <div className="font-mono font-semibold text-[#0F172A] mt-0.5">
                    {target.item.itemCode}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Category</div>
                  <div className="font-semibold text-[#0F172A] mt-0.5">
                    {target.item.category}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Dimensions</div>
                  <div className="font-mono font-semibold text-[#2563EB] mt-0.5">
                    {target.item.dimensions}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Branch / Yard</div>
                  <div className="font-medium text-[#0F172A] mt-0.5">
                    {target.item.locationName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Finish &amp; Thickness</div>
                  <div className="font-medium text-[#0F172A] mt-0.5">
                    {target.item.finish} · {target.item.thickness}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Rate &amp; Valuation</div>
                  <div className="font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    ₹ {target.item.unitPriceInr.toLocaleString('en-IN')} / {target.item.unit}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Stock Status</div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      target.item.status === 'Out of Stock'
                        ? 'text-[#DC2626]'
                        : target.item.status === 'Low Stock'
                          ? 'text-[#D97706]'
                          : target.item.status === 'Overstock'
                            ? 'text-[#2563EB]'
                            : 'text-[#16A34A]'
                    }`}
                  >
                    {target.item.status}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Last Activity</div>
                  <div className="text-[#475569] mt-0.5">{target.item.lastCountedAt}</div>
                </div>
              </div>
            </div>
          )}

          {mode === 'view' && target.kind === 'slab' && (() => {
            const physicalQty =
              target.slab.status === 'Out of Stock' ? 0 : Math.max(0, target.slab.totalSqFt);
            const systemQty =
              typeof target.slab.systemSqFt === 'number'
                ? Math.max(0, target.slab.systemSqFt)
                : physicalQty;
            const variance = Number((physicalQty - systemQty).toFixed(2));
            return (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
                  <div className="text-[11px] font-medium text-[#64748B]">System Stock</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A] tabular-nums">
                    {systemQty.toLocaleString('en-IN')}{' '}
                    <span className="text-[12px] font-medium text-[#64748B]">sq. ft</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#64748B]">
                    From Purchase Bills − Sales Bills
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
                  <div className="text-[11px] font-medium text-[#64748B]">Physical Stock</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A] tabular-nums">
                    {physicalQty.toLocaleString('en-IN')}{' '}
                    <span className="text-[12px] font-medium text-[#64748B]">sq. ft</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#64748B]">
                    Updated by Sales &amp; Yard Count
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0]">
                  <div className="text-[11px] font-medium text-[#64748B]">
                    Variance (Physical − System)
                  </div>
                  <div
                    className={`mt-1 text-[18px] font-bold tabular-nums ${
                      variance < 0
                        ? 'text-[#DC2626]'
                        : variance > 0
                          ? 'text-[#16A34A]'
                          : 'text-[#0F172A]'
                    }`}
                  >
                    {variance > 0
                      ? `+${variance.toLocaleString('en-IN')}`
                      : variance.toLocaleString('en-IN')}{' '}
                    <span className="text-[12px] font-medium">sq. ft</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-[#F1F5F9] text-[12.5px]">
                <div>
                  <div className="text-[11px] text-[#64748B]">Slab Code</div>
                  <div className="font-mono font-semibold text-[#0F172A] mt-0.5">
                    {target.slab.lotNumber}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Category</div>
                  <div className="font-semibold text-[#0F172A] mt-0.5">
                    {target.slab.category}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Status</div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      target.slab.status === 'In Stock' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {target.slab.status}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Dimensions</div>
                  <div className="font-mono font-semibold text-[#2563EB] mt-0.5">
                    {target.slab.dimensionsFt}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Branch</div>
                  <div className="font-medium text-[#0F172A] mt-0.5">
                    {target.slab.branchName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">Finish &amp; Thickness</div>
                  <div className="font-medium text-[#0F172A] mt-0.5">
                    {target.slab.finish} · {target.slab.thicknessMm} mm
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {mode === 'edit' && target.kind === 'product' && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Product / Material Name
                  </label>
                  <input
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    required
                    className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Category
                  </label>
                  <select
                    value={pCat}
                    onChange={(e) => setPCat(e.target.value as StoneCategory)}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Dimensions
                  </label>
                  <input
                    value={pDims}
                    onChange={(e) => setPDims(e.target.value)}
                    required
                    className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Branch
                  </label>
                  <select
                    value={pLocId}
                    onChange={(e) => setPLocId(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Finish
                  </label>
                  <select
                    value={pFinish}
                    onChange={(e) => setPFinish(e.target.value as VarianceItem['finish'])}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="Polished">Polished</option>
                    <option value="Honed">Honed</option>
                    <option value="Leather">Leather</option>
                    <option value="Matte">Matte</option>
                    <option value="Standard">Standard</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Thickness
                    </label>
                    <input
                      value={pThick}
                      onChange={(e) => setPThick(e.target.value)}
                      className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Rate (₹/{target.item.unit})
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pPrice}
                      onChange={(e) => setPPrice(e.target.value)}
                      className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#FAFBFD] border border-[#E5E9F0] flex items-center gap-3.5">
                <img
                  src={resolveProductImage(pImageUrl)}
                  alt={pName || 'Product preview'}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                  }}
                  className="w-14 h-14 rounded-lg object-cover border border-[#E2E8F0] bg-white shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-semibold text-[#0F172A]">Product Image</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    {pImageUrl
                      ? 'Custom product photo attached'
                      : 'Using fixed default stone image'}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="h-7 px-2.5 rounded-md border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[11.5px] font-medium text-[#334155] inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Change Image</span>
                      <input
                        ref={editFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const dataUrl = await compressImageFileToDataUrl(file);
                            setPImageUrl(dataUrl);
                          } catch {
                            setErrorMsg('Unable to process selected image.');
                          }
                        }}
                      />
                    </label>
                    {pImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setPImageUrl('');
                          if (editFileRef.current) editFileRef.current.value = '';
                        }}
                        className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50"
                      >
                        Use Default
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11.5px] text-[#475569]">
                Note: System Stock ({target.item.systemQty} {target.item.unit}) and Physical Stock (
                {target.item.physicalQty} {target.item.unit}) are controlled via Purchase Bills, Sales Bills, and Yard Count Adjustments.
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                  {errorMsg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[12.5px] font-medium text-[#475569] hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Product Changes'}
                </button>
              </div>
            </form>
          )}

          {mode === 'edit' && target.kind === 'slab' && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Product / Stone Name
                  </label>
                  <input
                    value={sStone}
                    onChange={(e) => setSStone(e.target.value)}
                    required
                    className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Category
                  </label>
                  <select
                    value={sCat}
                    onChange={(e) => setSCat(e.target.value as StoneCategory)}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Dimensions
                  </label>
                  <input
                    value={sDims}
                    onChange={(e) => setSDims(e.target.value)}
                    required
                    className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Slab Status
                  </label>
                  <select
                    value={sStatus}
                    onChange={(e) => setSStatus(e.target.value as SlabLot['status'])}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="In Stock">In Stock</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Branch
                  </label>
                  <select
                    value={sBranch}
                    onChange={(e) => setSBranch(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Area (sq. ft)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={sSqft}
                      onChange={(e) => setSSqft(e.target.value)}
                      className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Slabs
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={sPcs}
                      onChange={(e) => setSPcs(e.target.value)}
                      className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Thick (mm)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={sThick}
                      onChange={(e) => setSThick(e.target.value)}
                      className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Finish
                  </label>
                  <select
                    value={sFinish}
                    onChange={(e) => setSFinish(e.target.value as SlabLot['finish'])}
                    className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="Polished">Polished</option>
                    <option value="Honed">Honed</option>
                    <option value="Leather">Leather</option>
                  </select>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                  {errorMsg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[12.5px] font-medium text-[#475569] hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Slab Changes'}
                </button>
              </div>
            </form>
          )}

          {mode === 'history' && (
            <div className="space-y-3">
              {itemHistory.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-[12.5px] text-[#64748B]">
                  No purchases, sales, transfers, or adjustments recorded yet for {code}.
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9] border border-[#E5E9F0] rounded-xl overflow-hidden">
                  {itemHistory.map((entry) => {
                    const TypeIcon =
                      entry.type === 'Purchase'
                        ? PackageCheck
                        : entry.type === 'Sale'
                          ? ShoppingCart
                          : entry.type === 'Transfer'
                            ? ArrowLeftRight
                            : entry.type === 'Return'
                              ? Undo2
                              : SlidersHorizontal;
                    const typeColor =
                      entry.type === 'Purchase'
                        ? 'text-[#16A34A]'
                        : entry.type === 'Sale'
                          ? 'text-[#DC2626]'
                          : entry.type === 'Transfer'
                            ? 'text-[#2563EB]'
                            : entry.type === 'Return'
                              ? 'text-[#7C3AED]'
                              : 'text-[#D97706]';

                    return (
                      <div
                        key={entry.id}
                        className="p-3.5 bg-white hover:bg-slate-50/70 flex items-start justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`mt-0.5 ${typeColor}`}>
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                              <span className={`font-semibold ${typeColor}`}>
                                {entry.type}
                              </span>
                              <span className="font-mono text-[11.5px] text-[#0F172A] font-medium">
                                {entry.referenceNo}
                              </span>
                              <span className="text-[#94A3B8]">·</span>
                              <span className="text-[11.5px] text-[#64748B]">
                                {entry.branchName}
                              </span>
                            </div>
                            <div className="text-[12px] text-[#334155] mt-0.5">
                              {entry.partyOrNote}
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-1 tabular-nums">
                              After movement — System:{' '}
                              <span className="font-semibold text-[#0F172A]">
                                {entry.systemAfter.toLocaleString('en-IN')} {entry.unit}
                              </span>{' '}
                              · Physical:{' '}
                              <span className="font-semibold text-[#0F172A]">
                                {entry.physicalAfter.toLocaleString('en-IN')} {entry.unit}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`text-[12.5px] font-bold tabular-nums ${
                              entry.quantityDelta > 0
                                ? 'text-[#16A34A]'
                                : entry.quantityDelta < 0
                                  ? 'text-[#DC2626]'
                                  : 'text-[#64748B]'
                            }`}
                          >
                            {entry.quantityDelta > 0
                              ? `+${entry.quantityDelta.toLocaleString('en-IN')}`
                              : entry.quantityDelta.toLocaleString('en-IN')}{' '}
                            {entry.unit}
                          </div>
                          <div className="text-[11px] text-[#94A3B8] mt-0.5">
                            {entry.timestampLabel}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
