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
  | 'returns'
  | 'reports'
  | 'settings';

export type UnitType = 'sq. ft' | 'pcs' | 'box' | 'bag' | 'kg';

export type TrackingType = 'quantity' | 'slab';

export type StoneCategory =
  | 'Marble'
  | 'Granite'
  | 'Tiles'
  | 'Adhesives'
  | 'Onyx & Quartz';

export type KpiId =
  | 'totalSales'
  | 'totalPurchases'
  | 'totalStockValue'
  | 'netProfit'
  | 'lowStockItems'
  | 'totalBranches'
  | 'totalProducts'
  | 'inventoryAccuracy'
  | 'stockInTransit';

export type WidgetId =
  | 'outstandingPayments'
  | 'salesTrend'
  | 'topProducts'
  | 'recentActivities'
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
  companyId?: string;
  authorizedBranchIds?: string[];
  name: string;
  email: string;
  initials: string;
  role: string;
  facilityScope: string;
  firebaseUid?: string;
  enabled?: boolean;
}

export interface StoredUser extends UserProfile {
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
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
  totalStockValueInr?: number;
  totalStockValueDelta: number;
  totalSalesInr?: number;
  totalSalesCount?: number;
  totalSalesCollectedPct?: number;
  totalPurchasesInr?: number;
  totalPurchasesCount?: number;
  totalPurchasesPaidPct?: number;
  netProfitInr?: number;
  netProfitMarginPct?: number;
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
  companyId?: string;
  name: string;
  type: 'Showroom' | 'Yard' | 'Godown' | 'Depot';
  address?: string;
  phone?: string;
  enabled?: boolean;
  totalItems: number;
  sqftQty: number;
  pcsQty: number;
  boxQty: number;
  stockValueCr: number;
  stockValueInr?: number;
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
  companyId?: string;
  branchId?: string;
  itemCode: string;
  itemName: string;
  dimensions: string;
  category: StoneCategory;
  material?: string;
  trackingType?: TrackingType;
  finish: 'Polished' | 'Honed' | 'Leather' | 'Matte' | 'Standard';
  thickness: string;
  locationId: string;
  locationName: string;
  unit: UnitType;
  systemQty: number;
  physicalQty: number;
  minStockQty?: number;
  variance: number;
  variancePct: number;
  unitPriceInr: number;
  unitPricePaise?: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Overstock';
  lastCountedAt: string;
  stockedDateIso?: string;
  imageUrl?: string;
  enabled?: boolean;
}

export interface ProductHistoryEntry {
  id: string;
  companyId?: string;
  itemId: string;
  itemCode: string;
  type: 'Purchase' | 'Sale' | 'Transfer' | 'Adjustment' | 'Return';
  referenceNo: string;
  quantityDelta: number;
  unit: UnitType;
  systemAfter: number;
  physicalAfter: number;
  branchName: string;
  partyOrNote: string;
  timestampLabel: string;
}

export type SlabLifecycleStatus =
  | 'In Stock'
  | 'Out of Stock'
  | 'Available'
  | 'Reserved'
  | 'Sold'
  | 'In Transit'
  | 'Damaged';

export interface SlabLot {
  id: string;
  companyId?: string;
  branchId?: string;
  productId?: string;
  purchaseBillId?: string;
  lotNumber: string;
  slabCode?: string;
  stoneName: string;
  category: StoneCategory;
  dimensionsFt: string;
  lengthFt?: number;
  widthFt?: number;
  slabCountPcs: number;
  systemSqFt?: number;
  totalSqFt: number;
  thicknessMm: number;
  costPriceInr?: number;
  costPricePaise?: number;
  unitPriceInr?: number;
  unitPricePaise?: number;
  branchName: string;
  finish: 'Polished' | 'Honed' | 'Leather';
  status: 'In Stock' | 'Out of Stock';
  slabStatus?: SlabLifecycleStatus;
  stockedDateIso?: string;
  imageUrl?: string;
  enabled?: boolean;
}

export interface PurchaseBillItem {
  id: string;
  productId?: string;
  slabIds?: string[];
  itemCode: string;
  itemName: string;
  dimensions: string;
  qty: number;
  unit: UnitType;
  unitPriceInr?: number;
  unitPricePaise?: number;
  amountInr: number;
  amountPaise?: number;
}

export interface PurchaseBill {
  id: string;
  companyId?: string;
  branchId?: string;
  supplierId?: string;
  createdBy?: string;
  billNo: string;
  supplierName: string;
  branchName: string;
  itemSummary: string;
  qty: number;
  unit: UnitType;
  subtotalInr?: number;
  discountInr?: number;
  taxInr?: number;
  additionalChargesInr?: number;
  totalInr: number;
  paidAmountInr?: number;
  dueAmountInr?: number;
  subtotalPaise?: number;
  discountPaise?: number;
  taxPaise?: number;
  additionalChargesPaise?: number;
  totalPaise?: number;
  paidAmountPaise?: number;
  dueAmountPaise?: number;
  status: 'Paid' | 'Pending' | 'Partial';
  dateLabel: string;
  dateIso?: string;
  notes?: string;
  items?: PurchaseBillItem[];
}

export interface PurchaseReturnItem {
  id: string;
  productId?: string;
  slabIds?: string[];
  itemCode: string;
  itemName: string;
  dimensions: string;
  qty: number;
  unit: UnitType;
  amountInr: number;
  amountPaise?: number;
  reason?: string;
}

export interface PurchaseReturn {
  id: string;
  companyId?: string;
  branchId?: string;
  supplierId?: string;
  createdBy?: string;
  returnNo: string;
  supplierName: string;
  branchName: string;
  purchaseBillId?: string;
  purchaseBillNo?: string;
  affectedBills?: string[];
  reason: string;
  notes?: string;
  itemSummary: string;
  qty: number;
  unit: UnitType;
  totalInr: number;
  totalPaise?: number;
  status: 'Completed' | 'Adjusted';
  dateLabel: string;
  dateIso?: string;
  items: PurchaseReturnItem[];
}

export type SalesPaymentStatus = 'Paid' | 'Partially Paid' | 'Due';

export interface SalesBillItem {
  id: string;
  productId?: string;
  slabIds?: string[];
  itemCode: string;
  itemName: string;
  dimensions: string;
  qty: number;
  unit: UnitType;
  unitPriceInr?: number;
  unitPricePaise?: number;
  amountInr: number;
  amountPaise?: number;
  status: SalesPaymentStatus;
}

export interface SalesBill {
  id: string;
  companyId?: string;
  branchId?: string;
  customerId?: string;
  createdBy?: string;
  invoiceNo: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  branchName: string;
  itemSummary: string;
  qty: number;
  unit: UnitType;
  subtotalInr?: number;
  discountInr?: number;
  taxInr?: number;
  additionalChargesInr?: number;
  totalInr: number;
  paidAmountInr?: number;
  dueAmountInr?: number;
  subtotalPaise?: number;
  discountPaise?: number;
  taxPaise?: number;
  additionalChargesPaise?: number;
  totalPaise?: number;
  paidAmountPaise?: number;
  dueAmountPaise?: number;
  status: SalesPaymentStatus;
  dateLabel: string;
  dateIso?: string;
  notes?: string;
  items?: SalesBillItem[];
}

export interface CustomerRecord {
  id: string;
  companyId?: string;
  branchId?: string;
  name: string;
  segment: 'Architect' | 'Builder' | 'Contractor' | 'Retail';
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  city: string;
  totalPurchasedInr: number;
  outstandingInr: number;
  totalPurchasedPaise?: number;
  outstandingPaise?: number;
  lastOrderLabel: string;
  enabled?: boolean;
}

export interface SupplierRecord {
  id: string;
  companyId?: string;
  branchId?: string;
  name: string;
  origin: string;
  specialty: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  totalSuppliedInr: number;
  payableInr: number;
  totalSuppliedPaise?: number;
  payablePaise?: number;
  lastDeliveryLabel: string;
  enabled?: boolean;
}

export interface InventoryAlert {
  id: string;
  companyId?: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  locationName: string;
  itemCode?: string;
  timestampLabel: string;
  createdAt: string;
  acknowledged: boolean;
}

export type TransferLifecycleStatus =
  | 'In Transit'
  | 'Delivered'
  | 'Scheduled'
  | 'Requested'
  | 'Approved'
  | 'Dispatched'
  | 'Received'
  | 'Cancelled';

export interface StockTransfer {
  id: string;
  companyId?: string;
  fromBranchId?: string;
  toBranchId?: string;
  requestedBy?: string;
  approvedBy?: string;
  transferCode: string;
  itemCode: string;
  itemName: string;
  slabIds?: string[];
  fromLocation: string;
  toLocation: string;
  quantity: number;
  unit: UnitType;
  valueCr: number;
  valuePaise?: number;
  status: TransferLifecycleStatus;
  etaLabel: string;
  dispatchedAt?: string;
  receivedAt?: string;
  notes?: string;
}

export type StockMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'PURCHASE_RETURN'
  | 'SALES_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT';

export interface StockMovementRecord {
  id: string;
  companyId: string;
  branchId: string;
  branchName: string;
  productId?: string;
  slabId?: string;
  itemCode: string;
  slabCode?: string;
  trackingType: TrackingType;
  movementType: StockMovementType;
  quantityDelta: number;
  unit: UnitType;
  balanceAfter: number;
  unitCostPaise?: number;
  totalValuePaise?: number;
  referenceType: 'PurchaseBill' | 'SalesBill' | 'PurchaseReturn' | 'SalesReturn' | 'Transfer' | 'Adjustment';
  referenceId: string;
  referenceNo: string;
  performedBy?: string;
  notes?: string;
  occurredAt: string;
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
  purchaseReturns?: PurchaseReturn[];
  salesBills: SalesBill[];
  customers: CustomerRecord[];
  suppliers: SupplierRecord[];
  alerts: InventoryAlert[];
  transfers: StockTransfer[];
  crossBranchSeedApplied?: boolean;
}

export interface StoreSchema {
  users: Record<string, StoredUser>;
  layouts: Record<string, DashboardLayout>;
  snapshot: InventorySnapshot;
}
