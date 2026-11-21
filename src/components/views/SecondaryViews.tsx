import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Eye,
  Info,
  Layers,
  Package,
  Pencil,
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
  PurchaseBill,
  SalesBill,
  SalesPaymentStatus,
  SlabLot,
  StoneCategory,
  SupplierRecord,
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
import {LocationTableWidget} from '../widgets/LocationTableWidget';
import {ReportsAnalyticsView} from './ReportsAnalyticsView';
import {computeAllBranches, formatInrCompact} from '../../utils/branchMetrics';

interface SecondaryViewsProps {
  section: Exclude<NavSection, 'dashboard'>;
  snapshot: InventorySnapshot;
  user: UserProfile;
  liveStreamEnabled: boolean;
  selectedLocationId: string | null;
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
    lotNumber?: string;
    stoneName: string;
    category: StoneCategory;
    dimensionsFt: string;
    slabCountPcs: number;
    totalSqFt: number;
    thicknessMm: number;
    branchName: string;
    finish: 'Polished' | 'Honed' | 'Leather';
    status: SlabLot['status'];
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
  onToggleSlabEnabled: (slabId: string) => Promise<void>;
  onDeleteSlabLot: (slabId: string) => Promise<void>;
  onCreatePurchaseBill: (payload: {
    billNo: string;
    supplierName: string;
    branchName: string;
    status: PurchaseBill['status'];
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
    }>;
  }) => Promise<void>;
  onUpdatePurchaseBill: (
    billId: string,
    payload: {
      billNo: string;
      supplierName: string;
      branchName: string;
      status: PurchaseBill['status'];
      dateLabel: string;
      dateIso?: string;
      items: Array<{
        itemCode: string;
        qty: number;
        unit: UnitType;
        amountInr: number;
      }>;
    },
  ) => Promise<PurchaseBill>;
  onCreateSalesBill: (payload: {
    invoiceNo: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    branchName: string;
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
      status: SalesPaymentStatus;
    }>;
  }) => Promise<void>;
  onUpdateSalesBill: (
    billId: string,
    payload: {
      invoiceNo: string;
      customerName: string;
      customerPhone: string;
      customerAddress: string;
      branchName: string;
      dateLabel: string;
      dateIso?: string;
      items: Array<{
        itemCode: string;
        qty: number;
        unit: UnitType;
        amountInr: number;
        status: SalesPaymentStatus;
      }>;
    },
  ) => Promise<SalesBill>;
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
  onUpdateSupplier: (
    supplierId: string,
    payload: {
      name: string;
      origin: string;
      specialty: string;
      phone: string;
    },
  ) => Promise<void>;
  onDeleteSupplier: (supplierId: string) => Promise<void>;
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

function calculateAreaSqFtFromDimensions(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  const match = cleaned.match(
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|'|in|inch|inches|"|cm|mm|m)?\s*(?:×|x|\*|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|'|in|inch|inches|"|cm|mm|m)?/,
  );
  if (!match) return null;
  const length = Number(match[1]);
  const width = Number(match[2]);
  if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) {
    return null;
  }
  let area = length * width;
  const unitToken =
    match[3] ||
    (cleaned.includes('mm')
      ? 'mm'
      : cleaned.includes('cm')
        ? 'cm'
        : cleaned.includes('in') || cleaned.includes('"')
          ? 'in'
          : 'ft');
  if (unitToken === 'in' || unitToken === 'inch' || unitToken === 'inches' || unitToken === '"') {
    area = area / 144;
  } else if (unitToken === 'cm') {
    area = area / 929.0304;
  } else if (unitToken === 'mm') {
    area = area / 92903.04;
  } else if (unitToken === 'm') {
    area = area * 10.7639;
  }
  return Number(area.toFixed(2));
}

function formatIsoDateToLabel(isoDate: string): string {
  if (!isoDate) return 'Today';
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});
}

const MONTH_NAME_TO_NUM: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function parseDateLabelToIso(dateLabel?: string, dateIso?: string): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) {
    return dateIso.trim();
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!dateLabel || dateLabel.trim().toLowerCase() === 'today') return todayIso;
  const isoMatch = dateLabel.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateLabel.trim();
  const labelMatch = dateLabel.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (labelMatch) {
    const day = labelMatch[1].padStart(2, '0');
    const month = MONTH_NAME_TO_NUM[labelMatch[2].slice(0, 3).toLowerCase()];
    const year = labelMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }
  const parsed = new Date(dateLabel);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return todayIso;
}

function getBillNoPrefixFromIso(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length === 3 && parts[0].length === 4 && parts[1].length === 2) {
    return `PB-${parts[1]}-${parts[0]}-`;
  }
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `PB-${month}-${now.getFullYear()}-`;
}

function extractBillNoSuffix(billNo: string): string {
  const trimmed = billNo.trim();
  const fullMatch = trimmed.match(/^PB-\d{2}-\d{4}-(.+)$/i);
  if (fullMatch) return fullMatch[1].trim();
  const legacyMatch = trimmed.match(/^PB-\d{4}-(.+)$/i);
  if (legacyMatch) return legacyMatch[1].trim();
  const pbPrefixMatch = trimmed.match(/^PB-(.+)$/i);
  if (pbPrefixMatch) return pbPrefixMatch[1].trim();
  return trimmed;
}

function buildFormattedBillNo(rawInput: string, isoDate: string): string {
  const suffix = extractBillNoSuffix(rawInput);
  return `${getBillNoPrefixFromIso(isoDate)}${suffix}`;
}

function getDisplayBillNo(bill: PurchaseBill): string {
  if (/^PB-\d{2}-\d{4}-.+$/i.test(bill.billNo)) {
    return bill.billNo;
  }
  const iso = parseDateLabelToIso(bill.dateLabel, bill.dateIso);
  return buildFormattedBillNo(bill.billNo, iso);
}

function getPurchaseBillTotal(bill: PurchaseBill): number {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return bill.items.reduce((sum, it) => sum + (Number(it.amountInr) || 0), 0);
  }
  return bill.totalInr;
}

interface PurchaseBillDraftItem {
  id: string;
  itemCode: string;
  qty: string;
  unit: UnitType;
  amountInr: string;
}

interface SalesBillDraftItem {
  id: string;
  itemCode: string;
  qty: string;
  unit: UnitType;
  amountInr: string;
  status: SalesPaymentStatus;
}

function extractInvoiceNoSuffix(raw: string): string {
  return raw.trim().replace(/^INV-/i, '').trim();
}

function formatInvoiceNo(raw: string): string {
  return `INV-${extractInvoiceNoSuffix(raw)}`;
}

function computeSalesBillStatus(
  items: Array<{amountInr: number | string; status: SalesPaymentStatus}>,
): {status: SalesPaymentStatus; paidPct: number} {
  if (!items || items.length === 0) return {status: 'Due', paidPct: 0};
  if (items.every((it) => it.status === 'Paid')) return {status: 'Paid', paidPct: 100};
  if (items.every((it) => it.status === 'Due')) return {status: 'Due', paidPct: 0};
  const totalAmt = items.reduce((sum, it) => sum + Math.max(0, Number(it.amountInr) || 0), 0);
  let paidWeight = 0;
  let totalWeight = 0;
  for (const it of items) {
    const w = totalAmt > 0 ? Math.max(0, Number(it.amountInr) || 0) : 1;
    totalWeight += w;
    if (it.status === 'Paid') paidWeight += w;
    else if (it.status === 'Partially Paid') paidWeight += w * 0.5;
  }
  const paidPct = totalWeight > 0 ? Math.round((paidWeight / totalWeight) * 100) : 0;
  if (paidPct >= 100) return {status: 'Paid', paidPct: 100};
  if (paidPct < 50) return {status: 'Due', paidPct};
  return {status: 'Partially Paid', paidPct};
}

function getSalesBillTotal(bill: SalesBill): number {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return bill.items.reduce((sum, it) => sum + (Number(it.amountInr) || 0), 0);
  }
  return bill.totalInr;
}

function getSalesBillComputedStatus(bill: SalesBill): SalesPaymentStatus {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return computeSalesBillStatus(bill.items).status;
  }
  return bill.status;
}

export function SecondaryViews({
  section,
  snapshot,
  user,
  liveStreamEnabled,
  selectedLocationId,
  onToggleLiveStream,
  onSelectLocation,
  onCreateProduct,
  onUpdateProduct,
  onToggleProductEnabled,
  onDeleteProduct,
  onCreateSlabLot,
  onUpdateSlabLot,
  onToggleSlabEnabled,
  onDeleteSlabLot,
  onCreatePurchaseBill,
  onUpdatePurchaseBill,
  onCreateSalesBill,
  onUpdateSalesBill,
  onCreateTransfer,
  onCreateCustomer,
  onCreateSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
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
  const [slabId, setSlabId] = useState(
    `SL-${String(snapshot.slabs.length + 1).padStart(3, '0')}`,
  );
  const [slabStone, setSlabStone] = useState('Statuario Venato');
  const [slabCat, setSlabCat] = useState<StoneCategory>('Marble');
  const [slabDims, setSlabDims] = useState('10 × 5 ft');
  const [slabThick, setSlabThick] = useState('18');
  const [slabSqft, setSlabSqft] = useState('50');
  const [slabBranch, setSlabBranch] = useState(snapshot.locations[0]?.name || 'Main Showroom');
  const [slabStatus, setSlabStatus] = useState<SlabLot['status']>('In Stock');
  const [slabError, setSlabError] = useState<string | null>(null);

  // Slab toggle & delete confirmation state
  const [togglingSlabId, setTogglingSlabId] = useState<string | null>(null);
  const [deleteConfirmSlab, setDeleteConfirmSlab] = useState<SlabLot | null>(null);
  const [deletingSlab, setDeletingSlab] = useState(false);

  // Purchase bill state
  const createDefaultPbItem = (index = 0): PurchaseBillDraftItem => {
    const pick =
      snapshot.varianceItems[index % Math.max(1, snapshot.varianceItems.length)] ||
      snapshot.varianceItems[0];
    const defaultQty = 100;
    const defaultUnit: UnitType = pick?.unit || 'sq. ft';
    const defaultAmount = defaultQty * (pick?.unitPriceInr || 450);
    return {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemCode: pick?.itemCode || 'MRB-SLB-10X5',
      qty: String(defaultQty),
      unit: defaultUnit,
      amountInr: String(defaultAmount),
    };
  };

  const [pbBillNo, setPbBillNo] = useState(() =>
    String(1108 + snapshot.purchaseBills.length),
  );
  const [pbSupplier, setPbSupplier] = useState(
    snapshot.suppliers[0]?.name || 'Kishangarh Marble Depot',
  );
  const [pbBranch, setPbBranch] = useState(snapshot.locations[0]?.name || 'Main Showroom');
  const [pbDate, setPbDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pbStatus, setPbStatus] = useState<PurchaseBill['status']>('Pending');
  const [pbItems, setPbItems] = useState<PurchaseBillDraftItem[]>(() => [createDefaultPbItem(0)]);
  const [pbError, setPbError] = useState<string | null>(null);
  const [viewPurchaseBill, setViewPurchaseBill] = useState<PurchaseBill | null>(null);
  const [isEditingBill, setIsEditingBill] = useState(false);
  const [editPbBillNo, setEditPbBillNo] = useState('');
  const [editPbSupplier, setEditPbSupplier] = useState('');
  const [editPbBranch, setEditPbBranch] = useState('');
  const [editPbDate, setEditPbDate] = useState('');
  const [editPbStatus, setEditPbStatus] = useState<PurchaseBill['status']>('Pending');
  const [editPbItems, setEditPbItems] = useState<PurchaseBillDraftItem[]>([]);
  const [editPbError, setEditPbError] = useState<string | null>(null);
  const [savingEditBill, setSavingEditBill] = useState(false);

  const startEditPurchaseBill = (bill: PurchaseBill) => {
    const iso = parseDateLabelToIso(bill.dateLabel, bill.dateIso);
    const sourceItems =
      Array.isArray(bill.items) && bill.items.length > 0
        ? bill.items
        : [
            {
              id: `legacy-${bill.id}`,
              itemCode: '',
              itemName: bill.itemSummary,
              dimensions: 'Standard',
              qty: bill.qty,
              unit: bill.unit,
              amountInr: bill.totalInr,
            },
          ];

    const draftItems: PurchaseBillDraftItem[] = sourceItems.map((it, idx) => {
      const matched =
        (it.itemCode &&
          snapshot.varianceItems.find((v) => v.itemCode === it.itemCode)) ||
        snapshot.varianceItems.find(
          (v) => v.itemName.toLowerCase() === it.itemName.toLowerCase(),
        ) ||
        snapshot.varianceItems[0];
      return {
        id: it.id || `edit-${Date.now()}-${idx}`,
        itemCode: matched?.itemCode || it.itemCode || 'MRB-SLB-10X5',
        qty: String(it.qty),
        unit: it.unit,
        amountInr: String(it.amountInr),
      };
    });

    setEditPbBillNo(extractBillNoSuffix(bill.billNo));
    setEditPbSupplier(bill.supplierName);
    setEditPbBranch(bill.branchName);
    setEditPbDate(iso);
    setEditPbStatus(bill.status);
    setEditPbItems(draftItems);
    setEditPbError(null);
    setIsEditingBill(true);
  };

  // Sales bill state
  const createDefaultSbItem = (index = 0): SalesBillDraftItem => {
    const pick =
      snapshot.varianceItems[index % Math.max(1, snapshot.varianceItems.length)] ||
      snapshot.varianceItems[0];
    const defaultQty = 100;
    const defaultUnit: UnitType = pick?.unit || 'sq. ft';
    const defaultAmount = defaultQty * (pick?.unitPriceInr || 680);
    return {
      id: `sb-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemCode: pick?.itemCode || 'MRB-SLB-10X5',
      qty: String(defaultQty),
      unit: defaultUnit,
      amountInr: String(defaultAmount),
      status: 'Paid',
    };
  };

  const [sbInvoiceNo, setSbInvoiceNo] = useState(() =>
    String(8845 + snapshot.salesBills.length),
  );
  const [sbCustomerName, setSbCustomerName] = useState('');
  const [sbPhone, setSbPhone] = useState('');
  const [sbAddress, setSbAddress] = useState('');
  const [sbDate, setSbDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sbBranch, setSbBranch] = useState(snapshot.locations[0]?.name || 'Main Showroom');
  const [sbItems, setSbItems] = useState<SalesBillDraftItem[]>(() => [createDefaultSbItem(0)]);
  const [sbError, setSbError] = useState<string | null>(null);
  const [viewSalesBill, setViewSalesBill] = useState<SalesBill | null>(null);
  const [isEditingSalesBill, setIsEditingSalesBill] = useState(false);
  const [editSbInvoiceNo, setEditSbInvoiceNo] = useState('');
  const [editSbCustomerName, setEditSbCustomerName] = useState('');
  const [editSbPhone, setEditSbPhone] = useState('');
  const [editSbAddress, setEditSbAddress] = useState('');
  const [editSbDate, setEditSbDate] = useState('');
  const [editSbBranch, setEditSbBranch] = useState('');
  const [editSbItems, setEditSbItems] = useState<SalesBillDraftItem[]>([]);
  const [editSbError, setEditSbError] = useState<string | null>(null);
  const [savingEditSalesBill, setSavingEditSalesBill] = useState(false);

  const startEditSalesBill = (bill: SalesBill) => {
    const iso = parseDateLabelToIso(bill.dateLabel, bill.dateIso);
    const sourceItems =
      Array.isArray(bill.items) && bill.items.length > 0
        ? bill.items
        : [
            {
              id: `sb-legacy-${bill.id}`,
              itemCode: '',
              itemName: bill.itemSummary,
              dimensions: 'Standard',
              qty: bill.qty,
              unit: bill.unit,
              amountInr: bill.totalInr,
              status: bill.status,
            },
          ];

    const draftItems: SalesBillDraftItem[] = sourceItems.map((it, idx) => {
      const matched =
        (it.itemCode &&
          snapshot.varianceItems.find((v) => v.itemCode === it.itemCode)) ||
        snapshot.varianceItems.find(
          (v) => v.itemName.toLowerCase() === it.itemName.toLowerCase(),
        ) ||
        snapshot.varianceItems[0];
      return {
        id: it.id || `sb-edit-${Date.now()}-${idx}`,
        itemCode: matched?.itemCode || it.itemCode || 'MRB-SLB-10X5',
        qty: String(it.qty),
        unit: it.unit,
        amountInr: String(it.amountInr),
        status: it.status || 'Paid',
      };
    });

    setEditSbInvoiceNo(extractInvoiceNoSuffix(bill.invoiceNo));
    setEditSbCustomerName(bill.customerName);
    setEditSbPhone(bill.customerPhone || '');
    setEditSbAddress(bill.customerAddress || '');
    setEditSbDate(iso);
    setEditSbBranch(bill.branchName);
    setEditSbItems(draftItems);
    setEditSbError(null);
    setIsEditingSalesBill(true);
  };

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
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [editSupName, setEditSupName] = useState('');
  const [editSupOrigin, setEditSupOrigin] = useState('');
  const [editSupSpecialty, setEditSupSpecialty] = useState('');
  const [editSupPhone, setEditSupPhone] = useState('');
  const [editSupError, setEditSupError] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [deleteConfirmSupplier, setDeleteConfirmSupplier] = useState<SupplierRecord | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState(false);

  const openEditSupplier = (supplier: SupplierRecord) => {
    setEditingSupplier(supplier);
    setEditSupName(supplier.name);
    setEditSupOrigin(supplier.origin);
    setEditSupSpecialty(supplier.specialty);
    setEditSupPhone(supplier.phone || '');
    setEditSupError(null);
  };

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
                {snapshot.slabs.filter((s) => s.status === 'In Stock').length} in stock
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
                      {(['All', 'In Stock', 'Out of Stock'] as const).map(
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
                      {filteredSlabs.map((slab) => {
                        const isDisabled = slab.enabled === false;
                        return (
                          <tr
                            key={slab.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isDisabled ? 'opacity-60' : ''
                            }`}
                          >
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
                              <div>
                                {slab.stoneName} ·{' '}
                                <span className="text-[#64748B]">{slab.thicknessMm}mm</span>
                              </div>
                              {isDisabled && (
                                <div className="text-[10.5px] font-medium text-[#94A3B8]">
                                  Disabled
                                </div>
                              )}
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
                                slab.status === 'In Stock' ? 'text-[#16A34A]' : 'text-[#DC2626]'
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
                        );
                      })}
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
                setSlabError(null);
                const parsedArea =
                  calculateAreaSqFtFromDimensions(slabDims) ?? Number(slabSqft);
                if (!parsedArea || parsedArea <= 0) {
                  setSlabError(
                    'Enter valid dimensions (e.g. 10 × 5 ft) to calculate Area (sq. ft).',
                  );
                  return;
                }
                try {
                  await onCreateSlabLot({
                    lotNumber: slabId.trim() || undefined,
                    stoneName: slabStone,
                    category: slabCat,
                    dimensionsFt: slabDims,
                    slabCountPcs: 1,
                    totalSqFt: parsedArea,
                    thicknessMm: Math.max(1, Number(slabThick) || 18),
                    branchName: slabBranch,
                    finish: 'Polished',
                    status: slabStatus,
                  });
                  setSlabId(`SL-${String(snapshot.slabs.length + 2).padStart(3, '0')}`);
                } catch (err) {
                  setSlabError(
                    err instanceof Error ? err.message : 'Unable to register slab record',
                  );
                }
              }}
              className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
            >
              <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#2563EB]" />
                <span>Register New Slab</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Slab ID
                  </label>
                  <input
                    value={slabId}
                    onChange={(e) => setSlabId(e.target.value)}
                    placeholder="e.g. SL-007"
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Category
                  </label>
                  <select
                    value={slabCat}
                    onChange={(e) => setSlabCat(e.target.value as StoneCategory)}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    {SHOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Product
                </label>
                <input
                  value={slabStone}
                  onChange={(e) => setSlabStone(e.target.value)}
                  placeholder="e.g. Italian Marble"
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                  required
                />
                {slabStone.trim() && (
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    Display:{' '}
                    <span className="font-medium text-[#0F172A]">
                      {slabStone.trim()} · {Math.max(1, Number(slabThick) || 18)}mm
                    </span>
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Dimensions
                  </label>
                  <input
                    value={slabDims}
                    onChange={(e) => {
                      const nextDims = e.target.value;
                      setSlabDims(nextDims);
                      const computedArea = calculateAreaSqFtFromDimensions(nextDims);
                      setSlabSqft(computedArea !== null ? String(computedArea) : '');
                    }}
                    placeholder="e.g. 10 × 5 ft"
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Thickness (mm)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={slabThick}
                    onChange={(e) => setSlabThick(e.target.value)}
                    placeholder="e.g. 18"
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] tabular-nums"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Area (sq. ft) <span className="text-[#2563EB] font-normal">· Auto</span>
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={slabSqft}
                    readOnly
                    placeholder="Auto from dimensions"
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] font-semibold tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                    Status
                  </label>
                  <select
                    value={slabStatus}
                    onChange={(e) => setSlabStatus(e.target.value as SlabLot['status'])}
                    className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="In Stock">In Stock</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Branch
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
              {slabError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                  {slabError}
                </div>
              )}
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
                <table className="w-full text-left border-collapse min-w-[780px]">
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
                    {snapshot.slabs.map((slab) => {
                      const isEnabled = slab.enabled !== false;
                      const isToggling = togglingSlabId === slab.id;
                      return (
                        <tr
                          key={slab.id}
                          className={`transition-colors ${
                            isEnabled ? 'hover:bg-slate-50/80' : 'bg-slate-50/60'
                          }`}
                        >
                          <td
                            className={`py-2.5 pr-2 font-mono font-semibold whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#0F172A]'
                            }`}
                          >
                            {slab.lotNumber}
                          </td>
                          <td
                            className={`py-2.5 px-2 font-medium whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8] line-through' : 'text-[#0F172A]'
                            }`}
                          >
                            {slab.stoneName} ·{' '}
                            <span className={!isEnabled ? 'text-[#94A3B8]' : 'text-[#64748B]'}>
                              {slab.thicknessMm}mm
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-2 whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#334155]'
                            }`}
                          >
                            {slab.category}
                          </td>
                          <td
                            className={`py-2.5 px-2 font-mono tabular-nums whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#475569]'
                            }`}
                          >
                            {slab.dimensionsFt}
                          </td>
                          <td
                            className={`py-2.5 px-2 whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : 'text-[#475569]'
                            }`}
                          >
                            {slab.branchName}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap ${
                              !isEnabled ? 'text-[#94A3B8]' : ''
                            }`}
                          >
                            {slab.totalSqFt.toLocaleString('en-IN')} sq. ft
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-semibold whitespace-nowrap ${
                              !isEnabled
                                ? 'text-[#94A3B8]'
                                : slab.status === 'In Stock'
                                  ? 'text-[#16A34A]'
                                  : 'text-[#DC2626]'
                            }`}
                          >
                            {slab.status}
                          </td>
                          <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2.5">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isEnabled}
                                aria-label={`${isEnabled ? 'Disable' : 'Enable'} slab ${slab.lotNumber}`}
                                title={
                                  isEnabled
                                    ? 'Enabled — click to disable'
                                    : 'Disabled — click to enable'
                                }
                                disabled={isToggling}
                                onClick={async () => {
                                  setTogglingSlabId(slab.id);
                                  try {
                                    await onToggleSlabEnabled(slab.id);
                                  } finally {
                                    setTogglingSlabId(null);
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
                                aria-label={`Delete slab ${slab.lotNumber}`}
                                title={`Delete ${slab.lotNumber}`}
                                onClick={() => setDeleteConfirmSlab(slab)}
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

  if (section === 'purchase-bills') {
    const pbCalculatedTotal = pbItems.reduce(
      (sum, row) => sum + Math.max(0, Number(row.amountInr) || 0),
      0,
    );

    const updatePbItem = (
      id: string,
      updater: (row: PurchaseBillDraftItem) => PurchaseBillDraftItem,
    ) => {
      setPbItems((prev) => prev.map((row) => (row.id === id ? updater(row) : row)));
    };

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
              setPbError(null);
              if (!pbBillNo.trim()) {
                setPbError('Please enter a Bill No.');
                return;
              }
              if (pbItems.length === 0) {
                setPbError('Add at least one product item to record a purchase bill.');
                return;
              }
              const parsedItems = pbItems.map((row) => ({
                itemCode: row.itemCode,
                qty: Number(row.qty),
                unit: row.unit,
                amountInr: Number(row.amountInr),
              }));
              if (parsedItems.some((it) => !it.itemCode || !it.qty || it.qty <= 0 || it.amountInr < 0)) {
                setPbError('Every item card must have a product, positive qty, and valid amount.');
                return;
              }
              try {
                await onCreatePurchaseBill({
                  billNo: buildFormattedBillNo(pbBillNo, pbDate),
                  supplierName: pbSupplier,
                  branchName: pbBranch,
                  status: pbStatus,
                  dateLabel: formatIsoDateToLabel(pbDate),
                  dateIso: pbDate,
                  items: parsedItems,
                });
                const numericSuffix = Number(extractBillNoSuffix(pbBillNo));
                if (!Number.isNaN(numericSuffix) && Number.isFinite(numericSuffix)) {
                  setPbBillNo(String(numericSuffix + 1));
                } else {
                  setPbBillNo('');
                }
                setPbItems([createDefaultPbItem(0)]);
              } catch (err) {
                setPbError(err instanceof Error ? err.message : 'Unable to post purchase bill.');
              }
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Record Purchase Bill</span>
            </h2>
            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Bill No
              </label>
              <div className="flex items-stretch rounded-lg border border-[#E2E8F0] overflow-hidden focus-within:border-blue-500 bg-white">
                <span className="px-2.5 inline-flex items-center bg-[#F8FAFC] border-r border-[#E2E8F0] text-[12px] font-mono font-semibold text-[#2563EB] select-none whitespace-nowrap">
                  {getBillNoPrefixFromIso(pbDate)}
                </span>
                <input
                  type="text"
                  value={pbBillNo}
                  onChange={(e) => setPbBillNo(e.target.value)}
                  placeholder="e.g. 1108"
                  className="w-full h-9 px-2.5 text-[12.5px] font-mono text-[#0F172A] focus:outline-none"
                  required
                />
              </div>
              <p className="mt-1 text-[10.5px] text-[#64748B] font-mono">
                Bill No in table:{' '}
                <span className="font-semibold text-[#0F172A]">
                  {pbBillNo.trim()
                    ? buildFormattedBillNo(pbBillNo, pbDate)
                    : `${getBillNoPrefixFromIso(pbDate)}...`}
                </span>
              </p>
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Date</label>
                <input
                  type="date"
                  value={pbDate}
                  onChange={(e) => setPbDate(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Status</label>
                <select
                  value={pbStatus}
                  onChange={(e) => setPbStatus(e.target.value as PurchaseBill['status'])}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-[#0F172A]">
                  Bill Items ({pbItems.length})
                </span>
                <span className="text-[11px] text-[#64748B]">Add one or more products</span>
              </div>

              {pbItems.map((row, idx) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#2563EB] uppercase tracking-wide">
                      Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      disabled={pbItems.length <= 1}
                      aria-label={`Delete item ${idx + 1}`}
                      title={
                        pbItems.length <= 1
                          ? 'At least one item is required'
                          : `Remove item #${idx + 1}`
                      }
                      onClick={() =>
                        setPbItems((prev) =>
                          prev.length > 1 ? prev.filter((item) => item.id !== row.id) : prev,
                        )
                      }
                      className="p-1 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#64748B]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-[11px] font-medium text-[#64748B]">
                        Product &amp; Size
                      </label>
                      {row.itemCode && (
                        <span className="text-[10.5px] font-mono font-semibold text-[#2563EB]">
                          {row.itemCode}
                        </span>
                      )}
                    </div>
                    <select
                      value={row.itemCode}
                      onChange={(e) => {
                        const nextCode = e.target.value;
                        const found = snapshot.varianceItems.find(
                          (i) => i.itemCode === nextCode,
                        );
                        updatePbItem(row.id, (prev) => {
                          const qtyNum = Number(prev.qty) || 0;
                          return {
                            ...prev,
                            itemCode: nextCode,
                            unit: found ? found.unit : prev.unit,
                            amountInr: found
                              ? String(Math.round(qtyNum * found.unitPriceInr))
                              : prev.amountInr,
                          };
                        });
                      }}
                      className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                    >
                      {snapshot.varianceItems.map((i) => (
                        <option key={i.id} value={i.itemCode}>
                          {i.itemCode} — {i.itemName} ({i.dimensions}) · {i.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) => {
                          const nextQty = e.target.value;
                          const found = snapshot.varianceItems.find(
                            (i) => i.itemCode === row.itemCode,
                          );
                          updatePbItem(row.id, (prev) => ({
                            ...prev,
                            qty: nextQty,
                            amountInr:
                              found && Number(nextQty) > 0
                                ? String(Math.round(Number(nextQty) * found.unitPriceInr))
                                : prev.amountInr,
                          }));
                        }}
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Unit
                      </label>
                      <select
                        value={row.unit}
                        onChange={(e) =>
                          updatePbItem(row.id, (prev) => ({
                            ...prev,
                            unit: e.target.value as UnitType,
                          }))
                        }
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                      >
                        {SHOP_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={row.amountInr}
                        onChange={(e) =>
                          updatePbItem(row.id, (prev) => ({
                            ...prev,
                            amountInr: e.target.value,
                          }))
                        }
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setPbItems((prev) => [...prev, createDefaultPbItem(prev.length)])
                }
                className="w-full h-9 rounded-lg border border-dashed border-[#2563EB]/50 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF] text-[#1D63ED] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Item</span>
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Total Bill Amount (₹) <span className="text-[#2563EB] font-normal">· Auto</span>
              </label>
              <input
                type="text"
                readOnly
                value={`₹ ${pbCalculatedTotal.toLocaleString('en-IN')}`}
                className="w-full h-9 px-3 text-[13px] font-bold text-[#0F172A] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] tabular-nums"
              />
            </div>

            {pbError && (
              <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                {pbError}
              </div>
            )}

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
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Supplier</th>
                    <th className="py-2 px-2">Location</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right">Status</th>
                    <th className="py-2 pl-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.purchaseBills.map((b) => {
                    const totalAmt = getPurchaseBillTotal(b);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-2 font-mono font-medium whitespace-nowrap">
                          {getDisplayBillNo(b)}
                        </td>
                        <td className="py-2.5 px-2 text-[#64748B] whitespace-nowrap">
                          {b.dateLabel}
                        </td>
                        <td className="py-2.5 px-2 text-[#0F172A] font-medium">
                          {b.supplierName}
                        </td>
                        <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                          {b.branchName}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                          ₹ {totalAmt.toLocaleString('en-IN')}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-medium whitespace-nowrap ${
                            b.status === 'Paid'
                              ? 'text-[#16A34A]'
                              : b.status === 'Pending'
                                ? 'text-[#DC2626]'
                                : 'text-[#D97706]'
                          }`}
                        >
                          {b.status}
                        </td>
                        <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingBill(false);
                              setEditPbError(null);
                              setViewPurchaseBill(b);
                            }}
                            className="h-7 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#EEF4FF] hover:border-blue-200 hover:text-[#1D63ED] text-[#334155] text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Bill</span>
                          </button>
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

  if (section === 'sales-bills') {
    const sbCalculatedTotal = sbItems.reduce(
      (sum, row) => sum + Math.max(0, Number(row.amountInr) || 0),
      0,
    );
    const sbStatusPreview = computeSalesBillStatus(sbItems);

    const updateSbItem = (
      id: string,
      updater: (row: SalesBillDraftItem) => SalesBillDraftItem,
    ) => {
      setSbItems((prev) => prev.map((row) => (row.id === id ? updater(row) : row)));
    };

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
              setSbError(null);
              if (!sbInvoiceNo.trim()) {
                setSbError('Please enter an Invoice No.');
                return;
              }
              if (!sbCustomerName.trim()) {
                setSbError('Please enter the Customer Name.');
                return;
              }
              if (sbItems.length === 0) {
                setSbError('Add at least one item to issue a sales invoice.');
                return;
              }
              const parsedItems = sbItems.map((row) => ({
                itemCode: row.itemCode,
                qty: Number(row.qty),
                unit: row.unit,
                amountInr: Number(row.amountInr),
                status: row.status,
              }));
              if (
                parsedItems.some(
                  (it) => !it.itemCode || !it.qty || it.qty <= 0 || it.amountInr < 0,
                )
              ) {
                setSbError(
                  'Every item card must have a product, positive qty, and valid amount.',
                );
                return;
              }
              try {
                await onCreateSalesBill({
                  invoiceNo: formatInvoiceNo(sbInvoiceNo),
                  customerName: sbCustomerName.trim(),
                  customerPhone: sbPhone.trim(),
                  customerAddress: sbAddress.trim(),
                  branchName: sbBranch,
                  dateLabel: formatIsoDateToLabel(sbDate),
                  dateIso: sbDate,
                  items: parsedItems,
                });
                const numSuffix = Number(extractInvoiceNoSuffix(sbInvoiceNo));
                if (!Number.isNaN(numSuffix) && Number.isFinite(numSuffix)) {
                  setSbInvoiceNo(String(numSuffix + 1));
                } else {
                  setSbInvoiceNo('');
                }
                setSbCustomerName('');
                setSbPhone('');
                setSbAddress('');
                setSbItems([createDefaultSbItem(0)]);
              } catch (err) {
                setSbError(
                  err instanceof Error ? err.message : 'Unable to issue sales invoice.',
                );
              }
            }}
            className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h2 className="text-[14px] font-semibold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              <span>Create Sales Invoice</span>
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Invoice No
                </label>
                <div className="flex items-stretch rounded-lg border border-[#E2E8F0] overflow-hidden focus-within:border-blue-500 bg-white">
                  <span className="px-2 inline-flex items-center bg-[#F8FAFC] border-r border-[#E2E8F0] text-[12px] font-mono font-semibold text-[#2563EB] select-none whitespace-nowrap">
                    INV-
                  </span>
                  <input
                    type="text"
                    value={sbInvoiceNo}
                    onChange={(e) => setSbInvoiceNo(e.target.value)}
                    placeholder="8845"
                    className="w-full h-9 px-2 text-[12.5px] font-mono text-[#0F172A] focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">Date</label>
                <input
                  type="date"
                  value={sbDate}
                  onChange={(e) => setSbDate(e.target.value)}
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={sbCustomerName}
                onChange={(e) => setSbCustomerName(e.target.value)}
                placeholder="Enter customer or firm name"
                className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={sbPhone}
                  onChange={(e) => setSbPhone(e.target.value)}
                  placeholder="+91 98200 12345"
                  className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Dispatch Branch
                </label>
                <select
                  value={sbBranch}
                  onChange={(e) => setSbBranch(e.target.value)}
                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                >
                  {snapshot.locations.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] p-3 space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#334155]">
                Customer Address
              </label>
              <textarea
                rows={2}
                value={sbAddress}
                onChange={(e) => setSbAddress(e.target.value)}
                placeholder="Site / billing street address, locality, city..."
                className="w-full px-2.5 py-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-[#0F172A]">
                  Invoice Items ({sbItems.length})
                </span>
                <span className="text-[11px] text-[#64748B]">Set payment status per item</span>
              </div>

              {sbItems.map((row, idx) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#2563EB] uppercase tracking-wide">
                      Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      disabled={sbItems.length <= 1}
                      aria-label={`Delete invoice item ${idx + 1}`}
                      title={
                        sbItems.length <= 1
                          ? 'At least one item is required'
                          : `Remove item #${idx + 1}`
                      }
                      onClick={() =>
                        setSbItems((prev) =>
                          prev.length > 1 ? prev.filter((item) => item.id !== row.id) : prev,
                        )
                      }
                      className="p-1 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#64748B]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-[11px] font-medium text-[#64748B]">
                        Product &amp; Size
                      </label>
                      {row.itemCode && (
                        <span className="text-[10.5px] font-mono font-semibold text-[#2563EB]">
                          {row.itemCode}
                        </span>
                      )}
                    </div>
                    <select
                      value={row.itemCode}
                      onChange={(e) => {
                        const nextCode = e.target.value;
                        const found = snapshot.varianceItems.find(
                          (i) => i.itemCode === nextCode,
                        );
                        updateSbItem(row.id, (prev) => {
                          const qtyNum = Number(prev.qty) || 0;
                          return {
                            ...prev,
                            itemCode: nextCode,
                            unit: found ? found.unit : prev.unit,
                            amountInr: found
                              ? String(Math.round(qtyNum * found.unitPriceInr))
                              : prev.amountInr,
                          };
                        });
                      }}
                      className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                    >
                      {snapshot.varianceItems.map((i) => (
                        <option key={i.id} value={i.itemCode}>
                          {i.itemCode} — {i.itemName} ({i.dimensions}) · {i.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) => {
                          const nextQty = e.target.value;
                          const found = snapshot.varianceItems.find(
                            (i) => i.itemCode === row.itemCode,
                          );
                          updateSbItem(row.id, (prev) => ({
                            ...prev,
                            qty: nextQty,
                            amountInr:
                              found && Number(nextQty) > 0
                                ? String(Math.round(Number(nextQty) * found.unitPriceInr))
                                : prev.amountInr,
                          }));
                        }}
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Unit
                      </label>
                      <select
                        value={row.unit}
                        onChange={(e) =>
                          updateSbItem(row.id, (prev) => ({
                            ...prev,
                            unit: e.target.value as UnitType,
                          }))
                        }
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                      >
                        {SHOP_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={row.amountInr}
                        onChange={(e) =>
                          updateSbItem(row.id, (prev) => ({
                            ...prev,
                            amountInr: e.target.value,
                          }))
                        }
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Status
                      </label>
                      <select
                        value={row.status}
                        onChange={(e) =>
                          updateSbItem(row.id, (prev) => ({
                            ...prev,
                            status: e.target.value as SalesPaymentStatus,
                          }))
                        }
                        className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                      >
                        <option value="Paid">Paid</option>
                        <option value="Partially Paid">Partially Paid</option>
                        <option value="Due">Due</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setSbItems((prev) => [...prev, createDefaultSbItem(prev.length)])
                }
                className="w-full h-9 rounded-lg border border-dashed border-[#2563EB]/50 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF] text-[#1D63ED] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Item</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Final Amount <span className="text-[#2563EB] font-normal">· Auto</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={`₹ ${sbCalculatedTotal.toLocaleString('en-IN')}`}
                  className="w-full h-9 px-2.5 text-[12.5px] font-bold text-[#0F172A] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Bill Status <span className="text-[#2563EB] font-normal">· {sbStatusPreview.paidPct}% paid</span>
                </label>
                <div
                  className={`w-full h-9 px-2.5 text-[12.5px] font-semibold rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] flex items-center ${
                    sbStatusPreview.status === 'Paid'
                      ? 'text-[#16A34A]'
                      : sbStatusPreview.status === 'Due'
                        ? 'text-[#DC2626]'
                        : 'text-[#D97706]'
                  }`}
                >
                  {sbStatusPreview.status}
                </div>
              </div>
            </div>

            {sbError && (
              <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                {sbError}
              </div>
            )}

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
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Customer</th>
                    <th className="py-2 px-2">Location</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right">Status</th>
                    <th className="py-2 pl-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.salesBills.map((b) => {
                    const totalAmt = getSalesBillTotal(b);
                    const computedStatus = getSalesBillComputedStatus(b);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-2 font-mono font-medium whitespace-nowrap">
                          {formatInvoiceNo(b.invoiceNo)}
                        </td>
                        <td className="py-2.5 px-2 text-[#64748B] whitespace-nowrap">
                          {b.dateLabel}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="text-[#0F172A] font-medium">{b.customerName}</div>
                          {b.customerPhone && (
                            <div className="text-[11px] text-[#64748B]">{b.customerPhone}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                          {b.branchName}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                          ₹ {totalAmt.toLocaleString('en-IN')}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-medium whitespace-nowrap ${
                            computedStatus === 'Paid'
                              ? 'text-[#16A34A]'
                              : computedStatus === 'Due'
                                ? 'text-[#DC2626]'
                                : 'text-[#D97706]'
                          }`}
                        >
                          {computedStatus}
                        </td>
                        <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingSalesBill(false);
                              setEditSbError(null);
                              setViewSalesBill(b);
                            }}
                            className="h-7 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#EEF4FF] hover:border-blue-200 hover:text-[#1D63ED] text-[#334155] text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Bill</span>
                          </button>
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
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-2">Supplier</th>
                    <th className="py-2 px-2">Origin</th>
                    <th className="py-2 px-2">Phone Number</th>
                    <th className="py-2 px-2">Specialty</th>
                    <th className="py-2 px-2 text-right">Supplied</th>
                    <th className="py-2 px-2 text-right">Payable</th>
                    <th className="py-2 pl-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {snapshot.suppliers.map((s) => {
                    const supplierKey = s.name.trim().toLowerCase();
                    const matchingBills = snapshot.purchaseBills.filter(
                      (b) => b.supplierName.trim().toLowerCase() === supplierKey,
                    );
                    const suppliedTotal = matchingBills.reduce(
                      (sum, b) => sum + getPurchaseBillTotal(b),
                      0,
                    );
                    let payableTotal = 0;
                    let paidCount = 0;
                    let dueCount = 0;
                    let partialCount = 0;
                    for (const b of matchingBills) {
                      const amt = getPurchaseBillTotal(b);
                      if (b.status === 'Paid') {
                        paidCount += 1;
                      } else if (b.status === 'Pending') {
                        dueCount += 1;
                        payableTotal += amt;
                      } else {
                        partialCount += 1;
                        payableTotal += Math.round(amt * 0.5);
                      }
                    }

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-2 font-semibold text-[#0F172A]">{s.name}</td>
                        <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">{s.origin}</td>
                        <td className="py-2.5 px-2 text-[#334155] font-mono text-[11.5px] whitespace-nowrap">
                          {s.phone || '—'}
                        </td>
                        <td className="py-2.5 px-2 text-[#64748B]">{s.specialty}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-[#0F172A]">
                            ₹ {suppliedTotal.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10.5px] text-[#64748B]">
                            {matchingBills.length} bill{matchingBills.length === 1 ? '' : 's'}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                          <div
                            className={`font-semibold ${
                              payableTotal > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                            }`}
                          >
                            ₹ {payableTotal.toLocaleString('en-IN')}
                          </div>
                          {matchingBills.length > 0 && (
                            <div className="text-[10.5px] text-[#64748B]">
                              {[
                                paidCount > 0 ? `${paidCount} Paid` : null,
                                partialCount > 0 ? `${partialCount} Partial` : null,
                                dueCount > 0 ? `${dueCount} Due` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditSupplier(s)}
                              aria-label={`Edit supplier ${s.name}`}
                              className="h-7 px-2 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#EEF4FF] hover:border-blue-200 hover:text-[#1D63ED] text-[#334155] text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmSupplier(s)}
                              aria-label={`Delete supplier ${s.name}`}
                              className="h-7 px-2 rounded-lg border border-[#E2E8F0] bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-[#DC2626] text-[#64748B] text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
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

  if (section === 'branches') {
    const branchBreakdowns = computeAllBranches(snapshot);
    const computedLocations = branchBreakdowns.map((b) => b.location);

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0F172A]">
            Showrooms, Yards &amp; Godowns
          </h1>
          <p className="text-[13px] text-[#64748B]">
            Inspect sq. ft, pcs, box stock balances, and valuation automatically calculated from Products, Slabs, Purchase Bills, and Sales Bills.
          </p>
        </div>

        <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold text-[#0F172A]">
                Inventory by Branch (sq. ft · pcs · box)
              </h2>
              <p className="text-[12px] text-[#64748B]">
                Values auto-sync live from Active Shop Products, In-Stock Slabs, Purchase Bills (+), and Sales Bills (−). Click View to inspect the breakdown.
              </p>
            </div>
          </div>

          <LocationTableWidget
            locations={computedLocations}
            selectedLocationId={selectedLocationId}
            onViewLocation={onSelectLocation}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branchBreakdowns.map((entry) => {
            const loc = entry.location;
            return (
              <div
                key={loc.id}
                className="bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-[#64748B]">
                      {loc.type} · {formatInrCompact(entry.net.valueInr)}
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

                <div className="text-[11px] text-[#64748B] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span>{entry.sources.products.count} products</span>
                  <span>·</span>
                  <span>{entry.sources.slabs.inStockCount} slabs</span>
                  <span>·</span>
                  <span>{entry.sources.purchases.count} purchase bills</span>
                  <span>·</span>
                  <span>{entry.sources.sales.count} sales bills</span>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectLocation(loc)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 text-[12.5px] font-semibold text-[#2563EB] transition-colors"
                >
                  Inspect Branch Stock
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (section === 'reports') {
    return (
      <ReportsAnalyticsView
        snapshot={snapshot}
        onSelectLocation={onSelectLocation}
        onExportCsv={onExportCsv}
      />
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

      {deleteConfirmSlab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => {
              if (!deletingSlab) setDeleteConfirmSlab(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md bg-white rounded-xl border border-[#E5E9F0] shadow-xl p-6 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <img
                src={resolveProductImage(deleteConfirmSlab.imageUrl)}
                alt={deleteConfirmSlab.stoneName}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                }}
                className="w-12 h-12 rounded-lg object-cover border border-[#E5E9F0] bg-slate-50 shrink-0"
              />
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-[#0F172A]">Delete Slab Record?</h3>
                <p className="text-[12.5px] text-[#64748B] mt-0.5">
                  Are you sure you want to permanently delete slab{' '}
                  <span className="font-mono font-semibold text-[#0F172A]">
                    {deleteConfirmSlab.lotNumber}
                  </span>{' '}
                  ({deleteConfirmSlab.stoneName} · {deleteConfirmSlab.dimensionsFt}) from{' '}
                  {deleteConfirmSlab.branchName}?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
              <button
                type="button"
                disabled={deletingSlab}
                onClick={() => setDeleteConfirmSlab(null)}
                className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[12.5px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingSlab}
                onClick={async () => {
                  setDeletingSlab(true);
                  try {
                    await onDeleteSlabLot(deleteConfirmSlab.id);
                    setDeleteConfirmSlab(null);
                  } finally {
                    setDeletingSlab(false);
                  }
                }}
                className="h-9 px-4 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingSlab ? 'Deleting...' : 'Delete Slab'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewPurchaseBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => {
              if (!savingEditBill) {
                setIsEditingBill(false);
                setViewPurchaseBill(null);
              }
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl bg-white rounded-xl border border-[#E5E9F0] shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[#E5E9F0] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <span className="font-mono font-semibold text-[#2563EB]">
                    {isEditingBill
                      ? editPbBillNo.trim()
                        ? buildFormattedBillNo(editPbBillNo, editPbDate)
                        : `${getBillNoPrefixFromIso(editPbDate)}...`
                      : getDisplayBillNo(viewPurchaseBill)}
                  </span>
                  <span className="text-[#CBD5E1]">·</span>
                  <span className="text-[#64748B]">
                    {isEditingBill
                      ? formatIsoDateToLabel(editPbDate)
                      : viewPurchaseBill.dateLabel}
                  </span>
                  <span className="text-[#CBD5E1]">·</span>
                  <span
                    className={`font-semibold ${
                      (isEditingBill ? editPbStatus : viewPurchaseBill.status) === 'Paid'
                        ? 'text-[#16A34A]'
                        : (isEditingBill ? editPbStatus : viewPurchaseBill.status) === 'Pending'
                          ? 'text-[#DC2626]'
                          : 'text-[#D97706]'
                    }`}
                  >
                    {isEditingBill ? editPbStatus : viewPurchaseBill.status}
                  </span>
                </div>
                <h3 className="text-[17px] font-bold text-[#0F172A] mt-0.5 truncate">
                  {isEditingBill ? 'Edit Purchase Bill' : viewPurchaseBill.supplierName}
                </h3>
                <p className="text-[12px] text-[#64748B]">
                  {isEditingBill
                    ? 'Update bill details, add or remove items, and save changes.'
                    : `Receiving Branch: ${viewPurchaseBill.branchName}`}
                </p>
              </div>
              <button
                type="button"
                disabled={savingEditBill}
                onClick={() => {
                  setIsEditingBill(false);
                  setViewPurchaseBill(null);
                }}
                aria-label="Close purchase bill modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditingBill ? (
              (() => {
                const editCalculatedTotal = editPbItems.reduce(
                  (sum, row) => sum + Math.max(0, Number(row.amountInr) || 0),
                  0,
                );
                const updateEditPbItem = (
                  id: string,
                  updater: (row: PurchaseBillDraftItem) => PurchaseBillDraftItem,
                ) => {
                  setEditPbItems((prev) =>
                    prev.map((row) => (row.id === id ? updater(row) : row)),
                  );
                };

                return (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setEditPbError(null);
                      if (!editPbBillNo.trim()) {
                        setEditPbError('Please enter a Bill No.');
                        return;
                      }
                      if (editPbItems.length === 0) {
                        setEditPbError('Add at least one item to save the purchase bill.');
                        return;
                      }
                      const parsedItems = editPbItems.map((row) => ({
                        itemCode: row.itemCode,
                        qty: Number(row.qty),
                        unit: row.unit,
                        amountInr: Number(row.amountInr),
                      }));
                      if (
                        parsedItems.some(
                          (it) => !it.itemCode || !it.qty || it.qty <= 0 || it.amountInr < 0,
                        )
                      ) {
                        setEditPbError(
                          'Every item card must have a product, positive qty, and valid amount.',
                        );
                        return;
                      }
                      setSavingEditBill(true);
                      try {
                        const updated = await onUpdatePurchaseBill(viewPurchaseBill.id, {
                          billNo: buildFormattedBillNo(editPbBillNo, editPbDate),
                          supplierName: editPbSupplier,
                          branchName: editPbBranch,
                          status: editPbStatus,
                          dateLabel: formatIsoDateToLabel(editPbDate),
                          dateIso: editPbDate,
                          items: parsedItems,
                        });
                        setViewPurchaseBill(updated);
                        setIsEditingBill(false);
                      } catch (err) {
                        setEditPbError(
                          err instanceof Error ? err.message : 'Unable to update purchase bill.',
                        );
                      } finally {
                        setSavingEditBill(false);
                      }
                    }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    <div className="p-6 overflow-y-auto flex-1 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Bill No
                          </label>
                          <div className="flex items-stretch rounded-lg border border-[#E2E8F0] overflow-hidden focus-within:border-blue-500 bg-white">
                            <span className="px-2.5 inline-flex items-center bg-[#F8FAFC] border-r border-[#E2E8F0] text-[12px] font-mono font-semibold text-[#2563EB] select-none whitespace-nowrap">
                              {getBillNoPrefixFromIso(editPbDate)}
                            </span>
                            <input
                              type="text"
                              value={editPbBillNo}
                              onChange={(e) => setEditPbBillNo(e.target.value)}
                              className="w-full h-9 px-2.5 text-[12.5px] font-mono text-[#0F172A] focus:outline-none"
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                              Date
                            </label>
                            <input
                              type="date"
                              value={editPbDate}
                              onChange={(e) => setEditPbDate(e.target.value)}
                              className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                              Status
                            </label>
                            <select
                              value={editPbStatus}
                              onChange={(e) =>
                                setEditPbStatus(e.target.value as PurchaseBill['status'])
                              }
                              className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                            >
                              <option value="Paid">Paid</option>
                              <option value="Pending">Pending</option>
                              <option value="Partial">Partial</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Supplier
                          </label>
                          <select
                            value={editPbSupplier}
                            onChange={(e) => setEditPbSupplier(e.target.value)}
                            className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                          >
                            {!snapshot.suppliers.some((s) => s.name === editPbSupplier) &&
                              editPbSupplier && (
                                <option value={editPbSupplier}>{editPbSupplier}</option>
                              )}
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
                            value={editPbBranch}
                            onChange={(e) => setEditPbBranch(e.target.value)}
                            className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                          >
                            {!snapshot.locations.some((l) => l.name === editPbBranch) &&
                              editPbBranch && (
                                <option value={editPbBranch}>{editPbBranch}</option>
                              )}
                            {snapshot.locations.map((l) => (
                              <option key={l.id} value={l.name}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11.5px] font-semibold text-[#0F172A]">
                            Bill Items ({editPbItems.length})
                          </span>
                          <span className="text-[11px] text-[#64748B]">
                            Edit quantities, units, or add items
                          </span>
                        </div>

                        {editPbItems.map((row, idx) => (
                          <div
                            key={row.id}
                            className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] p-3 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-[#2563EB] uppercase tracking-wide">
                                Item #{idx + 1}
                              </span>
                              <button
                                type="button"
                                disabled={editPbItems.length <= 1}
                                aria-label={`Delete edit item ${idx + 1}`}
                                onClick={() =>
                                  setEditPbItems((prev) =>
                                    prev.length > 1
                                      ? prev.filter((item) => item.id !== row.id)
                                      : prev,
                                  )
                                }
                                className="p-1 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#64748B]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="text-[11px] font-medium text-[#64748B]">
                                  Product &amp; Size
                                </label>
                                {row.itemCode && (
                                  <span className="text-[10.5px] font-mono font-semibold text-[#2563EB]">
                                    {row.itemCode}
                                  </span>
                                )}
                              </div>
                              <select
                                value={row.itemCode}
                                onChange={(e) => {
                                  const nextCode = e.target.value;
                                  const found = snapshot.varianceItems.find(
                                    (i) => i.itemCode === nextCode,
                                  );
                                  updateEditPbItem(row.id, (prev) => {
                                    const qtyNum = Number(prev.qty) || 0;
                                    return {
                                      ...prev,
                                      itemCode: nextCode,
                                      unit: found ? found.unit : prev.unit,
                                      amountInr: found
                                        ? String(Math.round(qtyNum * found.unitPriceInr))
                                        : prev.amountInr,
                                    };
                                  });
                                }}
                                className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                              >
                                {snapshot.varianceItems.map((i) => (
                                  <option key={i.id} value={i.itemCode}>
                                    {i.itemCode} — {i.itemName} ({i.dimensions}) · {i.unit}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={row.qty}
                                  onChange={(e) => {
                                    const nextQty = e.target.value;
                                    const found = snapshot.varianceItems.find(
                                      (i) => i.itemCode === row.itemCode,
                                    );
                                    updateEditPbItem(row.id, (prev) => ({
                                      ...prev,
                                      qty: nextQty,
                                      amountInr:
                                        found && Number(nextQty) > 0
                                          ? String(Math.round(Number(nextQty) * found.unitPriceInr))
                                          : prev.amountInr,
                                    }));
                                  }}
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Unit
                                </label>
                                <select
                                  value={row.unit}
                                  onChange={(e) =>
                                    updateEditPbItem(row.id, (prev) => ({
                                      ...prev,
                                      unit: e.target.value as UnitType,
                                    }))
                                  }
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                                >
                                  {SHOP_UNITS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Amount (₹)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={row.amountInr}
                                  onChange={(e) =>
                                    updateEditPbItem(row.id, (prev) => ({
                                      ...prev,
                                      amountInr: e.target.value,
                                    }))
                                  }
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setEditPbItems((prev) => [
                              ...prev,
                              createDefaultPbItem(prev.length),
                            ])
                          }
                          className="w-full h-9 rounded-lg border border-dashed border-[#2563EB]/50 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF] text-[#1D63ED] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Another Item</span>
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                          Total Bill Amount (₹){' '}
                          <span className="text-[#2563EB] font-normal">· Auto</span>
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={`₹ ${editCalculatedTotal.toLocaleString('en-IN')}`}
                          className="w-full h-9 px-3 text-[13px] font-bold text-[#0F172A] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] tabular-nums"
                        />
                      </div>

                      {editPbError && (
                        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                          {editPbError}
                        </div>
                      )}
                    </div>

                    <div className="px-6 py-3.5 border-t border-[#E5E9F0] bg-[#FAFBFD] flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={savingEditBill}
                        onClick={() => {
                          setIsEditingBill(false);
                          setEditPbError(null);
                        }}
                        className="h-9 px-4 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#475569] text-[12.5px] font-medium disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEditBill}
                        className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold disabled:opacity-60"
                      >
                        {savingEditBill ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                );
              })()
            ) : (
              <>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                  {(() => {
                    const billItems =
                      Array.isArray(viewPurchaseBill.items) && viewPurchaseBill.items.length > 0
                        ? viewPurchaseBill.items
                        : [
                            {
                              id: `fallback-${viewPurchaseBill.id}`,
                              itemCode: '',
                              itemName: viewPurchaseBill.itemSummary,
                              dimensions: 'Standard',
                              qty: viewPurchaseBill.qty,
                              unit: viewPurchaseBill.unit,
                              amountInr: viewPurchaseBill.totalInr,
                            },
                          ];
                    const grandTotal = billItems.reduce(
                      (sum, it) => sum + (Number(it.amountInr) || 0),
                      0,
                    );

                    return (
                      <div className="overflow-x-auto border border-[#E5E9F0] rounded-xl">
                        <table className="w-full text-left border-collapse min-w-[520px]">
                          <thead>
                            <tr className="bg-[#FAFBFD] border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                              <th className="py-2.5 pl-4 pr-2">#</th>
                              <th className="py-2.5 px-2">Product &amp; Size</th>
                              <th className="py-2.5 px-2 text-right">Qty</th>
                              <th className="py-2.5 px-2">Unit</th>
                              <th className="py-2.5 pl-2 pr-4 text-right">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                            {billItems.map((it, idx) => (
                              <tr key={it.id} className="hover:bg-slate-50/70">
                                <td className="py-3 pl-4 pr-2 text-[#64748B] font-mono text-[11.5px]">
                                  {idx + 1}
                                </td>
                                <td className="py-3 px-2">
                                  <div className="font-semibold text-[#0F172A]">{it.itemName}</div>
                                  <div className="text-[11px] text-[#64748B] font-mono">
                                    {it.dimensions}
                                    {it.itemCode ? ` · ${it.itemCode}` : ''}
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-right font-medium tabular-nums whitespace-nowrap">
                                  {it.qty.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-2 text-[#2563EB] font-medium whitespace-nowrap">
                                  {it.unit}
                                </td>
                                <td className="py-3 pl-2 pr-4 text-right font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                                  ₹ {it.amountInr.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-[#F8FAFC] border-t border-[#E5E9F0]">
                              <td
                                colSpan={4}
                                className="py-3 pl-4 pr-2 text-[12.5px] font-semibold text-[#0F172A]"
                              >
                                Total ({billItems.length} item{billItems.length === 1 ? '' : 's'})
                              </td>
                              <td className="py-3 pl-2 pr-4 text-right text-[14px] font-bold text-[#0F172A] tabular-nums whitespace-nowrap">
                                ₹ {grandTotal.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div className="px-6 py-3.5 border-t border-[#E5E9F0] bg-[#FAFBFD] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => startEditPurchaseBill(viewPurchaseBill)}
                    className="h-9 px-4 rounded-lg border border-[#2563EB] bg-white hover:bg-[#EEF4FF] text-[#1D63ED] text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Bill</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingBill(false);
                      setViewPurchaseBill(null);
                    }}
                    className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewSalesBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => {
              if (!savingEditSalesBill) {
                setIsEditingSalesBill(false);
                setViewSalesBill(null);
              }
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl bg-white rounded-xl border border-[#E5E9F0] shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            {(() => {
              const headerStatus = isEditingSalesBill
                ? computeSalesBillStatus(editSbItems).status
                : getSalesBillComputedStatus(viewSalesBill);

              return (
                <div className="px-6 py-4 border-b border-[#E5E9F0] flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                      <span className="font-mono font-semibold text-[#2563EB]">
                        {isEditingSalesBill
                          ? editSbInvoiceNo.trim()
                            ? formatInvoiceNo(editSbInvoiceNo)
                            : 'INV-...'
                          : formatInvoiceNo(viewSalesBill.invoiceNo)}
                      </span>
                      <span className="text-[#CBD5E1]">·</span>
                      <span className="text-[#64748B]">
                        {isEditingSalesBill
                          ? formatIsoDateToLabel(editSbDate)
                          : viewSalesBill.dateLabel}
                      </span>
                      <span className="text-[#CBD5E1]">·</span>
                      <span
                        className={`font-semibold ${
                          headerStatus === 'Paid'
                            ? 'text-[#16A34A]'
                            : headerStatus === 'Due'
                              ? 'text-[#DC2626]'
                              : 'text-[#D97706]'
                        }`}
                      >
                        {headerStatus}
                      </span>
                    </div>
                    <h3 className="text-[17px] font-bold text-[#0F172A] mt-0.5 truncate">
                      {isEditingSalesBill ? 'Edit Sales Invoice' : viewSalesBill.customerName}
                    </h3>
                    <p className="text-[12px] text-[#64748B]">
                      {isEditingSalesBill
                        ? 'Update customer info, invoice items, and per-item payment status.'
                        : `Dispatch Branch: ${viewSalesBill.branchName}${viewSalesBill.customerPhone ? ` · ${viewSalesBill.customerPhone}` : ''}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingEditSalesBill}
                    onClick={() => {
                      setIsEditingSalesBill(false);
                      setViewSalesBill(null);
                    }}
                    aria-label="Close sales bill modal"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })()}

            {isEditingSalesBill ? (
              (() => {
                const editTotal = editSbItems.reduce(
                  (sum, row) => sum + Math.max(0, Number(row.amountInr) || 0),
                  0,
                );
                const editStatusInfo = computeSalesBillStatus(editSbItems);
                const updateEditSbItem = (
                  id: string,
                  updater: (row: SalesBillDraftItem) => SalesBillDraftItem,
                ) => {
                  setEditSbItems((prev) =>
                    prev.map((row) => (row.id === id ? updater(row) : row)),
                  );
                };

                return (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setEditSbError(null);
                      if (!editSbInvoiceNo.trim()) {
                        setEditSbError('Please enter an Invoice No.');
                        return;
                      }
                      if (!editSbCustomerName.trim()) {
                        setEditSbError('Please enter the Customer Name.');
                        return;
                      }
                      if (editSbItems.length === 0) {
                        setEditSbError('Add at least one item to save the invoice.');
                        return;
                      }
                      const parsedItems = editSbItems.map((row) => ({
                        itemCode: row.itemCode,
                        qty: Number(row.qty),
                        unit: row.unit,
                        amountInr: Number(row.amountInr),
                        status: row.status,
                      }));
                      if (
                        parsedItems.some(
                          (it) => !it.itemCode || !it.qty || it.qty <= 0 || it.amountInr < 0,
                        )
                      ) {
                        setEditSbError(
                          'Every item card must have a product, positive qty, and valid amount.',
                        );
                        return;
                      }
                      setSavingEditSalesBill(true);
                      try {
                        const updated = await onUpdateSalesBill(viewSalesBill.id, {
                          invoiceNo: formatInvoiceNo(editSbInvoiceNo),
                          customerName: editSbCustomerName.trim(),
                          customerPhone: editSbPhone.trim(),
                          customerAddress: editSbAddress.trim(),
                          branchName: editSbBranch,
                          dateLabel: formatIsoDateToLabel(editSbDate),
                          dateIso: editSbDate,
                          items: parsedItems,
                        });
                        setViewSalesBill(updated);
                        setIsEditingSalesBill(false);
                      } catch (err) {
                        setEditSbError(
                          err instanceof Error ? err.message : 'Unable to update sales invoice.',
                        );
                      } finally {
                        setSavingEditSalesBill(false);
                      }
                    }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    <div className="p-6 overflow-y-auto flex-1 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Invoice No
                          </label>
                          <div className="flex items-stretch rounded-lg border border-[#E2E8F0] overflow-hidden focus-within:border-blue-500 bg-white">
                            <span className="px-2.5 inline-flex items-center bg-[#F8FAFC] border-r border-[#E2E8F0] text-[12px] font-mono font-semibold text-[#2563EB] select-none whitespace-nowrap">
                              INV-
                            </span>
                            <input
                              type="text"
                              value={editSbInvoiceNo}
                              onChange={(e) => setEditSbInvoiceNo(e.target.value)}
                              className="w-full h-9 px-2.5 text-[12.5px] font-mono text-[#0F172A] focus:outline-none"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={editSbDate}
                            onChange={(e) => setEditSbDate(e.target.value)}
                            className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Customer Name
                          </label>
                          <input
                            type="text"
                            value={editSbCustomerName}
                            onChange={(e) => setEditSbCustomerName(e.target.value)}
                            className="w-full h-9 px-2.5 text-[12.5px] rounded-lg border border-[#E2E8F0] bg-white"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={editSbPhone}
                            onChange={(e) => setEditSbPhone(e.target.value)}
                            className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Dispatch Branch
                          </label>
                          <select
                            value={editSbBranch}
                            onChange={(e) => setEditSbBranch(e.target.value)}
                            className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                          >
                            {!snapshot.locations.some((l) => l.name === editSbBranch) &&
                              editSbBranch && (
                                <option value={editSbBranch}>{editSbBranch}</option>
                              )}
                            {snapshot.locations.map((l) => (
                              <option key={l.id} value={l.name}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] p-3 space-y-1.5">
                        <label className="block text-[11px] font-semibold text-[#334155]">
                          Customer Address
                        </label>
                        <textarea
                          rows={2}
                          value={editSbAddress}
                          onChange={(e) => setEditSbAddress(e.target.value)}
                          placeholder="Site / billing address..."
                          className="w-full px-2.5 py-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white resize-none"
                        />
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11.5px] font-semibold text-[#0F172A]">
                            Invoice Items ({editSbItems.length})
                          </span>
                          <span className="text-[11px] text-[#64748B]">
                            Edit items or update payment statuses
                          </span>
                        </div>

                        {editSbItems.map((row, idx) => (
                          <div
                            key={row.id}
                            className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] p-3 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-[#2563EB] uppercase tracking-wide">
                                Item #{idx + 1}
                              </span>
                              <button
                                type="button"
                                disabled={editSbItems.length <= 1}
                                aria-label={`Delete edit sales item ${idx + 1}`}
                                onClick={() =>
                                  setEditSbItems((prev) =>
                                    prev.length > 1
                                      ? prev.filter((item) => item.id !== row.id)
                                      : prev,
                                  )
                                }
                                className="p-1 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#64748B]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="text-[11px] font-medium text-[#64748B]">
                                  Product &amp; Size
                                </label>
                                {row.itemCode && (
                                  <span className="text-[10.5px] font-mono font-semibold text-[#2563EB]">
                                    {row.itemCode}
                                  </span>
                                )}
                              </div>
                              <select
                                value={row.itemCode}
                                onChange={(e) => {
                                  const nextCode = e.target.value;
                                  const found = snapshot.varianceItems.find(
                                    (i) => i.itemCode === nextCode,
                                  );
                                  updateEditSbItem(row.id, (prev) => {
                                    const qtyNum = Number(prev.qty) || 0;
                                    return {
                                      ...prev,
                                      itemCode: nextCode,
                                      unit: found ? found.unit : prev.unit,
                                      amountInr: found
                                        ? String(Math.round(qtyNum * found.unitPriceInr))
                                        : prev.amountInr,
                                    };
                                  });
                                }}
                                className="w-full h-9 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                              >
                                {snapshot.varianceItems.map((i) => (
                                  <option key={i.id} value={i.itemCode}>
                                    {i.itemCode} — {i.itemName} ({i.dimensions}) · {i.unit}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={row.qty}
                                  onChange={(e) => {
                                    const nextQty = e.target.value;
                                    const found = snapshot.varianceItems.find(
                                      (i) => i.itemCode === row.itemCode,
                                    );
                                    updateEditSbItem(row.id, (prev) => ({
                                      ...prev,
                                      qty: nextQty,
                                      amountInr:
                                        found && Number(nextQty) > 0
                                          ? String(Math.round(Number(nextQty) * found.unitPriceInr))
                                          : prev.amountInr,
                                    }));
                                  }}
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Unit
                                </label>
                                <select
                                  value={row.unit}
                                  onChange={(e) =>
                                    updateEditSbItem(row.id, (prev) => ({
                                      ...prev,
                                      unit: e.target.value as UnitType,
                                    }))
                                  }
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                                >
                                  {SHOP_UNITS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Amount (₹)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={row.amountInr}
                                  onChange={(e) =>
                                    updateEditSbItem(row.id, (prev) => ({
                                      ...prev,
                                      amountInr: e.target.value,
                                    }))
                                  }
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white tabular-nums"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                                  Status
                                </label>
                                <select
                                  value={row.status}
                                  onChange={(e) =>
                                    updateEditSbItem(row.id, (prev) => ({
                                      ...prev,
                                      status: e.target.value as SalesPaymentStatus,
                                    }))
                                  }
                                  className="w-full h-9 px-2 text-[12px] rounded-lg border border-[#E2E8F0] bg-white"
                                >
                                  <option value="Paid">Paid</option>
                                  <option value="Partially Paid">Partially Paid</option>
                                  <option value="Due">Due</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setEditSbItems((prev) => [
                              ...prev,
                              createDefaultSbItem(prev.length),
                            ])
                          }
                          className="w-full h-9 rounded-lg border border-dashed border-[#2563EB]/50 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF] text-[#1D63ED] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Another Item</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Final Amount <span className="text-[#2563EB] font-normal">· Auto</span>
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={`₹ ${editTotal.toLocaleString('en-IN')}`}
                            className="w-full h-9 px-3 text-[13px] font-bold text-[#0F172A] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                            Bill Status{' '}
                            <span className="text-[#2563EB] font-normal">
                              · {editStatusInfo.paidPct}% paid
                            </span>
                          </label>
                          <div
                            className={`w-full h-9 px-3 text-[13px] font-semibold rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] flex items-center ${
                              editStatusInfo.status === 'Paid'
                                ? 'text-[#16A34A]'
                                : editStatusInfo.status === 'Due'
                                  ? 'text-[#DC2626]'
                                  : 'text-[#D97706]'
                            }`}
                          >
                            {editStatusInfo.status}
                          </div>
                        </div>
                      </div>

                      {editSbError && (
                        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                          {editSbError}
                        </div>
                      )}
                    </div>

                    <div className="px-6 py-3.5 border-t border-[#E5E9F0] bg-[#FAFBFD] flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={savingEditSalesBill}
                        onClick={() => {
                          setIsEditingSalesBill(false);
                          setEditSbError(null);
                        }}
                        className="h-9 px-4 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#475569] text-[12.5px] font-medium disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEditSalesBill}
                        className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold disabled:opacity-60"
                      >
                        {savingEditSalesBill ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                );
              })()
            ) : (
              <>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                  {(viewSalesBill.customerPhone || viewSalesBill.customerAddress) && (
                    <div className="rounded-xl border border-[#E5E9F0] bg-[#FAFBFD] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                      <div>
                        <div className="text-[11px] font-medium text-[#64748B]">Phone Number</div>
                        <div className="font-medium text-[#0F172A] mt-0.5">
                          {viewSalesBill.customerPhone || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-[#64748B]">
                          Customer Address
                        </div>
                        <div className="font-medium text-[#0F172A] mt-0.5">
                          {viewSalesBill.customerAddress || '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const billItems =
                      Array.isArray(viewSalesBill.items) && viewSalesBill.items.length > 0
                        ? viewSalesBill.items
                        : [
                            {
                              id: `sb-fallback-${viewSalesBill.id}`,
                              itemCode: '',
                              itemName: viewSalesBill.itemSummary,
                              dimensions: 'Standard',
                              qty: viewSalesBill.qty,
                              unit: viewSalesBill.unit,
                              amountInr: viewSalesBill.totalInr,
                              status: viewSalesBill.status,
                            },
                          ];
                    const grandTotal = billItems.reduce(
                      (sum, it) => sum + (Number(it.amountInr) || 0),
                      0,
                    );
                    const statusSummary = computeSalesBillStatus(billItems);

                    return (
                      <div className="overflow-x-auto border border-[#E5E9F0] rounded-xl">
                        <table className="w-full text-left border-collapse min-w-[560px]">
                          <thead>
                            <tr className="bg-[#FAFBFD] border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                              <th className="py-2.5 pl-4 pr-2">#</th>
                              <th className="py-2.5 px-2">Product &amp; Size</th>
                              <th className="py-2.5 px-2 text-right">Qty</th>
                              <th className="py-2.5 px-2">Unit</th>
                              <th className="py-2.5 px-2 text-right">Status</th>
                              <th className="py-2.5 pl-2 pr-4 text-right">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                            {billItems.map((it, idx) => (
                              <tr key={it.id} className="hover:bg-slate-50/70">
                                <td className="py-3 pl-4 pr-2 text-[#64748B] font-mono text-[11.5px]">
                                  {idx + 1}
                                </td>
                                <td className="py-3 px-2">
                                  <div className="font-semibold text-[#0F172A]">{it.itemName}</div>
                                  <div className="text-[11px] text-[#64748B] font-mono">
                                    {it.dimensions}
                                    {it.itemCode ? ` · ${it.itemCode}` : ''}
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-right font-medium tabular-nums whitespace-nowrap">
                                  {it.qty.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-2 text-[#2563EB] font-medium whitespace-nowrap">
                                  {it.unit}
                                </td>
                                <td
                                  className={`py-3 px-2 text-right font-semibold whitespace-nowrap ${
                                    it.status === 'Paid'
                                      ? 'text-[#16A34A]'
                                      : it.status === 'Due'
                                        ? 'text-[#DC2626]'
                                        : 'text-[#D97706]'
                                  }`}
                                >
                                  {it.status}
                                </td>
                                <td className="py-3 pl-2 pr-4 text-right font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                                  ₹ {it.amountInr.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-[#F8FAFC] border-t border-[#E5E9F0]">
                              <td
                                colSpan={4}
                                className="py-3 pl-4 pr-2 text-[12.5px] font-semibold text-[#0F172A]"
                              >
                                Total ({billItems.length} item{billItems.length === 1 ? '' : 's'})
                              </td>
                              <td
                                className={`py-3 px-2 text-right text-[12px] font-semibold whitespace-nowrap ${
                                  statusSummary.status === 'Paid'
                                    ? 'text-[#16A34A]'
                                    : statusSummary.status === 'Due'
                                      ? 'text-[#DC2626]'
                                      : 'text-[#D97706]'
                                }`}
                              >
                                {statusSummary.status} ({statusSummary.paidPct}%)
                              </td>
                              <td className="py-3 pl-2 pr-4 text-right text-[14px] font-bold text-[#0F172A] tabular-nums whitespace-nowrap">
                                ₹ {grandTotal.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div className="px-6 py-3.5 border-t border-[#E5E9F0] bg-[#FAFBFD] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => startEditSalesBill(viewSalesBill)}
                    className="h-9 px-4 rounded-lg border border-[#2563EB] bg-white hover:bg-[#EEF4FF] text-[#1D63ED] text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Bill</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingSalesBill(false);
                      setViewSalesBill(null);
                    }}
                    className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => {
              if (!savingSupplier) setEditingSupplier(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md bg-white rounded-xl border border-[#E5E9F0] shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[#E5E9F0] flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-bold text-[#0F172A]">Edit Supplier</h3>
                <p className="text-[12px] text-[#64748B]">
                  Update supplier contact and catalog details.
                </p>
              </div>
              <button
                type="button"
                disabled={savingSupplier}
                onClick={() => setEditingSupplier(null)}
                aria-label="Close edit supplier modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditSupError(null);
                if (!editSupName.trim() || !editSupOrigin.trim()) {
                  setEditSupError('Supplier name and origin city are required.');
                  return;
                }
                setSavingSupplier(true);
                try {
                  await onUpdateSupplier(editingSupplier.id, {
                    name: editSupName.trim(),
                    origin: editSupOrigin.trim(),
                    specialty: editSupSpecialty.trim(),
                    phone: editSupPhone.trim(),
                  });
                  setEditingSupplier(null);
                } catch (err) {
                  setEditSupError(
                    err instanceof Error ? err.message : 'Unable to update supplier.',
                  );
                } finally {
                  setSavingSupplier(false);
                }
              }}
              className="p-6 space-y-3.5"
            >
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Supplier Name
                </label>
                <input
                  value={editSupName}
                  onChange={(e) => setEditSupName(e.target.value)}
                  required
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Origin City
                </label>
                <input
                  value={editSupOrigin}
                  onChange={(e) => setEditSupOrigin(e.target.value)}
                  required
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editSupPhone}
                  onChange={(e) => setEditSupPhone(e.target.value)}
                  placeholder="+91 94140 12345"
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Specialty &amp; Unit
                </label>
                <input
                  value={editSupSpecialty}
                  onChange={(e) => setEditSupSpecialty(e.target.value)}
                  className="w-full h-9 px-3 text-[12.5px] rounded-lg border border-[#E2E8F0]"
                />
              </div>

              {editSupError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
                  {editSupError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1F5F9]">
                <button
                  type="button"
                  disabled={savingSupplier}
                  onClick={() => setEditingSupplier(null)}
                  className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[12.5px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-semibold disabled:opacity-60"
                >
                  {savingSupplier ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => {
              if (!deletingSupplier) setDeleteConfirmSupplier(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md bg-white rounded-xl border border-[#E5E9F0] shadow-xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-[15px] font-bold text-[#0F172A]">Delete Supplier?</h3>
              <p className="text-[12.5px] text-[#64748B] mt-1">
                Are you sure you want to remove{' '}
                <span className="font-semibold text-[#0F172A]">{deleteConfirmSupplier.name}</span> (
                {deleteConfirmSupplier.origin}
                {deleteConfirmSupplier.phone ? ` · ${deleteConfirmSupplier.phone}` : ''}) from
                Active Suppliers?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
              <button
                type="button"
                disabled={deletingSupplier}
                onClick={() => setDeleteConfirmSupplier(null)}
                className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[12.5px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingSupplier}
                onClick={async () => {
                  setDeletingSupplier(true);
                  try {
                    await onDeleteSupplier(deleteConfirmSupplier.id);
                    setDeleteConfirmSupplier(null);
                  } finally {
                    setDeletingSupplier(false);
                  }
                }}
                className="h-9 px-4 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingSupplier ? 'Deleting...' : 'Delete Supplier'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
