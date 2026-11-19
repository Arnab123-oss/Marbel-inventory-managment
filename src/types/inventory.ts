export type NavSection =
  | 'dashboard'
  | 'inventory'
  | 'products'
  | 'slabs'
  | 'purchase-bills'
  | 'sales-bills'
  | 'transfers'
  | 'customers'
  | 'suppliers'
  | 'branches'
  | 'reports'
  | 'settings';

export type UnitType = 'sq. ft' | 'pcs' | 'box' | 'bag' | 'kg';

export type StoneCategory =
  | 'Marble'
  | 'Granite'
  | 'Tiles'
  | 'Adhesives'
  | 'Onyx & Quartz';

export type KpiId =
  | 'totalBranches'
  | 'totalProducts'
  | 'totalStockValue'
  | 'inventoryAccuracy'
  | 'stockInTransit'
  | 'lowStockItems';

export type WidgetId =
  | 'accuracyOverview'
  | 'valueTrend'
  | 'stockValueByLocation'
  | 'inventoryByLocation'
  | 'stockStatusSummary'
  | 'accuracyTrend'
  | 'topVarianceItems'
  | 'recentAlerts';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  facilityScope: string;
}

export interface DashboardLayout {
  kpiOrder: KpiId[];
  widgetOrder: WidgetId[];
  widgetSpans: Record<WidgetId, 1 | 2 | 3>;
  updatedAt: string;
}

export interface KpiMetrics {
  totalBranches: number;
  totalBranchesDelta: number;
  totalProducts: number;
  totalProductsDelta: number;
  totalStockValueCr: number;
  totalStockValueDelta: number;
  inventoryAccuracyPct: number;
  inventoryAccuracyDelta: number;
  stockInTransitCr: number;
  stockInTransitDelta: number;
  lowStockItems: number;
  lowStockItemsDelta: number;
}

export interface AccuracyBreakdown {
  accurateCount: number;
  accuratePct: number;
  minorVarianceCount: number;
  minorVariancePct: number;
  majorVarianceCount: number;
  majorVariancePct: number;
}

export interface StockStatusBreakdown {
  totalItems: number;
  inStockCount: number;
  inStockPct: number;
  lowStockCount: number;
  lowStockPct: number;
  outOfStockCount: number;
  outOfStockPct: number;
  overstockCount: number;
  overstockPct: number;
}

export interface TrendPoint {
  date: string;
  valueCr: number;
  accuracyPct: number;
}

export interface LocationRow {
  id: string;
  name: string;
  type: 'Showroom' | 'Yard' | 'Godown' | 'Depot';
  totalItems: number;
  sqftQty: number;
  pcsQty: number;
  boxQty: number;
  stockValueCr: number;
  inventoryAccuracyPct: number;
  minorVarianceItems: number;
  majorVarianceItems: number;
  lowStockItems: number;
  overstockItems: number;
  inTransitCr: number;
  lastAuditAt: string;
}

export interface VarianceItem {
  id: string;
  itemCode: string;
  itemName: string;
  dimensions: string;
  category: StoneCategory;
  finish: 'Polished' | 'Honed' | 'Leather' | 'Matte' | 'Standard';
  thickness: string;
  locationId: string;
  locationName: string;
  unit: UnitType;
  systemQty: number;
  physicalQty: number;
  variance: number;
  variancePct: number;
  unitPriceInr: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Overstock';
  lastCountedAt: string;
  imageUrl?: string;
  enabled?: boolean;
}

export interface ProductHistoryEntry {
  id: string;
  itemId: string;
  itemCode: string;
  type: 'Purchase' | 'Sale' | 'Transfer' | 'Adjustment';
  referenceNo: string;
  quantityDelta: number;
  unit: UnitType;
  systemAfter: number;
  physicalAfter: number;
  branchName: string;
  partyOrNote: string;
  timestampLabel: string;
}

export interface SlabLot {
  id: string;
  lotNumber: string;
  stoneName: string;
  category: StoneCategory;
  dimensionsFt: string;
  slabCountPcs: number;
  totalSqFt: number;
  thicknessMm: number;
  branchName: string;
  finish: 'Polished' | 'Honed' | 'Leather';
  status: 'Available' | 'Reserved' | 'Sold' | 'In Cutting';
  imageUrl?: string;
}

export interface PurchaseBill {
  id: string;
  billNo: string;
  supplierName: string;
  branchName: string;
  itemSummary: string;
  qty: number;
  unit: UnitType;
  totalInr: number;
  status: 'Paid' | 'Pending' | 'Partial';
  dateLabel: string;
}

export interface SalesBill {
  id: string;
  invoiceNo: string;
  customerName: string;
  branchName: string;
  itemSummary: string;
  qty: number;
  unit: UnitType;
  totalInr: number;
  status: 'Paid' | 'Due' | 'Dispatched';
  dateLabel: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  segment: 'Architect' | 'Builder' | 'Contractor' | 'Retail';
  phone: string;
  city: string;
  totalPurchasedInr: number;
  outstandingInr: number;
  lastOrderLabel: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  origin: string;
  specialty: string;
  phone: string;
  totalSuppliedInr: number;
  payableInr: number;
  lastDeliveryLabel: string;
}

export interface InventoryAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  locationName: string;
  itemCode?: string;
  timestampLabel: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface StockTransfer {
  id: string;
  transferCode: string;
  itemCode: string;
  itemName: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  unit: UnitType;
  valueCr: number;
  status: 'In Transit' | 'Delivered' | 'Scheduled';
  etaLabel: string;
}

export interface InventorySnapshot {
  domainVersion: string;
  dateRange: string;
  lastUpdatedAt: string;
  kpis: KpiMetrics;
  accuracyBreakdown: AccuracyBreakdown;
  stockStatus: StockStatusBreakdown;
  trends: TrendPoint[];
  locations: LocationRow[];
  varianceItems: VarianceItem[];
  history: ProductHistoryEntry[];
  slabs: SlabLot[];
  purchaseBills: PurchaseBill[];
  salesBills: SalesBill[];
  customers: CustomerRecord[];
  suppliers: SupplierRecord[];
  alerts: InventoryAlert[];
  transfers: StockTransfer[];
}

export type DateRangeKey = 'apr_2024' | 'last_7_days' | 'mar_2024' | 'q1_2024';

export interface DashboardFilters {
  locationType: 'All' | 'Showroom' | 'Yard' | 'Godown' | 'Depot';
  unitFilter: 'All' | UnitType;
  accuracyBand: 'All' | '99%+' | '<98.5%';
  statusFilter: 'All' | 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Overstock';
  searchQuery: string;
}
