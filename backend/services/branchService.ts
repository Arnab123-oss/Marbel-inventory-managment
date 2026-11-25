import type {
  InventorySnapshot,
  LocationRow,
  PurchaseBill,
  PurchaseBillItem,
  SalesBill,
  SalesBillItem,
  SlabLot,
  StoneCategory,
  VarianceItem,
} from '../types/inventory.ts';
import {getPurchaseBillAmountServer} from './dateService.ts';

const DEFAULT_SLAB_RATE_BY_CATEGORY: Record<StoneCategory, number> = {
  Marble: 650,
  Granite: 260,
  'Onyx & Quartz': 850,
  Tiles: 180,
  Adhesives: 150,
};

export interface UnitSourceTotals {
  count: number;
  sqft: number;
  pcs: number;
  box: number;
  valueInr: number;
}

export interface SlabSourceTotals {
  count: number;
  inStockCount: number;
  outOfStockCount: number;
  sqft: number;
  pcs: number;
  valueInr: number;
}

export interface BranchLedgerBreakdown {
  location: LocationRow;
  products: VarianceItem[];
  slabs: SlabLot[];
  purchaseBills: PurchaseBill[];
  salesBills: SalesBill[];
  sources: {
    products: UnitSourceTotals;
    slabs: SlabSourceTotals;
    purchases: UnitSourceTotals;
    sales: UnitSourceTotals;
  };
  net: {
    skus: number;
    sqft: number;
    pcs: number;
    box: number;
    valueInr: number;
    valueCr: number;
    accuracyPct: number;
    minorVariances: number;
    majorVariances: number;
    lowStock: number;
    overstock: number;
  };
}

export function getPurchaseBillLines(bill: PurchaseBill): PurchaseBillItem[] {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return bill.items;
  }
  return [
    {
      id: `pb-line-${bill.id}`,
      itemCode: '',
      itemName: bill.itemSummary,
      dimensions: 'Standard',
      qty: Number(bill.qty) || 0,
      unit: bill.unit,
      amountInr: Number(bill.totalInr) || 0,
    },
  ];
}

export function getSalesBillLines(bill: SalesBill): SalesBillItem[] {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return bill.items;
  }
  return [
    {
      id: `sb-line-${bill.id}`,
      itemCode: '',
      itemName: bill.itemSummary,
      dimensions: 'Standard',
      qty: Number(bill.qty) || 0,
      unit: bill.unit,
      amountInr: Number(bill.totalInr) || 0,
      status: bill.status,
    },
  ];
}

export function estimateSlabRateInr(
  slab: SlabLot,
  allProducts: VarianceItem[],
): number {
  if (slab.unitPriceInr && slab.unitPriceInr > 0) {
    return Math.round(slab.unitPriceInr);
  }
  const matchingSqftProducts = allProducts.filter(
    (p) =>
      p.enabled !== false &&
      p.category === slab.category &&
      p.unit === 'sq. ft' &&
      p.unitPriceInr > 0,
  );
  if (matchingSqftProducts.length > 0) {
    const avg =
      matchingSqftProducts.reduce((sum, p) => sum + p.unitPriceInr, 0) /
      matchingSqftProducts.length;
    return Math.round(avg);
  }
  return DEFAULT_SLAB_RATE_BY_CATEGORY[slab.category] || 450;
}

export function computeBranchBreakdown(
  loc: LocationRow,
  data: Pick<InventorySnapshot, 'varianceItems' | 'slabs' | 'purchaseBills' | 'salesBills'>,
): BranchLedgerBreakdown {
  const locNameLower = loc.name.trim().toLowerCase();

  const products = (data.varianceItems || []).filter(
    (p) =>
      p.enabled !== false &&
      (p.locationId === loc.id || p.locationName.trim().toLowerCase() === locNameLower),
  );

  const slabs = (data.slabs || []).filter(
    (s) => s.enabled !== false && s.branchName.trim().toLowerCase() === locNameLower,
  );
  const inStockSlabs = slabs.filter((s) => s.status === 'In Stock');
  const outOfStockSlabs = slabs.filter((s) => s.status === 'Out of Stock');

  const purchaseBills = (data.purchaseBills || []).filter(
    (b) => b.branchName.trim().toLowerCase() === locNameLower,
  );

  const salesBills = (data.salesBills || []).filter(
    (b) => b.branchName.trim().toLowerCase() === locNameLower,
  );

  let prodSqft = 0;
  let prodPcs = 0;
  let prodBox = 0;
  let prodValueInr = 0;
  for (const p of products) {
    const qty = Math.max(0, Number(p.physicalQty) || 0);
    if (p.unit === 'sq. ft') prodSqft += qty;
    else if (p.unit === 'pcs') prodPcs += qty;
    else if (p.unit === 'box') prodBox += qty;
    prodValueInr += qty * (Number(p.unitPriceInr) || 0);
  }

  let slabSqft = 0;
  let slabPcs = 0;
  let slabValueInr = 0;
  for (const s of inStockSlabs) {
    const area = Math.max(0, Number(s.totalSqFt) || 0);
    const pcs = Math.max(0, Number(s.slabCountPcs) || 0);
    slabSqft += area;
    slabPcs += pcs;
    slabValueInr += area * estimateSlabRateInr(s, data.varianceItems || []);
  }

  let purchaseSqft = 0;
  let purchasePcs = 0;
  let purchaseBox = 0;
  let purchaseValueInr = 0;
  const skuSet = new Set<string>();

  for (const p of products) {
    skuSet.add(p.itemCode.trim().toUpperCase());
  }
  for (const s of inStockSlabs) {
    skuSet.add(s.lotNumber.trim().toUpperCase());
  }

  for (const bill of purchaseBills) {
    const lines = getPurchaseBillLines(bill);
    for (const line of lines) {
      const qty = Math.max(0, Number(line.qty) || 0);
      if (line.unit === 'sq. ft') purchaseSqft += qty;
      else if (line.unit === 'pcs') purchasePcs += qty;
      else if (line.unit === 'box') purchaseBox += qty;
      purchaseValueInr += Math.max(0, Number(line.amountInr) || 0);
      if (line.itemCode) {
        skuSet.add(line.itemCode.trim().toUpperCase());
      }
    }
  }

  let salesSqft = 0;
  let salesPcs = 0;
  let salesBox = 0;
  let salesValueInr = 0;
  for (const bill of salesBills) {
    const lines = getSalesBillLines(bill);
    for (const line of lines) {
      const qty = Math.max(0, Number(line.qty) || 0);
      if (line.unit === 'sq. ft') salesSqft += qty;
      else if (line.unit === 'pcs') salesPcs += qty;
      else if (line.unit === 'box') salesBox += qty;
      salesValueInr += Math.max(0, Number(line.amountInr) || 0);
      if (line.itemCode) {
        skuSet.add(line.itemCode.trim().toUpperCase());
      }
    }
  }

  const netSqft = Math.max(0, Math.round(prodSqft + slabSqft + purchaseSqft - salesSqft));
  const netPcs = Math.max(0, Math.round(prodPcs + slabPcs + purchasePcs - salesPcs));
  const netBox = Math.max(0, Math.round(prodBox + purchaseBox - salesBox));
  const netValueInr = Math.max(
    0,
    Math.round(prodValueInr + slabValueInr + purchaseValueInr - salesValueInr),
  );
  const netValueCr = Number((netValueInr / 10000000).toFixed(4));

  const totalSystemQty = products.reduce(
    (sum, p) => sum + Math.max(0, Number(p.systemQty) || 0),
    0,
  );
  const totalAbsVariance = products.reduce(
    (sum, p) => sum + Math.abs((Number(p.physicalQty) || 0) - (Number(p.systemQty) || 0)),
    0,
  );
  const accuracyPct =
    totalSystemQty > 0
      ? Number(
          Math.max(0, Math.min(100, (1 - totalAbsVariance / totalSystemQty) * 100)).toFixed(2),
        )
      : 100;

  let minorVariances = 0;
  let majorVariances = 0;
  let lowStock = 0;
  let overstock = 0;

  for (const p of products) {
    const absPct = Math.abs(Number(p.variancePct) || 0);
    if (absPct > 0 && absPct <= 3) minorVariances += 1;
    else if (absPct > 3) majorVariances += 1;
    if (p.status === 'Low Stock' || p.status === 'Out of Stock') lowStock += 1;
    if (p.status === 'Overstock') overstock += 1;
  }
  lowStock += outOfStockSlabs.length;

  const updatedLocation: LocationRow = {
    ...loc,
    totalItems: skuSet.size,
    sqftQty: netSqft,
    pcsQty: netPcs,
    boxQty: netBox,
    stockValueInr: netValueInr,
    stockValueCr: Number((netValueInr / 10000000).toFixed(2)),
    inventoryAccuracyPct: accuracyPct,
    minorVarianceItems: minorVariances,
    majorVarianceItems: majorVariances,
    lowStockItems: lowStock,
    overstockItems: overstock,
  };

  return {
    location: updatedLocation,
    products,
    slabs,
    purchaseBills,
    salesBills,
    sources: {
      products: {
        count: products.length,
        sqft: Math.round(prodSqft),
        pcs: Math.round(prodPcs),
        box: Math.round(prodBox),
        valueInr: Math.round(prodValueInr),
      },
      slabs: {
        count: slabs.length,
        inStockCount: inStockSlabs.length,
        outOfStockCount: outOfStockSlabs.length,
        sqft: Math.round(slabSqft),
        pcs: Math.round(slabPcs),
        valueInr: Math.round(slabValueInr),
      },
      purchases: {
        count: purchaseBills.length,
        sqft: Math.round(purchaseSqft),
        pcs: Math.round(purchasePcs),
        box: Math.round(purchaseBox),
        valueInr: Math.round(purchaseValueInr),
      },
      sales: {
        count: salesBills.length,
        sqft: Math.round(salesSqft),
        pcs: Math.round(salesPcs),
        box: Math.round(salesBox),
        valueInr: Math.round(salesValueInr),
      },
    },
    net: {
      skus: skuSet.size,
      sqft: netSqft,
      pcs: netPcs,
      box: netBox,
      valueInr: netValueInr,
      valueCr: netValueCr,
      accuracyPct,
      minorVariances,
      majorVariances,
      lowStock,
      overstock,
    },
  };
}

export function computeAllBranches(snapshot: InventorySnapshot): BranchLedgerBreakdown[] {
  return snapshot.locations.map((loc) => computeBranchBreakdown(loc, snapshot));
}

export function syncLocationsFromLedger(snap: InventorySnapshot): boolean {
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

export function syncSuppliersFromPurchaseBills(snapshot: InventorySnapshot): boolean {
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
