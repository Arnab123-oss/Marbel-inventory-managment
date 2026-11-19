import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Info,
  Layers,
  Package,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {useMemo, useRef, useState} from 'react';
import {
  compressImageFileToDataUrl,
  DEFAULT_PRODUCT_IMAGE,
  resolveProductImage,
} from '../../constants/assets';
import type {
  CustomerRecord,
  InventorySnapshot,
  LocationRow,
  NavSection,
  SlabLot,
  StoneCategory,
  UnitType,
  UserProfile,
  VarianceItem,
} from '../../types/inventory';
import {
  type ActionModalMode,
  type ActionModalTarget,
  ProductActionModal,
} from '../modals/ProductActionModal';
import {RowActionMenu} from '../ui/RowActionMenu';

interface SecondaryViewsProps {
  section: Exclude<NavSection, 'dashboard'>;
  snapshot: InventorySnapshot;
  user: UserProfile;
  liveStreamEnabled: boolean;
  onToggleLiveStream: () => void;
  onSelectLocation: (loc: LocationRow) => void;
  onCreateProduct: (payload: {
    itemCode: string;
    itemName: string;
    dimensions: string;
    category: StoneCategory;
    finish: VarianceItem['finish'];
    thickness: string;
    locationId: string;
    unit: UnitType;
    qty: number;
    unitPriceInr: number;
    imageUrl?: string;
  }) => Promise<void>;
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
  onToggleProductEnabled: (itemId: string) => Promise<void>;
  onDeleteProduct: (itemId: string) => Promise<void>;
  onCreateSlabLot: (payload: {
    stoneName: string;
    category: StoneCategory;
    dimensionsFt: string;
    slabCountPcs: number;
    totalSqFt: number;
    thicknessMm: number;
    branchName: string;
    finish: 'Polished' | 'Honed' | 'Leather';
  }) => Promise<void>;
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
  onCreatePurchaseBill: (payload: {
    supplierName: string;
    branchName: string;
    itemCode: string;
    qty: number;
    unit: UnitType;
    totalInr: number;
  }) => Promise<void>;
  onCreateSalesBill: (payload: {
    customerName: string;
    branchName: string;
    itemCode: string;
    qty: number;
    unit: UnitType;
    totalInr: number;
  }) => Promise<void>;
  onCreateTransfer: (payload: {
    itemCode: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }) => Promise<void>;
  onCreateCustomer: (payload: {
    name: string;
    segment: CustomerRecord['segment'];
    phone: string;
    city: string;
  }) => Promise<void>;
  onCreateSupplier: (payload: {
    name: string;
    origin: string;
    specialty: string;
    phone: string;
  }) => Promise<void>;
  onToggleAcknowledgeAlert: (alertId: string) => Promise<void>;
  onExportCsv: () => void;
  onResetLayout: () => void;
  onLogout: () => void;
}

const DIMENSION_PRESETS = [
  '10 ft × 5 ft',
  '9 ft × 5 ft',
  '8 ft × 4 ft',
  '2 ft × 2 ft',
  '20 kg Pack',
];

const SHOP_CATEGORIES: StoneCategory[] = [
  'Marble',
  'Granite',
  'Tiles',
  'Adhesives',
  'Onyx & Quartz',
];

const SHOP_UNITS: UnitType[] = ['sq. ft', 'pcs', 'box', 'bag', 'kg'];

export function SecondaryViews({
  section,
  snapshot,
  user,
  liveStreamEnabled,
  onToggleLiveStream,
  onSelectLocation,
  onCreateProduct,
  onUpdateProduct,
  onToggleProductEnabled,
  onDeleteProduct,
  onCreateSlabLot,
  onUpdateSlabLot,
  onCreatePurchaseBill,
  onCreateSalesBill,
  onCreateTransfer,
  onCreateCustomer,
  onCreateSupplier,
  onToggleAcknowledgeAlert,
  onExportCsv,
  onResetLayout,
  onLogout,
}: SecondaryViewsProps) {
  const [inventoryTab, setInventoryTab] = useState<'slabs' | 'quantity'>('quantity');
  const [skuSearch, setSkuSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<'All' | UnitType>('All');
  const [slabStatusFilter, setSlabStatusFilter] = useState<'All' | SlabLot['status']>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | StoneCategory>('All');

  // View / Edit / History modal state
  const [actionTarget, setActionTarget] = useState<ActionModalTarget | null>(null);
  const [actionMode, setActionMode] = useState<ActionModalMode>('view');

  // Product creation state
  const [prodCode, setProdCode] = useState('MRB-SLB-8X5');
  const [prodName, setProdName] = useState('Italian Statuario Slab');
  const [prodDimensions, setProdDimensions] = useState('8 ft × 5 ft');
  const [prodCat, setProdCat] = useState<StoneCategory>('Marble');
  const [prodFinish, setProdFinish] = useState<VarianceItem['finish']>('Polished');
  const [prodThick, setProdThick] = useState('18 mm');
  const [prodBranch, setProdBranch] = useState(snapshot.locations[0]?.id || 'main-showroom');
  const [prodUnit, setProdUnit] = useState<UnitType>('sq. ft');
  const [prodQty, setProdQty] = useState('1600');
  const [prodPrice, setProdPrice] = useState('680');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodImageLoading, setProdImageLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const prodFileInputRef = useRef<HTMLInputElement | null>(null);

  // Product toggle & delete confirmation state
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<VarianceItem | null>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);

  // Slab lot creation state
  const [slabStone, setSlabStone] = useState('Statuario Venato');
  const [slabCat, setSlabCat] = useState<StoneCategory>('Marble');
  const [slabDims, setSlabDims] = useState('10 × 5 ft');
  const [slabPcs, setSlabPcs] = useState('1');
  const [slabSqft, setSlabSqft] = useState('50');
  const [slabBranch, setSlabBranch] = useState(snapshot.locations[0]?.name || 'Main Showroom');

  // Purchase bill state
  const [pbSupplier, setPbSupplier] = useState(
    snapshot.suppliers[0]?.name || 'Kishangarh Marble Depot',
  );
  const [pbBranch, setPbBranch] = useState(snapshot.locations[0]?.name || 'Main Showroom');
  const [pbItemCode, setPbItemCode] = useState(
    snapshot.varianceItems[0]?.itemCode || 'MRB-SLB-10X5',
  );
  const [pbQty, setPbQty] = useState('1200');
  const [pbUnit, setPbUnit] = useState<UnitType>('sq. ft');

  // Sales bill state
  const [sbCustomer, setSbCustomer] = useState(
    snapshot.customers[0]?.name || 'Apex Horizon Builders',
  );
  const [sbBranch, setSbBranch] = useState(snapshot.locations[0]?.name || 'Main Showroom');
  const [sbItemCode, setSbItemCode] = useState(
    snapshot.varianceItems[0]?.itemCode || 'MRB-SLB-10X5',
  );
  const [sbQty, setSbQty] = useState('850');
  const [sbUnit, setSbUnit] = useState<UnitType>('sq. ft');

  // Transfer state
  const [transferItem, setTransferItem] = useState(
    snapshot.varianceItems[0]?.itemCode || 'MRB-SLB-10X5',
  );
  const [transferFrom, setTransferFrom] = useState(
    snapshot.locations[5]?.name || 'Kishangarh Hub',
  );
  const [transferTo, setTransferTo] = useState(snapshot.locations[0]?.name || 'Main Showroom');
  const [transferQty, setTransferQty] = useState('600');

  // Customer & Supplier state
  const [custName, setCustName] = useState('');
  const [custSegment, setCustSegment] = useState<CustomerRecord['segment']>('Architect');
  const [custPhone, setCustPhone] = useState('');
  const [custCity, setCustCity] = useState('Mumbai');

  const [supName, setSupName] = useState('');
  const [supOrigin, setSupOrigin] = useState('');
  const [supSpecialty, setSupSpecialty] = useState('Italian Marble Slabs (sq. ft)');
  const [supPhone, setSupPhone] = useState('');

  const filteredItems = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return snapshot.varianceItems.filter((item) => {
      const matchesUnit = unitFilter === 'All' || item.unit === unitFilter;
      const matchesCat = categoryFilter === 'All' || item.category === categoryFilter;
      const matchesQuery =
        !q ||
        item.itemCode.toLowerCase().includes(q) ||
        item.itemName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.dimensions.toLowerCase().includes(q) ||
        item.locationName.toLowerCase().includes(q);
      return matchesUnit && matchesCat && matchesQuery;
    });
  }, [snapshot.varianceItems, skuSearch, unitFilter, categoryFilter]);

  const filteredSlabs = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return snapshot.slabs.filter((slab) => {
      const matchesStatus = slabStatusFilter === 'All' || slab.status === slabStatusFilter;
      const matchesCat = categoryFilter === 'All' || slab.category === categoryFilter;
      const matchesQuery =
        !q ||
        slab.lotNumber.toLowerCase().includes(q) ||
        slab.stoneName.toLowerCase().includes(q) ||
        slab.category.toLowerCase().includes(q) ||
        slab.dimensionsFt.toLowerCase().includes(q) ||
        slab.branchName.toLowerCase().includes(q);
      return matchesStatus && matchesCat && matchesQuery;
    });
  }, [snapshot.slabs, skuSearch, slabStatusFilter, categoryFilter]);

  function openProductAction(item: VarianceItem, mode: ActionModalMode) {
    setActionTarget({kind: 'product', item});
    setActionMode(mode);
  }

  function openSlabAction(slab: SlabLot, mode: ActionModalMode) {
    setActionTarget({kind: 'slab', slab});
    setActionMode(mode);
  }

  function renderMainSection() {
    if (section === 'inventory') {
      return (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-bold text-[#0F172A]">
                Marble, Granite, Tiles &amp; Adhesives Inventory
              </h1>
              <p className="text-[13px] text-[#64748B]">
                Track individual marble/granite slabs by Slab ID and bulk stock with Variance (Physical − System).
              </p>
            </div>
            <button
              type="button"
              onClick={onExportCsv}
              className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Export Ledger CSV</span>
            </button>
          </div>

          {/* Two-Tab Switcher: Slab Inventory vs Quantity Inventory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white border border-[#E5E9F0] rounded-xl p-2">
            <button
              type="button"
              onClick={() => setInventoryTab('slabs')}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                inventoryTab === 'slabs'
                  ? 'bg-[#EEF4FF] border border-blue-200 text-[#1D63ED]'
                  : 'border border-transparent hover:bg-slate-50 text-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Layers
                  className={`w-5 h-5 shrink-0 ${
                    inventoryTab === 'slabs' ? 'text-[#2563EB]' : 'text-[#64748B]'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-[14px] font-bold leading-tight">Slab Inventory</div>
                  <div
                    className={`text-[11.5px] mt-0.5 ${
                      inventoryTab === 'slabs' ? 'text-[#2563EB]' : 'text-[#64748B]'
                    }`}
                  >
                    Individual slab records ({snapshot.slabs.length})
                  </div>
                </div>
              </div>
              <span className="text-[12px] font-semibold tabular-nums">
                {snapshot.slabs.filter((s) => s.status === 'Available').length} available
              </span>
            </button>

            <button
              type="button"
              onClick={() => setInventoryTab('quantity')}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                inventoryTab === 'quantity'
                  ? 'bg-[#EEF4FF] border border-blue-200 text-[#1D63ED]'
                  : 'border border-transparent hover:bg-slate-50 text-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Package
                  className={`w-5 h-5 shrink-0 ${
                    inventoryTab === 'quantity' ? 'text-[#2563EB]' : 'text-[#64748B]'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-[14px] font-bold leading-tight">Quantity Inventory</div>
                  <div
                    className={`text-[11.5px] mt-0.5 ${
                      inventoryTab === 'quantity' ? 'text-[#2563EB]' : 'text-[#64748B]'
                    }`}
                  >
                    Bulk stock records ({snapshot.varianceItems.length})
                  </div>
                </div>
              </div>
              <span className="text-[12px] font-semibold tabular-nums">
                System vs Physical
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className="lg:col-span-3 bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    placeholder={
                      inventoryTab === 'slabs'
                        ? 'Search Slab ID, stone, dimensions...'
                        : 'Search SKU, product, category, dimensions...'
                    }
                    className="w-full h-9 pl-9 pr-3 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {inventoryTab === 'quantity' ? (
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['All', ...SHOP_UNITS] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setUnitFilter(u)}
                          className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
                            unitFilter === u
                              ? 'bg-white text-[#0F172A] shadow-sm'
                              : 'text-[#64748B] hover:text-[#0F172A]'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['All', 'Available', 'Reserved', 'Sold', 'In Cutting'] as const).map(
                        (st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setSlabStatusFilter(st)}
                            className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
                              slabStatusFilter === st
                                ? 'bg-white text-[#0F172A] shadow-sm'
                                : 'text-[#64748B] hover:text-[#0F172A]'
                            }`}
                          >
                            {st}
                          </button>
                        ),
                      )}
                    </div>
                  )}

                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as 'All' | StoneCategory)
                    }
                    className="h-9 px-3 text-[12px] rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A]"
                  >
                    <option value="All">All Categories</option>
                    {SHOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {inventoryTab === 'quantity' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1160px]">
                    <thead>
                      <tr className="border-b border-[#E5E9F0] text-[11.5px] font-medium text-[#64748B]">
                        <th className="py-2.5 pr-3">Image</th>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Dimensions</th>
                        <th className="py-2.5 px-3">Thickness</th>
                        <th className="py-2.5 px-3">Unit</th>
                        <th className="py-2.5 px-3 text-right">System Stock</th>
                        <th className="py-2.5 px-3 text-right">Physical Stock</th>
                        <th className="py-2.5 px-3 text-right">Variance</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                        <th className="py-2.5 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                      {filteredItems.map((item) => {
                        const isNeg = item.variance < 0;
                        const isPos = item.variance > 0;
                        const isDisabled = item.enabled === false;
                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isDisabled ? 'opacity-60' : ''
                            }`}
                          >
                            <td className="py-2.5 pr-3 whitespace-nowrap">
                              <img
                                src={resolveProductImage(item.imageUrl)}
                                alt={item.itemName}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                                }}
                                className="w-10 h-10 rounded-lg object-cover border border-[#E5E9F0] bg-slate-50"
                              />
                            </td>
                            <td className="py-3 px-3 font-mono font-medium text-[#0F172A] whitespace-nowrap">
                              {item.itemCode}
                            </td>
                            <td className="py-3 px-3 font-medium text-[#1E293B] whitespace-nowrap">
                              <div>{item.itemName}</div>
                              {isDisabled && (
                                <div className="text-[10.5px] font-medium text-[#94A3B8]">
                                  Disabled
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-[#475569] whitespace-nowrap">
                              {item.locationName}
                            </td>
                            <td className="py-3 px-3 font-medium text-[#334155] whitespace-nowrap">
                              {item.category}
                            </td>
                            <td className="py-3 px-3 font-mono text-[12px] text-[#334155] whitespace-nowrap">
                              {item.dimensions}
                            </td>
                            <td className="py-3 px-3 font-mono text-[12px] text-[#475569] whitespace-nowrap">
                              {item.thickness}
                            </td>
                            <td className="py-3 px-3 font-medium text-[#2563EB] whitespace-nowrap">
                              {item.unit}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                              {item.systemQty.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                              {item.physicalQty.toLocaleString('en-IN')}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-semibold tabular-nums whitespace-nowrap ${
                                isNeg
                                  ? 'text-[#DC2626]'
                                  : isPos
                                    ? 'text-[#16A34A]'
                                    : 'text-[#64748B]'
                              }`}
                            >
                              {isPos
                                ? `+${item.variance.toLocaleString('en-IN')}`
                                : item.variance.toLocaleString('en-IN')}{' '}
                              {item.unit}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-medium whitespace-nowrap ${
                                item.status === 'Out of Stock'
                                  ? 'text-[#DC2626]'
                                  : item.status === 'Low Stock'
                                    ? 'text-[#D97706]'
                                    : item.status === 'Overstock'
                                      ? 'text-[#2563EB]'
                                      : 'text-[#16A34A]'
                              }`}
                            >
                              {item.status}
                            </td>
                            <td className="py-3 pl-3 text-right whitespace-nowrap">
                              <RowActionMenu
                                ariaLabel={`Actions for ${item.itemCode}`}
                                onSelect={(mode) => openProductAction(item, mode)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="border-b border-[#E5E9F0] text-[11.5px] font-medium text-[#64748B]">
                        <th className="py-2.5 pr-3">Image</th>
                        <th className="py-2.5 px-3">Slab ID</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Dimensions</th>
                        <th className="py-2.5 px-3">Thickness</th>
                        <th className="py-2.5 px-3">Branch</th>
                        <th className="py-2.5 px-3 text-right">Area (sq. ft)</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                        <th className="py-2.5 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                      {filteredSlabs.map((slab) => (
                        <tr key={slab.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <img
                              src={resolveProductImage(slab.imageUrl)}
                              alt={slab.stoneName}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                              }}
                              className="w-10 h-10 rounded-lg object-cover border border-[#E5E9F0] bg-slate-50"
                            />
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-[#0F172A] whitespace-nowrap">
                            {slab.lotNumber}
                          </td>
                          <td className="py-3 px-3 font-medium text-[#1E293B]">
                            {slab.stoneName}
                          </td>
                          <td className="py-3 px-3 font-medium text-[#334155] whitespace-nowrap">
                            {slab.category}
                          </td>
                          <td className="py-3 px-3 font-mono text-[12px] text-[#334155] whitespace-nowrap">
                            {slab.dimensionsFt}
                          </td>
                          <td className="py-3 px-3 font-mono text-[12px] text-[#475569] whitespace-nowrap">
                            {slab.thicknessMm} mm
                          </td>
                          <td className="py-3 px-3 text-[#475569] whitespace-nowrap">
                            {slab.branchName}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold tabular-nums whitespace-nowrap">
                            {slab.totalSqFt.toLocaleString('en-IN')} sq. ft
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-semibold whitespace-nowrap ${
                              slab.status === 'Available'
                                ? 'text-[#16A34A]'
                                : slab.status === 'Sold'
                                  ? 'text-[#DC2626]'
                                  : slab.status === 'Reserved'
                                    ? 'text-[#2563EB]'
                                    : 'text-[#D97706]'
                            }`}
                          >
                            {slab.status}
                          </td>
                          <td className="py-3 pl-3 text-right whitespace-nowrap">
                            <RowActionMenu
                              ariaLabel={`Actions for slab ${slab.lotNumber}`}
                              onSelect={(mode) => openSlabAction(slab, mode)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-2.5 h-fit">
                <h3 className="text-[13.5px] font-semibold text-[#0F172A]">
                  Open Stock Alerts
                </h3>
                {snapshot.alerts.slice(0, 4).map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => onToggleAcknowledgeAlert(alert.id)}
                    className="w-full text-left flex items-start gap-2 p-2 rounded-lg border border-[#F1F5F9] hover:bg-slate-50 text-[11.5px]"
                  >
                    {alert.acknowledged ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : alert.severity === 'critical' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] shrink-0 mt-0.5" />
                    ) : alert.severity === 'warning' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-[#D97706] shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-[#7C3AED] shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        alert.acknowledged ? 'line-through text-slate-400' : 'text-[#334155]'
                      }
                    >
                      {alert.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (section === 'products') {
      return (
        <div className="space-y-5">
          <div>
            <h1 className="text-[20px] font-bold text-[#0F172A]">
              Marble, Granite, Tiles &amp; Adhesives Catalog
            </h1>
            <p className="text-[13px] text-[#64748B]">
              Each dimension variant (such as 10 ft × 5 ft vs 9 ft × 5 ft Italian Statuario Slab) is tracked as a separate product with its own SKU, category, unit rate, and stock.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setProdError(null);
                try {
                  await onCreateProduct({
                    itemCode: prodCode,
                    itemName: prodName,
                    dimensions: prodDimensions,
                    category: prodCat,
                    finish: prodFinish,
                    thickness: prodThick,
                    locationId: prodBranch,
                    unit: prodUnit,
                    qty: Number(prodQty),
                    unitPriceInr: Number(prodPrice),
                    imageUrl: prodImageUrl || undefined,
                  });
                  setProdImageUrl('');
                  if (prodFileInputRef.current) prodFileInputRef.current.value = '';
                } catch (err) {
                  setProdError(
                    err instanceof Error ? err.message : 'Unable to add product variant',
                  );
                }
              }}
              className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
            >
              <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#2563EB]" />
                <span>Add Shop Product</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    SKU Code
                  </label>
                  <input
                    value={prodCode}
                    onChange={(e) => setProdCode(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">Unit</label>
                  <select
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value as UnitType)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {SHOP_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Product / Material Name
                </label>
                <input
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Dimensions (creates separate product per size)
                </label>
                <input
                  value={prodDimensions}
                  onChange={(e) => setProdDimensions(e.target.value)}
                  placeholder="e.g. 10 ft × 5 ft or 9 ft × 5 ft"
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0] font-mono"
                  required
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DIMENSION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setProdDimensions(preset)}
                      className={`px-2 py-0.5 text-[10.5px] font-mono rounded border transition-colors ${
                        prodDimensions === preset
                          ? 'bg-[#EEF4FF] border-blue-300 text-[#1D63ED]'
                          : 'bg-slate-50 border-slate-200 text-[#475569] hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Category
                  </label>
                  <select
                    value={prodCat}
                    onChange={(e) => setProdCat(e.target.value as StoneCategory)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {SHOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Finish
                  </label>
                  <select
                    value={prodFinish}
                    onChange={(e) => setProdFinish(e.target.value as VarianceItem['finish'])}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="Polished">Polished</option>
                    <option value="Honed">Honed</option>
                    <option value="Leather">Leather</option>
                    <option value="Matte">Matte</option>
                    <option value="Standard">Standard</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Thickness
                  </label>
                  <input
                    value={prodThick}
                    onChange={(e) => setProdThick(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Qty ({prodUnit})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={prodQty}
                    onChange={(e) => setProdQty(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Rate (₹/{prodUnit})
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Branch</label>
                <select
                  value={prodBranch}
                  onChange={(e) => setProdBranch(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {snapshot.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1.5">
                  Product Image
                </label>
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-[#E2E8F0] bg-[#FAFBFD]">
                  <img
                    src={resolveProductImage(prodImageUrl)}
                    alt="Product preview"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                    }}
                    className="w-14 h-14 rounded-lg object-cover border border-[#E5E9F0] bg-white shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[12px] font-medium text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>
                          {prodImageLoading
                            ? 'Processing...'
                            : prodImageUrl
                              ? 'Change Image'
                              : 'Upload Image'}
                        </span>
                        <input
                          ref={prodFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setProdError(null);
                            setProdImageLoading(true);
                            try {
                              const compressed = await compressImageFileToDataUrl(file);
                              setProdImageUrl(compressed);
                            } catch {
                              setProdError('Could not read the selected image file.');
                            } finally {
                              setProdImageLoading(false);
                            }
                          }}
                        />
                      </label>
                      {prodImageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setProdImageUrl('');
                            if (prodFileInputRef.current) prodFileInputRef.current.value = '';
                          }}
                          className="h-8 px-2 rounded-lg text-[11.5px] font-medium text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 inline-flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-1">
                      {prodImageUrl
                        ? 'Custom product image selected'
                        : 'Optional — uses fixed default stone image if not uploaded'}
                    </p>
                  </div>
                </div>
              </div>
              {prodError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                  {prodError}
                </div>
              )}
              <button
                type="submit"
                disabled={prodImageLoading}
                className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold disabled:opacity-60"
              >
                Add Product Variant
              </button>
            </form>

            <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
                Active Shop Products ({snapshot.varianceItems.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1040px]">
                  <thead>
                    <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                      <th className="py-2 pr-2">Image</th>
                      <th className="py-2 px-2">SKU</th>
                      <th className="py-2 px-2">Product</th>
                      <th className="py-2 px-2">Location</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2">Dimensions</th>
                      <th className="py-2 px-2">Thickness</th>
                      <th className="py-2 px-2 text-right">System</th>
                      <th className="py-2 px-2 text-right">Physical</th>
                      <th className="py-2 px-2 text-right">Variance</th>
                      <th className="py-2 pl-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                    {snapshot.varianceItems.map((item) => {
                      const isEnabled = item.enabled !== false;
                      const isToggling = togglingProductId === item.id;
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isEnabled ? 'hover:bg-slate-50/80' : 'bg-slate-50/60'
                          }`}
                        >
                          <td className={`py-2.5 pr-2 whitespace-nowrap ${!isEnabled ? 'opacity-55' : ''}`}>
                            <img
                              src={resolveProductImage(item.imageUrl)}
                              alt={item.itemName}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                              }}
                              className="w-10 h-10 rounded-lg object-cover border border-[#E5E9F0] bg-slate-50"
                            />
                          </td>
                          <td
                            className={`py-2.5 px-2 font-mono font-medium whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#0F172A]'
                            }`}
                          >
                            {item.itemCode}
                          </td>
                          <td
                            className={`py-2.5 px-2 font-medium whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8] line-through' : 'text-[#0F172A]'
                            }`}
                          >
                            {item.itemName}
                          </td>
                          <td
                            className={`py-2.5 px-2 whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#475569]'
                            }`}
                          >
                            {item.locationName}
                          </td>
                          <td
                            className={`py-2.5 px-2 font-medium whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#334155]'
                            }`}
                          >
                            {item.category}
                          </td>
                          <td
                            className={`py-2.5 px-2 font-mono text-[11.5px] whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#2563EB]'
                            }`}
                          >
                            {item.dimensions}
                          </td>
                          <td
                            className={`py-2.5 px-2 font-mono text-[11.5px] whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#475569]'
                            }`}
                          >
                            {item.thickness}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right tabular-nums whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : ''
                            }`}
                          >
                            {item.systemQty.toLocaleString('en-IN')} {item.unit}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : ''
                            }`}
                          >
                            {item.physicalQty.toLocaleString('en-IN')} {item.unit}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap ${
                              !isEnabled
                                ? 'text-[#94A3B8]'
                                : item.variance < 0
                                  ? 'text-[#DC2626]'
                                  : item.variance > 0
                                    ? 'text-[#16A34A]'
                                    : 'text-[#64748B]'
                            }`}
                          >
                            {item.variance > 0 ? `+${item.variance}` : item.variance}
                          </td>
                          <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2.5">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isEnabled}
                                aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${item.itemCode}`}
                                title={isEnabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                                disabled={isToggling}
                                onClick={async () => {
                                  setTogglingProductId(item.id);
                                  try {
                                    await onToggleProductEnabled(item.id);
                                  } finally {
                                    setTogglingProductId(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <span
                                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                    isEnabled ? 'bg-[#16A34A]' : 'bg-slate-300'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                                      isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                    }`}
                                  />
                                </span>
                                <span
                                  className={`text-[11px] font-semibold w-[52px] text-left ${
                                    isEnabled ? 'text-[#16A34A]' : 'text-[#64748B]'
                                  }`}
                                >
                                  {isEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </button>

                              <button
                                type="button"
                                aria-label={`Delete ${item.itemCode}`}
                                title={`Delete ${item.itemName}`}
                                onClick={() => setDeleteConfirmItem(item)}
                                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (section === 'slabs') {
      return (
        <div className="space-y-5">
          <div>
            <h1 className="text-[20px] font-bold text-[#0F172A]">
              Individual Slab Register &amp; Bundle Tracker
            </h1>
            <p className="text-[13px] text-[#64748B]">
              Track individual marble &amp; granite slabs by unique Slab ID (e.g., SL-001), dimensions, branch, and status.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onCreateSlabLot({
                  stoneName: slabStone,
                  category: slabCat,
                  dimensionsFt: slabDims,
                  slabCountPcs: Number(slabPcs),
                  totalSqFt: Number(slabSqft),
                  thicknessMm: 18,
                  branchName: slabBranch,
                  finish: 'Polished',
                });
              }}
              className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
            >
              <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#2563EB]" />
                <span>Register New Slab</span>
              </h2>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Stone Name
                </label>
                <input
                  value={slabStone}
                  onChange={(e) => setSlabStone(e.target.value)}
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Category
                  </label>
                  <select
                    value={slabCat}
                    onChange={(e) => setSlabCat(e.target.value as StoneCategory)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="Marble">Marble</option>
                    <option value="Granite">Granite</option>
                    <option value="Onyx & Quartz">Onyx &amp; Quartz</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Dimensions
                  </label>
                  <input
                    value={slabDims}
                    onChange={(e) => setSlabDims(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Slab Count (pcs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={slabPcs}
                    onChange={(e) => setSlabPcs(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Total Area (sq. ft)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={slabSqft}
                    onChange={(e) => setSlabSqft(e.target.value)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Branch / Yard
                </label>
                <select
                  value={slabBranch}
                  onChange={(e) => setSlabBranch(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {snapshot.locations.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
              >
                Register Slab Record
              </button>
            </form>

            <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
                Slab Inventory Records ({snapshot.slabs.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead>
                    <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                      <th className="py-2 pr-2">Slab ID</th>
                      <th className="py-2 px-2">Product</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2">Dimensions</th>
                      <th className="py-2 px-2">Branch</th>
                      <th className="py-2 px-2 text-right">Area (sq. ft)</th>
                      <th className="py-2 px-2 text-right">Status</th>
                      <th className="py-2 pl-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                    {snapshot.slabs.map((slab) => (
                      <tr key={slab.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-2 font-mono font-semibold">{slab.lotNumber}</td>
                        <td className="py-2.5 px-2 font-medium text-[#0F172A]">
                          {slab.stoneName} ·{' '}
                          <span className="text-[#64748B]">{slab.thicknessMm}mm</span>
                        </td>
                        <td className="py-2.5 px-2 text-[#334155] whitespace-nowrap">
                          {slab.category}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[#475569] tabular-nums whitespace-nowrap">
                          {slab.dimensionsFt}
                        </td>
                        <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                          {slab.branchName}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                          {slab.totalSqFt.toLocaleString('en-IN')} sq. ft
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-semibold whitespace-nowrap ${
                            slab.status === 'Available'
                              ? 'text-[#16A34A]'
                              : slab.status === 'Sold'
                                ? 'text-[#DC2626]'
                                : slab.status === 'Reserved'
                                  ? 'text-[#2563EB]'
                                  : 'text-[#D97706]'
                          }`}
                        >
                          {slab.status}
                        </td>
                        <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                          <RowActionMenu
                            ariaLabel={`Actions for slab ${slab.lotNumber}`}
                            onSelect={(mode) => openSlabAction(slab, mode)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      );
    }

  if (section === 'purchase-bills') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">Supplier Purchase Bills</h1>
          <p className="text-[13px] text-[#64748B]">
            Recording a purchase bill adds qty to System Stock (sq. ft, pcs, box, bag, or kg) so you can verify incoming loads against physical yard counts.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreatePurchaseBill({
                supplierName: pbSupplier,
                branchName: pbBranch,
                itemCode: pbItemCode,
                qty: Number(pbQty),
                unit: pbUnit,
                totalInr: Number(pbQty) * 520,
              });
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Record Purchase Bill</span>
            </h2>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Supplier
              </label>
              <select
                value={pbSupplier}
                onChange={(e) => setPbSupplier(e.target.value)}
                className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.suppliers.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Receiving Branch
              </label>
              <select
                value={pbBranch}
                onChange={(e) => setPbBranch(e.target.value)}
                className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.locations.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Product &amp; Size
              </label>
              <select
                value={pbItemCode}
                onChange={(e) => {
                  const found = snapshot.varianceItems.find((i) => i.itemCode === e.target.value);
                  setPbItemCode(e.target.value);
                  if (found) setPbUnit(found.unit);
                }}
                className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.varianceItems.map((i) => (
                  <option key={i.id} value={i.itemCode}>
                    [{i.category}] {i.itemName} — {i.dimensions} ({i.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={pbQty}
                  onChange={(e) => setPbQty(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Unit</label>
                <select
                  value={pbUnit}
                  onChange={(e) => setPbUnit(e.target.value as UnitType)}
                  className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {SHOP_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-[#64748B]">
              Posting adds {pbQty || 0} {pbUnit} to System Stock and recalculates Variance (Physical − System).
            </p>
            <button
              type="submit"
              className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
            >
              Post Purchase Bill &amp; Add System Stock
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
              Purchase Bills ({snapshot.purchaseBills.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-2">Bill No</th>
                    <th className="py-2 px-2">Supplier</th>
                    <th className="py-2 px-2">Product</th>
                    <th className="py-2 px-2">Location</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 pl-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.purchaseBills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-2 font-mono font-medium">{b.billNo}</td>
                      <td className="py-2.5 px-2 text-[#0F172A] font-medium">{b.supplierName}</td>
                      <td className="py-2.5 px-2 text-[#1E293B] font-medium">
                        {b.itemSummary}
                      </td>
                      <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                        {b.branchName}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                        {b.qty.toLocaleString('en-IN')} {b.unit}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                        ₹ {b.totalInr.toLocaleString('en-IN')}
                      </td>
                      <td
                        className={`py-2.5 pl-2 text-right font-medium ${
                          b.status === 'Paid'
                            ? 'text-[#16A34A]'
                            : b.status === 'Pending'
                              ? 'text-[#DC2626]'
                              : 'text-[#D97706]'
                        }`}
                      >
                        {b.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'sales-bills') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">Customer Sales Bills</h1>
          <p className="text-[13px] text-[#64748B]">
            Issuing a sales bill subtracts sold qty from System Stock and updates Physical Stock in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreateSalesBill({
                customerName: sbCustomer,
                branchName: sbBranch,
                itemCode: sbItemCode,
                qty: Number(sbQty),
                unit: sbUnit,
                totalInr: Number(sbQty) * 680,
              });
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Create Sales Invoice</span>
            </h2>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Customer
              </label>
              <select
                value={sbCustomer}
                onChange={(e) => setSbCustomer(e.target.value)}
                className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.customers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Dispatch Branch
              </label>
              <select
                value={sbBranch}
                onChange={(e) => setSbBranch(e.target.value)}
                className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.locations.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Product &amp; Size
              </label>
              <select
                value={sbItemCode}
                onChange={(e) => {
                  const found = snapshot.varianceItems.find((i) => i.itemCode === e.target.value);
                  setSbItemCode(e.target.value);
                  if (found) setSbUnit(found.unit);
                }}
                className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.varianceItems.map((i) => (
                  <option key={i.id} value={i.itemCode}>
                    [{i.category}] {i.itemName} — {i.dimensions} ({i.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={sbQty}
                  onChange={(e) => setSbQty(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Unit</label>
                <select
                  value={sbUnit}
                  onChange={(e) => setSbUnit(e.target.value as UnitType)}
                  className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {SHOP_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-[#64748B]">
              Billing subtracts {sbQty || 0} {sbUnit} from System Stock and updates Physical Stock.
            </p>
            <button
              type="submit"
              className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
            >
              Issue Sales Bill &amp; Deduct Stock
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
              Recent Sales Invoices ({snapshot.salesBills.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-2">Invoice</th>
                    <th className="py-2 px-2">Customer</th>
                    <th className="py-2 px-2">Product</th>
                    <th className="py-2 px-2">Location</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 pl-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.salesBills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-2 font-mono font-medium">{b.invoiceNo}</td>
                      <td className="py-2.5 px-2 text-[#0F172A] font-medium">{b.customerName}</td>
                      <td className="py-2.5 px-2 text-[#1E293B] font-medium">
                        {b.itemSummary}
                      </td>
                      <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                        {b.branchName}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                        {b.qty.toLocaleString('en-IN')} {b.unit}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                        ₹ {b.totalInr.toLocaleString('en-IN')}
                      </td>
                      <td
                        className={`py-2.5 pl-2 text-right font-medium ${
                          b.status === 'Paid'
                            ? 'text-[#16A34A]'
                            : b.status === 'Due'
                              ? 'text-[#DC2626]'
                              : 'text-[#2563EB]'
                        }`}
                      >
                        {b.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'transfers') {
    const selectedSku = snapshot.varianceItems.find((i) => i.itemCode === transferItem);
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">Inter-Branch Transfers</h1>
          <p className="text-[13px] text-[#64748B]">
            Move marble slabs (sq. ft), borders (pcs), and tile boxes (box) between showrooms and yards.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (transferFrom === transferTo) return;
              await onCreateTransfer({
                itemCode: transferItem,
                fromLocation: transferFrom,
                toLocation: transferTo,
                quantity: Number(transferQty),
              });
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-4 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Dispatch Stock Transfer</span>
            </h2>
            <div>
              <label className="block text-[11.5px] font-medium text-[#64748B] mb-1">
                Material SKU &amp; Size
              </label>
              <select
                value={transferItem}
                onChange={(e) => setTransferItem(e.target.value)}
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
              >
                {snapshot.varianceItems.map((i) => (
                  <option key={i.id} value={i.itemCode}>
                    {i.itemCode} — {i.itemName} ({i.dimensions}) · {i.unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11.5px] font-medium text-[#64748B] mb-1">
                  From Branch
                </label>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {snapshot.locations.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-[#64748B] mb-1">
                  To Branch
                </label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {snapshot.locations.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#64748B] mb-1">
                Quantity ({selectedSku?.unit || 'sq. ft'})
              </label>
              <input
                type="number"
                min={1}
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0] tabular-nums"
              />
            </div>
            <button
              type="submit"
              disabled={transferFrom === transferTo}
              className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-[12.5px] font-semibold"
            >
              Create Transfer Manifest
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
              Active &amp; Recent Transfers
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[540px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-3">Transfer ID</th>
                    <th className="py-2 px-3">Stone / Tile</th>
                    <th className="py-2 px-3">Route</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Value</th>
                    <th className="py-2 pl-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                  {snapshot.transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3 font-mono text-[11.5px] font-medium text-[#0F172A]">
                        {tr.transferCode}
                      </td>
                      <td className="py-3 px-3 text-[#1E293B]">{tr.itemName}</td>
                      <td className="py-3 px-3 text-[#334155] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{tr.fromLocation}</span>
                          <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                          <span>{tr.toLocation}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                        {tr.quantity.toLocaleString('en-IN')} {tr.unit}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        ₹ {tr.valueCr.toFixed(2)} Cr
                      </td>
                      <td
                        className={`py-3 pl-3 text-right font-medium whitespace-nowrap ${
                          tr.status === 'In Transit'
                            ? 'text-[#D97706]'
                            : tr.status === 'Delivered'
                              ? 'text-[#16A34A]'
                              : 'text-[#2563EB]'
                        }`}
                      >
                        {tr.status} · {tr.etaLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'customers') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">
            Customers, Builders &amp; Architects
          </h1>
          <p className="text-[13px] text-[#64748B]">
            Track trade buyers, billed volume, and pending invoice balances.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreateCustomer({
                name: custName,
                segment: custSegment,
                phone: custPhone,
                city: custCity,
              });
              setCustName('');
              setCustPhone('');
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Add Customer</span>
            </h2>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Client / Firm Name
              </label>
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Lodha Marble Projects"
                required
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Segment
                </label>
                <select
                  value={custSegment}
                  onChange={(e) => setCustSegment(e.target.value as CustomerRecord['segment'])}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  <option value="Architect">Architect</option>
                  <option value="Builder">Builder</option>
                  <option value="Contractor">Contractor</option>
                  <option value="Retail">Retail</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">City</label>
                <input
                  value={custCity}
                  onChange={(e) => setCustCity(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">Phone</label>
              <input
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="+91 98200 12345"
                required
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
              />
            </div>
            <button
              type="submit"
              className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
            >
              Save Customer
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
              Customer Directory ({snapshot.customers.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 px-2">Segment</th>
                    <th className="py-2 px-2">City &amp; Phone</th>
                    <th className="py-2 px-2 text-right">Total Billed</th>
                    <th className="py-2 pl-2 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-2 font-semibold text-[#0F172A]">{c.name}</td>
                      <td className="py-2.5 px-2 text-[#475569]">{c.segment}</td>
                      <td className="py-2.5 px-2 text-[#64748B]">
                        {c.city} · {c.phone}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        ₹ {c.totalPurchasedInr.toLocaleString('en-IN')}
                      </td>
                      <td
                        className={`py-2.5 pl-2 text-right font-semibold tabular-nums ${
                          c.outstandingInr > 0 ? 'text-[#D97706]' : 'text-[#16A34A]'
                        }`}
                      >
                        ₹ {c.outstandingInr.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'suppliers') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">Quarry &amp; Tile Suppliers</h1>
          <p className="text-[13px] text-[#64748B]">
            Manage marble importers, Kishangarh yards, granite quarries, and tile manufacturers.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreateSupplier({
                name: supName,
                origin: supOrigin,
                specialty: supSpecialty,
                phone: supPhone,
              });
              setSupName('');
              setSupOrigin('');
              setSupPhone('');
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Add Supplier</span>
            </h2>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Supplier Name
              </label>
              <input
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Carrara Stone Exim"
                required
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Origin City
              </label>
              <input
                value={supOrigin}
                onChange={(e) => setSupOrigin(e.target.value)}
                placeholder="Kishangarh, RJ"
                required
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Specialty &amp; Unit
              </label>
              <input
                value={supSpecialty}
                onChange={(e) => setSupSpecialty(e.target.value)}
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Contact Phone
              </label>
              <input
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                placeholder="+91 94140 12345"
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
              />
            </div>
            <button
              type="submit"
              className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
            >
              Save Supplier
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#E5E9F0] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A] mb-3">
              Active Suppliers ({snapshot.suppliers.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-2">Supplier</th>
                    <th className="py-2 px-2">Origin</th>
                    <th className="py-2 px-2">Specialty</th>
                    <th className="py-2 px-2 text-right">Supplied</th>
                    <th className="py-2 pl-2 text-right">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-2 font-semibold text-[#0F172A]">{s.name}</td>
                      <td className="py-2.5 px-2 text-[#475569]">{s.origin}</td>
                      <td className="py-2.5 px-2 text-[#64748B]">{s.specialty}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        ₹ {s.totalSuppliedInr.toLocaleString('en-IN')}
                      </td>
                      <td
                        className={`py-2.5 pl-2 text-right font-semibold tabular-nums ${
                          s.payableInr > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                        }`}
                      >
                        ₹ {s.payableInr.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'branches') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">
            Showrooms, Yards &amp; Godowns
          </h1>
          <p className="text-[13px] text-[#64748B]">
            Inspect sq. ft, pcs, and box inventory balances across each shop branch.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {snapshot.locations.map((loc) => (
            <div
              key={loc.id}
              className="bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-[#64748B]">
                    {loc.type} · {loc.lastAuditAt}
                  </div>
                  <h3 className="text-[16px] font-bold text-[#0F172A] mt-0.5">{loc.name}</h3>
                </div>
                <span className="text-[14px] font-bold text-[#16A34A] tabular-nums">
                  {loc.inventoryAccuracyPct.toFixed(2)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#F1F5F9] text-[12px]">
                <div>
                  <div className="text-[#64748B] text-[11px]">Slabs</div>
                  <div className="font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    {loc.sqftQty.toLocaleString('en-IN')} sq. ft
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B] text-[11px]">Pieces</div>
                  <div className="font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    {loc.pcsQty.toLocaleString('en-IN')} pcs
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B] text-[11px]">Boxes</div>
                  <div className="font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    {loc.boxQty.toLocaleString('en-IN')} box
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectLocation(loc)}
                className="w-full h-9 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 text-[12.5px] font-semibold text-[#2563EB] transition-colors"
              >
                Inspect Branch Stock
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'reports') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">Reports &amp; Exports</h1>
          <p className="text-[13px] text-[#64748B]">
            Download real-time branch valuation, unit-wise stock (sq. ft / pcs / box), and billing summaries.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3">
            <h3 className="text-[15px] font-semibold text-[#0F172A]">
              Branch Stock Valuation &amp; Unit Breakdown CSV
            </h3>
            <p className="text-[12.5px] text-[#64748B]">
              Includes all {snapshot.locations.length} marble showrooms, yards, and godowns with sq. ft, pcs, box counts, and INR valuation.
            </p>
            <button
              type="button"
              onClick={onExportCsv}
              className="h-9 px-4 rounded-lg bg-[#2563EB] text-white text-[12.5px] font-semibold inline-flex items-center gap-2 hover:bg-[#1D4ED8]"
            >
              <Download className="w-4 h-4" />
              <span>Download Branch CSV</span>
            </button>
          </div>
          <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3">
            <h3 className="text-[15px] font-semibold text-[#0F172A]">
              Full Shop Audit Snapshot JSON
            </h3>
            <p className="text-[12.5px] text-[#64748B]">
              Exports complete inventory, slab bundles, purchase bills, sales bills, and customer/supplier ledgers.
            </p>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `marble-shop-audit-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] text-[12.5px] font-semibold inline-flex items-center gap-2 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              <span>Download JSON Snapshot</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

    return (
      <div className="space-y-5 max-w-3xl">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">
            Workspace &amp; Account Settings
          </h1>
          <p className="text-[13px] text-[#64748B]">
            Manage operator authentication, real-time telemetry streaming, and saved drag-and-drop layouts.
          </p>
        </div>

        <div className="bg-white border border-[#E5E9F0] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#FCE7E3] text-[#C84B31] font-bold text-[15px] flex items-center justify-center">
                {user.initials}
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#0F172A]">{user.name}</div>
                <div className="text-[12.5px] text-[#64748B]">
                  {user.email} · {user.role}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="h-9 px-4 rounded-lg border border-rose-200 text-[#DC2626] text-[12.5px] font-medium hover:bg-rose-50"
            >
              Sign Out / Switch User
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E5E9F0] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-[#0F172A]">
                Real-Time Telemetry Stream
              </div>
              <div className="text-[12.5px] text-[#64748B]">
                Subscribe to live Server-Sent Events (SSE) for sq. ft, pcs, and box stock updates every 3.5s.
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleLiveStream}
              className={`h-9 px-4 rounded-lg text-[12.5px] font-semibold border transition-colors ${
                liveStreamEnabled
                  ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]'
                  : 'bg-slate-100 border-slate-200 text-[#475569]'
              }`}
            >
              {liveStreamEnabled ? 'Live Feed: Active' : 'Live Feed: Paused'}
            </button>
          </div>

          <div className="pt-4 border-t border-[#F1F5F9] flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-[#0F172A]">
                Dashboard Widget Layout
              </div>
              <div className="text-[12.5px] text-[#64748B]">
                Restore the default 6-KPI + 8-widget arrangement for your account.
              </div>
            </div>
            <button
              type="button"
              onClick={onResetLayout}
              className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] text-[12.5px] font-medium inline-flex items-center gap-2 hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Default</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderMainSection()}
      <ProductActionModal
        target={actionTarget}
        initialMode={actionMode}
        locations={snapshot.locations}
        history={snapshot.history || []}
        onClose={() => setActionTarget(null)}
        onUpdateProduct={onUpdateProduct}
        onUpdateSlabLot={onUpdateSlabLot}
      />

      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => {
              if (!deletingProduct) setDeleteConfirmItem(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md bg-white rounded-xl border border-[#E5E9F0] shadow-xl p-6 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <img
                src={resolveProductImage(deleteConfirmItem.imageUrl)}
                alt={deleteConfirmItem.itemName}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                }}
                className="w-12 h-12 rounded-lg object-cover border border-[#E5E9F0] bg-slate-50 shrink-0"
              />
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-[#0F172A]">Delete Product?</h3>
                <p className="text-[12.5px] text-[#64748B] mt-0.5">
                  Are you sure you want to permanently delete{' '}
                  <span className="font-semibold text-[#0F172A]">
                    {deleteConfirmItem.itemName}
                  </span>{' '}
                  (<span className="font-mono">{deleteConfirmItem.itemCode}</span> ·{' '}
                  {deleteConfirmItem.dimensions}) from {deleteConfirmItem.locationName}?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
              <button
                type="button"
                disabled={deletingProduct}
                onClick={() => setDeleteConfirmItem(null)}
                className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[12.5px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingProduct}
                onClick={async () => {
                  setDeletingProduct(true);
                  try {
                    await onDeleteProduct(deleteConfirmItem.id);
                    setDeleteConfirmItem(null);
                  } finally {
                    setDeletingProduct(false);
                  }
                }}
                className="h-9 px-4 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingProduct ? 'Deleting...' : 'Delete Product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
