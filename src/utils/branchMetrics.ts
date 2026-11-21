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
} from '../types/inventory';

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

export function formatInrCompact(amountInr: number): string {
  const safe = Number.isFinite(amountInr) ? amountInr : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}₹ ${(abs / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹ ${(abs / 100000).toFixed(2)} L`;
  }
  return `${sign}₹ ${Math.round(abs).toLocaleString('en-IN')}`;
}

export function formatInrExact(amountInr: number): string {
  const safe = Number.isFinite(amountInr) ? Math.round(amountInr) : 0;
  const sign = safe < 0 ? '-' : '';
  return `${sign}₹ ${Math.abs(safe).toLocaleString('en-IN')}`;
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
  const matchingSqftProducts = allProducts.filter(
    (p) => p.enabled !== false && p.category === slab.category && p.unit === 'sq. ft' && p.unitPriceInr > 0,
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

  // 1. Products totals
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

  // 2. Slabs totals (In Stock slabs contribute to available branch stock & valuation)
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

  // 3. Purchase bills totals (+)
  let purchaseSqft = 0;
  let purchasePcs = 0;
  let purchaseBox = 0;
  let purchaseValueInr = 0;
  const skuSet = new Set<string>();

  for (const p of products) {
    skuSet.add(`prod:${p.itemCode.toUpperCase()}`);
  }
  for (const s of inStockSlabs) {
    skuSet.add(`slab:${s.lotNumber.toUpperCase()}`);
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
        skuSet.add(`prod:${line.itemCode.toUpperCase()}`);
      }
    }
  }

  // 4. Sales bills totals (-)
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
        skuSet.add(`prod:${line.itemCode.toUpperCase()}`);
      }
    }
  }

  // Net branch quantities & valuation
  const netSqft = Math.max(0, Math.round(prodSqft + slabSqft + purchaseSqft - salesSqft));
  const netPcs = Math.max(0, Math.round(prodPcs + slabPcs + purchasePcs - salesPcs));
  const netBox = Math.max(0, Math.round(prodBox + purchaseBox - salesBox));
  const netValueInr = Math.max(
    0,
    Math.round(prodValueInr + slabValueInr + purchaseValueInr - salesValueInr),
  );
  const netValueCr = Number((netValueInr / 10000000).toFixed(4));

  // Accuracy & variance counts from branch products
  const totalSystemQty = products.reduce((sum, p) => sum + Math.max(0, Number(p.systemQty) || 0), 0);
  const totalAbsVariance = products.reduce(
    (sum, p) => sum + Math.abs((Number(p.physicalQty) || 0) - (Number(p.systemQty) || 0)),
    0,
  );
  const accuracyPct =
    totalSystemQty > 0
      ? Number(Math.max(0, Math.min(100, (1 - totalAbsVariance / totalSystemQty) * 100)).toFixed(2))
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
