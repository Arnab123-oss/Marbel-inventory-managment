import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, {type Request, type Response, type NextFunction} from 'express';
import {createServer as createViteServer} from 'vite';
import type {
  CustomerRecord,
  DashboardLayout,
  InventoryAlert,
  InventorySnapshot,
  KpiId,
  LocationRow,
  ProductHistoryEntry,
  PurchaseBill,
  PurchaseBillItem,
  SalesBill,
  SalesBillItem,
  SalesPaymentStatus,
  SlabLot,
  StockTransfer,
  StoneCategory,
  SupplierRecord,
  UnitType,
  UserProfile,
  VarianceItem,
  WidgetId,
} from './src/types/inventory.ts';
import {computeAllBranches} from './src/utils/branchMetrics.ts';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'stonepulse-marble-session-key-2026';
const SESSION_COOKIE = 'sp_session';
const LOGOUT_COOKIE = 'sp_logged_out';
const DOMAIN_VERSION = 'marble-v3';

interface StoredUser extends UserProfile {
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface StoreSchema {
  users: Record<string, StoredUser>;
  layouts: Record<string, DashboardLayout>;
  snapshot: InventorySnapshot;
}

const DEFAULT_KPI_ORDER: KpiId[] = [
  'totalSales',
  'totalPurchases',
  'totalStockValue',
  'netProfit',
  'lowStockItems',
];

const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  'salesTrend',
  'valueTrend',
  'stockValueByLocation',
  'topProducts',
  'recentActivities',
  'stockStatusSummary',
  'accuracyTrend',
  'topVarianceItems',
  'recentAlerts',
];

const DEFAULT_WIDGET_SPANS: Record<WidgetId, 1 | 2 | 3> = {
  salesTrend: 1,
  topProducts: 1,
  recentActivities: 2,
  accuracyOverview: 1,
  valueTrend: 1,
  stockValueByLocation: 1,
  inventoryByLocation: 2,
  stockStatusSummary: 1,
  accuracyTrend: 2,
  topVarianceItems: 2,
  recentAlerts: 1,
};

function createDefaultLayout(): DashboardLayout {
  return {
    kpiOrder: [...DEFAULT_KPI_ORDER],
    widgetOrder: [...DEFAULT_WIDGET_ORDER],
    widgetSpans: {...DEFAULT_WIDGET_SPANS},
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeLayoutServer(layout: DashboardLayout): {layout: DashboardLayout; changed: boolean} {
  const rawKpis = Array.isArray(layout.kpiOrder) ? layout.kpiOrder : [];
  const validKpis: KpiId[] = rawKpis.filter((k) => DEFAULT_KPI_ORDER.includes(k));
  const nextKpiOrder: KpiId[] =
    validKpis.length === DEFAULT_KPI_ORDER.length ? validKpis : [...DEFAULT_KPI_ORDER];
  const kpiChanged =
    nextKpiOrder.length !== rawKpis.length ||
    nextKpiOrder.some((k, idx) => rawKpis[idx] !== k);

  const rawWidgets = Array.isArray(layout.widgetOrder) ? layout.widgetOrder : [];
  const validWidgets: WidgetId[] = rawWidgets.filter((w) =>
    DEFAULT_WIDGET_ORDER.includes(w),
  );
  const hasAllCurrent = validWidgets.length === DEFAULT_WIDGET_ORDER.length;
  const nextOrder: WidgetId[] = hasAllCurrent ? validWidgets : [...DEFAULT_WIDGET_ORDER];
  const orderChanged =
    kpiChanged ||
    !hasAllCurrent ||
    nextOrder.length !== rawWidgets.length ||
    nextOrder.some((w, idx) => rawWidgets[idx] !== w);
  const nextSpans = hasAllCurrent
    ? {...DEFAULT_WIDGET_SPANS, ...layout.widgetSpans}
    : {...DEFAULT_WIDGET_SPANS};
  return {
    layout: {
      ...layout,
      kpiOrder: nextKpiOrder,
      widgetOrder: nextOrder,
      widgetSpans: nextSpans,
    },
    changed: orderChanged,
  };
}

function syncLocationsFromLedger(snap: InventorySnapshot): boolean {
  const computed = computeAllBranches(snap);
  let changed = false;
  snap.locations = computed.map((entry, idx) => {
    const prev = snap.locations[idx];
    const next = entry.location;
    if (
      !prev ||
      prev.totalItems !== next.totalItems ||
      prev.sqftQty !== next.sqftQty ||
      prev.pcsQty !== next.pcsQty ||
      prev.boxQty !== next.boxQty ||
      prev.stockValueInr !== next.stockValueInr ||
      prev.stockValueCr !== next.stockValueCr ||
      prev.inventoryAccuracyPct !== next.inventoryAccuracyPct ||
      prev.minorVarianceItems !== next.minorVarianceItems ||
      prev.majorVarianceItems !== next.majorVarianceItems ||
      prev.lowStockItems !== next.lowStockItems
    ) {
      changed = true;
    }
    return next;
  });

  const totalValueInr = computed.reduce((sum, b) => sum + b.net.valueInr, 0);
  const totalValueCr = Number((totalValueInr / 10000000).toFixed(2));
  const totalSkus = computed.reduce((sum, b) => sum + b.net.skus, 0);
  const weightedAcc =
    totalSkus > 0
      ? Number(
          (
            computed.reduce((sum, b) => sum + b.net.accuracyPct * b.net.skus, 0) / totalSkus
          ).toFixed(2),
        )
      : 100;
  const totalLowStock = computed.reduce((sum, b) => sum + b.net.lowStock, 0);

  if (snap.kpis.totalStockValueCr !== totalValueCr) {
    snap.kpis.totalStockValueCr = totalValueCr;
    changed = true;
  }
  if (snap.kpis.inventoryAccuracyPct !== weightedAcc) {
    snap.kpis.inventoryAccuracyPct = weightedAcc;
    changed = true;
  }
  if (snap.kpis.lowStockItems !== totalLowStock) {
    snap.kpis.lowStockItems = totalLowStock;
    changed = true;
  }
  if (snap.kpis.totalProducts !== totalSkus) {
    snap.kpis.totalProducts = totalSkus;
    changed = true;
  }
  snap.kpis.totalBranches = snap.locations.length;

  return changed;
}

function hashPassword(password: string, existingSalt?: string): {salt: string; hash: string} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return {salt, hash};
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const {hash} = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const MONTH_MAP: Record<string, string> = {
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

function parseDateLabelToIsoServer(dateLabel?: string): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!dateLabel || dateLabel.trim().toLowerCase() === 'today') return todayIso;
  const isoMatch = dateLabel.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateLabel.trim();
  const labelMatch = dateLabel.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (labelMatch) {
    const day = labelMatch[1].padStart(2, '0');
    const month = MONTH_MAP[labelMatch[2].slice(0, 3).toLowerCase()];
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

function extractBillNoSuffixServer(rawBillNo: string): string {
  const trimmed = rawBillNo.trim();
  const fullMatch = trimmed.match(/^PB-\d{2}-\d{4}-(.+)$/i);
  if (fullMatch) return fullMatch[1].trim();
  const legacyMatch = trimmed.match(/^PB-\d{4}-(.+)$/i);
  if (legacyMatch) return legacyMatch[1].trim();
  const pbPrefixMatch = trimmed.match(/^PB-(.+)$/i);
  if (pbPrefixMatch) return pbPrefixMatch[1].trim();
  return trimmed;
}

function formatPurchaseBillNoServer(
  rawBillNo: string | undefined,
  dateIso?: string,
  dateLabel?: string,
): string {
  const resolvedIso =
    dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
      ? dateIso.trim()
      : parseDateLabelToIsoServer(dateLabel);
  const [year, month] = resolvedIso.split('-');
  const fallbackSuffix = String(Math.floor(1120 + Math.random() * 800));
  const suffix = rawBillNo?.trim() ? extractBillNoSuffixServer(rawBillNo) : fallbackSuffix;
  return `PB-${month}-${year}-${suffix || fallbackSuffix}`;
}

function formatInvoiceNoServer(rawInvoiceNo?: string): string {
  const fallback = String(Math.floor(8850 + Math.random() * 900));
  const trimmed = rawInvoiceNo?.trim() || '';
  const suffix = trimmed.replace(/^INV-/i, '').trim() || fallback;
  return `INV-${suffix}`;
}

function normalizeSalesItemStatusServer(raw?: string): SalesPaymentStatus {
  if (raw === 'Paid' || raw === 'Partially Paid' || raw === 'Due') return raw;
  if (raw === 'Dispatched' || raw === 'Partial') return 'Partially Paid';
  return 'Due';
}

function computeSalesBillStatusServer(
  items: Array<{amountInr: number; status: SalesPaymentStatus}>,
): SalesPaymentStatus {
  if (!items || items.length === 0) return 'Due';
  if (items.every((it) => it.status === 'Paid')) return 'Paid';
  if (items.every((it) => it.status === 'Due')) return 'Due';
  const totalAmt = items.reduce((sum, it) => sum + Math.max(0, Number(it.amountInr) || 0), 0);
  let paidWeight = 0;
  let totalWeight = 0;
  for (const it of items) {
    const w = totalAmt > 0 ? Math.max(0, Number(it.amountInr) || 0) : 1;
    totalWeight += w;
    if (it.status === 'Paid') paidWeight += w;
    else if (it.status === 'Partially Paid') paidWeight += w * 0.5;
  }
  const paidPct = totalWeight > 0 ? (paidWeight / totalWeight) * 100 : 0;
  if (paidPct >= 100) return 'Paid';
  if (paidPct < 50) return 'Due';
  return 'Partially Paid';
}

function getPurchaseBillAmountServer(bill: PurchaseBill): number {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return bill.items.reduce((sum, it) => sum + (Number(it.amountInr) || 0), 0);
  }
  return Number(bill.totalInr) || 0;
}

function syncSuppliersFromPurchaseBills(snapshot: InventorySnapshot): boolean {
  if (!Array.isArray(snapshot.suppliers) || !Array.isArray(snapshot.purchaseBills)) {
    return false;
  }
  let changed = false;
  for (const sup of snapshot.suppliers) {
    const supKey = sup.name.trim().toLowerCase();
    let supplied = 0;
    let payable = 0;
    for (const bill of snapshot.purchaseBills) {
      if (bill.supplierName.trim().toLowerCase() === supKey) {
        const amt = getPurchaseBillAmountServer(bill);
        supplied += amt;
        if (bill.status === 'Pending') {
          payable += amt;
        } else if (bill.status === 'Partial') {
          payable += Math.round(amt * 0.5);
        }
      }
    }
    if (sup.totalSuppliedInr !== supplied || sup.payableInr !== payable) {
      sup.totalSuppliedInr = supplied;
      sup.payableInr = payable;
      changed = true;
    }
  }
  return changed;
}

function buildInitialSnapshot(): InventorySnapshot {
  const locations: LocationRow[] = [
    {
      id: 'main-showroom',
      name: 'Main Showroom',
      type: 'Showroom',
      totalItems: 312,
      sqftQty: 48200,
      pcsQty: 1420,
      boxQty: 380,
      stockValueCr: 6.28,
      inventoryAccuracyPct: 99.12,
      minorVarianceItems: 5,
      majorVarianceItems: 1,
      lowStockItems: 6,
      overstockItems: 4,
      inTransitCr: 0.42,
      lastAuditAt: 'Today, 09:40',
    },
    {
      id: 'marble-yard-north',
      name: 'Marble Yard - North',
      type: 'Yard',
      totalItems: 298,
      sqftQty: 64500,
      pcsQty: 980,
      boxQty: 190,
      stockValueCr: 5.16,
      inventoryAccuracyPct: 98.45,
      minorVarianceItems: 6,
      majorVarianceItems: 2,
      lowStockItems: 8,
      overstockItems: 3,
      inTransitCr: 0.31,
      lastAuditAt: 'Today, 08:15',
    },
    {
      id: 'godown-1',
      name: 'Slabs Godown - 1',
      type: 'Godown',
      totalItems: 260,
      sqftQty: 52100,
      pcsQty: 740,
      boxQty: 145,
      stockValueCr: 4.02,
      inventoryAccuracyPct: 97.8,
      minorVarianceItems: 4,
      majorVarianceItems: 1,
      lowStockItems: 7,
      overstockItems: 5,
      inTransitCr: 0.28,
      lastAuditAt: 'Yesterday, 17:30',
    },
    {
      id: 'tile-depot',
      name: 'Tile & Box Depot',
      type: 'Depot',
      totalItems: 180,
      sqftQty: 12400,
      pcsQty: 2640,
      boxQty: 1480,
      stockValueCr: 3.38,
      inventoryAccuracyPct: 99.35,
      minorVarianceItems: 3,
      majorVarianceItems: 0,
      lowStockItems: 4,
      overstockItems: 2,
      inTransitCr: 0.19,
      lastAuditAt: 'Today, 10:05',
    },
    {
      id: 'godown-2',
      name: 'Slabs Godown - 2',
      type: 'Godown',
      totalItems: 140,
      sqftQty: 29800,
      pcsQty: 510,
      boxQty: 95,
      stockValueCr: 2.24,
      inventoryAccuracyPct: 98.9,
      minorVarianceItems: 2,
      majorVarianceItems: 1,
      lowStockItems: 2,
      overstockItems: 1,
      inTransitCr: 0.12,
      lastAuditAt: 'Today, 07:50',
    },
    {
      id: 'kishangarh-hub',
      name: 'Kishangarh Hub',
      type: 'Yard',
      totalItems: 110,
      sqftQty: 21400,
      pcsQty: 320,
      boxQty: 84,
      stockValueCr: 1.62,
      inventoryAccuracyPct: 97.15,
      minorVarianceItems: 1,
      majorVarianceItems: 1,
      lowStockItems: 3,
      overstockItems: 1,
      inTransitCr: 0.08,
      lastAuditAt: '2 days ago',
    },
    {
      id: 'others',
      name: 'Display Annex',
      type: 'Showroom',
      totalItems: 148,
      sqftQty: 14200,
      pcsQty: 610,
      boxQty: 240,
      stockValueCr: 2.0,
      inventoryAccuracyPct: 99.5,
      minorVarianceItems: 1,
      majorVarianceItems: 2,
      lowStockItems: 8,
      overstockItems: 2,
      inTransitCr: 0.08,
      lastAuditAt: 'Today, 06:30',
    },
  ];

  const varianceItems: VarianceItem[] = [
    {
      id: 'var-1',
      itemCode: 'MRB-SLB-10X5',
      itemName: 'Italian Statuario Slab',
      dimensions: '10 ft × 5 ft',
      category: 'Marble',
      finish: 'Polished',
      thickness: '18 mm',
      locationId: 'main-showroom',
      locationName: 'Main Showroom',
      unit: 'sq. ft',
      systemQty: 7500,
      physicalQty: 7250,
      variance: -250,
      variancePct: -3.33,
      unitPriceInr: 740,
      status: 'Low Stock',
      lastCountedAt: '10 min ago',
    },
    {
      id: 'var-1b',
      itemCode: 'MRB-SLB-9X5',
      itemName: 'Italian Statuario Slab',
      dimensions: '9 ft × 5 ft',
      category: 'Marble',
      finish: 'Polished',
      thickness: '18 mm',
      locationId: 'main-showroom',
      locationName: 'Main Showroom',
      unit: 'sq. ft',
      systemQty: 5000,
      physicalQty: 4870,
      variance: -130,
      variancePct: -2.6,
      unitPriceInr: 700,
      status: 'In Stock',
      lastCountedAt: '18 min ago',
    },
    {
      id: 'var-2',
      itemCode: 'GRN-SLB-10X6',
      itemName: 'Black Galaxy Granite',
      dimensions: '10 ft × 6 ft',
      category: 'Granite',
      finish: 'Polished',
      thickness: '20 mm',
      locationId: 'marble-yard-north',
      locationName: 'Marble Yard - North',
      unit: 'sq. ft',
      systemQty: 8000,
      physicalQty: 8320,
      variance: 320,
      variancePct: 4.0,
      unitPriceInr: 245,
      status: 'Overstock',
      lastCountedAt: '25 min ago',
    },
    {
      id: 'var-3',
      itemCode: 'TIL-BOX-2X2',
      itemName: 'Floor Tiles (Carrara Matte)',
      dimensions: '2 ft × 2 ft',
      category: 'Tiles',
      finish: 'Matte',
      thickness: '10 mm',
      locationId: 'tile-depot',
      locationName: 'Tile & Box Depot',
      unit: 'box',
      systemQty: 500,
      physicalQty: 492,
      variance: -8,
      variancePct: -1.6,
      unitPriceInr: 1850,
      status: 'In Stock',
      lastCountedAt: '1 hr ago',
    },
    {
      id: 'var-adh-1',
      itemCode: 'ADH-BAG-20KG',
      itemName: 'Tile Adhesive',
      dimensions: '20 kg Pack',
      category: 'Adhesives',
      finish: 'Standard',
      thickness: 'N/A',
      locationId: 'tile-depot',
      locationName: 'Tile & Box Depot',
      unit: 'bag',
      systemQty: 120,
      physicalQty: 118,
      variance: -2,
      variancePct: -1.67,
      unitPriceInr: 580,
      status: 'In Stock',
      lastCountedAt: '40 min ago',
    },
    {
      id: 'var-adh-2',
      itemCode: 'GRT-KG-5KG',
      itemName: 'Epoxy Tile Grout',
      dimensions: 'Bulk Jar / Kg',
      category: 'Adhesives',
      finish: 'Standard',
      thickness: 'N/A',
      locationId: 'tile-depot',
      locationName: 'Tile & Box Depot',
      unit: 'kg',
      systemQty: 250,
      physicalQty: 262,
      variance: 12,
      variancePct: 4.8,
      unitPriceInr: 195,
      status: 'Overstock',
      lastCountedAt: '55 min ago',
    },
    {
      id: 'var-4',
      itemCode: 'MRB-PCS-4X1',
      itemName: 'Makrana CNC Border',
      dimensions: '4 ft × 1 ft',
      category: 'Marble',
      finish: 'Honed',
      thickness: '16 mm',
      locationId: 'godown-1',
      locationName: 'Slabs Godown - 1',
      unit: 'pcs',
      systemQty: 500,
      physicalQty: 521,
      variance: 21,
      variancePct: 4.2,
      unitPriceInr: 680,
      status: 'In Stock',
      lastCountedAt: '2 hrs ago',
    },
    {
      id: 'var-5',
      itemCode: 'ONX-SLB-8X5',
      itemName: 'Honey Onyx Backlit Slab',
      dimensions: '8 ft × 5 ft',
      category: 'Onyx & Quartz',
      finish: 'Polished',
      thickness: '18 mm',
      locationId: 'godown-2',
      locationName: 'Slabs Godown - 2',
      unit: 'sq. ft',
      systemQty: 4200,
      physicalQty: 4000,
      variance: -200,
      variancePct: -4.76,
      unitPriceInr: 890,
      status: 'Low Stock',
      lastCountedAt: '3 hrs ago',
    },
    {
      id: 'var-6',
      itemCode: 'QRT-PCS-5X2',
      itemName: 'Calacatta Quartz Vanity',
      dimensions: '5 ft × 2 ft',
      category: 'Onyx & Quartz',
      finish: 'Polished',
      thickness: '20 mm',
      locationId: 'main-showroom',
      locationName: 'Main Showroom',
      unit: 'pcs',
      systemQty: 184,
      physicalQty: 181,
      variance: -3,
      variancePct: -1.63,
      unitPriceInr: 4950,
      status: 'In Stock',
      lastCountedAt: '3 hrs ago',
    },
    {
      id: 'var-7',
      itemCode: 'TRA-BOX-4X2',
      itemName: 'Roman Travertine Tile Box',
      dimensions: '4 ft × 2 ft',
      category: 'Tiles',
      finish: 'Matte',
      thickness: '12 mm',
      locationId: 'tile-depot',
      locationName: 'Tile & Box Depot',
      unit: 'box',
      systemQty: 420,
      physicalQty: 420,
      variance: 0,
      variancePct: 0.0,
      unitPriceInr: 2250,
      status: 'In Stock',
      lastCountedAt: '4 hrs ago',
    },
    {
      id: 'var-8',
      itemCode: 'MRB-SLB-9X5B',
      itemName: 'Botticino Classico Slab',
      dimensions: '9 ft × 5 ft',
      category: 'Marble',
      finish: 'Polished',
      thickness: '18 mm',
      locationId: 'kishangarh-hub',
      locationName: 'Kishangarh Hub',
      unit: 'sq. ft',
      systemQty: 1950,
      physicalQty: 1840,
      variance: -110,
      variancePct: -5.64,
      unitPriceInr: 480,
      status: 'Out of Stock',
      lastCountedAt: '5 hrs ago',
    },
    {
      id: 'var-9',
      itemCode: 'GRN-PCS-4X1',
      itemName: 'Absolute Black Step Riser',
      dimensions: '4 ft × 0.5 ft',
      category: 'Granite',
      finish: 'Leather',
      thickness: '18 mm',
      locationId: 'godown-1',
      locationName: 'Slabs Godown - 1',
      unit: 'pcs',
      systemQty: 740,
      physicalQty: 752,
      variance: 12,
      variancePct: 1.62,
      unitPriceInr: 540,
      status: 'In Stock',
      lastCountedAt: '6 hrs ago',
    },
  ];

  const slabs: SlabLot[] = [
    {
      id: 'slb-1',
      lotNumber: 'SL-001',
      stoneName: 'Italian Marble',
      category: 'Marble',
      dimensionsFt: '10 × 5 ft',
      slabCountPcs: 1,
      totalSqFt: 50,
      thicknessMm: 18,
      branchName: 'Main Showroom',
      finish: 'Polished',
      status: 'In Stock',
      enabled: true,
    },
    {
      id: 'slb-2',
      lotNumber: 'SL-002',
      stoneName: 'Italian Marble',
      category: 'Marble',
      dimensionsFt: '10 × 5 ft',
      slabCountPcs: 1,
      totalSqFt: 50,
      thicknessMm: 18,
      branchName: 'Main Showroom',
      finish: 'Polished',
      status: 'Out of Stock',
      enabled: true,
    },
    {
      id: 'slb-3',
      lotNumber: 'SL-003',
      stoneName: 'Black Granite',
      category: 'Granite',
      dimensionsFt: '9 × 5 ft',
      slabCountPcs: 1,
      totalSqFt: 45,
      thicknessMm: 20,
      branchName: 'Marble Yard - North',
      finish: 'Polished',
      status: 'In Stock',
      enabled: true,
    },
    {
      id: 'slb-4',
      lotNumber: 'SL-004',
      stoneName: 'Italian Statuario Extra',
      category: 'Marble',
      dimensionsFt: '9.5 × 5.8 ft',
      slabCountPcs: 42,
      totalSqFt: 2314,
      thicknessMm: 18,
      branchName: 'Main Showroom',
      finish: 'Polished',
      status: 'In Stock',
      enabled: true,
    },
    {
      id: 'slb-5',
      lotNumber: 'SL-005',
      stoneName: 'Honey Onyx Translucent',
      category: 'Onyx & Quartz',
      dimensionsFt: '8.2 × 5.2 ft',
      slabCountPcs: 24,
      totalSqFt: 1023,
      thicknessMm: 18,
      branchName: 'Slabs Godown - 2',
      finish: 'Polished',
      status: 'In Stock',
      enabled: true,
    },
    {
      id: 'slb-6',
      lotNumber: 'SL-006',
      stoneName: 'Makrana Albeta White',
      category: 'Marble',
      dimensionsFt: '7.5 × 4.8 ft',
      slabCountPcs: 36,
      totalSqFt: 1296,
      thicknessMm: 16,
      branchName: 'Slabs Godown - 1',
      finish: 'Honed',
      status: 'In Stock',
      enabled: true,
    },
  ];

  const purchaseBills: PurchaseBill[] = [
    {
      id: 'pb-1',
      billNo: 'PB-04-2024-1104',
      supplierName: 'Kishangarh Marble Depot',
      branchName: 'Main Showroom',
      itemSummary: 'Italian Statuario Slab + 1 more',
      qty: 4200,
      unit: 'sq. ft',
      totalInr: 2856000,
      status: 'Paid',
      dateLabel: '29 Apr 2024',
      dateIso: '2024-04-29',
      items: [
        {
          id: 'pbi-1a',
          itemCode: 'MRB-SLB-10X5',
          itemName: 'Italian Statuario Slab',
          dimensions: '10 ft × 5 ft',
          qty: 3000,
          unit: 'sq. ft',
          amountInr: 2100000,
        },
        {
          id: 'pbi-1b',
          itemCode: 'MRB-SLB-9X5',
          itemName: 'Italian Statuario Slab',
          dimensions: '9 ft × 5 ft',
          qty: 1200,
          unit: 'sq. ft',
          amountInr: 756000,
        },
      ],
    },
    {
      id: 'pb-2',
      billNo: 'PB-04-2024-1105',
      supplierName: 'Morbi Porcelain Works',
      branchName: 'Tile & Box Depot',
      itemSummary: 'Floor Tiles (Carrara Matte)',
      qty: 320,
      unit: 'box',
      totalInr: 544000,
      status: 'Pending',
      dateLabel: '28 Apr 2024',
      dateIso: '2024-04-28',
      items: [
        {
          id: 'pbi-2a',
          itemCode: 'TIL-BOX-2X2',
          itemName: 'Floor Tiles (Carrara Matte)',
          dimensions: '2 ft × 2 ft',
          qty: 320,
          unit: 'box',
          amountInr: 544000,
        },
      ],
    },
    {
      id: 'pb-3',
      billNo: 'PB-04-2024-1106',
      supplierName: 'Ongole Granite Quarries',
      branchName: 'Marble Yard - North',
      itemSummary: 'Black Galaxy Granite',
      qty: 5600,
      unit: 'sq. ft',
      totalInr: 1232000,
      status: 'Partial',
      dateLabel: '26 Apr 2024',
      dateIso: '2024-04-26',
      items: [
        {
          id: 'pbi-3a',
          itemCode: 'GRN-SLB-10X6',
          itemName: 'Black Galaxy Granite',
          dimensions: '10 ft × 6 ft',
          qty: 5600,
          unit: 'sq. ft',
          amountInr: 1232000,
        },
      ],
    },
    {
      id: 'pb-4',
      billNo: 'PB-04-2024-1107',
      supplierName: 'Makrana Artisans Guild',
      branchName: 'Slabs Godown - 1',
      itemSummary: 'Makrana CNC Border',
      qty: 280,
      unit: 'pcs',
      totalInr: 184800,
      status: 'Paid',
      dateLabel: '24 Apr 2024',
      dateIso: '2024-04-24',
      items: [
        {
          id: 'pbi-4a',
          itemCode: 'MRB-PCS-4X1',
          itemName: 'Makrana CNC Border',
          dimensions: '4 ft × 1 ft',
          qty: 280,
          unit: 'pcs',
          amountInr: 184800,
        },
      ],
    },
  ];

  const salesBills: SalesBill[] = [
    {
      id: 'sb-1',
      invoiceNo: 'INV-8841',
      customerName: 'Apex Horizon Builders',
      customerPhone: '+91 98204 11420',
      customerAddress: 'Plot 14, BKC Commercial Towers, Bandra East, Mumbai',
      branchName: 'Main Showroom',
      itemSummary: 'Italian Statuario Slab + 1 more',
      qty: 2400,
      unit: 'sq. ft',
      totalInr: 1728000,
      status: 'Paid',
      dateLabel: '30 Apr 2024',
      dateIso: '2024-04-30',
      items: [
        {
          id: 'sbi-1a',
          itemCode: 'MRB-SLB-10X5',
          itemName: 'Italian Statuario Slab',
          dimensions: '10 ft × 5 ft',
          qty: 1600,
          unit: 'sq. ft',
          amountInr: 1184000,
          status: 'Paid',
        },
        {
          id: 'sbi-1b',
          itemCode: 'MRB-SLB-9X5',
          itemName: 'Italian Statuario Slab',
          dimensions: '9 ft × 5 ft',
          qty: 800,
          unit: 'sq. ft',
          amountInr: 544000,
          status: 'Paid',
        },
      ],
    },
    {
      id: 'sb-2',
      invoiceNo: 'INV-8842',
      customerName: 'Studio Vastu Architects',
      customerPhone: '+91 98112 77390',
      customerAddress: '402 Design Plaza, Koregaon Park, Pune',
      branchName: 'Tile & Box Depot',
      itemSummary: 'Roman Travertine Tile Box + 1 more',
      qty: 170,
      unit: 'box',
      totalInr: 358500,
      status: 'Partially Paid',
      dateLabel: '29 Apr 2024',
      dateIso: '2024-04-29',
      items: [
        {
          id: 'sbi-2a',
          itemCode: 'TRA-BOX-4X2',
          itemName: 'Roman Travertine Tile Box',
          dimensions: '4 ft × 2 ft',
          qty: 110,
          unit: 'box',
          amountInr: 247500,
          status: 'Paid',
        },
        {
          id: 'sbi-2b',
          itemCode: 'TIL-BOX-2X2',
          itemName: 'Floor Tiles (Carrara Matte)',
          dimensions: '2 ft × 2 ft',
          qty: 60,
          unit: 'box',
          amountInr: 111000,
          status: 'Due',
        },
      ],
    },
    {
      id: 'sb-3',
      invoiceNo: 'INV-8843',
      customerName: 'Mehta Residency Project',
      customerPhone: '+91 97650 88211',
      customerAddress: 'Site B, Ghodbunder Road, Thane West',
      branchName: 'Slabs Godown - 1',
      itemSummary: 'Absolute Black Step Riser',
      qty: 165,
      unit: 'pcs',
      totalInr: 89100,
      status: 'Due',
      dateLabel: '28 Apr 2024',
      dateIso: '2024-04-28',
      items: [
        {
          id: 'sbi-3a',
          itemCode: 'GRN-PCS-4X1',
          itemName: 'Absolute Black Step Riser',
          dimensions: '4 ft × 0.5 ft',
          qty: 165,
          unit: 'pcs',
          amountInr: 89100,
          status: 'Due',
        },
      ],
    },
    {
      id: 'sb-4',
      invoiceNo: 'INV-8844',
      customerName: 'Kothari Villa Interiors',
      customerPhone: '+91 98330 44105',
      customerAddress: 'Villa 9, Palm Beach Enclave, Navi Mumbai',
      branchName: 'Slabs Godown - 2',
      itemSummary: 'Honey Onyx Backlit Slab',
      qty: 680,
      unit: 'sq. ft',
      totalInr: 605200,
      status: 'Paid',
      dateLabel: '27 Apr 2024',
      dateIso: '2024-04-27',
      items: [
        {
          id: 'sbi-4a',
          itemCode: 'ONX-SLB-8X5',
          itemName: 'Honey Onyx Backlit Slab',
          dimensions: '8 ft × 5 ft',
          qty: 680,
          unit: 'sq. ft',
          amountInr: 605200,
          status: 'Paid',
        },
      ],
    },
  ];

  const history: ProductHistoryEntry[] = [
    {
      id: 'hist-1',
      itemId: 'var-1',
      itemCode: 'MRB-SLB-10X5',
      type: 'Purchase',
      referenceNo: 'PB-2024-1104',
      quantityDelta: 4200,
      unit: 'sq. ft',
      systemAfter: 9900,
      physicalAfter: 9650,
      branchName: 'Main Showroom',
      partyOrNote: 'Kishangarh Marble Depot (Added to System Stock)',
      timestampLabel: '29 Apr 2024',
    },
    {
      id: 'hist-2',
      itemId: 'var-1',
      itemCode: 'MRB-SLB-10X5',
      type: 'Sale',
      referenceNo: 'INV-8841',
      quantityDelta: -2400,
      unit: 'sq. ft',
      systemAfter: 7500,
      physicalAfter: 7250,
      branchName: 'Main Showroom',
      partyOrNote: 'Apex Horizon Builders (Subtracted from System & Physical)',
      timestampLabel: '30 Apr 2024',
    },
    {
      id: 'hist-3',
      itemId: 'var-1',
      itemCode: 'MRB-SLB-10X5',
      type: 'Transfer',
      referenceNo: 'TRF-2024-8841',
      quantityDelta: 1450,
      unit: 'sq. ft',
      systemAfter: 7500,
      physicalAfter: 7250,
      branchName: 'Kishangarh Hub → Main Showroom',
      partyOrNote: 'Inter-branch bundle dispatch',
      timestampLabel: '28 Apr 2024',
    },
    {
      id: 'hist-4',
      itemId: 'var-3',
      itemCode: 'TIL-BOX-2X2',
      type: 'Purchase',
      referenceNo: 'PB-2024-1105',
      quantityDelta: 320,
      unit: 'box',
      systemAfter: 500,
      physicalAfter: 492,
      branchName: 'Tile & Box Depot',
      partyOrNote: 'Morbi Porcelain Works (Added to System Stock)',
      timestampLabel: '28 Apr 2024',
    },
    {
      id: 'hist-5',
      itemId: 'var-2',
      itemCode: 'GRN-SLB-10X6',
      type: 'Purchase',
      referenceNo: 'PB-2024-1106',
      quantityDelta: 5600,
      unit: 'sq. ft',
      systemAfter: 8000,
      physicalAfter: 8320,
      branchName: 'Marble Yard - North',
      partyOrNote: 'Ongole Granite Quarries',
      timestampLabel: '26 Apr 2024',
    },
    {
      id: 'hist-6',
      itemId: 'var-adh-1',
      itemCode: 'ADH-BAG-20KG',
      type: 'Adjustment',
      referenceNo: 'ADJ-2024-301',
      quantityDelta: -2,
      unit: 'bag',
      systemAfter: 120,
      physicalAfter: 118,
      branchName: 'Tile & Box Depot',
      partyOrNote: 'Damaged bags removed during physical bay count',
      timestampLabel: '25 Apr 2024',
    },
    {
      id: 'hist-7',
      itemId: 'slb-2',
      itemCode: 'SL-002',
      type: 'Sale',
      referenceNo: 'INV-8839',
      quantityDelta: -50,
      unit: 'sq. ft',
      systemAfter: 0,
      physicalAfter: 0,
      branchName: 'Main Showroom',
      partyOrNote: 'Sold individual slab SL-002 (10 × 5 ft Italian Marble)',
      timestampLabel: '27 Apr 2024',
    },
  ];

  const customers: CustomerRecord[] = [
    {
      id: 'cust-1',
      name: 'Apex Horizon Builders',
      segment: 'Builder',
      phone: '+91 98204 11420',
      city: 'Mumbai',
      totalPurchasedInr: 6840000,
      outstandingInr: 420000,
      lastOrderLabel: 'Today',
    },
    {
      id: 'cust-2',
      name: 'Studio Vastu Architects',
      segment: 'Architect',
      phone: '+91 98112 77390',
      city: 'Pune',
      totalPurchasedInr: 3420000,
      outstandingInr: 0,
      lastOrderLabel: 'Yesterday',
    },
    {
      id: 'cust-3',
      name: 'Mehta Residency Project',
      segment: 'Contractor',
      phone: '+91 97650 88211',
      city: 'Thane',
      totalPurchasedInr: 2150000,
      outstandingInr: 89100,
      lastOrderLabel: '2 days ago',
    },
    {
      id: 'cust-4',
      name: 'Kothari Villa Interiors',
      segment: 'Retail',
      phone: '+91 98330 44105',
      city: 'Navi Mumbai',
      totalPurchasedInr: 1490000,
      outstandingInr: 0,
      lastOrderLabel: '3 days ago',
    },
  ];

  const suppliers: SupplierRecord[] = [
    {
      id: 'sup-1',
      name: 'Kishangarh Marble Depot',
      origin: 'Kishangarh, RJ',
      specialty: 'Italian & Imported Slabs (sq. ft)',
      phone: '+91 94140 55210',
      totalSuppliedInr: 9240000,
      payableInr: 0,
      lastDeliveryLabel: 'Yesterday',
    },
    {
      id: 'sup-2',
      name: 'Morbi Porcelain Works',
      origin: 'Morbi, GJ',
      specialty: 'Boxed Porcelain & Mosaic Tiles (box)',
      phone: '+91 98250 33198',
      totalSuppliedInr: 3680000,
      payableInr: 544000,
      lastDeliveryLabel: '2 days ago',
    },
    {
      id: 'sup-3',
      name: 'Ongole Granite Quarries',
      origin: 'Ongole, AP',
      specialty: 'Black & Exotic Granite Slabs (sq. ft)',
      phone: '+91 94401 77612',
      totalSuppliedInr: 5120000,
      payableInr: 310000,
      lastDeliveryLabel: '4 days ago',
    },
    {
      id: 'sup-4',
      name: 'Makrana Artisans Guild',
      origin: 'Makrana, RJ',
      specialty: 'CNC Stone Borders & Risers (pcs)',
      phone: '+91 94132 10944',
      totalSuppliedInr: 1840000,
      payableInr: 0,
      lastDeliveryLabel: '6 days ago',
    },
  ];

  const trends = [
    {date: '1 Apr', valueCr: 15.2, accuracyPct: 98.9},
    {date: '3 Apr', valueCr: 18.0, accuracyPct: 98.7},
    {date: '5 Apr', valueCr: 22.1, accuracyPct: 98.6},
    {date: '7 Apr', valueCr: 17.8, accuracyPct: 98.8},
    {date: '9 Apr', valueCr: 19.6, accuracyPct: 98.4},
    {date: '11 Apr', valueCr: 23.1, accuracyPct: 98.0},
    {date: '13 Apr', valueCr: 20.5, accuracyPct: 98.6},
    {date: '15 Apr', valueCr: 18.1, accuracyPct: 98.8},
    {date: '17 Apr', valueCr: 19.8, accuracyPct: 99.1},
    {date: '19 Apr', valueCr: 16.2, accuracyPct: 98.5},
    {date: '21 Apr', valueCr: 17.9, accuracyPct: 98.2},
    {date: '23 Apr', valueCr: 20.4, accuracyPct: 99.2},
    {date: '25 Apr', valueCr: 24.3, accuracyPct: 98.4},
    {date: '27 Apr', valueCr: 22.4, accuracyPct: 98.3},
    {date: '29 Apr', valueCr: 21.1, accuracyPct: 98.5},
    {date: '30 Apr', valueCr: 24.68, accuracyPct: 98.76},
  ];

  const alerts: InventoryAlert[] = [
    {
      id: 'alt-1',
      severity: 'critical',
      title: 'Italian Statuario Slab below 12,500 sq. ft safety reserve at Main Showroom',
      locationName: 'Main Showroom',
      itemCode: 'MRB-SLB-001',
      timestampLabel: '10 min ago',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      acknowledged: false,
    },
    {
      id: 'alt-2',
      severity: 'warning',
      title: 'Box count variance (4.0%) for Carrara Porcelain Tile at Tile & Box Depot',
      locationName: 'Tile & Box Depot',
      itemCode: 'TIL-BOX-004',
      timestampLabel: '25 min ago',
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      acknowledged: false,
    },
    {
      id: 'alt-3',
      severity: 'info',
      title: 'Physical slab bundle audit pending at Kishangarh Hub',
      locationName: 'Kishangarh Hub',
      timestampLabel: '45 min ago',
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      acknowledged: false,
    },
    {
      id: 'alt-4',
      severity: 'critical',
      title: 'Botticino Classico Slab sq. ft stock depleted at Kishangarh Hub',
      locationName: 'Kishangarh Hub',
      itemCode: 'MRB-SLB-014',
      timestampLabel: '2 hrs ago',
      createdAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      acknowledged: false,
    },
  ];

  const transfers: StockTransfer[] = [
    {
      id: 'tr-1',
      transferCode: 'TRF-2024-8841',
      itemCode: 'MRB-SLB-001',
      itemName: 'Italian Statuario Slab',
      fromLocation: 'Kishangarh Hub',
      toLocation: 'Main Showroom',
      quantity: 1450,
      unit: 'sq. ft',
      valueCr: 0.42,
      status: 'In Transit',
      etaLabel: 'Arrives in 2h 15m',
    },
    {
      id: 'tr-2',
      transferCode: 'TRF-2024-8842',
      itemCode: 'TIL-BOX-004',
      itemName: 'Carrara Porcelain Tile',
      fromLocation: 'Tile & Box Depot',
      toLocation: 'Main Showroom',
      quantity: 180,
      unit: 'box',
      valueCr: 0.34,
      status: 'In Transit',
      etaLabel: 'Arrives in 4h 40m',
    },
    {
      id: 'tr-3',
      transferCode: 'TRF-2024-8839',
      itemCode: 'MRB-PCS-003',
      itemName: 'Makrana CNC Border',
      fromLocation: 'Slabs Godown - 1',
      toLocation: 'Display Annex',
      quantity: 220,
      unit: 'pcs',
      valueCr: 0.26,
      status: 'Delivered',
      etaLabel: 'Completed today',
    },
    {
      id: 'tr-4',
      transferCode: 'TRF-2024-8845',
      itemCode: 'GRN-SLB-002',
      itemName: 'Black Galaxy Granite',
      fromLocation: 'Marble Yard - North',
      toLocation: 'Slabs Godown - 1',
      quantity: 980,
      unit: 'sq. ft',
      valueCr: 0.21,
      status: 'Scheduled',
      etaLabel: 'Dispatch 16:00',
    },
  ];

  const initialSnap: InventorySnapshot = {
    domainVersion: DOMAIN_VERSION,
    dateRange: '01 Apr 2024 - 30 Apr 2024',
    lastUpdatedAt: new Date().toISOString(),
    kpis: {
      totalBranches: 7,
      totalBranchesDelta: 9.1,
      totalProducts: 1248,
      totalProductsDelta: 6.3,
      totalStockValueCr: 24.68,
      totalStockValueDelta: 8.6,
      inventoryAccuracyPct: 98.76,
      inventoryAccuracyDelta: 2.8,
      stockInTransitCr: 1.48,
      stockInTransitDelta: -4.3,
      lowStockItems: 38,
      lowStockItemsDelta: -11.6,
    },
    accuracyBreakdown: {
      accurateCount: 1962,
      accuratePct: 98.76,
      minorVarianceCount: 22,
      minorVariancePct: 1.11,
      majorVarianceCount: 8,
      majorVariancePct: 0.13,
    },
    stockStatus: {
      totalItems: 1248,
      inStockCount: 912,
      inStockPct: 73.1,
      lowStockCount: 38,
      lowStockPct: 3.0,
      outOfStockCount: 12,
      outOfStockPct: 1.0,
      overstockCount: 286,
      overstockPct: 22.9,
    },
    trends,
    locations,
    varianceItems,
    history,
    slabs,
    purchaseBills,
    salesBills,
    customers,
    suppliers,
    alerts,
    transfers,
  };
  syncSuppliersFromPurchaseBills(initialSnap);
  syncLocationsFromLedger(initialSnap);
  return initialSnap;
}

function loadStore(): StoreSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }

  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StoreSchema;
      if (parsed && parsed.users && parsed.snapshot && parsed.layouts) {
        // Migrate legacy snapshot or layouts cleanly to Marble Shop domain
        if (parsed.snapshot.domainVersion !== DOMAIN_VERSION) {
          parsed.snapshot = buildInitialSnapshot();
          for (const uid of Object.keys(parsed.layouts)) {
            parsed.layouts[uid] = createDefaultLayout();
          }
          for (const u of Object.values(parsed.users)) {
            u.facilityScope = 'All 7 Marble Showrooms, Yards & Depots';
          }
          fs.writeFileSync(STORE_PATH, JSON.stringify(parsed, null, 2));
        } else if (Array.isArray(parsed.snapshot.slabs)) {
          let migratedSlabs = false;
          for (const s of parsed.snapshot.slabs) {
            const rawStatus = s.status as string;
            if (rawStatus !== 'In Stock' && rawStatus !== 'Out of Stock') {
              s.status = rawStatus === 'Sold' ? 'Out of Stock' : 'In Stock';
              migratedSlabs = true;
            }
            if (s.enabled === undefined) {
              s.enabled = true;
              migratedSlabs = true;
            }
          }
          if (Array.isArray(parsed.snapshot.purchaseBills)) {
            for (const b of parsed.snapshot.purchaseBills) {
              if (!b.dateIso) {
                b.dateIso = parseDateLabelToIsoServer(b.dateLabel);
                migratedSlabs = true;
              }
              if (!/^PB-\d{2}-\d{4}-.+$/i.test(b.billNo)) {
                b.billNo = formatPurchaseBillNoServer(b.billNo, b.dateIso, b.dateLabel);
                migratedSlabs = true;
              }
              if (!Array.isArray(b.items) || b.items.length === 0) {
                b.items = [
                  {
                    id: `pbi-${b.id}`,
                    itemCode: '',
                    itemName: b.itemSummary,
                    dimensions: 'Standard',
                    qty: b.qty,
                    unit: b.unit,
                    amountInr: b.totalInr,
                  },
                ];
                migratedSlabs = true;
              }
            }
          }
          if (Array.isArray(parsed.snapshot.salesBills)) {
            for (const sb of parsed.snapshot.salesBills) {
              const normalizedSbStatus = normalizeSalesItemStatusServer(sb.status as string);
              if (sb.status !== normalizedSbStatus) {
                sb.status = normalizedSbStatus;
                migratedSlabs = true;
              }
              if (!sb.dateIso) {
                sb.dateIso = parseDateLabelToIsoServer(sb.dateLabel);
                migratedSlabs = true;
              }
              if (!/^INV-.+$/i.test(sb.invoiceNo)) {
                sb.invoiceNo = formatInvoiceNoServer(sb.invoiceNo);
                migratedSlabs = true;
              }
              if (sb.customerPhone === undefined) {
                const matchedCust = parsed.snapshot.customers?.find(
                  (c) => c.name.toLowerCase() === sb.customerName.toLowerCase(),
                );
                sb.customerPhone = matchedCust?.phone || '';
                migratedSlabs = true;
              }
              if (sb.customerAddress === undefined) {
                const matchedCust = parsed.snapshot.customers?.find(
                  (c) => c.name.toLowerCase() === sb.customerName.toLowerCase(),
                );
                sb.customerAddress = matchedCust?.city ? `${matchedCust.city}, Maharashtra` : '';
                migratedSlabs = true;
              }
              if (!Array.isArray(sb.items) || sb.items.length === 0) {
                sb.items = [
                  {
                    id: `sbi-${sb.id}`,
                    itemCode: '',
                    itemName: sb.itemSummary,
                    dimensions: 'Standard',
                    qty: sb.qty,
                    unit: sb.unit,
                    amountInr: sb.totalInr,
                    status: normalizedSbStatus,
                  },
                ];
                migratedSlabs = true;
              } else {
                const recomputed = computeSalesBillStatusServer(sb.items);
                if (sb.status !== recomputed) {
                  sb.status = recomputed;
                  migratedSlabs = true;
                }
              }
            }
          }
          if (syncSuppliersFromPurchaseBills(parsed.snapshot)) {
            migratedSlabs = true;
          }
          if (syncLocationsFromLedger(parsed.snapshot)) {
            migratedSlabs = true;
          }
          for (const uid of Object.keys(parsed.layouts)) {
            const {layout: sanitized, changed} = sanitizeLayoutServer(parsed.layouts[uid]);
            if (changed) {
              parsed.layouts[uid] = sanitized;
              migratedSlabs = true;
            }
          }
          if (migratedSlabs) {
            fs.writeFileSync(STORE_PATH, JSON.stringify(parsed, null, 2));
          }
        }
        return parsed;
      }
    } catch {
      // Fall through to re-seed on corrupted JSON
    }
  }

  const demoUserId = 'usr-demo-st';
  const {salt, hash} = hashPassword('password123');
  const initialStore: StoreSchema = {
    users: {
      [demoUserId]: {
        id: demoUserId,
        name: 'Siddharth Thakur',
        email: 'siddharth.thakur@marble-ops.com',
        initials: 'ST',
        role: 'Showroom & Yard Ops Lead',
        facilityScope: 'All 7 Marble Showrooms, Yards & Depots',
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      },
    },
    layouts: {
      [demoUserId]: createDefaultLayout(),
    },
    snapshot: buildInitialSnapshot(),
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  return initialStore;
}

const store = loadStore();

function saveStore() {
  try {
    syncLocationsFromLedger(store.snapshot);
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

function signSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({uid: userId, iat: Date.now()}),
    'utf8',
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
    };
    return decoded.uid || null;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = val;
  }
  return cookies;
}

function sanitizeUser(u: StoredUser): UserProfile {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    initials: u.initials,
    role: u.role,
    facilityScope: u.facilityScope,
  };
}

function setSessionCookie(res: Response, userId: string) {
  const token = signSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
  res.clearCookie(LOGOUT_COOKIE, {path: '/'});
}

function getAuthenticatedUser(req: Request): StoredUser | null {
  const cookies = parseCookies(req);
  const uid = verifySessionToken(cookies[SESSION_COOKIE]);
  if (uid && store.users[uid]) {
    return store.users[uid];
  }
  if (cookies[LOGOUT_COOKIE] !== '1' && store.users['usr-demo-st']) {
    return store.users['usr-demo-st'];
  }
  return null;
}

const sseClients = new Set<Response>();

function broadcastSnapshot() {
  const payload = `data: ${JSON.stringify(store.snapshot)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Keep live SSE connection fresh without mutating ledger-calculated branch inventory values
setInterval(() => {
  const snap = store.snapshot;
  syncLocationsFromLedger(snap);
  snap.lastUpdatedAt = new Date().toISOString();

  if (sseClients.size > 0) {
    broadcastSnapshot();
  }
}, 5000);

async function startServer() {
  const app = express();
  app.use(express.json({limit: '10mb'}));

  // --- Auth Routes ---
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.json({user: null});
      return;
    }
    setSessionCookie(res, user.id);
    res.json({user: sanitizeUser(user)});
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const {email, password} = req.body as {email?: string; password?: string};
    if (!email || !password) {
      res.status(400).json({error: 'Email and password are required.'});
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = Object.values(store.users).find(
      (u) => u.email.toLowerCase() === normalizedEmail,
    );
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({error: 'Invalid email or password.'});
      return;
    }
    setSessionCookie(res, user.id);
    res.json({user: sanitizeUser(user)});
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const {name, email, password, role} = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Name, valid email, and password (min 6 characters) are required.',
      });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const exists = Object.values(store.users).some(
      (u) => u.email.toLowerCase() === normalizedEmail,
    );
    if (exists) {
      res.status(409).json({error: 'An account with this email already exists.'});
      return;
    }
    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const {salt, hash} = hashPassword(password);
    const newUser: StoredUser = {
      id,
      name: name.trim(),
      email: normalizedEmail,
      initials: computeInitials(name),
      role: role?.trim() || 'Showroom Manager',
      facilityScope: 'All 7 Marble Showrooms, Yards & Depots',
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };
    store.users[id] = newUser;
    store.layouts[id] = createDefaultLayout();
    saveStore();

    setSessionCookie(res, id);
    res.status(201).json({user: sanitizeUser(newUser)});
  });

  app.post('/api/auth/demo', (_req: Request, res: Response) => {
    const demoUser = store.users['usr-demo-st'];
    if (!demoUser) {
      res.status(404).json({error: 'Demo operator account unavailable.'});
      return;
    }
    setSessionCookie(res, demoUser.id);
    res.json({user: sanitizeUser(demoUser)});
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE, {path: '/'});
    res.cookie(LOGOUT_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ok: true});
  });

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({error: 'Authentication required.'});
      return;
    }
    (req as Request & {authUser: StoredUser}).authUser = user;
    next();
  }

  // --- User Dashboard Layout Routes ---
  app.get('/api/layout', requireAuth, (req: Request, res: Response) => {
    const user = (req as Request & {authUser: StoredUser}).authUser;
    if (!store.layouts[user.id]) {
      store.layouts[user.id] = createDefaultLayout();
      saveStore();
    } else {
      const {layout: sanitized, changed} = sanitizeLayoutServer(store.layouts[user.id]);
      if (changed) {
        store.layouts[user.id] = sanitized;
        saveStore();
      }
    }
    res.json({layout: store.layouts[user.id]});
  });

  app.put('/api/layout', requireAuth, (req: Request, res: Response) => {
    const user = (req as Request & {authUser: StoredUser}).authUser;
    const body = req.body as Partial<DashboardLayout>;
    const current = store.layouts[user.id] || createDefaultLayout();

    const kpiOrder = Array.isArray(body.kpiOrder)
      ? body.kpiOrder.filter((k): k is KpiId => DEFAULT_KPI_ORDER.includes(k as KpiId))
      : current.kpiOrder;
    const widgetOrder = Array.isArray(body.widgetOrder)
      ? body.widgetOrder.filter((w): w is WidgetId => DEFAULT_WIDGET_ORDER.includes(w as WidgetId))
      : current.widgetOrder;
    const widgetSpans = body.widgetSpans
      ? {...current.widgetSpans, ...body.widgetSpans}
      : current.widgetSpans;

    const updated: DashboardLayout = {
      kpiOrder: kpiOrder.length === DEFAULT_KPI_ORDER.length ? kpiOrder : current.kpiOrder,
      widgetOrder:
        widgetOrder.length === DEFAULT_WIDGET_ORDER.length ? widgetOrder : current.widgetOrder,
      widgetSpans,
      updatedAt: new Date().toISOString(),
    };
    store.layouts[user.id] = updated;
    saveStore();
    res.json({layout: updated});
  });

  app.post('/api/layout/reset', requireAuth, (req: Request, res: Response) => {
    const user = (req as Request & {authUser: StoredUser}).authUser;
    const reset = createDefaultLayout();
    store.layouts[user.id] = reset;
    saveStore();
    res.json({layout: reset});
  });

  // --- Inventory Data & Real-Time SSE Stream ---
  app.get('/api/inventory/snapshot', (_req: Request, res: Response) => {
    res.json(store.snapshot);
  });

  app.get('/api/inventory/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify(store.snapshot)}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  function recomputeItemMetrics(item: VarianceItem) {
    item.variance = item.physicalQty - item.systemQty;
    item.variancePct =
      item.systemQty > 0
        ? Number(((item.variance / item.systemQty) * 100).toFixed(2))
        : item.physicalQty > 0
          ? 100
          : 0;
    if (item.physicalQty === 0) {
      item.status = 'Out of Stock';
    } else if (item.variancePct < -2.5) {
      item.status = 'Low Stock';
    } else if (item.variancePct > 3.5) {
      item.status = 'Overstock';
    } else {
      item.status = 'In Stock';
    }
  }

  function pushHistory(entry: Omit<ProductHistoryEntry, 'id'>) {
    const record: ProductHistoryEntry = {
      id: `hist-${crypto.randomUUID().slice(0, 6)}`,
      ...entry,
    };
    store.snapshot.history = [record, ...(store.snapshot.history || [])].slice(0, 120);
  }

  app.post('/api/inventory/adjustments', requireAuth, (req: Request, res: Response) => {
    const {itemId, newPhysicalQty, reason} = req.body as {
      itemId?: string;
      newPhysicalQty?: number;
      reason?: string;
    };
    if (!itemId || typeof newPhysicalQty !== 'number' || newPhysicalQty < 0) {
      res.status(400).json({error: 'Valid itemId and non-negative newPhysicalQty are required.'});
      return;
    }
    const item = store.snapshot.varianceItems.find((i) => i.id === itemId);
    if (!item) {
      res.status(404).json({error: 'Inventory item not found.'});
      return;
    }

    const prevPhysical = item.physicalQty;
    item.physicalQty = Math.round(newPhysicalQty);
    recomputeItemMetrics(item);
    item.lastCountedAt = 'Reconciled just now';

    pushHistory({
      itemId: item.id,
      itemCode: item.itemCode,
      type: 'Adjustment',
      referenceNo: `ADJ-${Math.floor(1000 + Math.random() * 8999)}`,
      quantityDelta: item.physicalQty - prevPhysical,
      unit: item.unit,
      systemAfter: item.systemQty,
      physicalAfter: item.physicalQty,
      branchName: item.locationName,
      partyOrNote: reason?.trim() || 'Physical yard stock count adjustment',
      timestampLabel: 'Just now',
    });

    const newAlert: InventoryAlert = {
      id: `alt-${crypto.randomUUID().slice(0, 6)}`,
      severity: 'info',
      title: `Count reconciled for ${item.itemName} (${item.physicalQty.toLocaleString('en-IN')} ${item.unit}) at ${item.locationName}${reason ? ` — ${reason}` : ''}`,
      locationName: item.locationName,
      itemCode: item.itemCode,
      timestampLabel: 'Just now',
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };
    store.snapshot.alerts = [newAlert, ...store.snapshot.alerts].slice(0, 12);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();

    res.json({item, snapshot: store.snapshot});
  });

  app.post('/api/inventory/products', requireAuth, (req: Request, res: Response) => {
    const {
      itemCode,
      itemName,
      dimensions,
      category,
      finish,
      thickness,
      locationId,
      unit,
      qty,
      unitPriceInr,
      imageUrl,
    } = req.body as {
      itemCode?: string;
      itemName?: string;
      dimensions?: string;
      category?: StoneCategory;
      finish?: VarianceItem['finish'];
      thickness?: string;
      locationId?: string;
      unit?: UnitType;
      qty?: number;
      unitPriceInr?: number;
      imageUrl?: string;
    };
    if (
      !itemCode?.trim() ||
      !itemName?.trim() ||
      !dimensions?.trim() ||
      !locationId ||
      !unit ||
      qty === undefined ||
      qty < 0
    ) {
      res
        .status(400)
        .json({error: 'Item code, name, dimensions, branch, unit, and quantity are required.'});
      return;
    }
    const loc = store.snapshot.locations.find((l) => l.id === locationId);
    if (!loc) {
      res.status(404).json({error: 'Branch not found.'});
      return;
    }
    const normalizedDim = dimensions.trim();
    const normalizedName = itemName.trim();
    const duplicate = store.snapshot.varianceItems.find(
      (i) =>
        i.locationId === loc.id &&
        i.itemName.toLowerCase() === normalizedName.toLowerCase() &&
        i.dimensions.toLowerCase() === normalizedDim.toLowerCase(),
    );
    if (duplicate) {
      res.status(409).json({
        error: `${normalizedName} (${normalizedDim}) already exists at ${loc.name}. Use a different dimension or branch.`,
      });
      return;
    }
    const newItem: VarianceItem = {
      id: `var-${crypto.randomUUID().slice(0, 6)}`,
      itemCode: itemCode.trim().toUpperCase(),
      itemName: normalizedName,
      dimensions: normalizedDim,
      category: category || 'Marble',
      finish: finish || 'Polished',
      thickness: thickness || '18 mm',
      locationId: loc.id,
      locationName: loc.name,
      unit,
      systemQty: Math.round(qty),
      physicalQty: Math.round(qty),
      variance: 0,
      variancePct: 0,
      unitPriceInr: unitPriceInr || 450,
      status: qty === 0 ? 'Out of Stock' : 'In Stock',
      lastCountedAt: 'Added just now',
      imageUrl: imageUrl?.trim() || undefined,
      enabled: true,
    };
    store.snapshot.varianceItems = [newItem, ...store.snapshot.varianceItems];
    loc.totalItems += 1;
    if (unit === 'sq. ft') loc.sqftQty += newItem.physicalQty;
    if (unit === 'pcs') loc.pcsQty += newItem.physicalQty;
    if (unit === 'box') loc.boxQty += newItem.physicalQty;
    store.snapshot.kpis.totalProducts += 1;
    store.snapshot.stockStatus.totalItems += 1;
    store.snapshot.stockStatus.inStockCount += 1;

    pushHistory({
      itemId: newItem.id,
      itemCode: newItem.itemCode,
      type: 'Adjustment',
      referenceNo: `INIT-${newItem.itemCode}`,
      quantityDelta: newItem.physicalQty,
      unit: newItem.unit,
      systemAfter: newItem.systemQty,
      physicalAfter: newItem.physicalQty,
      branchName: loc.name,
      partyOrNote: `Initial product variant created (${newItem.dimensions})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.status(201).json({item: newItem, snapshot: store.snapshot});
  });

  app.put('/api/inventory/products/:id', requireAuth, (req: Request, res: Response) => {
    const item = store.snapshot.varianceItems.find((i) => i.id === req.params.id);
    if (!item) {
      res.status(404).json({error: 'Product not found.'});
      return;
    }
    const {
      itemName,
      dimensions,
      category,
      finish,
      thickness,
      locationId,
      unitPriceInr,
      imageUrl,
      enabled,
    } = req.body as Partial<VarianceItem>;

    if (itemName?.trim()) item.itemName = itemName.trim();
    if (dimensions?.trim()) item.dimensions = dimensions.trim();
    if (category) item.category = category;
    if (finish) item.finish = finish;
    if (thickness?.trim()) item.thickness = thickness.trim();
    if (typeof unitPriceInr === 'number' && unitPriceInr > 0) {
      item.unitPriceInr = Math.round(unitPriceInr);
    }
    if (imageUrl !== undefined) {
      item.imageUrl = imageUrl.trim() || undefined;
    }
    if (typeof enabled === 'boolean') {
      item.enabled = enabled;
    }
    if (locationId) {
      const loc = store.snapshot.locations.find((l) => l.id === locationId);
      if (loc) {
        item.locationId = loc.id;
        item.locationName = loc.name;
      }
    }

    pushHistory({
      itemId: item.id,
      itemCode: item.itemCode,
      type: 'Adjustment',
      referenceNo: `EDT-${item.itemCode}`,
      quantityDelta: 0,
      unit: item.unit,
      systemAfter: item.systemQty,
      physicalAfter: item.physicalQty,
      branchName: item.locationName,
      partyOrNote: `Updated product info (${item.category} · ${item.dimensions})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({item, snapshot: store.snapshot});
  });

  app.patch('/api/inventory/products/:id/toggle', requireAuth, (req: Request, res: Response) => {
    const item = store.snapshot.varianceItems.find((i) => i.id === req.params.id);
    if (!item) {
      res.status(404).json({error: 'Product not found.'});
      return;
    }
    const nextEnabled = item.enabled === false;
    item.enabled = nextEnabled;

    pushHistory({
      itemId: item.id,
      itemCode: item.itemCode,
      type: 'Adjustment',
      referenceNo: `${nextEnabled ? 'ENB' : 'DSB'}-${item.itemCode}`,
      quantityDelta: 0,
      unit: item.unit,
      systemAfter: item.systemQty,
      physicalAfter: item.physicalQty,
      branchName: item.locationName,
      partyOrNote: `Product ${nextEnabled ? 'enabled' : 'disabled'} in catalog`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({item, snapshot: store.snapshot});
  });

  app.delete('/api/inventory/products/:id', requireAuth, (req: Request, res: Response) => {
    const idx = store.snapshot.varianceItems.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Product not found.'});
      return;
    }
    const [removed] = store.snapshot.varianceItems.splice(idx, 1);
    const loc = store.snapshot.locations.find((l) => l.id === removed.locationId);
    if (loc) {
      loc.totalItems = Math.max(0, loc.totalItems - 1);
      if (removed.unit === 'sq. ft') loc.sqftQty = Math.max(0, loc.sqftQty - removed.physicalQty);
      if (removed.unit === 'pcs') loc.pcsQty = Math.max(0, loc.pcsQty - removed.physicalQty);
      if (removed.unit === 'box') loc.boxQty = Math.max(0, loc.boxQty - removed.physicalQty);
    }
    store.snapshot.kpis.totalProducts = Math.max(0, store.snapshot.kpis.totalProducts - 1);
    store.snapshot.stockStatus.totalItems = Math.max(
      0,
      store.snapshot.stockStatus.totalItems - 1,
    );
    if (removed.status === 'In Stock') {
      store.snapshot.stockStatus.inStockCount = Math.max(
        0,
        store.snapshot.stockStatus.inStockCount - 1,
      );
    } else if (removed.status === 'Low Stock') {
      store.snapshot.stockStatus.lowStockCount = Math.max(
        0,
        store.snapshot.stockStatus.lowStockCount - 1,
      );
    } else if (removed.status === 'Out of Stock') {
      store.snapshot.stockStatus.outOfStockCount = Math.max(
        0,
        store.snapshot.stockStatus.outOfStockCount - 1,
      );
    } else if (removed.status === 'Overstock') {
      store.snapshot.stockStatus.overstockCount = Math.max(
        0,
        store.snapshot.stockStatus.overstockCount - 1,
      );
    }

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({
      deletedId: removed.id,
      itemCode: removed.itemCode,
      snapshot: store.snapshot,
    });
  });

  app.post('/api/inventory/slabs', requireAuth, (req: Request, res: Response) => {
    const {
      lotNumber,
      stoneName,
      category,
      dimensionsFt,
      slabCountPcs,
      totalSqFt,
      thicknessMm,
      branchName,
      finish,
      status,
    } = req.body as Partial<SlabLot>;
    if (!stoneName?.trim() || !totalSqFt || totalSqFt <= 0 || !branchName) {
      res.status(400).json({error: 'Product name, area (sq. ft), and branch are required.'});
      return;
    }

    let resolvedLotNumber = lotNumber?.trim().toUpperCase();
    if (!resolvedLotNumber) {
      let nextIdx = store.snapshot.slabs.length + 1;
      while (
        store.snapshot.slabs.some(
          (s) => s.lotNumber.toUpperCase() === `SL-${String(nextIdx).padStart(3, '0')}`,
        )
      ) {
        nextIdx += 1;
      }
      resolvedLotNumber = `SL-${String(nextIdx).padStart(3, '0')}`;
    } else if (
      store.snapshot.slabs.some((s) => s.lotNumber.toUpperCase() === resolvedLotNumber)
    ) {
      res.status(409).json({
        error: `Slab ID ${resolvedLotNumber} already exists. Please use a unique Slab ID.`,
      });
      return;
    }

    const normalizedStatus: SlabLot['status'] =
      status === 'Out of Stock' ? 'Out of Stock' : 'In Stock';

    const slab: SlabLot = {
      id: `slb-${crypto.randomUUID().slice(0, 6)}`,
      lotNumber: resolvedLotNumber,
      stoneName: stoneName.trim(),
      category: category || 'Marble',
      dimensionsFt: dimensionsFt?.trim() || '10 × 5 ft',
      slabCountPcs: Math.max(1, Math.round(slabCountPcs || 1)),
      totalSqFt: Number(Number(totalSqFt).toFixed(2)),
      thicknessMm: Math.max(1, Math.round(Number(thicknessMm) || 18)),
      branchName,
      finish: finish || 'Polished',
      status: normalizedStatus,
      enabled: true,
    };
    store.snapshot.slabs = [slab, ...store.snapshot.slabs];
    const loc = store.snapshot.locations.find((l) => l.name === branchName);
    if (loc && normalizedStatus === 'In Stock') {
      loc.sqftQty += slab.totalSqFt;
      loc.pcsQty += slab.slabCountPcs;
    }

    pushHistory({
      itemId: slab.id,
      itemCode: slab.lotNumber,
      type: 'Purchase',
      referenceNo: slab.lotNumber,
      quantityDelta: slab.totalSqFt,
      unit: 'sq. ft',
      systemAfter: slab.totalSqFt,
      physicalAfter: normalizedStatus === 'Out of Stock' ? 0 : slab.totalSqFt,
      branchName: slab.branchName,
      partyOrNote: `Registered slab ${slab.lotNumber} (${slab.stoneName} ${slab.dimensionsFt} · ${slab.status})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.status(201).json({slab, snapshot: store.snapshot});
  });

  app.put('/api/inventory/slabs/:id', requireAuth, (req: Request, res: Response) => {
    const slab = store.snapshot.slabs.find((s) => s.id === req.params.id);
    if (!slab) {
      res.status(404).json({error: 'Slab record not found.'});
      return;
    }
    const {
      stoneName,
      category,
      dimensionsFt,
      slabCountPcs,
      totalSqFt,
      thicknessMm,
      branchName,
      finish,
      status,
      enabled,
    } = req.body as Partial<SlabLot>;

    if (stoneName?.trim()) slab.stoneName = stoneName.trim();
    if (category) slab.category = category;
    if (dimensionsFt?.trim()) slab.dimensionsFt = dimensionsFt.trim();
    if (typeof slabCountPcs === 'number' && slabCountPcs > 0) {
      slab.slabCountPcs = Math.round(slabCountPcs);
    }
    if (typeof totalSqFt === 'number' && totalSqFt > 0) {
      slab.totalSqFt = Number(totalSqFt.toFixed(2));
    }
    if (typeof thicknessMm === 'number' && thicknessMm > 0) {
      slab.thicknessMm = Math.round(thicknessMm);
    }
    if (branchName?.trim()) slab.branchName = branchName.trim();
    if (finish) slab.finish = finish;
    if (status === 'In Stock' || status === 'Out of Stock') slab.status = status;
    if (typeof enabled === 'boolean') slab.enabled = enabled;

    pushHistory({
      itemId: slab.id,
      itemCode: slab.lotNumber,
      type: slab.status === 'Out of Stock' ? 'Sale' : 'Adjustment',
      referenceNo: `SLB-${slab.lotNumber}`,
      quantityDelta: 0,
      unit: 'sq. ft',
      systemAfter: slab.totalSqFt,
      physicalAfter: slab.status === 'Out of Stock' ? 0 : slab.totalSqFt,
      branchName: slab.branchName,
      partyOrNote: `Slab updated (${slab.stoneName} · ${slab.dimensionsFt} · Status: ${slab.status})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({slab, snapshot: store.snapshot});
  });

  app.patch('/api/inventory/slabs/:id/toggle', requireAuth, (req: Request, res: Response) => {
    const slab = store.snapshot.slabs.find((s) => s.id === req.params.id);
    if (!slab) {
      res.status(404).json({error: 'Slab record not found.'});
      return;
    }
    const nextEnabled = slab.enabled === false;
    slab.enabled = nextEnabled;

    pushHistory({
      itemId: slab.id,
      itemCode: slab.lotNumber,
      type: 'Adjustment',
      referenceNo: `${nextEnabled ? 'ENB' : 'DSB'}-${slab.lotNumber}`,
      quantityDelta: 0,
      unit: 'sq. ft',
      systemAfter: slab.totalSqFt,
      physicalAfter: slab.status === 'Out of Stock' ? 0 : slab.totalSqFt,
      branchName: slab.branchName,
      partyOrNote: `Slab ${nextEnabled ? 'enabled' : 'disabled'} in register`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({slab, snapshot: store.snapshot});
  });

  app.delete('/api/inventory/slabs/:id', requireAuth, (req: Request, res: Response) => {
    const idx = store.snapshot.slabs.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Slab record not found.'});
      return;
    }
    const [removed] = store.snapshot.slabs.splice(idx, 1);
    const loc = store.snapshot.locations.find((l) => l.name === removed.branchName);
    if (loc && removed.status === 'In Stock') {
      loc.sqftQty = Math.max(0, loc.sqftQty - removed.totalSqFt);
      loc.pcsQty = Math.max(0, loc.pcsQty - removed.slabCountPcs);
    }

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({
      deletedId: removed.id,
      lotNumber: removed.lotNumber,
      snapshot: store.snapshot,
    });
  });

  app.post('/api/inventory/purchase-bills', requireAuth, (req: Request, res: Response) => {
    const body = req.body as {
      billNo?: string;
      supplierName?: string;
      branchName?: string;
      status?: PurchaseBill['status'];
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
      }>;
      // Legacy single-item fallback fields
      itemCode?: string;
      qty?: number;
      unit?: UnitType;
      totalInr?: number;
    };

    const {billNo, supplierName, branchName, status, dateLabel, dateIso} = body;
    const rawItems =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : body.itemCode
          ? [
              {
                itemCode: body.itemCode,
                qty: body.qty,
                unit: body.unit,
                amountInr: body.totalInr,
              },
            ]
          : [];

    if (!supplierName?.trim() || !branchName?.trim() || rawItems.length === 0) {
      res.status(400).json({error: 'Supplier, branch, and at least one bill item are required.'});
      return;
    }

    const normalizedItems: PurchaseBillItem[] = [];
    for (const raw of rawItems) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        res.status(400).json({error: 'Every item requires a product, positive qty, and unit.'});
        return;
      }
      const matched = store.snapshot.varianceItems.find((i) => i.itemCode === raw.itemCode);
      const qtyRounded = Math.round(raw.qty);
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * (matched?.unitPriceInr || 450),
        ),
      );
      normalizedItems.push({
        id: `pbi-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: raw.itemCode,
        itemName: matched ? matched.itemName : raw.itemCode,
        dimensions: matched ? matched.dimensions : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
      });
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;
    const normalizedStatus: PurchaseBill['status'] =
      status === 'Paid' || status === 'Pending' || status === 'Partial' ? status : 'Pending';
    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel);
    const formattedBillNo = formatPurchaseBillNoServer(billNo, resolvedIso, dateLabel);

    const bill: PurchaseBill = {
      id: `pb-${crypto.randomUUID().slice(0, 6)}`,
      billNo: formattedBillNo,
      supplierName: supplierName.trim(),
      branchName: branchName.trim(),
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: normalizedStatus,
      dateLabel: dateLabel?.trim() || 'Today',
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    store.snapshot.purchaseBills = [bill, ...store.snapshot.purchaseBills];
    const loc = store.snapshot.locations.find((l) => l.name === bill.branchName);

    for (const line of normalizedItems) {
      const item = store.snapshot.varianceItems.find((i) => i.itemCode === line.itemCode);
      if (item) {
        // Purchase bill adds strictly to System Stock; Variance = Physical - System updates accordingly
        item.systemQty += line.qty;
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Purchase bill posted';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Purchase',
          referenceNo: bill.billNo,
          quantityDelta: line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: bill.branchName,
          partyOrNote: `${bill.supplierName} (Added to System Stock)`,
          timestampLabel: 'Just now',
        });
      }
      if (loc) {
        if (line.unit === 'sq. ft') loc.sqftQty += line.qty;
        if (line.unit === 'pcs') loc.pcsQty += line.qty;
        if (line.unit === 'box') loc.boxQty += line.qty;
      }
    }

    if (loc) {
      loc.stockValueCr = Number((loc.stockValueCr + bill.totalInr / 10000000).toFixed(2));
    }

    syncSuppliersFromPurchaseBills(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.status(201).json({bill, snapshot: store.snapshot});
  });

  app.put('/api/inventory/purchase-bills/:id', requireAuth, (req: Request, res: Response) => {
    const billIndex = store.snapshot.purchaseBills.findIndex((b) => b.id === req.params.id);
    if (billIndex === -1) {
      res.status(404).json({error: 'Purchase bill not found.'});
      return;
    }

    const existing = store.snapshot.purchaseBills[billIndex];
    const body = req.body as {
      billNo?: string;
      supplierName?: string;
      branchName?: string;
      status?: PurchaseBill['status'];
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
      }>;
    };

    const {billNo, supplierName, branchName, status, dateLabel, dateIso, items} = body;
    if (
      !supplierName?.trim() ||
      !branchName?.trim() ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      res.status(400).json({error: 'Supplier, branch, and at least one bill item are required.'});
      return;
    }

    const normalizedItems: PurchaseBillItem[] = [];
    for (const raw of items) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        res.status(400).json({error: 'Every item requires a product, positive qty, and unit.'});
        return;
      }
      const matched = store.snapshot.varianceItems.find((i) => i.itemCode === raw.itemCode);
      const qtyRounded = Math.round(raw.qty);
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * (matched?.unitPriceInr || 450),
        ),
      );
      normalizedItems.push({
        id: `pbi-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: raw.itemCode,
        itemName: matched ? matched.itemName : raw.itemCode,
        dimensions: matched ? matched.dimensions : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
      });
    }

    // Reverse old stock impact
    const prevItems =
      Array.isArray(existing.items) && existing.items.length > 0 ? existing.items : [];
    const oldLoc = store.snapshot.locations.find((l) => l.name === existing.branchName);
    for (const oldLine of prevItems) {
      const oldItem = oldLine.itemCode
        ? store.snapshot.varianceItems.find((i) => i.itemCode === oldLine.itemCode)
        : store.snapshot.varianceItems.find(
            (i) => i.itemName.toLowerCase() === oldLine.itemName.toLowerCase(),
          );
      if (oldItem) {
        oldItem.systemQty = Math.max(0, oldItem.systemQty - oldLine.qty);
        recomputeItemMetrics(oldItem);
      }
      if (oldLoc) {
        if (oldLine.unit === 'sq. ft') oldLoc.sqftQty = Math.max(0, oldLoc.sqftQty - oldLine.qty);
        if (oldLine.unit === 'pcs') oldLoc.pcsQty = Math.max(0, oldLoc.pcsQty - oldLine.qty);
        if (oldLine.unit === 'box') oldLoc.boxQty = Math.max(0, oldLoc.boxQty - oldLine.qty);
      }
    }
    if (oldLoc) {
      oldLoc.stockValueCr = Number(
        Math.max(0.5, oldLoc.stockValueCr - existing.totalInr / 10000000).toFixed(2),
      );
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;
    const normalizedStatus: PurchaseBill['status'] =
      status === 'Paid' || status === 'Pending' || status === 'Partial'
        ? status
        : existing.status;
    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel || existing.dateLabel);
    const formattedBillNo = formatPurchaseBillNoServer(
      billNo?.trim() || existing.billNo,
      resolvedIso,
      dateLabel || existing.dateLabel,
    );

    const updatedBill: PurchaseBill = {
      ...existing,
      billNo: formattedBillNo,
      supplierName: supplierName.trim(),
      branchName: branchName.trim(),
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: normalizedStatus,
      dateLabel: dateLabel?.trim() || existing.dateLabel,
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    store.snapshot.purchaseBills[billIndex] = updatedBill;

    // Apply new stock impact
    const newLoc = store.snapshot.locations.find((l) => l.name === updatedBill.branchName);
    for (const line of normalizedItems) {
      const item = store.snapshot.varianceItems.find((i) => i.itemCode === line.itemCode);
      if (item) {
        item.systemQty += line.qty;
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Purchase bill updated';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Purchase',
          referenceNo: updatedBill.billNo,
          quantityDelta: line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: updatedBill.branchName,
          partyOrNote: `${updatedBill.supplierName} (Purchase bill edited)`,
          timestampLabel: 'Just now',
        });
      }
      if (newLoc) {
        if (line.unit === 'sq. ft') newLoc.sqftQty += line.qty;
        if (line.unit === 'pcs') newLoc.pcsQty += line.qty;
        if (line.unit === 'box') newLoc.boxQty += line.qty;
      }
    }
    if (newLoc) {
      newLoc.stockValueCr = Number(
        (newLoc.stockValueCr + updatedBill.totalInr / 10000000).toFixed(2),
      );
    }

    syncSuppliersFromPurchaseBills(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({bill: updatedBill, snapshot: store.snapshot});
  });

  app.post('/api/inventory/sales-bills', requireAuth, (req: Request, res: Response) => {
    const body = req.body as {
      invoiceNo?: string;
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      branchName?: string;
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
        status?: SalesPaymentStatus;
      }>;
      // Legacy single-item fallback
      itemCode?: string;
      qty?: number;
      unit?: UnitType;
      totalInr?: number;
    };

    const {invoiceNo, customerName, customerPhone, customerAddress, branchName, dateLabel, dateIso} =
      body;
    const rawItems =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : body.itemCode
          ? [
              {
                itemCode: body.itemCode,
                qty: body.qty,
                unit: body.unit,
                amountInr: body.totalInr,
                status: 'Paid' as SalesPaymentStatus,
              },
            ]
          : [];

    if (!customerName?.trim() || !branchName?.trim() || rawItems.length === 0) {
      res
        .status(400)
        .json({error: 'Customer name, branch, and at least one invoice item are required.'});
      return;
    }

    const normalizedItems: SalesBillItem[] = [];
    for (const raw of rawItems) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        res.status(400).json({error: 'Every item requires a product, positive qty, and unit.'});
        return;
      }
      const matched = store.snapshot.varianceItems.find((i) => i.itemCode === raw.itemCode);
      const qtyRounded = Math.round(raw.qty);
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * (matched?.unitPriceInr || 500),
        ),
      );
      normalizedItems.push({
        id: `sbi-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: raw.itemCode,
        itemName: matched ? matched.itemName : raw.itemCode,
        dimensions: matched ? matched.dimensions : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
        status: normalizeSalesItemStatusServer(raw.status),
      });
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;
    const computedStatus = computeSalesBillStatusServer(normalizedItems);
    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel);

    const bill: SalesBill = {
      id: `sb-${crypto.randomUUID().slice(0, 6)}`,
      invoiceNo: formatInvoiceNoServer(invoiceNo),
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || '',
      customerAddress: customerAddress?.trim() || '',
      branchName: branchName.trim(),
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: computedStatus,
      dateLabel: dateLabel?.trim() || 'Today',
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    store.snapshot.salesBills = [bill, ...store.snapshot.salesBills];
    const loc = store.snapshot.locations.find((l) => l.name === bill.branchName);

    for (const line of normalizedItems) {
      const item = store.snapshot.varianceItems.find((i) => i.itemCode === line.itemCode);
      if (item) {
        // Sales bill subtracts qty from System Stock AND updates/subtracts Physical Stock
        item.systemQty = Math.max(0, item.systemQty - line.qty);
        item.physicalQty = Math.max(0, item.physicalQty - line.qty);
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Sales bill dispatched';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Sale',
          referenceNo: bill.invoiceNo,
          quantityDelta: -line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: bill.branchName,
          partyOrNote: `${bill.customerName} (${line.status} · Subtracted from System & Physical)`,
          timestampLabel: 'Just now',
        });
      }
      if (loc) {
        if (line.unit === 'sq. ft') loc.sqftQty = Math.max(0, loc.sqftQty - line.qty);
        if (line.unit === 'pcs') loc.pcsQty = Math.max(0, loc.pcsQty - line.qty);
        if (line.unit === 'box') loc.boxQty = Math.max(0, loc.boxQty - line.qty);
      }
    }

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.status(201).json({bill, snapshot: store.snapshot});
  });

  app.put('/api/inventory/sales-bills/:id', requireAuth, (req: Request, res: Response) => {
    const billIndex = store.snapshot.salesBills.findIndex((b) => b.id === req.params.id);
    if (billIndex === -1) {
      res.status(404).json({error: 'Sales bill not found.'});
      return;
    }

    const existing = store.snapshot.salesBills[billIndex];
    const body = req.body as {
      invoiceNo?: string;
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      branchName?: string;
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
        status?: SalesPaymentStatus;
      }>;
    };

    const {
      invoiceNo,
      customerName,
      customerPhone,
      customerAddress,
      branchName,
      dateLabel,
      dateIso,
      items,
    } = body;

    if (
      !customerName?.trim() ||
      !branchName?.trim() ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      res
        .status(400)
        .json({error: 'Customer name, branch, and at least one invoice item are required.'});
      return;
    }

    const normalizedItems: SalesBillItem[] = [];
    for (const raw of items) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        res.status(400).json({error: 'Every item requires a product, positive qty, and unit.'});
        return;
      }
      const matched = store.snapshot.varianceItems.find((i) => i.itemCode === raw.itemCode);
      const qtyRounded = Math.round(raw.qty);
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * (matched?.unitPriceInr || 500),
        ),
      );
      normalizedItems.push({
        id: `sbi-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: raw.itemCode,
        itemName: matched ? matched.itemName : raw.itemCode,
        dimensions: matched ? matched.dimensions : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
        status: normalizeSalesItemStatusServer(raw.status),
      });
    }

    // Reverse old stock deductions
    const prevItems =
      Array.isArray(existing.items) && existing.items.length > 0 ? existing.items : [];
    const oldLoc = store.snapshot.locations.find((l) => l.name === existing.branchName);
    for (const oldLine of prevItems) {
      const oldItem = oldLine.itemCode
        ? store.snapshot.varianceItems.find((i) => i.itemCode === oldLine.itemCode)
        : store.snapshot.varianceItems.find(
            (i) => i.itemName.toLowerCase() === oldLine.itemName.toLowerCase(),
          );
      if (oldItem) {
        oldItem.systemQty += oldLine.qty;
        oldItem.physicalQty += oldLine.qty;
        recomputeItemMetrics(oldItem);
      }
      if (oldLoc) {
        if (oldLine.unit === 'sq. ft') oldLoc.sqftQty += oldLine.qty;
        if (oldLine.unit === 'pcs') oldLoc.pcsQty += oldLine.qty;
        if (oldLine.unit === 'box') oldLoc.boxQty += oldLine.qty;
      }
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;
    const computedStatus = computeSalesBillStatusServer(normalizedItems);
    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel || existing.dateLabel);

    const updatedBill: SalesBill = {
      ...existing,
      invoiceNo: formatInvoiceNoServer(invoiceNo?.trim() || existing.invoiceNo),
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() ?? existing.customerPhone ?? '',
      customerAddress: customerAddress?.trim() ?? existing.customerAddress ?? '',
      branchName: branchName.trim(),
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: computedStatus,
      dateLabel: dateLabel?.trim() || existing.dateLabel,
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    store.snapshot.salesBills[billIndex] = updatedBill;

    // Apply updated stock deductions
    const newLoc = store.snapshot.locations.find((l) => l.name === updatedBill.branchName);
    for (const line of normalizedItems) {
      const item = store.snapshot.varianceItems.find((i) => i.itemCode === line.itemCode);
      if (item) {
        item.systemQty = Math.max(0, item.systemQty - line.qty);
        item.physicalQty = Math.max(0, item.physicalQty - line.qty);
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Sales bill updated';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Sale',
          referenceNo: updatedBill.invoiceNo,
          quantityDelta: -line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: updatedBill.branchName,
          partyOrNote: `${updatedBill.customerName} (Sales bill edited · ${line.status})`,
          timestampLabel: 'Just now',
        });
      }
      if (newLoc) {
        if (line.unit === 'sq. ft') newLoc.sqftQty = Math.max(0, newLoc.sqftQty - line.qty);
        if (line.unit === 'pcs') newLoc.pcsQty = Math.max(0, newLoc.pcsQty - line.qty);
        if (line.unit === 'box') newLoc.boxQty = Math.max(0, newLoc.boxQty - line.qty);
      }
    }

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({bill: updatedBill, snapshot: store.snapshot});
  });

  app.post('/api/inventory/customers', requireAuth, (req: Request, res: Response) => {
    const {name, segment, phone, city} = req.body as Partial<CustomerRecord>;
    if (!name?.trim() || !phone?.trim()) {
      res.status(400).json({error: 'Customer name and phone are required.'});
      return;
    }
    const customer: CustomerRecord = {
      id: `cust-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      segment: segment || 'Builder',
      phone: phone.trim(),
      city: city?.trim() || 'Mumbai',
      totalPurchasedInr: 0,
      outstandingInr: 0,
      lastOrderLabel: 'New',
    };
    store.snapshot.customers = [customer, ...store.snapshot.customers];
    saveStore();
    broadcastSnapshot();
    res.status(201).json({customer, snapshot: store.snapshot});
  });

  app.post('/api/inventory/suppliers', requireAuth, (req: Request, res: Response) => {
    const {name, origin, specialty, phone} = req.body as Partial<SupplierRecord>;
    if (!name?.trim() || !origin?.trim()) {
      res.status(400).json({error: 'Supplier name and origin are required.'});
      return;
    }
    const supplier: SupplierRecord = {
      id: `sup-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      origin: origin.trim(),
      specialty: specialty?.trim() || 'Marble & Granite Slabs (sq. ft)',
      phone: phone?.trim() || '+91 98000 00000',
      totalSuppliedInr: 0,
      payableInr: 0,
      lastDeliveryLabel: 'New',
    };
    store.snapshot.suppliers = [supplier, ...store.snapshot.suppliers];
    syncSuppliersFromPurchaseBills(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.status(201).json({supplier, snapshot: store.snapshot});
  });

  app.put('/api/inventory/suppliers/:id', requireAuth, (req: Request, res: Response) => {
    const supplier = store.snapshot.suppliers.find((s) => s.id === req.params.id);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found.'});
      return;
    }
    const {name, origin, specialty, phone} = req.body as Partial<SupplierRecord>;
    if (!name?.trim() || !origin?.trim()) {
      res.status(400).json({error: 'Supplier name and origin are required.'});
      return;
    }

    const oldName = supplier.name.trim().toLowerCase();
    const newName = name.trim();
    supplier.name = newName;
    supplier.origin = origin.trim();
    supplier.specialty = specialty?.trim() || supplier.specialty;
    supplier.phone = phone?.trim() || '';

    // Keep linked purchase bills in sync if supplier name changed
    if (oldName !== newName.toLowerCase()) {
      for (const bill of store.snapshot.purchaseBills) {
        if (bill.supplierName.trim().toLowerCase() === oldName) {
          bill.supplierName = newName;
        }
      }
    }

    syncSuppliersFromPurchaseBills(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({supplier, snapshot: store.snapshot});
  });

  app.delete('/api/inventory/suppliers/:id', requireAuth, (req: Request, res: Response) => {
    const idx = store.snapshot.suppliers.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Supplier not found.'});
      return;
    }
    const [removed] = store.snapshot.suppliers.splice(idx, 1);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.json({
      deletedId: removed.id,
      name: removed.name,
      snapshot: store.snapshot,
    });
  });

  app.post('/api/inventory/transfers', requireAuth, (req: Request, res: Response) => {
    const {itemCode, fromLocation, toLocation, quantity} = req.body as {
      itemCode?: string;
      fromLocation?: string;
      toLocation?: string;
      quantity?: number;
    };
    if (!itemCode || !fromLocation || !toLocation || !quantity || quantity <= 0) {
      res.status(400).json({error: 'Item, source, destination, and positive quantity are required.'});
      return;
    }
    const refItem = store.snapshot.varianceItems.find((i) => i.itemCode === itemCode);
    const unit: UnitType = refItem?.unit || 'sq. ft';
    const valueCr = Number(
      (((refItem?.unitPriceInr || 450) * quantity) / 10000000).toFixed(2),
    );
    const transfer: StockTransfer = {
      id: `tr-${crypto.randomUUID().slice(0, 6)}`,
      transferCode: `TRF-2024-${Math.floor(8850 + Math.random() * 900)}`,
      itemCode,
      itemName: refItem?.itemName || itemCode,
      fromLocation,
      toLocation,
      quantity: Math.round(quantity),
      unit,
      valueCr: Math.max(0.02, valueCr),
      status: 'In Transit',
      etaLabel: 'Dispatched just now',
    };
    store.snapshot.transfers = [transfer, ...store.snapshot.transfers];
    if (refItem) {
      pushHistory({
        itemId: refItem.id,
        itemCode: refItem.itemCode,
        type: 'Transfer',
        referenceNo: transfer.transferCode,
        quantityDelta: transfer.quantity,
        unit: transfer.unit,
        systemAfter: refItem.systemQty,
        physicalAfter: refItem.physicalQty,
        branchName: `${fromLocation} → ${toLocation}`,
        partyOrNote: `Inter-branch transfer (${transfer.status})`,
        timestampLabel: 'Just now',
      });
    }
    store.snapshot.kpis.stockInTransitCr = Number(
      (store.snapshot.kpis.stockInTransitCr + transfer.valueCr).toFixed(2),
    );
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    res.status(201).json({transfer, snapshot: store.snapshot});
  });

  app.post(
    '/api/inventory/alerts/:id/acknowledge',
    requireAuth,
    (req: Request, res: Response) => {
      const alert = store.snapshot.alerts.find((a) => a.id === req.params.id);
      if (!alert) {
        res.status(404).json({error: 'Alert not found.'});
        return;
      }
      alert.acknowledged = !alert.acknowledged;
      store.snapshot.lastUpdatedAt = new Date().toISOString();
      saveStore();
      broadcastSnapshot();
      res.json({alert, snapshot: store.snapshot});
    },
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StonePulse Marble Shop server listening on http://localhost:${PORT}`);
  });
}

startServer();
