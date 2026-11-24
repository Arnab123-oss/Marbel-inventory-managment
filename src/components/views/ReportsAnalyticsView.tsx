import {
  BarChart3,
  Calendar,
  ChevronRight,
  Download,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {
  InventorySnapshot,
  LocationRow,
  PurchaseBill,
  SalesBill,
  SlabLot,
  StoneCategory,
  VarianceItem,
} from '../../types/inventory';
import {
  computeAllBranches,
  estimateSlabRateInr,
  formatInrCompact,
  formatInrExact,
  getPurchaseBillLines,
  getSalesBillLines,
} from '../../utils/branchMetrics';
import {
  computeSlowMovingStockAnalysis,
  SlowMovingAnalyticsPanel,
} from './SlowMovingAnalyticsPanel';

interface ReportsAnalyticsViewProps {
  snapshot: InventorySnapshot;
  onSelectLocation: (loc: LocationRow) => void;
  onExportCsv: () => void;
  onCreateTransfer?: (payload: {
    itemCode: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }) => Promise<void>;
}

type ReportTab = 'sales' | 'purchase' | 'stock' | 'profit' | 'analytics';
type DateFilterPreset = 'all' | 'this_month' | 'apr_2024' | 'custom';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const CATEGORY_COLORS: Record<StoneCategory, string> = {
  Marble: '#2563EB',
  Granite: '#10B981',
  Tiles: '#F59E0B',
  'Onyx & Quartz': '#8B5CF6',
  Adhesives: '#06B6D4',
};

const ALL_CATEGORIES: StoneCategory[] = [
  'Marble',
  'Granite',
  'Tiles',
  'Onyx & Quartz',
  'Adhesives',
];

function parseBillDateIso(dateLabel?: string, dateIso?: string): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) {
    return dateIso.trim();
  }
  if (dateLabel) {
    const trimmed = dateLabel.trim();
    if (/^today$/i.test(trimmed)) {
      return new Date().toISOString().slice(0, 10);
    }
    const dmy = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (dmy) {
      const mIdx = MONTHS_SHORT.findIndex(
        (m) => m.toLowerCase() === dmy[2].toLowerCase(),
      );
      if (mIdx >= 0) {
        return `${dmy[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function formatIsoShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const monthName = MONTHS_SHORT[Math.max(0, Math.min(11, Number(m[2]) - 1))];
  return `${Number(m[3])} ${monthName} ${m[1]}`;
}

function formatIsoDayMonth(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const monthName = MONTHS_SHORT[Math.max(0, Math.min(11, Number(m[2]) - 1))];
  return `${Number(m[3])} ${monthName}`;
}

function resolveCategory(
  itemCode: string,
  itemName: string,
  products: VarianceItem[],
  slabs: SlabLot[] = [],
): StoneCategory {
  if (itemCode) {
    const normCode = itemCode.trim().toLowerCase();
    const bySlabCode = slabs.find(
      (s) => s.lotNumber.trim().toLowerCase() === normCode,
    );
    if (bySlabCode) return bySlabCode.category;
    const byCode = products.find(
      (p) => p.itemCode.trim().toLowerCase() === normCode,
    );
    if (byCode) return byCode.category;
  }
  const lower = itemName.toLowerCase();
  const bySlabName = slabs.find(
    (s) =>
      s.stoneName.toLowerCase() === lower ||
      lower.includes(s.stoneName.toLowerCase()) ||
      s.stoneName.toLowerCase().includes(lower),
  );
  if (bySlabName) return bySlabName.category;
  const byName = products.find(
    (p) =>
      p.itemName.toLowerCase() === lower ||
      lower.includes(p.itemName.toLowerCase()) ||
      p.itemName.toLowerCase().includes(lower),
  );
  if (byName) return byName.category;
  if (lower.includes('granite')) return 'Granite';
  if (lower.includes('tile') || lower.includes('porcelain') || lower.includes('travertine')) {
    return 'Tiles';
  }
  if (lower.includes('onyx') || lower.includes('quartz')) return 'Onyx & Quartz';
  if (lower.includes('adhesive') || lower.includes('grout')) return 'Adhesives';
  return 'Marble';
}

function getPurchaseTotal(bill: PurchaseBill): number {
  const lines = getPurchaseBillLines(bill);
  return lines.reduce((sum, l) => sum + Math.max(0, Number(l.amountInr) || 0), 0);
}

function getSalesTotal(bill: SalesBill): number {
  const lines = getSalesBillLines(bill);
  return lines.reduce((sum, l) => sum + Math.max(0, Number(l.amountInr) || 0), 0);
}

function getSalesCollected(bill: SalesBill): number {
  const lines = getSalesBillLines(bill);
  return lines.reduce((sum, l) => {
    const amt = Math.max(0, Number(l.amountInr) || 0);
    if (l.status === 'Paid') return sum + amt;
    if (l.status === 'Partially Paid') return sum + Math.round(amt * 0.5);
    return sum;
  }, 0);
}

function getPurchasePaid(bill: PurchaseBill): number {
  const total = getPurchaseTotal(bill);
  if (bill.status === 'Paid') return total;
  if (bill.status === 'Partial') return Math.round(total * 0.5);
  return 0;
}

function shortenBranchLabel(name: string): string {
  if (name.length <= 13) return name;
  return name
    .replace('Main Showroom', 'Main Show.')
    .replace('Marble Yard - North', 'Yard North')
    .replace('Slabs Godown - 1', 'Godown 1')
    .replace('Slabs Godown - 2', 'Godown 2')
    .replace('Tile & Box Depot', 'Tile Depot')
    .replace('Kishangarh Hub', 'Kishangarh')
    .replace('Display Annex', 'Annex');
}

function formatAxisTickInr(val: number): string {
  if (val === 0) return '0';
  if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (val >= 1000) return `${Math.round(val / 1000)}K`;
  return String(Math.round(val));
}

export function ReportsAnalyticsView({
  snapshot,
  onSelectLocation,
  onCreateTransfer,
}: ReportsAnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('2024-04-01');
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [skuSummarySearch, setSkuSummarySearch] = useState('');

  const [hoveredOverviewIdx, setHoveredOverviewIdx] = useState<number | null>(null);
  const [hoveredBranchIdx, setHoveredBranchIdx] = useState<number | null>(null);
  const [hoveredCat, setHoveredCat] = useState<StoneCategory | null>(null);

  const slowMovingAnalysis = useMemo(
    () => computeSlowMovingStockAnalysis(snapshot),
    [snapshot],
  );

  // Filter purchase & sales bills by date preset
  const filteredBills = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const thisMonthPrefix = todayIso.slice(0, 7);

    const matchesDate = (iso: string): boolean => {
      if (datePreset === 'all') return true;
      if (datePreset === 'apr_2024') return iso.startsWith('2024-04');
      if (datePreset === 'this_month') return iso.startsWith(thisMonthPrefix);
      if (datePreset === 'custom') {
        if (customFrom && iso < customFrom) return false;
        if (customTo && iso > customTo) return false;
        return true;
      }
      return true;
    };

    const salesBills = snapshot.salesBills.filter((b) =>
      matchesDate(parseBillDateIso(b.dateLabel, b.dateIso)),
    );
    const purchaseBills = snapshot.purchaseBills.filter((b) =>
      matchesDate(parseBillDateIso(b.dateLabel, b.dateIso)),
    );

    const allDates = [
      ...salesBills.map((b) => parseBillDateIso(b.dateLabel, b.dateIso)),
      ...purchaseBills.map((b) => parseBillDateIso(b.dateLabel, b.dateIso)),
    ].sort();

    let rangeLabel = 'All Recorded Dates';
    if (datePreset === 'apr_2024') {
      rangeLabel = '01 Apr – 30 Apr 2024';
    } else if (datePreset === 'this_month') {
      const mIdx = Number(thisMonthPrefix.slice(5, 7)) - 1;
      rangeLabel = `${MONTHS_SHORT[mIdx] || 'Month'} ${thisMonthPrefix.slice(0, 4)}`;
    } else if (datePreset === 'custom') {
      rangeLabel = `${formatIsoShort(customFrom)} – ${formatIsoShort(customTo)}`;
    } else if (allDates.length > 0) {
      const first = allDates[0];
      const last = allDates[allDates.length - 1];
      rangeLabel =
        first === last
          ? formatIsoShort(first)
          : `${formatIsoShort(first)} – ${formatIsoShort(last)}`;
    }

    return {salesBills, purchaseBills, rangeLabel};
  }, [snapshot.salesBills, snapshot.purchaseBills, datePreset, customFrom, customTo]);

  // Core financial & inventory analytics across all tables
  const analytics = useMemo(() => {
    const {salesBills, purchaseBills} = filteredBills;
    const activeProducts = snapshot.varianceItems.filter((p) => p.enabled !== false);
    const activeSlabs = snapshot.slabs.filter((s) => s.enabled !== false);
    const inStockSlabs = activeSlabs.filter((s) => s.status === 'In Stock');

    // Summary totals
    const totalSalesInr = salesBills.reduce((sum, b) => sum + getSalesTotal(b), 0);
    const totalPurchaseInr = purchaseBills.reduce((sum, b) => sum + getPurchaseTotal(b), 0);
    const grossProfitInr = totalSalesInr - totalPurchaseInr;
    const profitMarginPct =
      totalSalesInr > 0
        ? (grossProfitInr / totalSalesInr) * 100
        : totalPurchaseInr > 0
          ? -100
          : 0;

    const totalSalesCollectedInr = salesBills.reduce((sum, b) => sum + getSalesCollected(b), 0);
    const totalSalesReceivableInr = Math.max(0, totalSalesInr - totalSalesCollectedInr);
    const totalPurchasePaidInr = purchaseBills.reduce((sum, b) => sum + getPurchasePaid(b), 0);
    const totalPurchasePayableInr = Math.max(0, totalPurchaseInr - totalPurchasePaidInr);
    const netCashFlowInr = totalSalesCollectedInr - totalPurchasePaidInr;

    // Stock totals from Products + Slabs + filtered bills via computeAllBranches
    const branchBreakdowns = computeAllBranches({
      ...snapshot,
      salesBills,
      purchaseBills,
    });
    const totalStockValueInr = branchBreakdowns.reduce((sum, b) => sum + b.net.valueInr, 0);
    const totalSqft = branchBreakdowns.reduce((sum, b) => sum + b.net.sqft, 0);
    const totalPcs = branchBreakdowns.reduce((sum, b) => sum + b.net.pcs, 0);
    const totalBox = branchBreakdowns.reduce((sum, b) => sum + b.net.box, 0);
    const totalLowStock = branchBreakdowns.reduce((sum, b) => sum + b.net.lowStock, 0);

    // Category breakdown across Sales, Purchase, Stock, and Profit
    const catSales: Record<StoneCategory, number> = {
      Marble: 0,
      Granite: 0,
      Tiles: 0,
      'Onyx & Quartz': 0,
      Adhesives: 0,
    };
    const catPurchase: Record<StoneCategory, number> = {
      Marble: 0,
      Granite: 0,
      Tiles: 0,
      'Onyx & Quartz': 0,
      Adhesives: 0,
    };
    const catStock: Record<StoneCategory, number> = {
      Marble: 0,
      Granite: 0,
      Tiles: 0,
      'Onyx & Quartz': 0,
      Adhesives: 0,
    };

    for (const bill of salesBills) {
      for (const line of getSalesBillLines(bill)) {
        const cat = resolveCategory(
          line.itemCode,
          line.itemName,
          snapshot.varianceItems,
          snapshot.slabs,
        );
        catSales[cat] += Math.max(0, Number(line.amountInr) || 0);
      }
    }
    for (const bill of purchaseBills) {
      for (const line of getPurchaseBillLines(bill)) {
        const cat = resolveCategory(
          line.itemCode,
          line.itemName,
          snapshot.varianceItems,
          snapshot.slabs,
        );
        catPurchase[cat] += Math.max(0, Number(line.amountInr) || 0);
      }
    }
    for (const p of activeProducts) {
      catStock[p.category] += Math.max(0, p.physicalQty) * Math.max(0, p.unitPriceInr);
    }
    for (const s of inStockSlabs) {
      catStock[s.category] +=
        Math.max(0, s.totalSqFt) * estimateSlabRateInr(s, snapshot.varianceItems);
    }

    const categoryRows = ALL_CATEGORIES.map((category) => {
      const sales = Math.round(catSales[category]);
      const purchase = Math.round(catPurchase[category]);
      const stock = Math.round(catStock[category]);
      const profit = sales - purchase;
      return {
        category,
        color: CATEGORY_COLORS[category],
        sales,
        purchase,
        stock,
        profit,
        marginPct: sales > 0 ? (profit / sales) * 100 : purchase > 0 ? -100 : 0,
      };
    });

    // Overview time-bucket series (grouped by date or week automatically)
    const datedEntries: Array<{
      iso: string;
      sales: number;
      purchase: number;
      collected: number;
      paid: number;
    }> = [];

    const byDateMap = new Map<
      string,
      {iso: string; sales: number; purchase: number; collected: number; paid: number}
    >();
    const ensureDate = (iso: string) => {
      let bucket = byDateMap.get(iso);
      if (!bucket) {
        bucket = {iso, sales: 0, purchase: 0, collected: 0, paid: 0};
        byDateMap.set(iso, bucket);
      }
      return bucket;
    };
    for (const b of salesBills) {
      const iso = parseBillDateIso(b.dateLabel, b.dateIso);
      const bucket = ensureDate(iso);
      bucket.sales += getSalesTotal(b);
      bucket.collected += getSalesCollected(b);
    }
    for (const b of purchaseBills) {
      const iso = parseBillDateIso(b.dateLabel, b.dateIso);
      const bucket = ensureDate(iso);
      bucket.purchase += getPurchaseTotal(b);
      bucket.paid += getPurchasePaid(b);
    }

    const sortedDates = Array.from(byDateMap.values()).sort((a, b) =>
      a.iso.localeCompare(b.iso),
    );

    // Per-product SKU Sales, Purchase & Profit summary across every active product (+ any billed SKUs)
    const skuMap = new Map<
      string,
      {
        itemCode: string;
        itemName: string;
        category: StoneCategory;
        unit: string;
        physicalQty: number;
        stockValueInr: number;
        salesInr: number;
        purchaseInr: number;
      }
    >();

    for (const s of activeSlabs) {
      const key = s.lotNumber.trim().toLowerCase();
      const inStockSqft = s.status === 'In Stock' ? Math.max(0, s.totalSqFt) : 0;
      const rate = estimateSlabRateInr(s, snapshot.varianceItems);
      skuMap.set(key, {
        itemCode: s.lotNumber,
        itemName: `${s.stoneName} · ${s.thicknessMm}mm`,
        category: s.category,
        unit: 'sq. ft',
        physicalQty: inStockSqft,
        stockValueInr: Math.round(inStockSqft * rate),
        salesInr: 0,
        purchaseInr: 0,
      });
    }

    for (const p of activeProducts) {
      const key = p.itemCode.trim().toLowerCase();
      skuMap.set(key, {
        itemCode: p.itemCode,
        itemName: p.itemName,
        category: p.category,
        unit: p.unit,
        physicalQty: Math.max(0, p.physicalQty),
        stockValueInr: Math.round(Math.max(0, p.physicalQty) * Math.max(0, p.unitPriceInr)),
        salesInr: 0,
        purchaseInr: 0,
      });
    }

    const resolveSkuEntry = (
      rawCode: string,
      rawName: string,
      rawUnit: string,
    ) => {
      const normCode = (rawCode || '').trim().toLowerCase();
      if (normCode && skuMap.has(normCode)) {
        return skuMap.get(normCode)!;
      }
      const normName = (rawName || '').trim().toLowerCase();
      if (normName) {
        for (const entry of skuMap.values()) {
          const entryName = entry.itemName.trim().toLowerCase();
          if (
            entryName === normName ||
            normName.includes(entryName) ||
            entryName.includes(normName)
          ) {
            return entry;
          }
        }
      }
      const fallbackCode = (rawCode || '').trim() || rawName.trim().slice(0, 14).toUpperCase() || 'SKU-MISC';
      const fallbackKey = fallbackCode.toLowerCase();
      let existing = skuMap.get(fallbackKey);
      if (!existing) {
        existing = {
          itemCode: fallbackCode,
          itemName: rawName.trim() || fallbackCode,
          category: resolveCategory(
            fallbackCode,
            rawName,
            snapshot.varianceItems,
            snapshot.slabs,
          ),
          unit: rawUnit || 'sq. ft',
          physicalQty: 0,
          stockValueInr: 0,
          salesInr: 0,
          purchaseInr: 0,
        };
        skuMap.set(fallbackKey, existing);
      }
      return existing;
    };

    for (const bill of salesBills) {
      for (const line of getSalesBillLines(bill)) {
        const entry = resolveSkuEntry(line.itemCode, line.itemName, line.unit);
        entry.salesInr += Math.max(0, Number(line.amountInr) || 0);
      }
    }
    for (const bill of purchaseBills) {
      for (const line of getPurchaseBillLines(bill)) {
        const entry = resolveSkuEntry(line.itemCode, line.itemName, line.unit);
        entry.purchaseInr += Math.max(0, Number(line.amountInr) || 0);
      }
    }

    const productSummaries = Array.from(skuMap.values())
      .map((entry) => {
        const salesInr = Math.round(entry.salesInr);
        const purchaseInr = Math.round(entry.purchaseInr);
        const profitInr = salesInr - purchaseInr;
        const marginPct =
          salesInr > 0 ? (profitInr / salesInr) * 100 : purchaseInr > 0 ? -100 : 0;
        return {
          ...entry,
          salesInr,
          purchaseInr,
          profitInr,
          marginPct,
        };
      })
      .sort((a, b) => {
        const activityDiff = b.salesInr + b.purchaseInr - (a.salesInr + a.purchaseInr);
        if (activityDiff !== 0) return activityDiff;
        return b.stockValueInr - a.stockValueInr;
      });

    let overviewBuckets: Array<{
      label: string;
      subLabel: string;
      stockNote?: string;
      primary: number;
      secondary: number;
      primaryLabel: string;
      secondaryLabel: string;
      profit: number;
    }> = [];

    if (activeTab === 'stock') {
      // On Stock tab, show Purchase vs. Sales by top Product SKU
      const topSkus = productSummaries.slice(0, 7);
      overviewBuckets = topSkus.map((p) => ({
        label: p.itemCode,
        subLabel: `${p.itemCode} · ${p.itemName}`,
        stockNote: `${p.physicalQty.toLocaleString('en-IN')} ${p.unit} (${formatInrCompact(p.stockValueInr)})`,
        secondary: p.purchaseInr,
        primary: p.salesInr,
        secondaryLabel: 'Purchase',
        primaryLabel: 'Sales',
        profit: p.profitInr,
      }));
    } else {
      // Decide whether to show weekly buckets (if > 6 unique dates) or chronological date buckets
      if (sortedDates.length > 6) {
        const weekMap = new Map<
          string,
          {label: string; sales: number; purchase: number; collected: number; paid: number}
        >();
        for (const entry of sortedDates) {
          const day = Number(entry.iso.slice(8, 10)) || 1;
          const wk = Math.min(4, Math.ceil(day / 7));
          const ym = entry.iso.slice(0, 7);
          const mIdx = Math.max(0, Math.min(11, Number(ym.slice(5, 7)) - 1));
          const key = `${ym}-W${wk}`;
          const label = `Wk ${wk} ${MONTHS_SHORT[mIdx]}`;
          const prev = weekMap.get(key) || {
            label,
            sales: 0,
            purchase: 0,
            collected: 0,
            paid: 0,
          };
          prev.sales += entry.sales;
          prev.purchase += entry.purchase;
          prev.collected += entry.collected;
          prev.paid += entry.paid;
          weekMap.set(key, prev);
        }
        for (const v of Array.from(weekMap.values()).slice(-6)) {
          datedEntries.push({
            iso: v.label,
            sales: v.sales,
            purchase: v.purchase,
            collected: v.collected,
            paid: v.paid,
          });
        }
      } else {
        for (const entry of sortedDates) {
          datedEntries.push(entry);
        }
      }

      overviewBuckets = datedEntries.map((d) => {
        const label = /^\d{4}-\d{2}-\d{2}$/.test(d.iso) ? formatIsoDayMonth(d.iso) : d.iso;
        if (activeTab === 'purchase') {
          return {
            label,
            subLabel: label,
            secondary: d.purchase,
            primary: d.paid,
            secondaryLabel: 'Total Purchase',
            primaryLabel: 'Paid Amount',
            profit: d.purchase - d.paid,
          };
        }
        if (activeTab === 'profit') {
          return {
            label,
            subLabel: label,
            secondary: d.purchase,
            primary: d.sales,
            secondaryLabel: 'Purchase Cost',
            primaryLabel: 'Sales Revenue',
            profit: d.sales - d.purchase,
          };
        }
        // default 'sales' tab
        return {
          label,
          subLabel: label,
          secondary: d.purchase,
          primary: d.sales,
          secondaryLabel: 'Purchase',
          primaryLabel: 'Sales',
          profit: d.sales - d.purchase,
        };
      });
    }

    // Branch performance rows
    const branchPerf = branchBreakdowns.map((b) => {
      const sales = b.sources.sales.valueInr;
      const purchase = b.sources.purchases.valueInr;
      const profit = sales - purchase;
      const marginPct = sales > 0 ? (profit / sales) * 100 : purchase > 0 ? -100 : 0;
      return {
        location: b.location,
        name: b.location.name,
        shortName: shortenBranchLabel(b.location.name),
        sales,
        purchase,
        profit,
        marginPct,
        stockValueInr: b.net.valueInr,
        sqft: b.net.sqft,
        pcs: b.net.pcs,
        box: b.net.box,
        salesCount: b.sources.sales.count,
        purchaseCount: b.sources.purchases.count,
      };
    });

    // Top Customers (from filtered sales bills)
    const custMap = new Map<
      string,
      {name: string; invoices: number; totalSales: number; collected: number; due: number}
    >();
    for (const b of salesBills) {
      const total = getSalesTotal(b);
      const collected = getSalesCollected(b);
      const key = b.customerName.trim().toLowerCase();
      const prev = custMap.get(key) || {
        name: b.customerName,
        invoices: 0,
        totalSales: 0,
        collected: 0,
        due: 0,
      };
      prev.invoices += 1;
      prev.totalSales += total;
      prev.collected += collected;
      prev.due += Math.max(0, total - collected);
      custMap.set(key, prev);
    }
    const customerBreakdown = Array.from(custMap.values()).sort(
      (a, b) => b.totalSales - a.totalSales,
    );

    // Supplier Spend (from filtered purchase bills)
    const supMap = new Map<
      string,
      {name: string; bills: number; totalPurchase: number; paid: number; payable: number}
    >();
    for (const b of purchaseBills) {
      const total = getPurchaseTotal(b);
      const paid = getPurchasePaid(b);
      const key = b.supplierName.trim().toLowerCase();
      const prev = supMap.get(key) || {
        name: b.supplierName,
        bills: 0,
        totalPurchase: 0,
        paid: 0,
        payable: 0,
      };
      prev.bills += 1;
      prev.totalPurchase += total;
      prev.paid += paid;
      prev.payable += Math.max(0, total - paid);
      supMap.set(key, prev);
    }
    const supplierBreakdown = Array.from(supMap.values()).sort(
      (a, b) => b.totalPurchase - a.totalPurchase,
    );

    return {
      totalSalesInr,
      totalPurchaseInr,
      grossProfitInr,
      profitMarginPct,
      totalSalesCollectedInr,
      totalSalesReceivableInr,
      totalPurchasePaidInr,
      totalPurchasePayableInr,
      netCashFlowInr,
      totalStockValueInr,
      totalSqft,
      totalPcs,
      totalBox,
      totalLowStock,
      activeProductsCount: activeProducts.length,
      inStockSlabsCount: inStockSlabs.length,
      categoryRows,
      overviewBuckets,
      branchPerf,
      customerBreakdown,
      supplierBreakdown,
      productSummaries,
    };
  }, [filteredBills, snapshot, activeTab]);

  const filteredProductSummaries = useMemo(() => {
    const q = skuSummarySearch.trim().toLowerCase();
    if (!q) return analytics.productSummaries;
    return analytics.productSummaries.filter(
      (p) =>
        p.itemCode.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [analytics.productSummaries, skuSummarySearch]);

  const filteredProductTotals = useMemo(() => {
    return filteredProductSummaries.reduce(
      (acc, p) => {
        acc.salesInr += p.salesInr;
        acc.purchaseInr += p.purchaseInr;
        acc.profitInr += p.profitInr;
        return acc;
      },
      {salesInr: 0, purchaseInr: 0, profitInr: 0},
    );
  }, [filteredProductSummaries]);

  // Donut chart segments for the active tab
  const donutData = useMemo(() => {
    const raw = analytics.categoryRows
      .map((row) => {
        const value =
          activeTab === 'sales'
            ? row.sales
            : activeTab === 'purchase'
              ? row.purchase
              : activeTab === 'stock'
                ? row.stock
                : Math.abs(row.profit);
        return {
          ...row,
          value,
          signedProfit: row.profit,
        };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = raw.reduce((sum, r) => sum + r.value, 0);
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    const segments = raw.map((item) => {
      const pct = total > 0 ? (item.value / total) * 100 : 0;
      const dashLen = (pct / 100) * circumference;
      const seg = {
        ...item,
        pct,
        dashArray: `${Math.max(0, dashLen - 1.5)} ${circumference}`,
        dashOffset: -offset,
      };
      offset += dashLen;
      return seg;
    });

    return {segments, total, radius, circumference};
  }, [analytics.categoryRows, activeTab]);

  // Overview bar chart scale
  const overviewMax = useMemo(() => {
    const peak = Math.max(
      100000,
      ...analytics.overviewBuckets.map((b) => Math.max(b.primary, b.secondary)),
    );
    const step = peak >= 5000000 ? 1000000 : peak >= 1000000 ? 500000 : 100000;
    return Math.ceil(peak / step) * step;
  }, [analytics.overviewBuckets]);

  const overviewTicks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(overviewMax * f));

  // Branch performance chart scale (show active branches, up to 6 sorted by activity)
  const chartBranches = useMemo(() => {
    const sorted = [...analytics.branchPerf].sort((a, b) => {
      if (activeTab === 'stock') return b.stockValueInr - a.stockValueInr;
      return b.sales + b.purchase - (a.sales + a.purchase);
    });
    const activeOnes = sorted.filter((b) =>
      activeTab === 'stock' ? b.stockValueInr > 0 : b.sales > 0 || b.purchase > 0,
    );
    return (activeOnes.length > 0 ? activeOnes : sorted).slice(0, 6);
  }, [analytics.branchPerf, activeTab]);

  const branchMax = useMemo(() => {
    const peak = Math.max(
      100000,
      ...chartBranches.map((b) =>
        activeTab === 'stock'
          ? b.stockValueInr
          : Math.max(b.sales, b.purchase, Math.abs(b.profit)),
      ),
    );
    const step = peak >= 5000000 ? 1000000 : peak >= 1000000 ? 500000 : 100000;
    return Math.ceil(peak / step) * step;
  }, [chartBranches, activeTab]);

  const branchTicks = [1, 0.66, 0.33, 0].map((f) => Math.round(branchMax * f));

  // Export Profit & Loss / Active Tab CSV
  function handleExportReportCsv() {
    if (activeTab === 'analytics') {
      const headers = [
        'SKU',
        'Source',
        'Design / Product Name',
        'Dimensions',
        'Category',
        'Finish',
        'Branch',
        'On-Hand Qty',
        'Unit',
        'Blocked Stock Value (INR)',
        'Days in Warehouse',
        'Age Bracket',
        'Sales Qty',
        'Turnover (%)',
        'Movement Status',
        'Recommended Action',
      ];
      const rows = slowMovingAnalysis.items.map((item) => [
        `"${item.itemCode}"`,
        `"${item.sourceKind}"`,
        `"${item.itemName.replace(/"/g, '""')}"`,
        `"${item.dimensions}"`,
        `"${item.category}"`,
        `"${item.finish}"`,
        `"${item.branchName}"`,
        item.qty,
        `"${item.unit}"`,
        item.stockValueInr,
        item.ageDays,
        `"${item.ageBucket}"`,
        item.salesQty,
        item.turnoverPct.toFixed(1),
        `"${item.movementStatus}"`,
        `"${item.recommendation.replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stonepulse-slow-moving-aging-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (activeTab === 'stock') {
      const headers = [
        'SKU',
        'Product Name',
        'Category',
        'Current Stock Qty',
        'Unit',
        'Stock Value (INR)',
        'Total Sales (INR)',
        'Total Purchase (INR)',
        'Profit (Sales - Purchase INR)',
        'Margin (%)',
      ];
      const rows = analytics.productSummaries.map((p) => [
        `"${p.itemCode}"`,
        `"${p.itemName.replace(/"/g, '""')}"`,
        `"${p.category}"`,
        p.physicalQty,
        `"${p.unit}"`,
        p.stockValueInr,
        p.salesInr,
        p.purchaseInr,
        p.profitInr,
        p.marginPct.toFixed(1),
      ]);
      const sumSales = analytics.productSummaries.reduce((s, p) => s + p.salesInr, 0);
      const sumPurchase = analytics.productSummaries.reduce((s, p) => s + p.purchaseInr, 0);
      const sumProfit = sumSales - sumPurchase;
      const sumStock = analytics.productSummaries.reduce((s, p) => s + p.stockValueInr, 0);
      rows.push([
        '"TOTAL"',
        `"${analytics.productSummaries.length} SKUs"`,
        '""',
        '',
        '""',
        sumStock,
        sumSales,
        sumPurchase,
        sumProfit,
        sumSales > 0 ? ((sumProfit / sumSales) * 100).toFixed(1) : '0.0',
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stonepulse-stock-sku-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = [
      'Branch',
      'Sales Bills',
      'Total Sales (INR)',
      'Purchase Bills',
      'Total Purchase (INR)',
      'Gross Profit (Sales - Purchase INR)',
      'Margin (%)',
      'Current Stock Value (INR)',
    ];
    const rows = analytics.branchPerf.map((b) => [
      `"${b.name}"`,
      b.salesCount,
      b.sales,
      b.purchaseCount,
      b.purchase,
      b.profit,
      b.marginPct.toFixed(1),
      b.stockValueInr,
    ]);
    rows.push([
      '"TOTAL"',
      filteredBills.salesBills.length,
      analytics.totalSalesInr,
      filteredBills.purchaseBills.length,
      analytics.totalPurchaseInr,
      analytics.grossProfitInr,
      analytics.profitMarginPct.toFixed(1),
      analytics.totalStockValueInr,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stonepulse-${activeTab}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJsonSnapshot() {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stonepulse-audit-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const overviewTitle =
    activeTab === 'sales'
      ? 'Sales Overview'
      : activeTab === 'purchase'
        ? 'Purchase Overview'
        : activeTab === 'stock'
          ? 'Product Sales vs. Purchase by SKU'
          : 'Profit & Revenue Overview';

  const donutTitle =
    activeTab === 'sales'
      ? 'Sales by Category'
      : activeTab === 'purchase'
        ? 'Purchase by Category'
        : activeTab === 'stock'
          ? 'Stock Value by Category'
          : 'Profit Impact by Category';

  return (
    <div className="space-y-5">
      {/* Header Row matching reference layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shrink-0">
            <BarChart3 className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#0F172A] tracking-tight leading-tight">
              Reports &amp; Analytics
            </h1>
            <p className="text-[12.5px] text-[#64748B]">
              Live financial &amp; stock analytics calculated from Sales Bills, Purchase Bills, Products, and Slabs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Picker Control (for bill-period tabs) */}
          {activeTab !== 'analytics' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDateMenuOpen((v) => !v)}
              className="h-9 px-3 rounded-lg bg-white border border-[#E2E8F0] hover:border-slate-300 text-[12px] font-medium text-[#0F172A] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="tabular-nums">{filteredBills.rangeLabel}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-[#64748B] transition-transform ${
                  dateMenuOpen ? 'rotate-90' : ''
                }`}
              />
            </button>

            {dateMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white border border-[#E5E9F0] rounded-xl shadow-lg p-3 z-30 space-y-2.5">
                <div className="text-[11px] font-semibold text-[#64748B]">
                  Filter Bills by Period
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      {id: 'all', label: 'All Dates'},
                      {id: 'this_month', label: 'This Month'},
                      {id: 'apr_2024', label: 'April 2024'},
                      {id: 'custom', label: 'Custom Range'},
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDatePreset(opt.id);
                        if (opt.id !== 'custom') setDateMenuOpen(false);
                      }}
                      className={`h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-left transition-colors ${
                        datePreset === opt.id
                          ? 'bg-[#EEF4FF] text-[#1D63ED] border border-blue-200'
                          : 'bg-[#F8FAFC] text-[#334155] hover:bg-slate-100 border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {datePreset === 'custom' && (
                  <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10.5px] text-[#64748B] mb-0.5">
                          From
                        </label>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="w-full h-8 px-2 text-[11.5px] rounded-md border border-[#E2E8F0] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[#64748B] mb-0.5">To</label>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="w-full h-8 px-2 text-[11.5px] rounded-md border border-[#E2E8F0] tabular-nums"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDateMenuOpen(false)}
                      className="w-full h-8 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-semibold"
                    >
                      Apply Range
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          <button
            type="button"
            onClick={handleExportReportCsv}
            className="h-9 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJsonSnapshot}
            className="h-9 px-3 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-50 text-[#334155] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Underline Tab Bar (Sales · Purchase · Stock · Profit · Analytics) */}
      <div className="border-b border-[#E5E9F0] flex items-center gap-6 overflow-x-auto">
        {(
          [
            {id: 'sales', label: 'Sales'},
            {id: 'purchase', label: 'Purchase'},
            {id: 'stock', label: 'Stock'},
            {id: 'profit', label: 'Profit'},
            {id: 'analytics', label: 'Analytics'},
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setHoveredOverviewIdx(null);
                setHoveredBranchIdx(null);
                setHoveredCat(null);
              }}
              className={`pb-2.5 text-[13.5px] font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'analytics' ? (
        <SlowMovingAnalyticsPanel
          snapshot={snapshot}
          analysis={slowMovingAnalysis}
          onSelectLocation={onSelectLocation}
          onCreateTransfer={onCreateTransfer}
        />
      ) : (
        <>
      {/* Row 1: Overview Bar Chart + Contextual Summary Card (Stacked full-width on Stock, Side-by-side on Profit) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Overview Grouped Bar Chart */}
        <div
          className={`${
            activeTab === 'profit' ? 'lg:col-span-7' : 'lg:col-span-12'
          } min-w-0 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold text-[#0F172A]">{overviewTitle}</h2>
              <p className="text-[11.5px] text-[#64748B]">
                {activeTab === 'stock'
                  ? 'Top active Product SKUs comparing Purchase cost vs. Sales revenue'
                  : 'Grouped comparison automatically aggregated from recorded bills'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11.5px] text-[#475569]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#93C5FD]" />
                {analytics.overviewBuckets[0]?.secondaryLabel || 'Purchase'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" />
                {analytics.overviewBuckets[0]?.primaryLabel || 'Sales'}
              </span>
            </div>
          </div>

          {analytics.overviewBuckets.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-[#64748B]">
              No bills recorded in this date range. Switch to All Dates or record a new bill.
            </div>
          ) : (
            <div className="relative pt-2">
              <div className="grid grid-cols-[44px_1fr] gap-2">
                {/* Y-axis ticks */}
                <div className="flex flex-col justify-between h-[200px] text-right pr-1 text-[10.5px] text-[#64748B] font-mono tabular-nums">
                  {overviewTicks.map((t, i) => (
                    <span key={i}>{formatAxisTickInr(t)}</span>
                  ))}
                </div>

                {/* Bar plotting area */}
                <div className="relative h-[200px] flex flex-col justify-between">
                  {/* Gridlines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {overviewTicks.map((_, i) => (
                      <div key={i} className="w-full border-t border-[#F1F5F9]" />
                    ))}
                  </div>

                  {/* Bars */}
                  <div className="relative z-10 h-full flex items-end justify-around gap-3 px-2 pt-1">
                    {analytics.overviewBuckets.map((bucket, idx) => {
                      const secH = Math.max(
                        bucket.secondary > 0 ? 4 : 0,
                        (bucket.secondary / overviewMax) * 100,
                      );
                      const priH = Math.max(
                        bucket.primary > 0 ? 4 : 0,
                        (bucket.primary / overviewMax) * 100,
                      );
                      const isHovered = hoveredOverviewIdx === idx;
                      const tooltipPosClass =
                        idx === 0
                          ? 'left-0'
                          : idx === analytics.overviewBuckets.length - 1
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2';
                      return (
                        <div
                          key={bucket.label}
                          onMouseEnter={() => setHoveredOverviewIdx(idx)}
                          onMouseLeave={() => setHoveredOverviewIdx(null)}
                          className="relative flex-1 max-w-[112px] h-full flex items-end justify-center gap-1.5 group cursor-pointer"
                        >
                          {isHovered && (
                            <div
                              className={`absolute -top-2 -translate-y-full ${tooltipPosClass} z-40 bg-[#0F172A] text-white text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none`}
                            >
                              <div className="font-semibold mb-1">{bucket.subLabel}</div>
                              {bucket.stockNote && (
                                <div className="flex items-center justify-between gap-3 text-slate-300 mb-1 tabular-nums">
                                  <span>In Stock:</span>
                                  <span className="font-mono">{bucket.stockNote}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-3 tabular-nums">
                                <span className="text-sky-300">{bucket.secondaryLabel}:</span>
                                <span className="font-mono">{formatInrExact(bucket.secondary)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 tabular-nums">
                                <span className="text-blue-300">{bucket.primaryLabel}:</span>
                                <span className="font-mono">{formatInrExact(bucket.primary)}</span>
                              </div>
                              <div className="mt-1 pt-1 border-t border-slate-700 flex items-center justify-between gap-3 tabular-nums">
                                <span className="text-slate-300">
                                  {activeTab === 'purchase' ? 'Unpaid:' : 'Net Profit:'}
                                </span>
                                <span
                                  className={`font-mono font-semibold ${
                                    bucket.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {bucket.profit > 0 ? '+' : ''}
                                  {formatInrExact(bucket.profit)}
                                </span>
                              </div>
                            </div>
                          )}

                          <div
                            style={{height: `${secH}%`}}
                            className={`w-4 sm:w-5 rounded-t-md transition-opacity duration-150 ${
                              isHovered ? 'bg-[#60A5FA]' : 'bg-[#93C5FD]'
                            }`}
                          />
                          <div
                            style={{height: `${priH}%`}}
                            className={`w-4 sm:w-5 rounded-t-md transition-opacity duration-150 ${
                              isHovered ? 'bg-[#1D4ED8]' : 'bg-[#2563EB]'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* X-axis labels */}
              <div className="grid grid-cols-[44px_1fr] gap-2 mt-2">
                <div />
                <div className="flex items-center justify-around gap-3 px-2 text-[10.5px] font-medium text-[#64748B]">
                  {analytics.overviewBuckets.map((bucket) => (
                    <span
                      key={bucket.label}
                      title={bucket.subLabel}
                      className={`truncate text-center flex-1 max-w-[112px] min-w-0 ${
                        activeTab === 'stock' ? 'font-mono text-[10.5px]' : ''
                      }`}
                    >
                      {bucket.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stacked Full-Width (Stock Tab): Product Summary showing Sales, Purchase & Profit for every product with SKU */}
        {activeTab === 'stock' && (
          <div className="lg:col-span-12 min-w-0 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col gap-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-[15px] font-bold text-[#0F172A]">Summary</h2>
                <p className="text-[12px] text-[#64748B]">
                  Sales, Purchase &amp; Profit for every product by SKU ({filteredProductSummaries.length} of{' '}
                  {analytics.productSummaries.length} SKUs)
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={skuSummarySearch}
                  onChange={(e) => setSkuSummarySearch(e.target.value)}
                  placeholder="Search SKU, product, or category..."
                  className="w-full h-8.5 pl-8 pr-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white focus:outline-none text-[12px] text-[#0F172A] placeholder:text-[#94A3B8]"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-[#EBF0F6] rounded-lg">
              <table className="w-full text-left border-collapse text-[12.5px] min-w-[720px]">
                <thead className="sticky top-0 bg-[#F8FAFC] z-10">
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-semibold text-[#64748B]">
                    <th className="py-2.5 pl-3.5 pr-2">SKU</th>
                    <th className="py-2.5 px-2">Product</th>
                    <th className="py-2.5 px-2 text-right">In Stock</th>
                    <th className="py-2.5 px-2 text-right">Sales (₹)</th>
                    <th className="py-2.5 px-2 text-right">Purchase (₹)</th>
                    <th className="py-2.5 px-2 text-right">Profit (₹)</th>
                    <th className="py-2.5 pl-2 pr-3.5 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {filteredProductSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[12.5px] text-[#64748B]">
                        No matching products found.
                      </td>
                    </tr>
                  ) : (
                    filteredProductSummaries.map((p) => (
                      <tr key={p.itemCode} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pl-3.5 pr-2 font-mono text-[11.5px] font-semibold text-[#1D4ED8] whitespace-nowrap">
                          {p.itemCode}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="font-medium text-[#0F172A]">{p.itemName}</div>
                          <div className="text-[11px] text-[#64748B]">{p.category}</div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[#475569] whitespace-nowrap">
                          {p.physicalQty.toLocaleString('en-IN')} {p.unit}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums font-medium text-[#0F172A] whitespace-nowrap">
                          {formatInrExact(p.salesInr)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569] whitespace-nowrap">
                          {formatInrExact(p.purchaseInr)}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            p.profitInr > 0
                              ? 'text-[#16A34A]'
                              : p.profitInr < 0
                                ? 'text-[#DC2626]'
                                : 'text-[#64748B]'
                          }`}
                        >
                          {p.profitInr > 0 ? '+' : ''}
                          {formatInrExact(p.profitInr)}
                        </td>
                        <td
                          className={`py-2.5 pl-2 pr-3.5 text-right tabular-nums font-medium whitespace-nowrap ${
                            p.profitInr > 0
                              ? 'text-[#16A34A]'
                              : p.profitInr < 0
                                ? 'text-[#DC2626]'
                                : 'text-[#64748B]'
                          }`}
                        >
                          {p.salesInr > 0 || p.purchaseInr > 0
                            ? `${p.marginPct >= 0 ? '+' : ''}${p.marginPct.toFixed(1)}%`
                            : '0.0%'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-[#FAFBFD] z-10">
                  <tr className="border-t border-[#E5E9F0] font-semibold text-[#0F172A]">
                    <td colSpan={3} className="py-2.5 pl-3.5 pr-2">
                      Total ({filteredProductSummaries.length} SKUs)
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatInrExact(filteredProductTotals.salesInr)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatInrExact(filteredProductTotals.purchaseInr)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                        filteredProductTotals.profitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {filteredProductTotals.profitInr > 0 ? '+' : ''}
                      {formatInrExact(filteredProductTotals.profitInr)}
                    </td>
                    <td
                      className={`py-2.5 pl-2 pr-3.5 text-right tabular-nums whitespace-nowrap ${
                        filteredProductTotals.profitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {filteredProductTotals.salesInr > 0
                        ? `${filteredProductTotals.profitInr >= 0 ? '+' : ''}${(
                            (filteredProductTotals.profitInr / filteredProductTotals.salesInr) *
                            100
                          ).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Right (Profit Tab ONLY): Financial Summary Card */}
        {activeTab === 'profit' && (
          <div className="lg:col-span-5 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-[#0F172A]">Summary</h2>
              <span className="text-[11.5px] text-[#64748B] tabular-nums">
                {filteredBills.salesBills.length} sales · {filteredBills.purchaseBills.length} purchase
              </span>
            </div>

            <div className="space-y-2.5 flex-1 flex flex-col justify-center">
              {/* Total Sales */}
              <div className="px-4 py-3.5 rounded-xl bg-[#F8FAFC] border border-[#EBF0F6] flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-[#334155]">Total Sales</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 tabular-nums">
                    Collected: {formatInrCompact(analytics.totalSalesCollectedInr)} · Due:{' '}
                    {formatInrCompact(analytics.totalSalesReceivableInr)}
                  </div>
                </div>
                <div
                  title={formatInrExact(analytics.totalSalesInr)}
                  className="text-[18px] font-bold text-[#0F172A] tabular-nums font-mono whitespace-nowrap"
                >
                  {formatInrExact(analytics.totalSalesInr)}
                </div>
              </div>

              {/* Total Purchase */}
              <div className="px-4 py-3.5 rounded-xl bg-[#F8FAFC] border border-[#EBF0F6] flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-[#334155]">Total Purchase</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 tabular-nums">
                    Paid: {formatInrCompact(analytics.totalPurchasePaidInr)} · Payable:{' '}
                    {formatInrCompact(analytics.totalPurchasePayableInr)}
                  </div>
                </div>
                <div
                  title={formatInrExact(analytics.totalPurchaseInr)}
                  className="text-[18px] font-bold text-[#0F172A] tabular-nums font-mono whitespace-nowrap"
                >
                  {formatInrExact(analytics.totalPurchaseInr)}
                </div>
              </div>

              {/* Gross Profit (Sales − Purchase) */}
              <div className="px-4 py-3.5 rounded-xl bg-[#F8FAFC] border border-[#EBF0F6] flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-[#334155] flex items-center gap-1.5">
                    <span>{analytics.grossProfitInr >= 0 ? 'Gross Profit' : 'Net Deficit'}</span>
                    {analytics.grossProfitInr >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-[#16A34A]" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-[#DC2626]" />
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 tabular-nums">
                    Sales − Purchase · Margin:{' '}
                    <span
                      className={`font-semibold ${
                        analytics.grossProfitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {analytics.profitMarginPct >= 0 ? '+' : ''}
                      {analytics.profitMarginPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div
                  title={formatInrExact(analytics.grossProfitInr)}
                  className={`text-[18px] font-bold tabular-nums font-mono whitespace-nowrap ${
                    analytics.grossProfitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}
                >
                  {analytics.grossProfitInr > 0 ? '+' : ''}
                  {formatInrExact(analytics.grossProfitInr)}
                </div>
              </div>
            </div>

            {/* Compact Cash Flow & Inventory Valuation footer inside Summary */}
            <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between text-[11.5px] text-[#64748B] tabular-nums">
              <span>
                Inventory Stock:{' '}
                <strong className="text-[#0F172A]">
                  {formatInrCompact(analytics.totalStockValueInr)}
                </strong>
              </span>
              <span>
                Cash Flow:{' '}
                <strong
                  className={
                    analytics.netCashFlowInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }
                >
                  {analytics.netCashFlowInr > 0 ? '+' : ''}
                  {formatInrCompact(analytics.netCashFlowInr)}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Sales/Purchase/Stock by Category Donut (Left) + Branch Performance Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Bottom Left: Category Donut Chart */}
        <div className="lg:col-span-5 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-[#0F172A]">{donutTitle}</h2>
            <span className="text-[11.5px] text-[#64748B] font-mono tabular-nums">
              {formatInrCompact(donutData.total)}
            </span>
          </div>

          {donutData.segments.length === 0 ? (
            <div className="h-[175px] flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-[#64748B]">
              No category transactions recorded for this period.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 my-auto">
              <div className="relative w-[152px] h-[152px] shrink-0">
                <svg viewBox="0 0 148 148" className="w-full h-full -rotate-90">
                  <circle
                    cx="74"
                    cy="74"
                    r={donutData.radius}
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="20"
                  />
                  {donutData.segments.map((seg) => {
                    const isHovered = hoveredCat === seg.category;
                    return (
                      <circle
                        key={seg.category}
                        cx="74"
                        cy="74"
                        r={donutData.radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isHovered ? 23 : 20}
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        className="transition-all duration-150 cursor-pointer"
                        onMouseEnter={() => setHoveredCat(seg.category)}
                        onMouseLeave={() => setHoveredCat(null)}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                  <span className="text-[10.5px] text-[#64748B] truncate max-w-[84px]">
                    {hoveredCat || 'Total'}
                  </span>
                  <span className="text-[13px] font-bold text-[#0F172A] tabular-nums">
                    {hoveredCat
                      ? formatInrCompact(
                          donutData.segments.find((s) => s.category === hoveredCat)?.value || 0,
                        )
                      : formatInrCompact(donutData.total)}
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full space-y-2.5">
                {donutData.segments.map((seg) => {
                  const isHovered = hoveredCat === seg.category;
                  return (
                    <div
                      key={seg.category}
                      onMouseEnter={() => setHoveredCat(seg.category)}
                      onMouseLeave={() => setHoveredCat(null)}
                      className={`flex items-center justify-between gap-2 text-[12.5px] rounded-md px-1.5 py-0.5 transition-colors cursor-pointer ${
                        isHovered ? 'bg-slate-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{backgroundColor: seg.color}}
                        />
                        <span className="font-medium text-[#334155] truncate">
                          {seg.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                        <span className="text-[11.5px] text-[#64748B] font-mono">
                          {formatInrCompact(seg.value)}
                        </span>
                        <span className="font-bold text-[#0F172A] w-10 text-right">
                          {Math.round(seg.pct)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Right: Branch Performance Grouped Bar Chart */}
        <div className="lg:col-span-7 bg-white border border-[#E5E9F0] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold text-[#0F172A]">Branch Performance</h2>
              <p className="text-[11.5px] text-[#64748B]">
                Click any branch column to open its full stock &amp; billing breakdown
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11.5px] text-[#475569]">
              {activeTab === 'stock' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" />
                  Net Stock Value (₹)
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#BFDBFE]" />
                    Purchase
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" />
                    Sales
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="relative pt-2">
            <div className="grid grid-cols-[44px_1fr] gap-2">
              <div className="flex flex-col justify-between h-[170px] text-right pr-1 text-[10.5px] text-[#64748B] font-mono tabular-nums">
                {branchTicks.map((t, i) => (
                  <span key={i}>{formatAxisTickInr(t)}</span>
                ))}
              </div>

              <div className="relative h-[170px] flex flex-col justify-between">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {branchTicks.map((_, i) => (
                    <div key={i} className="w-full border-t border-[#F1F5F9]" />
                  ))}
                </div>

                <div className="relative z-10 h-full flex items-end justify-around gap-2 px-1 pt-1">
                  {chartBranches.map((b, idx) => {
                    const isHovered = hoveredBranchIdx === idx;
                    const purH = Math.max(
                      b.purchase > 0 ? 5 : 0,
                      (b.purchase / branchMax) * 100,
                    );
                    const salH = Math.max(
                      b.sales > 0 ? 5 : 0,
                      (b.sales / branchMax) * 100,
                    );
                    const stkH = Math.max(
                      b.stockValueInr > 0 ? 5 : 0,
                      (b.stockValueInr / branchMax) * 100,
                    );
                    const branchTooltipPos =
                      idx === 0
                        ? 'left-0'
                        : idx === chartBranches.length - 1
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2';
                    return (
                      <button
                        key={b.location.id}
                        type="button"
                        onClick={() => onSelectLocation(b.location)}
                        onMouseEnter={() => setHoveredBranchIdx(idx)}
                        onMouseLeave={() => setHoveredBranchIdx(null)}
                        className="relative flex-1 max-w-[84px] h-full flex items-end justify-center gap-1.5 cursor-pointer focus:outline-none"
                      >
                        {isHovered && (
                          <div
                            className={`absolute -top-2 -translate-y-full ${branchTooltipPos} z-40 bg-[#0F172A] text-white text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none text-left`}
                          >
                            <div className="font-semibold mb-1">{b.name}</div>
                            <div className="flex items-center justify-between gap-3 tabular-nums">
                              <span className="text-blue-300">Sales:</span>
                              <span className="font-mono">{formatInrExact(b.sales)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 tabular-nums">
                              <span className="text-sky-200">Purchase:</span>
                              <span className="font-mono">{formatInrExact(b.purchase)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 tabular-nums">
                              <span className="text-slate-300">Profit:</span>
                              <span
                                className={`font-mono font-semibold ${
                                  b.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {b.profit > 0 ? '+' : ''}
                                {formatInrExact(b.profit)}
                              </span>
                            </div>
                            <div className="mt-1 pt-1 border-t border-slate-700 flex items-center justify-between gap-3 tabular-nums">
                              <span className="text-slate-400">Stock Value:</span>
                              <span className="font-mono">{formatInrCompact(b.stockValueInr)}</span>
                            </div>
                          </div>
                        )}

                        {activeTab === 'stock' ? (
                          <div
                            style={{height: `${stkH}%`}}
                            className={`w-7 rounded-t-md transition-colors ${
                              isHovered ? 'bg-[#1D4ED8]' : 'bg-[#2563EB]'
                            }`}
                          />
                        ) : (
                          <>
                            <div
                              style={{height: `${purH}%`}}
                              className={`w-3.5 sm:w-4.5 rounded-t-md transition-colors ${
                                isHovered ? 'bg-[#93C5FD]' : 'bg-[#BFDBFE]'
                              }`}
                            />
                            <div
                              style={{height: `${salH}%`}}
                              className={`w-3.5 sm:w-4.5 rounded-t-md transition-colors ${
                                isHovered ? 'bg-[#1D4ED8]' : 'bg-[#2563EB]'
                              }`}
                            />
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[44px_1fr] gap-2 mt-2">
              <div />
              <div className="flex items-center justify-around gap-2 px-1 text-[11px] font-medium text-[#64748B]">
                {chartBranches.map((b) => (
                  <span
                    key={b.location.id}
                    title={b.name}
                    className="truncate text-center flex-1 max-w-[84px]"
                  >
                    {b.shortName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Contextual Live Ledger Report Table (Sales / Purchase / Profit only) */}
      {activeTab !== 'stock' && (
        <div className="bg-white border border-[#E5E9F0] rounded-xl p-5 space-y-3.5">
        {activeTab === 'sales' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[14.5px] font-bold text-[#0F172A]">
                  Customer Revenue &amp; Collection Report ({analytics.customerBreakdown.length})
                </h2>
                <p className="text-[12px] text-[#64748B]">
                  Aggregated directly from Sales Invoices in the selected period
                </p>
              </div>
              <div className="text-[12px] text-[#475569] tabular-nums">
                Collection Rate:{' '}
                <strong className="text-[#16A34A]">
                  {analytics.totalSalesInr > 0
                    ? `${((analytics.totalSalesCollectedInr / analytics.totalSalesInr) * 100).toFixed(1)}%`
                    : '0%'}
                </strong>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[640px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 px-2 text-right">Invoices</th>
                    <th className="py-2 px-2 text-right">Total Billed (₹)</th>
                    <th className="py-2 px-2 text-right">Collected (₹)</th>
                    <th className="py-2 pl-2 text-right">Due Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {analytics.customerBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#64748B]">
                        No sales invoices in this period.
                      </td>
                    </tr>
                  ) : (
                    analytics.customerBreakdown.map((c) => (
                      <tr key={c.name} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-3 font-medium text-[#0F172A]">{c.name}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[#475569]">
                          {c.invoices}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold tabular-nums font-mono">
                          {formatInrExact(c.totalSales)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-[#16A34A] tabular-nums font-mono">
                          {formatInrExact(c.collected)}
                        </td>
                        <td
                          className={`py-2.5 pl-2 text-right font-semibold tabular-nums font-mono ${
                            c.due > 0 ? 'text-[#DC2626]' : 'text-[#64748B]'
                          }`}
                        >
                          {formatInrExact(c.due)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'purchase' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[14.5px] font-bold text-[#0F172A]">
                  Supplier Spend &amp; Payables Report ({analytics.supplierBreakdown.length})
                </h2>
                <p className="text-[12px] text-[#64748B]">
                  Calculated automatically from Supplier Purchase Bills
                </p>
              </div>
              <div className="text-[12px] text-[#475569] tabular-nums">
                Total Payable:{' '}
                <strong className="text-[#DC2626]">
                  {formatInrExact(analytics.totalPurchasePayableInr)}
                </strong>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[640px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-3">Supplier</th>
                    <th className="py-2 px-2 text-right">Purchase Bills</th>
                    <th className="py-2 px-2 text-right">Total Purchased (₹)</th>
                    <th className="py-2 px-2 text-right">Paid (₹)</th>
                    <th className="py-2 pl-2 text-right">Payable Due (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {analytics.supplierBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#64748B]">
                        No purchase bills in this period.
                      </td>
                    </tr>
                  ) : (
                    analytics.supplierBreakdown.map((s) => (
                      <tr key={s.name} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-3 font-medium text-[#0F172A]">{s.name}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[#475569]">
                          {s.bills}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold tabular-nums font-mono">
                          {formatInrExact(s.totalPurchase)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-[#16A34A] tabular-nums font-mono">
                          {formatInrExact(s.paid)}
                        </td>
                        <td
                          className={`py-2.5 pl-2 text-right font-semibold tabular-nums font-mono ${
                            s.payable > 0 ? 'text-[#DC2626]' : 'text-[#64748B]'
                          }`}
                        >
                          {formatInrExact(s.payable)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'profit' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[14.5px] font-bold text-[#0F172A]">
                  Branch Profit &amp; Loss Statement (Sales − Purchase)
                </h2>
                <p className="text-[12px] text-[#64748B]">
                  Automatically compares Sales Invoices against Supplier Purchase Bills per branch
                </p>
              </div>
              <div className="text-[12px] text-[#475569] tabular-nums">
                Overall P&amp;L:{' '}
                <strong
                  className={
                    analytics.grossProfitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }
                >
                  {analytics.grossProfitInr > 0 ? '+' : ''}
                  {formatInrExact(analytics.grossProfitInr)}
                </strong>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                    <th className="py-2 pr-3">Branch</th>
                    <th className="py-2 px-2 text-right">Total Sales (₹)</th>
                    <th className="py-2 px-2 text-right">Total Purchase (₹)</th>
                    <th className="py-2 px-2 text-right">Profit / Loss (₹)</th>
                    <th className="py-2 px-2 text-right">Margin</th>
                    <th className="py-2 pl-2 text-right">Inventory On Hand (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {analytics.branchPerf.map((b) => (
                    <tr key={b.location.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-3 font-medium">
                        <button
                          type="button"
                          onClick={() => onSelectLocation(b.location)}
                          className="text-[#2563EB] hover:underline"
                        >
                          {b.name}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-mono">
                        {formatInrExact(b.sales)}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-mono text-[#475569]">
                        {formatInrExact(b.purchase)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-semibold tabular-nums font-mono ${
                          b.profit > 0
                            ? 'text-[#16A34A]'
                            : b.profit < 0
                              ? 'text-[#DC2626]'
                              : 'text-[#64748B]'
                        }`}
                      >
                        {b.profit > 0 ? '+' : ''}
                        {formatInrExact(b.profit)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right tabular-nums font-medium ${
                          b.profit > 0
                            ? 'text-[#16A34A]'
                            : b.profit < 0
                              ? 'text-[#DC2626]'
                              : 'text-[#64748B]'
                        }`}
                      >
                        {b.sales > 0 || b.purchase > 0
                          ? `${b.marginPct >= 0 ? '+' : ''}${b.marginPct.toFixed(1)}%`
                          : '0.0%'}
                      </td>
                      <td className="py-2.5 pl-2 text-right tabular-nums font-mono text-[#0F172A]">
                        {formatInrCompact(b.stockValueInr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E5E9F0] bg-[#FAFBFD] font-semibold text-[#0F172A]">
                    <td className="py-2.5 pr-3">Total</td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-mono">
                      {formatInrExact(analytics.totalSalesInr)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-mono">
                      {formatInrExact(analytics.totalPurchaseInr)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right tabular-nums font-mono ${
                        analytics.grossProfitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {analytics.grossProfitInr > 0 ? '+' : ''}
                      {formatInrExact(analytics.grossProfitInr)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right tabular-nums ${
                        analytics.grossProfitInr >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {analytics.profitMarginPct >= 0 ? '+' : ''}
                      {analytics.profitMarginPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 pl-2 text-right tabular-nums font-mono text-[#2563EB]">
                      {formatInrCompact(analytics.totalStockValueInr)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
