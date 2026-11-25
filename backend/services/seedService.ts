import type {
  CustomerRecord,
  DashboardLayout,
  InventoryAlert,
  InventorySnapshot,
  KpiId,
  LocationRow,
  ProductHistoryEntry,
  PurchaseBill,
  SalesBill,
  SlabLot,
  StockTransfer,
  SupplierRecord,
  VarianceItem,
  WidgetId,
} from '../types/inventory.ts';
import {syncLocationsFromLedger, syncSuppliersFromPurchaseBills} from './branchService.ts';
import {daysAgoIsoServer, formatIsoToDateLabelServer} from './dateService.ts';

export const DOMAIN_VERSION = 'marble-v3';

export const DEFAULT_KPI_ORDER: KpiId[] = [
  'totalSales',
  'totalPurchases',
  'totalStockValue',
  'netProfit',
  'lowStockItems',
];

export const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  'outstandingPayments',
  'salesTrend',
  'valueTrend',
  'stockValueByLocation',
  'topProducts',
  'recentActivities',
  'stockStatusSummary',
  'topVarianceItems',
  'recentAlerts',
];

export const DEFAULT_WIDGET_SPANS: Record<WidgetId, 1 | 2 | 3> = {
  outstandingPayments: 3,
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

export function createDefaultLayout(): DashboardLayout {
  return {
    kpiOrder: [...DEFAULT_KPI_ORDER],
    widgetOrder: [...DEFAULT_WIDGET_ORDER],
    widgetSpans: {...DEFAULT_WIDGET_SPANS},
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeLayoutServer(layout: DashboardLayout): {
  layout: DashboardLayout;
  changed: boolean;
} {
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

const LEGACY_SLAB_SKU_MAP: Record<string, string> = {
  'MRB-SLB-10X5': 'SL-001',
  'MRB-SLB-9X5': 'SL-004',
  'GRN-SLB-10X6': 'SL-003',
  'ONX-SLB-8X5': 'SL-005',
  'MRB-SLB-9X5B': 'SL-007',
};

export function migrateUnifiedSlabs(snap: InventorySnapshot): boolean {
  let changed = false;
  const skuRemap = new Map<string, string>();
  const remainingVariance: VarianceItem[] = [];

  const nextSlabNumber = () => {
    let maxNum = 0;
    for (const s of snap.slabs) {
      const m = s.lotNumber.match(/(\d+)$/);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    return `SL-${String(maxNum + 1).padStart(3, '0')}`;
  };

  for (const item of snap.varianceItems) {
    const upperCode = item.itemCode.trim().toUpperCase();
    const mappedLot = LEGACY_SLAB_SKU_MAP[upperCode];
    const isSlabProduct = Boolean(mappedLot) || item.unit === 'sq. ft';

    if (!isSlabProduct) {
      remainingVariance.push(item);
      continue;
    }

    changed = true;
    let targetSlab =
      (mappedLot
        ? snap.slabs.find((s) => s.lotNumber.trim().toUpperCase() === mappedLot)
        : undefined) ||
      snap.slabs.find(
        (s) =>
          s.stoneName.trim().toLowerCase() === item.itemName.trim().toLowerCase() &&
          s.branchName.trim().toLowerCase() === item.locationName.trim().toLowerCase(),
      );

    if (targetSlab) {
      if (item.physicalQty > targetSlab.totalSqFt) {
        targetSlab.totalSqFt = item.physicalQty;
      }
      if (
        typeof targetSlab.systemSqFt !== 'number' ||
        item.systemQty > targetSlab.systemSqFt
      ) {
        targetSlab.systemSqFt = item.systemQty;
      }
      if (!targetSlab.unitPriceInr && item.unitPriceInr > 0) {
        targetSlab.unitPriceInr = item.unitPriceInr;
      }
      if (!targetSlab.imageUrl && item.imageUrl) {
        targetSlab.imageUrl = item.imageUrl;
      }
      skuRemap.set(upperCode, targetSlab.lotNumber);
    } else {
      const lotNumber = mappedLot || nextSlabNumber();
      const parsedThick = Number.parseInt(item.thickness, 10);
      const thicknessMm = Number.isFinite(parsedThick) && parsedThick > 0 ? parsedThick : 18;
      const newSlab: SlabLot = {
        id: `slab-migrated-${lotNumber.toLowerCase()}`,
        lotNumber,
        stoneName: item.itemName,
        category: item.category,
        dimensionsFt:
          item.dimensions.replace(/\s*ft\s*/gi, ' ').replace(/\s+/g, ' ').trim() + ' ft',
        slabCountPcs: Math.max(1, Math.round(item.physicalQty / 50)),
        systemSqFt: Math.max(0, item.systemQty),
        totalSqFt: Math.max(0, item.physicalQty),
        thicknessMm,
        branchName: item.locationName,
        finish:
          item.finish === 'Honed' || item.finish === 'Leather' ? item.finish : 'Polished',
        status: item.physicalQty > 0 ? 'In Stock' : 'Out of Stock',
        enabled: item.enabled !== false,
        unitPriceInr: item.unitPriceInr > 0 ? item.unitPriceInr : 550,
        imageUrl: item.imageUrl,
      };
      snap.slabs.push(newSlab);
      skuRemap.set(upperCode, lotNumber);
    }
  }

  for (const s of snap.slabs) {
    if (typeof s.systemSqFt !== 'number') {
      s.systemSqFt = s.status === 'Out of Stock' ? 0 : s.totalSqFt;
      changed = true;
    }
  }

  if (changed) {
    snap.varianceItems = remainingVariance;
  }

  const remapCode = (code?: string): string | undefined => {
    if (!code) return code;
    const upper = code.trim().toUpperCase();
    return skuRemap.get(upper) || LEGACY_SLAB_SKU_MAP[upper] || code;
  };

  for (const bill of snap.purchaseBills) {
    if (Array.isArray(bill.items)) {
      for (const line of bill.items) {
        const nextCode = remapCode(line.itemCode);
        if (nextCode && nextCode !== line.itemCode) {
          line.itemCode = nextCode;
          changed = true;
        }
      }
    }
  }

  for (const bill of snap.salesBills) {
    if (Array.isArray(bill.items)) {
      for (const line of bill.items) {
        const nextCode = remapCode(line.itemCode);
        if (nextCode && nextCode !== line.itemCode) {
          line.itemCode = nextCode;
          changed = true;
        }
      }
    }
  }

  for (const h of snap.history) {
    const nextCode = remapCode(h.itemCode);
    if (nextCode && nextCode !== h.itemCode) {
      h.itemCode = nextCode;
      changed = true;
    }
  }

  for (const t of snap.transfers) {
    const nextCode = remapCode(t.itemCode);
    if (nextCode && nextCode !== t.itemCode) {
      t.itemCode = nextCode;
      changed = true;
    }
  }

  if (changed) {
    syncLocationsFromLedger(snap);
  }

  return changed;
}

const SEEDED_AGE_DAYS_BY_CODE: Record<string, number> = {
  'SL-001': 28,
  'SL-002': 240,
  'SL-003': 242,
  'SL-004': 124,
  'SL-005': 54,
  'SL-006': 138,
  'SL-007': 205,
  'TIL-BOX-2X2': 35,
  'ADH-BAG-20KG': 198,
  'GRT-KG-5KG': 230,
  'MRB-PCS-4X1': 215,
  'QRT-PCS-5X2': 114,
  'TRA-BOX-4X2': 42,
  'GRN-PCS-4X1': 48,
};

export function ensureStockedDatesServer(snap: InventorySnapshot): boolean {
  let changed = false;
  if (Array.isArray(snap.varianceItems)) {
    for (let idx = 0; idx < snap.varianceItems.length; idx++) {
      const item = snap.varianceItems[idx];
      if (!item.stockedDateIso) {
        const key = (item.itemCode || '').trim().toUpperCase();
        const ageDays = SEEDED_AGE_DAYS_BY_CODE[key] ?? 105 + (idx % 5) * 28;
        item.stockedDateIso = daysAgoIsoServer(ageDays);
        changed = true;
      }
    }
  }
  if (Array.isArray(snap.slabs)) {
    for (let idx = 0; idx < snap.slabs.length; idx++) {
      const slab = snap.slabs[idx];
      if (!slab.stockedDateIso) {
        const key = (slab.lotNumber || '').trim().toUpperCase();
        const ageDays = SEEDED_AGE_DAYS_BY_CODE[key] ?? 110 + (idx % 5) * 32;
        slab.stockedDateIso = daysAgoIsoServer(ageDays);
        changed = true;
      }
    }
  }
  return changed;
}

export function ensureCrossBranchTrendingBillsServer(snap: InventorySnapshot): boolean {
  if (snap.crossBranchSeedApplied) return false;
  if (!Array.isArray(snap.salesBills)) snap.salesBills = [];

  const inv8845Iso = daysAgoIsoServer(5);
  const inv8846Iso = daysAgoIsoServer(3);

  if (!snap.salesBills.some((b) => b.invoiceNo === 'INV-8845')) {
    snap.salesBills.unshift({
      id: 'sb-5',
      invoiceNo: 'INV-8845',
      customerName: 'Kothari Villa Interiors',
      customerPhone: '+91 98330 44105',
      customerAddress: 'Villa 9, Palm Beach Enclave, Navi Mumbai',
      branchName: 'Display Annex',
      itemSummary: 'Makrana Albeta White · 16mm + 1 more',
      qty: 660,
      unit: 'sq. ft',
      totalInr: 372000,
      status: 'Paid',
      dateLabel: formatIsoToDateLabelServer(inv8845Iso),
      dateIso: inv8845Iso,
      items: [
        {
          id: 'sbi-5a',
          itemCode: 'SL-006',
          itemName: 'Makrana Albeta White · 16mm',
          dimensions: '7.5 × 4.8 ft',
          qty: 480,
          unit: 'sq. ft',
          amountInr: 249600,
          status: 'Paid',
        },
        {
          id: 'sbi-5b',
          itemCode: 'MRB-PCS-4X1',
          itemName: 'Makrana CNC Border',
          dimensions: '4 ft × 1 ft',
          qty: 180,
          unit: 'pcs',
          amountInr: 122400,
          status: 'Paid',
        },
      ],
    });
  }

  if (!snap.salesBills.some((b) => b.invoiceNo === 'INV-8846')) {
    snap.salesBills.unshift({
      id: 'sb-6',
      invoiceNo: 'INV-8846',
      customerName: 'Apex Horizon Builders',
      customerPhone: '+91 98204 11420',
      customerAddress: 'Plot 14, BKC Commercial Towers, Bandra East, Mumbai',
      branchName: 'Main Showroom',
      itemSummary: 'Black Galaxy Granite · 20mm + 1 more',
      qty: 1885,
      unit: 'sq. ft',
      totalInr: 490300,
      status: 'Paid',
      dateLabel: formatIsoToDateLabelServer(inv8846Iso),
      dateIso: inv8846Iso,
      items: [
        {
          id: 'sbi-6a',
          itemCode: 'SL-003',
          itemName: 'Black Galaxy Granite · 20mm',
          dimensions: '10 × 6 ft',
          qty: 1800,
          unit: 'sq. ft',
          amountInr: 441000,
          status: 'Paid',
        },
        {
          id: 'sbi-6b',
          itemCode: 'ADH-BAG-20KG',
          itemName: 'Tile Adhesive',
          dimensions: '20 kg Pack',
          qty: 85,
          unit: 'bag',
          amountInr: 49300,
          status: 'Paid',
        },
      ],
    });
  }

  snap.crossBranchSeedApplied = true;
  return true;
}

export function buildInitialSnapshot(): InventorySnapshot {
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
      stoneName: 'Italian Statuario Slab',
      category: 'Marble',
      dimensionsFt: '10 × 5 ft',
      slabCountPcs: 145,
      systemSqFt: 7500,
      totalSqFt: 7250,
      thicknessMm: 18,
      unitPriceInr: 740,
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
      systemSqFt: 0,
      totalSqFt: 0,
      thicknessMm: 18,
      unitPriceInr: 680,
      branchName: 'Main Showroom',
      finish: 'Polished',
      status: 'Out of Stock',
      enabled: true,
    },
    {
      id: 'slb-3',
      lotNumber: 'SL-003',
      stoneName: 'Black Galaxy Granite',
      category: 'Granite',
      dimensionsFt: '10 × 6 ft',
      slabCountPcs: 138,
      systemSqFt: 8200,
      totalSqFt: 8320,
      thicknessMm: 20,
      unitPriceInr: 245,
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
      dimensionsFt: '9 × 5 ft',
      slabCountPcs: 108,
      systemSqFt: 5100,
      totalSqFt: 4870,
      thicknessMm: 18,
      unitPriceInr: 700,
      branchName: 'Main Showroom',
      finish: 'Polished',
      status: 'In Stock',
      enabled: true,
    },
    {
      id: 'slb-5',
      lotNumber: 'SL-005',
      stoneName: 'Honey Onyx Backlit Slab',
      category: 'Onyx & Quartz',
      dimensionsFt: '8 × 5 ft',
      slabCountPcs: 100,
      systemSqFt: 4120,
      totalSqFt: 4000,
      thicknessMm: 18,
      unitPriceInr: 890,
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
      systemSqFt: 1296,
      totalSqFt: 1296,
      thicknessMm: 16,
      unitPriceInr: 520,
      branchName: 'Slabs Godown - 1',
      finish: 'Honed',
      status: 'In Stock',
      enabled: true,
    },
    {
      id: 'slb-7',
      lotNumber: 'SL-007',
      stoneName: 'Botticino Classico Slab',
      category: 'Marble',
      dimensionsFt: '9 × 5 ft',
      slabCountPcs: 40,
      systemSqFt: 1920,
      totalSqFt: 1840,
      thicknessMm: 18,
      unitPriceInr: 480,
      branchName: 'Kishangarh Hub',
      finish: 'Polished',
      status: 'Out of Stock',
      enabled: true,
    },
  ];

  const purchaseBills: PurchaseBill[] = [
    {
      id: 'pb-1',
      billNo: 'PB-04-2024-1104',
      supplierName: 'Kishangarh Marble Depot',
      branchName: 'Main Showroom',
      itemSummary: 'Italian Statuario Slab · 18mm + 1 more',
      qty: 4200,
      unit: 'sq. ft',
      totalInr: 2856000,
      status: 'Paid',
      dateLabel: '29 Apr 2024',
      dateIso: '2024-04-29',
      items: [
        {
          id: 'pbi-1a',
          itemCode: 'SL-001',
          itemName: 'Italian Statuario Slab · 18mm',
          dimensions: '10 × 5 ft',
          qty: 3000,
          unit: 'sq. ft',
          amountInr: 2100000,
        },
        {
          id: 'pbi-1b',
          itemCode: 'SL-004',
          itemName: 'Italian Statuario Extra · 18mm',
          dimensions: '9 × 5 ft',
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
      itemSummary: 'Black Galaxy Granite · 20mm',
      qty: 5600,
      unit: 'sq. ft',
      totalInr: 1232000,
      status: 'Partial',
      dateLabel: '26 Apr 2024',
      dateIso: '2024-04-26',
      items: [
        {
          id: 'pbi-3a',
          itemCode: 'SL-003',
          itemName: 'Black Galaxy Granite · 20mm',
          dimensions: '10 × 6 ft',
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
      itemSummary: 'Italian Statuario Slab · 18mm + 1 more',
      qty: 2400,
      unit: 'sq. ft',
      totalInr: 1728000,
      status: 'Paid',
      dateLabel: '30 Apr 2024',
      dateIso: '2024-04-30',
      items: [
        {
          id: 'sbi-1a',
          itemCode: 'SL-001',
          itemName: 'Italian Statuario Slab · 18mm',
          dimensions: '10 × 5 ft',
          qty: 1600,
          unit: 'sq. ft',
          amountInr: 1184000,
          status: 'Paid',
        },
        {
          id: 'sbi-1b',
          itemCode: 'SL-004',
          itemName: 'Italian Statuario Extra · 18mm',
          dimensions: '9 × 5 ft',
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
      itemSummary: 'Honey Onyx Backlit Slab · 18mm',
      qty: 680,
      unit: 'sq. ft',
      totalInr: 605200,
      status: 'Paid',
      dateLabel: '27 Apr 2024',
      dateIso: '2024-04-27',
      items: [
        {
          id: 'sbi-4a',
          itemCode: 'SL-005',
          itemName: 'Honey Onyx Backlit Slab · 18mm',
          dimensions: '8 × 5 ft',
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
      itemId: 'slb-1',
      itemCode: 'SL-001',
      type: 'Purchase',
      referenceNo: 'PB-04-2024-1104',
      quantityDelta: 3000,
      unit: 'sq. ft',
      systemAfter: 8850,
      physicalAfter: 8850,
      branchName: 'Main Showroom',
      partyOrNote: 'Kishangarh Marble Depot (Added to Slab Stock)',
      timestampLabel: '29 Apr 2024',
    },
    {
      id: 'hist-2',
      itemId: 'slb-1',
      itemCode: 'SL-001',
      type: 'Sale',
      referenceNo: 'INV-8841',
      quantityDelta: -1600,
      unit: 'sq. ft',
      systemAfter: 7250,
      physicalAfter: 7250,
      branchName: 'Main Showroom',
      partyOrNote: 'Apex Horizon Builders (Subtracted from Slab Stock)',
      timestampLabel: '30 Apr 2024',
    },
    {
      id: 'hist-3',
      itemId: 'slb-1',
      itemCode: 'SL-001',
      type: 'Transfer',
      referenceNo: 'TRF-2024-8841',
      quantityDelta: 1450,
      unit: 'sq. ft',
      systemAfter: 7250,
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
    purchaseReturns: [],
    salesBills,
    customers,
    suppliers,
    alerts,
    transfers,
  };
  ensureStockedDatesServer(initialSnap);
  ensureCrossBranchTrendingBillsServer(initialSnap);
  syncSuppliersFromPurchaseBills(initialSnap);
  syncLocationsFromLedger(initialSnap);
  return initialSnap;
}
