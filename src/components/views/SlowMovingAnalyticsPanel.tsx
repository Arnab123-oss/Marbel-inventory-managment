import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  PackageX,
  Search,
  Sparkles,
  TrendingDown,
  Truck,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {
  InventorySnapshot,
  LocationRow,
  StoneCategory,
} from '../../types/inventory';
import {
  estimateSlabRateInr,
  formatInrCompact,
  formatInrExact,
  getPurchaseBillLines,
  getSalesBillLines,
} from '../../utils/branchMetrics';

export type AgingSegmentFilter =
  | 'all'
  | 'gt90'
  | '91_180'
  | 'gt180'
  | 'no_sales'
  | 'slow_marble';

export interface StockAgingItem {
  id: string;
  sourceKind: 'Slab Lot' | 'Catalog SKU';
  itemCode: string;
  itemName: string;
  dimensions: string;
  category: StoneCategory;
  finish: string;
  branchName: string;
  locationRow?: LocationRow;
  qty: number;
  unit: string;
  unitPriceInr: number;
  stockValueInr: number;
  stockedDateIso: string;
  lastMovementIso: string;
  ageDays: number;
  ageBucket: '0-30d' | '31-90d' | '91-180d' | '>180d';
  salesQty: number;
  globalSalesQty: number;
  salesRevenueInr: number;
  salesCount: number;
  lastSaleIso: string | null;
  turnoverPct: number;
  isOlderThan90: boolean;
  isOlderThan180: boolean;
  hasNoSales: boolean;
  hasNoLocalSales: boolean;
  trendingBranchName: string | null;
  isSlowMovingMarble: boolean;
  movementStatus: 'Dead Risk (>180d)' | 'No Sales' | 'Slow-Moving' | 'Active';
  recommendation: string;
}

export interface RebalanceRecommendation {
  id: string;
  itemCode: string;
  itemName: string;
  dimensions: string;
  category: StoneCategory;
  unit: string;
  fromBranch: string;
  fromBranchRow?: LocationRow;
  fromStockQty: number;
  fromAgeDays: number;
  fromLocalSalesQty: number;
  toBranch: string;
  toBranchRow?: LocationRow;
  toBranchStockQty: number;
  toBranchSalesQty: number;
  toBranchSalesCount: number;
  toBranchLastSaleIso: string;
  toBranchLastSaleDaysAgo: number;
  recommendedQty: number;
  recommendedValueInr: number;
  priority: 'High' | 'Medium';
  ownerAdvice: string;
  activeTransferCode: string | null;
}

export interface SlowMovingStockAnalysis {
  items: StockAgingItem[];
  rebalanceRecommendations: RebalanceRecommendation[];
  rebalanceTotalValueInr: number;
  totalInStockCount: number;
  totalInStockValueInr: number;
  olderThan90Items: StockAgingItem[];
  olderThan90ValueInr: number;
  bucket91To180Count: number;
  olderThan180Items: StockAgingItem[];
  olderThan180ValueInr: number;
  noSalesItems: StockAgingItem[];
  noSalesValueInr: number;
  slowMovingMarbleItems: StockAgingItem[];
  slowMovingMarbleValueInr: number;
  slowMovingMarbleSqft: number;
  slowMovingMarblePcs: number;
  ageBuckets: Array<{
    key: '0-30d' | '31-90d' | '91-180d' | '>180d';
    label: string;
    subtitle: string;
    count: number;
    valueInr: number;
    pctOfValue: number;
    barColor: string;
    segmentFilter: AgingSegmentFilter;
  }>;
}

function parseIsoMidnight(iso?: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return null;
  return new Date(y, mo, d);
}

const MONTHS_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

function normalizeBillIso(dateLabel?: string, dateIso?: string): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) {
    return dateIso.trim();
  }
  if (dateLabel) {
    const trimmed = dateLabel.trim();
    if (/^today$/i.test(trimmed)) return new Date().toISOString().slice(0, 10);
    const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(trimmed);
    if (m) {
      const mIdx = MONTHS_SHORT.indexOf(m[2].slice(0, 3).toLowerCase());
      if (mIdx >= 0) {
        return `${m[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
      }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function formatShortIso(iso: string): string {
  const dt = parseIsoMidnight(iso);
  if (!dt) return iso;
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function stripThicknessSuffix(name: string): string {
  return name.replace(/\s*·\s*\d+\s*mm\b/gi, '').trim().toLowerCase();
}

export function computeSlowMovingStockAnalysis(
  snapshot: InventorySnapshot,
): SlowMovingStockAnalysis {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayMs = today.getTime();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const msPerDay = 24 * 60 * 60 * 1000;

  interface TradeStats {
    salesQty: number;
    salesRevenueInr: number;
    salesCount: number;
    lastSaleIso: string | null;
    lastPurchaseIso: string | null;
  }

  interface BranchSaleDemand {
    branchName: string;
    itemCode: string;
    itemName: string;
    salesQty: number;
    salesRevenueInr: number;
    salesCount: number;
    lastSaleIso: string;
  }

  // Per-(branch, product) sales & purchase maps
  const branchStatsByCode = new Map<string, TradeStats>();
  const branchStatsByName = new Map<string, TradeStats>();
  const globalSalesQtyByCode = new Map<string, number>();
  const globalSalesQtyByName = new Map<string, number>();

  // All branch demand aggregates for cross-branch rebalancing
  const demandByBranchAndProduct = new Map<string, BranchSaleDemand>();

  const ensureStats = (map: Map<string, TradeStats>, key: string): TradeStats => {
    let existing = map.get(key);
    if (!existing) {
      existing = {
        salesQty: 0,
        salesRevenueInr: 0,
        salesCount: 0,
        lastSaleIso: null,
        lastPurchaseIso: null,
      };
      map.set(key, existing);
    }
    return existing;
  };

  for (const bill of snapshot.salesBills) {
    const iso = normalizeBillIso(bill.dateLabel, bill.dateIso);
    const branchKey = bill.branchName.trim().toLowerCase();
    for (const line of getSalesBillLines(bill)) {
      const qty = Math.max(0, Number(line.qty) || 0);
      const rev = Math.max(0, Number(line.amountInr) || 0);
      const codeKey = (line.itemCode || '').trim().toLowerCase();
      const baseNameKey = stripThicknessSuffix(line.itemName || '');

      if (codeKey) {
        const bs = ensureStats(branchStatsByCode, `${branchKey}::${codeKey}`);
        bs.salesQty += qty;
        bs.salesRevenueInr += rev;
        bs.salesCount += 1;
        if (!bs.lastSaleIso || iso > bs.lastSaleIso) bs.lastSaleIso = iso;
        globalSalesQtyByCode.set(codeKey, (globalSalesQtyByCode.get(codeKey) || 0) + qty);
      }
      if (baseNameKey) {
        const bs = ensureStats(branchStatsByName, `${branchKey}::${baseNameKey}`);
        bs.salesQty += qty;
        bs.salesRevenueInr += rev;
        bs.salesCount += 1;
        if (!bs.lastSaleIso || iso > bs.lastSaleIso) bs.lastSaleIso = iso;
        globalSalesQtyByName.set(
          baseNameKey,
          (globalSalesQtyByName.get(baseNameKey) || 0) + qty,
        );
      }

      const prodIdentity = codeKey || baseNameKey;
      if (prodIdentity && qty > 0) {
        const demandKey = `${branchKey}::${prodIdentity}`;
        const prev = demandByBranchAndProduct.get(demandKey);
        if (!prev) {
          demandByBranchAndProduct.set(demandKey, {
            branchName: bill.branchName,
            itemCode: (line.itemCode || '').trim(),
            itemName: line.itemName,
            salesQty: qty,
            salesRevenueInr: rev,
            salesCount: 1,
            lastSaleIso: iso,
          });
        } else {
          prev.salesQty += qty;
          prev.salesRevenueInr += rev;
          prev.salesCount += 1;
          if (iso > prev.lastSaleIso) prev.lastSaleIso = iso;
        }
      }
    }
  }

  for (const bill of snapshot.purchaseBills) {
    const iso = normalizeBillIso(bill.dateLabel, bill.dateIso);
    const branchKey = bill.branchName.trim().toLowerCase();
    for (const line of getPurchaseBillLines(bill)) {
      const codeKey = (line.itemCode || '').trim().toLowerCase();
      const baseNameKey = stripThicknessSuffix(line.itemName || '');
      if (codeKey) {
        const bs = ensureStats(branchStatsByCode, `${branchKey}::${codeKey}`);
        if (!bs.lastPurchaseIso || iso > bs.lastPurchaseIso) bs.lastPurchaseIso = iso;
      }
      if (baseNameKey) {
        const bs = ensureStats(branchStatsByName, `${branchKey}::${baseNameKey}`);
        if (!bs.lastPurchaseIso || iso > bs.lastPurchaseIso) bs.lastPurchaseIso = iso;
      }
    }
  }

  const lookupLocalTradeStats = (branchName: string, code: string, name: string) => {
    const branchKey = branchName.trim().toLowerCase();
    const codeKey = code.trim().toLowerCase();
    const baseNameKey = stripThicknessSuffix(name);

    const globalQty = Math.max(
      codeKey ? globalSalesQtyByCode.get(codeKey) || 0 : 0,
      baseNameKey ? globalSalesQtyByName.get(baseNameKey) || 0 : 0,
    );

    if (codeKey && branchStatsByCode.has(`${branchKey}::${codeKey}`)) {
      return {stats: branchStatsByCode.get(`${branchKey}::${codeKey}`)!, globalQty};
    }
    if (baseNameKey && branchStatsByName.has(`${branchKey}::${baseNameKey}`)) {
      return {stats: branchStatsByName.get(`${branchKey}::${baseNameKey}`)!, globalQty};
    }
    for (const [k, v] of branchStatsByName.entries()) {
      const [kBranch, kName] = k.split('::');
      if (kBranch === branchKey && (kName.includes(baseNameKey) || baseNameKey.includes(kName))) {
        return {stats: v, globalQty};
      }
    }
    return {
      stats: {
        salesQty: 0,
        salesRevenueInr: 0,
        salesCount: 0,
        lastSaleIso: null,
        lastPurchaseIso: null,
      },
      globalQty,
    };
  };

  // Track on-hand stock per (branch, product) so we know if Branch B is out/low on stock
  const branchStockLookup = new Map<string, number>();
  for (const s of snapshot.slabs) {
    if (s.enabled === false || s.status !== 'In Stock') continue;
    const bKey = s.branchName.trim().toLowerCase();
    const codeKey = s.lotNumber.trim().toLowerCase();
    const nameKey = stripThicknessSuffix(s.stoneName);
    branchStockLookup.set(`${bKey}::${codeKey}`, (branchStockLookup.get(`${bKey}::${codeKey}`) || 0) + Math.max(0, s.totalSqFt));
    branchStockLookup.set(`${bKey}::${nameKey}`, (branchStockLookup.get(`${bKey}::${nameKey}`) || 0) + Math.max(0, s.totalSqFt));
  }
  for (const p of snapshot.varianceItems) {
    if (p.enabled === false) continue;
    const bKey = p.locationName.trim().toLowerCase();
    const codeKey = p.itemCode.trim().toLowerCase();
    const nameKey = stripThicknessSuffix(p.itemName);
    branchStockLookup.set(`${bKey}::${codeKey}`, (branchStockLookup.get(`${bKey}::${codeKey}`) || 0) + Math.max(0, p.physicalQty));
    branchStockLookup.set(`${bKey}::${nameKey}`, (branchStockLookup.get(`${bKey}::${nameKey}`) || 0) + Math.max(0, p.physicalQty));
  }

  const allDemands = Array.from(demandByBranchAndProduct.values());

  const findBestTrendingDestination = (
    sourceBranch: string,
    itemCode: string,
    itemName: string,
    localSalesQty: number,
    sourceStockQty: number,
  ): BranchSaleDemand | null => {
    const srcBranchLower = sourceBranch.trim().toLowerCase();
    const codeLower = itemCode.trim().toLowerCase();
    const baseNameLower = stripThicknessSuffix(itemName);

    const candidates = allDemands.filter((d) => {
      if (d.branchName.trim().toLowerCase() === srcBranchLower) return false;
      const dCode = d.itemCode.trim().toLowerCase();
      const dBaseName = stripThicknessSuffix(d.itemName);
      const matchesProduct =
        (codeLower && dCode && codeLower === dCode) ||
        (baseNameLower && dBaseName && (baseNameLower === dBaseName || dBaseName.includes(baseNameLower) || baseNameLower.includes(dBaseName)));
      if (!matchesProduct) return false;
      // Branch B must have stronger sales than Branch A and less local stock than Branch A
      const destBranchLower = d.branchName.trim().toLowerCase();
      const destStock = Math.max(
        codeLower ? branchStockLookup.get(`${destBranchLower}::${codeLower}`) || 0 : 0,
        baseNameLower ? branchStockLookup.get(`${destBranchLower}::${baseNameLower}`) || 0 : 0,
      );
      return d.salesQty > localSalesQty && destStock < sourceStockQty;
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (b.lastSaleIso !== a.lastSaleIso) return b.lastSaleIso.localeCompare(a.lastSaleIso);
      return b.salesQty - a.salesQty;
    });
    return candidates[0];
  };

  const buildAgingItem = (input: {
    id: string;
    sourceKind: 'Slab Lot' | 'Catalog SKU';
    itemCode: string;
    itemName: string;
    dimensions: string;
    category: StoneCategory;
    finish: string;
    branchName: string;
    qty: number;
    unit: string;
    unitPriceInr: number;
    stockedDateIso?: string;
  }): {agingItem: StockAgingItem; rebalance: RebalanceRecommendation | null} => {
    const {stats: trade, globalQty} = lookupLocalTradeStats(
      input.branchName,
      input.itemCode,
      input.itemName,
    );
    const stockedIso = input.stockedDateIso || todayIso;

    let lastMovementIso = stockedIso;
    if (trade.lastSaleIso && trade.lastSaleIso > lastMovementIso) {
      lastMovementIso = trade.lastSaleIso;
    }
    if (trade.lastPurchaseIso && trade.lastPurchaseIso > lastMovementIso) {
      lastMovementIso = trade.lastPurchaseIso;
    }

    const refDate = parseIsoMidnight(lastMovementIso) || today;
    const ageDays = Math.max(0, Math.round((todayMs - refDate.getTime()) / msPerDay));
    const ageBucket: StockAgingItem['ageBucket'] =
      ageDays > 180
        ? '>180d'
        : ageDays > 90
          ? '91-180d'
          : ageDays > 30
            ? '31-90d'
            : '0-30d';

    const stockValueInr = Math.round(input.qty * input.unitPriceInr);
    const denom = input.qty + trade.salesQty;
    const turnoverPct = denom > 0 ? Number(((trade.salesQty / denom) * 100).toFixed(1)) : 0;

    const isOlderThan90 = ageDays > 90;
    const isOlderThan180 = ageDays > 180;
    const hasNoLocalSales = trade.salesQty === 0;
    const hasNoSales = globalQty === 0;
    const isSlowMovingMarble =
      input.category === 'Marble' && (hasNoLocalSales || isOlderThan90 || turnoverPct < 20);

    const trendingDest = isOlderThan90
      ? findBestTrendingDestination(
          input.branchName,
          input.itemCode,
          input.itemName,
          trade.salesQty,
          input.qty,
        )
      : null;

    const movementStatus: StockAgingItem['movementStatus'] = isOlderThan180
      ? 'Dead Risk (>180d)'
      : hasNoSales
        ? 'No Sales'
        : isOlderThan90 || turnoverPct < 20
          ? 'Slow-Moving'
          : 'Active';

    let recommendation = 'Healthy demand — maintain current branch stock';
    if (trendingDest) {
      const moveQty = Math.min(
        input.qty,
        Math.max(1, Math.min(Math.round(input.qty * 0.75), Math.max(trendingDest.salesQty, Math.round(input.qty * 0.35)))),
      );
      recommendation = `Move ${moveQty.toLocaleString('en-IN')} ${input.unit} from ${input.branchName} → ${trendingDest.branchName} (trending)`;
    } else if (isOlderThan180 && hasNoSales && input.category === 'Marble') {
      recommendation = 'Run 10–12% lot clearance or shift sample slabs to Main Showroom';
    } else if (isOlderThan180 && hasNoSales) {
      recommendation = 'Offer contractor bundle discount or initiate supplier return';
    } else if (isOlderThan90 && hasNoSales && input.category === 'Marble') {
      recommendation = 'Pitch in architect quotes & highlight finish in showroom bay';
    } else if (isOlderThan90 && input.category === 'Marble') {
      recommendation = 'Low turnover — bundle remaining sq. ft with turnkey villa quotes';
    } else if (hasNoSales) {
      recommendation = 'Zero invoices so far — promote as add-on at billing counter';
    } else if (isOlderThan90) {
      recommendation = 'Aging batch — prioritize dispatch before stocking fresh lots';
    }

    const locationRow = snapshot.locations.find(
      (l) => l.name.trim().toLowerCase() === input.branchName.trim().toLowerCase(),
    );

    const agingItem: StockAgingItem = {
      id: input.id,
      sourceKind: input.sourceKind,
      itemCode: input.itemCode,
      itemName: input.itemName,
      dimensions: input.dimensions,
      category: input.category,
      finish: input.finish,
      branchName: input.branchName,
      locationRow,
      qty: input.qty,
      unit: input.unit,
      unitPriceInr: input.unitPriceInr,
      stockValueInr,
      stockedDateIso: stockedIso,
      lastMovementIso,
      ageDays,
      ageBucket,
      salesQty: trade.salesQty,
      globalSalesQty: globalQty,
      salesRevenueInr: trade.salesRevenueInr,
      salesCount: trade.salesCount,
      lastSaleIso: trade.lastSaleIso,
      turnoverPct,
      isOlderThan90,
      isOlderThan180,
      hasNoSales,
      hasNoLocalSales,
      trendingBranchName: trendingDest ? trendingDest.branchName : null,
      isSlowMovingMarble,
      movementStatus,
      recommendation,
    };

    let rebalance: RebalanceRecommendation | null = null;
    if (trendingDest) {
      const destLower = trendingDest.branchName.trim().toLowerCase();
      const codeLower = input.itemCode.trim().toLowerCase();
      const baseNameLower = stripThicknessSuffix(input.itemName);
      const destStockQty = Math.max(
        codeLower ? branchStockLookup.get(`${destLower}::${codeLower}`) || 0 : 0,
        baseNameLower ? branchStockLookup.get(`${destLower}::${baseNameLower}`) || 0 : 0,
      );
      const recommendedQty = Math.min(
        input.qty,
        Math.max(
          1,
          Math.min(
            Math.round(input.qty * 0.75),
            Math.max(trendingDest.salesQty, Math.round(input.qty * 0.35)),
          ),
        ),
      );
      const saleDate = parseIsoMidnight(trendingDest.lastSaleIso) || today;
      const saleDaysAgo = Math.max(0, Math.round((todayMs - saleDate.getTime()) / msPerDay));

      const existingTransfer = snapshot.transfers.find(
        (tr) =>
          tr.itemCode.trim().toLowerCase() === codeLower &&
          tr.fromLocation.trim().toLowerCase() === input.branchName.trim().toLowerCase() &&
          tr.toLocation.trim().toLowerCase() === destLower &&
          tr.status !== 'Delivered',
      );

      rebalance = {
        id: `reb-${input.id}`,
        itemCode: input.itemCode,
        itemName: input.itemName,
        dimensions: input.dimensions,
        category: input.category,
        unit: input.unit,
        fromBranch: input.branchName,
        fromBranchRow: locationRow,
        fromStockQty: input.qty,
        fromAgeDays: ageDays,
        fromLocalSalesQty: trade.salesQty,
        toBranch: trendingDest.branchName,
        toBranchRow: snapshot.locations.find(
          (l) => l.name.trim().toLowerCase() === destLower,
        ),
        toBranchStockQty: destStockQty,
        toBranchSalesQty: trendingDest.salesQty,
        toBranchSalesCount: trendingDest.salesCount,
        toBranchLastSaleIso: trendingDest.lastSaleIso,
        toBranchLastSaleDaysAgo: saleDaysAgo,
        recommendedQty,
        recommendedValueInr: Math.round(recommendedQty * input.unitPriceInr),
        priority: saleDaysAgo <= 30 || destStockQty === 0 ? 'High' : 'Medium',
        ownerAdvice: `Move ${recommendedQty.toLocaleString('en-IN')} ${input.unit} from ${input.branchName} to ${trendingDest.branchName}`,
        activeTransferCode: existingTransfer ? existingTransfer.transferCode : null,
      };
    }

    return {agingItem, rebalance};
  };

  const items: StockAgingItem[] = [];
  const rebalanceRecommendations: RebalanceRecommendation[] = [];

  for (const slab of snapshot.slabs) {
    if (slab.enabled === false || slab.status !== 'In Stock' || slab.totalSqFt <= 0) {
      continue;
    }
    const rate = estimateSlabRateInr(slab, snapshot.varianceItems);
    const built = buildAgingItem({
      id: slab.id,
      sourceKind: 'Slab Lot',
      itemCode: slab.lotNumber,
      itemName: `${slab.stoneName} · ${slab.thicknessMm}mm`,
      dimensions: slab.dimensionsFt,
      category: slab.category,
      finish: slab.finish,
      branchName: slab.branchName,
      qty: Math.max(0, slab.totalSqFt),
      unit: 'sq. ft',
      unitPriceInr: rate,
      stockedDateIso: slab.stockedDateIso,
    });
    items.push(built.agingItem);
    if (built.rebalance) rebalanceRecommendations.push(built.rebalance);
  }

  for (const prod of snapshot.varianceItems) {
    if (prod.enabled === false || prod.physicalQty <= 0) {
      continue;
    }
    const built = buildAgingItem({
      id: prod.id,
      sourceKind: 'Catalog SKU',
      itemCode: prod.itemCode,
      itemName: prod.itemName,
      dimensions: prod.dimensions,
      category: prod.category,
      finish: prod.finish,
      branchName: prod.locationName,
      qty: Math.max(0, prod.physicalQty),
      unit: prod.unit,
      unitPriceInr: Math.max(0, prod.unitPriceInr),
      stockedDateIso: prod.stockedDateIso,
    });
    items.push(built.agingItem);
    if (built.rebalance) rebalanceRecommendations.push(built.rebalance);
  }

  // Sort oldest items first
  items.sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
    return b.stockValueInr - a.stockValueInr;
  });

  // Sort rebalance recommendations by value unlocked descending
  rebalanceRecommendations.sort((a, b) => b.recommendedValueInr - a.recommendedValueInr);

  const totalInStockValueInr = items.reduce((s, i) => s + i.stockValueInr, 0);
  const olderThan90Items = items.filter((i) => i.isOlderThan90);
  const olderThan180Items = items.filter((i) => i.isOlderThan180);
  const bucket91To180Count = items.filter((i) => i.ageBucket === '91-180d').length;
  const noSalesItems = items.filter((i) => i.hasNoSales);
  const slowMovingMarbleItems = items.filter((i) => i.isSlowMovingMarble);

  const bucketDefs: Array<{
    key: StockAgingItem['ageBucket'];
    label: string;
    subtitle: string;
    barColor: string;
    segmentFilter: AgingSegmentFilter;
  }> = [
    {
      key: '0-30d',
      label: '0 – 30 Days',
      subtitle: 'Freshly received or recently billed in this branch',
      barColor: '#16A34A',
      segmentFilter: 'all',
    },
    {
      key: '31-90d',
      label: '31 – 90 Days',
      subtitle: 'Normal showroom & yard holding cycle',
      barColor: '#2563EB',
      segmentFilter: 'all',
    },
    {
      key: '91-180d',
      label: '91 – 180 Days',
      subtitle: 'Aging stock — candidate for inter-branch transfer or quoting push',
      barColor: '#D97706',
      segmentFilter: '91_180',
    },
    {
      key: '>180d',
      label: 'Over 180 Days',
      subtitle: 'Old warehouse stock tying up working capital',
      barColor: '#DC2626',
      segmentFilter: 'gt180',
    },
  ];

  const ageBuckets = bucketDefs.map((b) => {
    const matched = items.filter((i) => i.ageBucket === b.key);
    const val = matched.reduce((s, i) => s + i.stockValueInr, 0);
    return {
      ...b,
      count: matched.length,
      valueInr: val,
      pctOfValue: totalInStockValueInr > 0 ? (val / totalInStockValueInr) * 100 : 0,
    };
  });

  return {
    items,
    rebalanceRecommendations,
    rebalanceTotalValueInr: rebalanceRecommendations.reduce(
      (s, r) => s + r.recommendedValueInr,
      0,
    ),
    totalInStockCount: items.length,
    totalInStockValueInr,
    olderThan90Items,
    olderThan90ValueInr: olderThan90Items.reduce((s, i) => s + i.stockValueInr, 0),
    bucket91To180Count,
    olderThan180Items,
    olderThan180ValueInr: olderThan180Items.reduce((s, i) => s + i.stockValueInr, 0),
    noSalesItems,
    noSalesValueInr: noSalesItems.reduce((s, i) => s + i.stockValueInr, 0),
    slowMovingMarbleItems,
    slowMovingMarbleValueInr: slowMovingMarbleItems.reduce((s, i) => s + i.stockValueInr, 0),
    slowMovingMarbleSqft: slowMovingMarbleItems
      .filter((i) => i.unit === 'sq. ft')
      .reduce((s, i) => s + i.qty, 0),
    slowMovingMarblePcs: slowMovingMarbleItems
      .filter((i) => i.unit === 'pcs')
      .reduce((s, i) => s + i.qty, 0),
    ageBuckets,
  };
}

interface SlowMovingAnalyticsPanelProps {
  snapshot: InventorySnapshot;
  analysis: SlowMovingStockAnalysis;
  onSelectLocation: (loc: LocationRow) => void;
  onCreateTransfer?: (payload: {
    itemCode: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }) => Promise<void>;
}

export function SlowMovingAnalyticsPanel({
  snapshot,
  analysis,
  onSelectLocation,
  onCreateTransfer,
}: SlowMovingAnalyticsPanelProps) {
  const [segmentFilter, setSegmentFilter] = useState<AgingSegmentFilter>('gt90');
  const [categoryFilter, setCategoryFilter] = useState<'All' | StoneCategory>('All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const filteredRebalances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return analysis.rebalanceRecommendations.filter((rec) => {
      if (categoryFilter !== 'All' && rec.category !== categoryFilter) return false;
      if (
        branchFilter !== 'All' &&
        rec.fromBranch !== branchFilter &&
        rec.toBranch !== branchFilter
      ) {
        return false;
      }
      if (q) {
        const hit =
          rec.itemCode.toLowerCase().includes(q) ||
          rec.itemName.toLowerCase().includes(q) ||
          rec.fromBranch.toLowerCase().includes(q) ||
          rec.toBranch.toLowerCase().includes(q) ||
          rec.category.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [analysis.rebalanceRecommendations, categoryFilter, branchFilter, searchQuery]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return analysis.items.filter((item) => {
      if (segmentFilter === 'gt90' && !item.isOlderThan90) return false;
      if (segmentFilter === '91_180' && item.ageBucket !== '91-180d') return false;
      if (segmentFilter === 'gt180' && !item.isOlderThan180) return false;
      if (segmentFilter === 'no_sales' && !item.hasNoSales) return false;
      if (segmentFilter === 'slow_marble' && !item.isSlowMovingMarble) return false;
      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
      if (branchFilter !== 'All' && item.branchName !== branchFilter) return false;
      if (q) {
        const hit =
          item.itemCode.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          item.dimensions.toLowerCase().includes(q) ||
          item.branchName.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [analysis.items, segmentFilter, categoryFilter, branchFilter, searchQuery]);

  const filteredCapitalInr = useMemo(
    () => filteredItems.reduce((sum, i) => sum + i.stockValueInr, 0),
    [filteredItems],
  );

  const older180SharePct =
    analysis.totalInStockValueInr > 0
      ? (analysis.olderThan180ValueInr / analysis.totalInStockValueInr) * 100
      : 0;

  async function handleQuickMove(rec: RebalanceRecommendation) {
    if (!onCreateTransfer || dispatchingId) return;
    setDispatchingId(rec.id);
    try {
      await onCreateTransfer({
        itemCode: rec.itemCode,
        fromLocation: rec.fromBranch,
        toLocation: rec.toBranch,
        quantity: rec.recommendedQty,
      });
    } finally {
      setDispatchingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Section Title Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-[#0F172A]">
            Slow-Moving, Old Stock &amp; Inter-Branch Rebalancing
          </h2>
          <p className="text-[12px] text-[#64748B]">
            Detect stock sitting over 90 days in one branch while trending in another, and dispatch A → B stock transfers.
          </p>
        </div>
        <span className="text-[11.5px] text-[#64748B] tabular-nums">
          Total Active Stock Evaluated:{' '}
          <strong className="text-[#0F172A]">
            {analysis.totalInStockCount} SKUs ({formatInrCompact(analysis.totalInStockValueInr)})
          </strong>
        </span>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => setSegmentFilter('gt90')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors ${
            segmentFilter === 'gt90'
              ? 'border-amber-400 ring-1 ring-amber-200'
              : 'border-[#E5E9F0] hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Stock Older Than 90 Days
            </span>
            <span className="w-7 h-7 rounded-md bg-amber-50 text-[#D97706] inline-flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-[#0F172A] tabular-nums">
              {analysis.olderThan90Items.length}
            </span>
            <span className="text-[12px] font-medium text-[#D97706] tabular-nums">
              {formatInrExact(analysis.olderThan90ValueInr)} blocked
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#64748B] tabular-nums">
            {analysis.bucket91To180Count} in 91–180d · {analysis.olderThan180Items.length} in &gt;180d
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSegmentFilter('gt180')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors ${
            segmentFilter === 'gt180'
              ? 'border-rose-400 ring-1 ring-rose-200'
              : 'border-[#E5E9F0] hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Stock Older Than 180 Days
            </span>
            <span className="w-7 h-7 rounded-md bg-rose-50 text-[#DC2626] inline-flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-[#DC2626] tabular-nums">
              {analysis.olderThan180Items.length}
            </span>
            <span className="text-[12px] font-medium text-[#DC2626] tabular-nums">
              {formatInrExact(analysis.olderThan180ValueInr)} blocked
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#64748B] tabular-nums">
            {older180SharePct.toFixed(1)}% of total warehouse stock capital
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSegmentFilter('no_sales')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors ${
            segmentFilter === 'no_sales'
              ? 'border-blue-400 ring-1 ring-blue-200'
              : 'border-[#E5E9F0] hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Products With No Sales
            </span>
            <span className="w-7 h-7 rounded-md bg-slate-100 text-[#334155] inline-flex items-center justify-center shrink-0">
              <PackageX className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-[#0F172A] tabular-nums">
              {analysis.noSalesItems.length}
            </span>
            <span className="text-[12px] font-medium text-[#475569] tabular-nums">
              {formatInrExact(analysis.noSalesValueInr)} idle
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#64748B]">
            Zero sales invoices across any showroom or yard
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSegmentFilter('slow_marble')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors ${
            segmentFilter === 'slow_marble'
              ? 'border-violet-400 ring-1 ring-violet-200'
              : 'border-[#E5E9F0] hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Slow-Moving Marble Designs
            </span>
            <span className="w-7 h-7 rounded-md bg-violet-50 text-[#7C3AED] inline-flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-[#0F172A] tabular-nums">
              {analysis.slowMovingMarbleItems.length}
            </span>
            <span className="text-[12px] font-medium text-[#7C3AED] tabular-nums">
              {formatInrExact(analysis.slowMovingMarbleValueInr)}
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#64748B] tabular-nums">
            {analysis.slowMovingMarbleSqft.toLocaleString('en-IN')} sq. ft ·{' '}
            {analysis.slowMovingMarblePcs.toLocaleString('en-IN')} pcs sitting
          </p>
        </button>
      </div>

      {/* Inter-Branch Stock Rebalancing: Move Old Stock (>90d) from Branch A to Trending Branch B */}
      <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h3 className="text-[14.5px] font-bold text-[#0F172A] flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#2563EB]" />
              <span>
                Owner Stock Move Alerts: Aging Branch (A) → Trending Branch (B)
              </span>
            </h3>
            <p className="text-[12px] text-[#64748B]">
              Products sitting &gt; 90 days in Branch A while actively selling in Branch B. Transfer idle stock instead of reordering new lots.
            </p>
          </div>
          <div className="text-[12px] text-[#475569] tabular-nums shrink-0">
            Rebalance Opportunity:{' '}
            <strong className="text-[#2563EB]">
              {filteredRebalances.length} move{filteredRebalances.length === 1 ? '' : 's'} ·{' '}
              {formatInrExact(
                filteredRebalances.reduce((sum, r) => sum + r.recommendedValueInr, 0),
              )}
            </strong>
          </div>
        </div>

        {filteredRebalances.length === 0 ? (
          <div className="py-6 px-4 text-center rounded-lg border border-dashed border-slate-200 bg-[#FAFBFD] text-[12.5px] text-[#64748B]">
            No cross-branch aging-to-trending mismatches match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredRebalances.map((rec) => {
              const isDispatching = dispatchingId === rec.id;
              return (
                <div
                  key={rec.id}
                  className="rounded-xl border border-[#E5E9F0] bg-[#FAFBFD] p-4 flex flex-col justify-between gap-3 hover:border-blue-200 transition-colors"
                >
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-[#2563EB]">
                          {rec.itemCode}
                        </span>
                        <span className="font-semibold text-[13px] text-[#0F172A] truncate">
                          {rec.itemName}
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          ({rec.dimensions} · {rec.category})
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] font-semibold text-[#1D4ED8]">
                        Recommendation: {rec.ownerAdvice}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[13px] font-bold text-[#0F172A] tabular-nums">
                        {formatInrExact(rec.recommendedValueInr)}
                      </div>
                      <div className="text-[10.5px] text-[#64748B]">Transfer Value</div>
                    </div>
                  </div>

                  {/* Branch A -> Branch B Comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
                    <div className="rounded-lg border border-amber-200/80 bg-white p-2.5">
                      <div className="flex items-center justify-between gap-1 text-[10.5px] font-semibold text-[#D97706]">
                        <span>FROM BRANCH A (OLD STOCK)</span>
                        <span className="tabular-nums">{rec.fromAgeDays}d idle</span>
                      </div>
                      <div className="mt-1 font-semibold text-[12.5px] text-[#0F172A]">
                        {rec.fromBranchRow ? (
                          <button
                            type="button"
                            onClick={() => onSelectLocation(rec.fromBranchRow!)}
                            className="hover:text-[#2563EB] hover:underline text-left"
                          >
                            {rec.fromBranch}
                          </button>
                        ) : (
                          rec.fromBranch
                        )}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#475569] tabular-nums">
                        {rec.fromStockQty.toLocaleString('en-IN')} {rec.unit} on hand ·{' '}
                        {rec.fromLocalSalesQty === 0
                          ? '0 local sales'
                          : `${rec.fromLocalSalesQty.toLocaleString('en-IN')} ${rec.unit} sold`}
                      </div>
                    </div>

                    <div className="flex items-center justify-center">
                      <span className="w-7 h-7 rounded-full bg-blue-50 text-[#2563EB] inline-flex items-center justify-center border border-blue-200">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <div className="rounded-lg border border-emerald-200/80 bg-white p-2.5">
                      <div className="flex items-center justify-between gap-1 text-[10.5px] font-semibold text-[#15803D]">
                        <span className="inline-flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          TO BRANCH B (TRENDING)
                        </span>
                        <span className="tabular-nums">
                          {rec.toBranchLastSaleDaysAgo === 0
                            ? 'Sold today'
                            : `Sold ${rec.toBranchLastSaleDaysAgo}d ago`}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold text-[12.5px] text-[#0F172A]">
                        {rec.toBranchRow ? (
                          <button
                            type="button"
                            onClick={() => onSelectLocation(rec.toBranchRow!)}
                            className="hover:text-[#2563EB] hover:underline text-left"
                          >
                            {rec.toBranch}
                          </button>
                        ) : (
                          rec.toBranch
                        )}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#475569] tabular-nums">
                        {rec.toBranchSalesQty.toLocaleString('en-IN')} {rec.unit} sold (
                        {rec.toBranchSalesCount} inv) ·{' '}
                        <span className="font-medium text-[#DC2626]">
                          {rec.toBranchStockQty.toLocaleString('en-IN')} {rec.unit} left
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E5E9F0]">
                    <span className="text-[11px] text-[#64748B] tabular-nums">
                      Suggested dispatch:{' '}
                      <strong className="text-[#0F172A]">
                        {rec.recommendedQty.toLocaleString('en-IN')} {rec.unit}
                      </strong>
                    </span>

                    {rec.activeTransferCode ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Transfer Active ({rec.activeTransferCode})</span>
                      </span>
                    ) : onCreateTransfer ? (
                      <button
                        type="button"
                        disabled={isDispatching}
                        onClick={() => handleQuickMove(rec)}
                        className="h-8 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>
                          {isDispatching
                            ? 'Dispatching...'
                            : `Move ${rec.recommendedQty.toLocaleString('en-IN')} ${rec.unit} (A → B)`}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Visual Insights Row: Age Distribution + Slow-Moving Marble Designs Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Warehouse Stock Age Distribution */}
        <div className="lg:col-span-6 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[14.5px] font-bold text-[#0F172A] flex items-center gap-2">
                <Archive className="w-4 h-4 text-[#2563EB]" />
                <span>Warehouse Stock Age Distribution</span>
              </h3>
              <p className="text-[11.5px] text-[#64748B]">
                Capital locked across branch holding brackets (click any bracket to filter)
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            {analysis.ageBuckets.map((bucket) => {
              const barWidth = Math.max(
                bucket.valueInr > 0 ? 4 : 0,
                Math.min(100, bucket.pctOfValue),
              );
              return (
                <button
                  key={bucket.key}
                  type="button"
                  onClick={() => setSegmentFilter(bucket.segmentFilter)}
                  className="w-full text-left group space-y-1.5 rounded-lg p-2 -mx-2 hover:bg-slate-50/90 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{backgroundColor: bucket.barColor}}
                      />
                      <span className="font-semibold text-[#0F172A]">{bucket.label}</span>
                      <span className="text-[11px] text-[#64748B] truncate hidden sm:inline">
                        · {bucket.subtitle}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span className="text-[#475569] font-medium">
                        {bucket.count} SKU{bucket.count === 1 ? '' : 's'}
                      </span>
                      <span className="font-mono font-semibold text-[#0F172A] w-24 text-right">
                        {formatInrCompact(bucket.valueInr)}
                      </span>
                      <span className="text-[11px] text-[#64748B] w-11 text-right">
                        {bucket.pctOfValue.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: bucket.barColor,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Slow-Moving Marble Designs Spotlight */}
        <div className="lg:col-span-6 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[14.5px] font-bold text-[#0F172A] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#7C3AED]" />
                <span>Slow-Moving Marble Designs</span>
              </h3>
              <p className="text-[11.5px] text-[#64748B]">
                Marble slabs &amp; cut designs sitting &gt;90d locally or &lt;20% local turnover
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSegmentFilter('slow_marble')}
              className="text-[12px] font-semibold text-[#2563EB] hover:underline whitespace-nowrap"
            >
              Filter Marble
            </button>
          </div>

          {analysis.slowMovingMarbleItems.length === 0 ? (
            <div className="py-8 text-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-[#64748B]">
              All marble designs currently have healthy turnover within 90 days.
            </div>
          ) : (
            <div className="space-y-2.5">
              {analysis.slowMovingMarbleItems.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-[#E5E9F0] bg-[#FAFBFD] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-[#2563EB]">
                        {m.itemCode}
                      </span>
                      <span className="font-semibold text-[12.5px] text-[#0F172A] truncate">
                        {m.itemName}
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        ({m.dimensions} · {m.finish})
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#475569] flex items-center gap-2 flex-wrap">
                      <span>{m.branchName}</span>
                      <span>·</span>
                      <span className="tabular-nums font-medium text-[#0F172A]">
                        {m.qty.toLocaleString('en-IN')} {m.unit}
                      </span>
                      <span>·</span>
                      <span
                        className={`font-medium tabular-nums ${
                          m.ageDays > 180 ? 'text-[#DC2626]' : 'text-[#D97706]'
                        }`}
                      >
                        {m.ageDays}d idle
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">
                        {m.hasNoLocalSales ? '0 local sales' : `${m.turnoverPct.toFixed(1)}% sold`}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 pt-0.5">
                      <Sparkles className="w-3 h-3 text-[#7C3AED] shrink-0" />
                      <span>{m.recommendation}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="font-mono font-bold text-[13px] text-[#0F172A] tabular-nums">
                      {formatInrExact(m.stockValueInr)}
                    </div>
                    <div className="text-[10.5px] text-[#64748B]">Blocked Capital</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full Slow-Moving & Old Stock Table with Filters */}
      <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 border-b border-[#E5E9F0] lg:border-b-0">
            {(
              [
                {key: 'all', label: `All In-Stock (${analysis.items.length})`},
                {key: 'gt90', label: `> 90 Days (${analysis.olderThan90Items.length})`},
                {key: '91_180', label: `91–180 Days (${analysis.bucket91To180Count})`},
                {key: 'gt180', label: `> 180 Days (${analysis.olderThan180Items.length})`},
                {key: 'no_sales', label: `No Sales (${analysis.noSalesItems.length})`},
                {
                  key: 'slow_marble',
                  label: `Slow Marble (${analysis.slowMovingMarbleItems.length})`,
                },
              ] as Array<{key: AgingSegmentFilter; label: string}>
            ).map((tab) => {
              const active = segmentFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSegmentFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#EEF4FF] text-[#1D63ED] border border-blue-200'
                      : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'All' | StoneCategory)}
              aria-label="Filter by stone category"
              className="h-8 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white text-[#334155]"
            >
              <option value="All">All Categories</option>
              <option value="Marble">Marble</option>
              <option value="Granite">Granite</option>
              <option value="Tiles">Tiles</option>
              <option value="Onyx & Quartz">Onyx &amp; Quartz</option>
              <option value="Adhesives">Adhesives</option>
            </select>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Filter by branch"
              className="h-8 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white text-[#334155]"
            >
              <option value="All">All Branches</option>
              {snapshot.locations.map((loc) => (
                <option key={loc.id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU or marble design..."
                className="w-full h-8 pl-8 pr-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] focus:bg-white focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                <th className="py-2 pr-3">SKU &amp; Design</th>
                <th className="py-2 px-2">Category</th>
                <th className="py-2 px-2">Branch</th>
                <th className="py-2 px-2 text-right">On-Hand Stock</th>
                <th className="py-2 px-2 text-right">Blocked Value (₹)</th>
                <th className="py-2 px-2 text-right">Branch Age</th>
                <th className="py-2 px-2">Sales Activity</th>
                <th className="py-2 px-2">Movement Status</th>
                <th className="py-2 pl-2">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#64748B]">
                    No inventory items match the selected aging filter criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#2563EB]">
                          {item.itemCode}
                        </span>
                        <span className="text-[10.5px] text-[#64748B]">({item.sourceKind})</span>
                      </div>
                      <div className="font-semibold text-[#0F172A]">{item.itemName}</div>
                      <div className="text-[11px] text-[#64748B]">
                        {item.dimensions} · {item.finish}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {item.locationRow ? (
                        <button
                          type="button"
                          onClick={() => onSelectLocation(item.locationRow!)}
                          className="text-[#2563EB] hover:underline font-medium text-left"
                        >
                          {item.branchName}
                        </button>
                      ) : (
                        <span className="text-[#334155]">{item.branchName}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap font-medium text-[#0F172A]">
                      {item.qty.toLocaleString('en-IN')}{' '}
                      <span className="text-[11px] font-normal text-[#64748B]">{item.unit}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                      {formatInrExact(item.stockValueInr)}
                    </td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap tabular-nums">
                      <div
                        className={`font-semibold ${
                          item.ageDays > 180
                            ? 'text-[#DC2626]'
                            : item.ageDays > 90
                              ? 'text-[#D97706]'
                              : 'text-[#16A34A]'
                        }`}
                      >
                        {item.ageDays} days
                      </div>
                      <div className="text-[10.5px] text-[#64748B]">
                        Since {formatShortIso(item.lastMovementIso)}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {item.hasNoLocalSales ? (
                        <div>
                          <div
                            className={`font-medium ${
                              item.trendingBranchName ? 'text-[#2563EB]' : 'text-[#DC2626]'
                            }`}
                          >
                            {item.trendingBranchName
                              ? '0 local sales'
                              : 'No sales recorded'}
                          </div>
                          {item.trendingBranchName && (
                            <div className="text-[10.5px] text-[#15803D] font-medium">
                              Trending at {item.trendingBranchName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="text-[#0F172A] font-medium tabular-nums">
                            {item.salesQty.toLocaleString('en-IN')} {item.unit} sold (
                            {item.turnoverPct.toFixed(1)}%)
                          </div>
                          <div className="text-[10.5px] text-[#64748B]">
                            Last sale: {item.lastSaleIso ? formatShortIso(item.lastSaleIso) : '—'}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium text-[12px] ${
                          item.movementStatus === 'Dead Risk (>180d)'
                            ? 'text-[#DC2626]'
                            : item.movementStatus === 'No Sales'
                              ? 'text-[#B91C1C]'
                              : item.movementStatus === 'Slow-Moving'
                                ? 'text-[#D97706]'
                                : 'text-[#16A34A]'
                        }`}
                      >
                        {item.movementStatus}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-[11.5px] text-[#475569] max-w-[240px]">
                      {item.recommendation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#E5E9F0] bg-[#FAFBFD] font-semibold text-[#0F172A]">
                <td colSpan={4} className="py-2.5 pr-3">
                  Showing {filteredItems.length} of {analysis.totalInStockCount} active warehouse SKUs
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#2563EB]">
                  {formatInrExact(filteredCapitalInr)}
                </td>
                <td colSpan={4} className="py-2.5 pl-2 text-[11.5px] font-normal text-[#64748B]">
                  Age measured from latest stocking, purchase receipt, or local branch sale date
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
