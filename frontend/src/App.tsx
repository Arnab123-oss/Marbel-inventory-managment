import {
  ArrowRight,
  LayoutGrid,
  Pause,
  Play,
  Radio,
  RotateCcw,
} from 'lucide-react';
import {type DragEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {AuthScreen} from './components/auth/AuthScreen';
import {LocationBarChart} from './components/charts/LocationBarChart';
import {SalesTrendChart} from './components/charts/SalesTrendChart';
import {StockStatusDonutChart} from './components/charts/StockStatusDonutChart';
import {TrendLineChart} from './components/charts/TrendLineChart';
import {LocationDetailDrawer} from './components/modals/LocationDetailDrawer';
import {Sidebar} from './components/Sidebar';
import {TopHeader} from './components/TopHeader';
import {SecondaryViews} from './components/views/SecondaryViews';
import {DraggableWidgetShell} from './components/widgets/DraggableWidgetShell';
import {KpiCard} from './components/widgets/KpiCard';
import {OutstandingPaymentsWidget} from './components/widgets/OutstandingPaymentsWidget';
import {RecentActivitiesWidget} from './components/widgets/RecentActivitiesWidget';
import {RecentAlertsWidget} from './components/widgets/RecentAlertsWidget';
import {TopProductsWidget} from './components/widgets/TopProductsWidget';
import {TopVarianceWidget} from './components/widgets/TopVarianceWidget';
import {api} from './services/api';
import {
  computeAllBranches,
  getPurchaseBillLines,
  getSalesBillLines,
} from './utils/branchMetrics';
import type {
  CustomerRecord,
  DashboardFilters,
  DashboardLayout,
  InventorySnapshot,
  KpiId,
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
  WidgetId,
} from './types/inventory';

const DEFAULT_KPI_ORDER: KpiId[] = [
  'totalSales',
  'totalPurchases',
  'totalStockValue',
  'netProfit',
  'lowStockItems',
];

const DEFAULT_WIDGET_ORDER: WidgetId[] = [
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

const DEFAULT_SPANS: Record<WidgetId, 1 | 2 | 3> = {
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

const WIDGET_TITLES: Record<WidgetId, string> = {
  outstandingPayments: 'Outstanding Payments',
  salesTrend: 'Sales Trend',
  topProducts: 'Top Products',
  recentActivities: 'Recent Activities',
  accuracyOverview: 'Stock Accuracy Overview',
  valueTrend: 'Inventory Value Trend (₹)',
  stockValueByLocation: 'Stock Value by Branch (₹)',
  inventoryByLocation: 'Inventory by Branch (sq. ft · pcs · box)',
  stockStatusSummary: 'Stock Status Summary',
  accuracyTrend: 'Stock Accuracy Trend (%)',
  topVarianceItems: 'Top Variance Items (sq. ft / pcs / box)',
  recentAlerts: 'Recent Shop Alerts',
};

function sanitizeDashboardLayout(raw: DashboardLayout): DashboardLayout {
  const validKpis: KpiId[] = (raw.kpiOrder || []).filter((k) =>
    DEFAULT_KPI_ORDER.includes(k),
  );
  const kpiOrder =
    validKpis.length === DEFAULT_KPI_ORDER.length ? validKpis : [...DEFAULT_KPI_ORDER];

  const rawWidgets = Array.isArray(raw.widgetOrder) ? raw.widgetOrder : [];
  const validWidgets: WidgetId[] = rawWidgets.filter((w) =>
    DEFAULT_WIDGET_ORDER.includes(w),
  );
  const hasAllCurrent = validWidgets.length === DEFAULT_WIDGET_ORDER.length;
  const widgetOrder = hasAllCurrent ? validWidgets : [...DEFAULT_WIDGET_ORDER];
  const widgetSpans = hasAllCurrent
    ? {...DEFAULT_SPANS, ...raw.widgetSpans}
    : {...DEFAULT_SPANS};
  return {
    ...raw,
    kpiOrder,
    widgetOrder,
    widgetSpans,
  };
}

function reorderArray<T>(list: T[], fromItem: T, toItem: T): T[] {
  const fromIdx = list.indexOf(fromItem);
  const toIdx = list.indexOf(toItem);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return list;
  const next = [...list];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [layout, setLayout] = useState<DashboardLayout>({
    kpiOrder: DEFAULT_KPI_ORDER,
    widgetOrder: DEFAULT_WIDGET_ORDER,
    widgetSpans: DEFAULT_SPANS,
    updatedAt: '',
  });

  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [liveStreamEnabled, setLiveStreamEnabled] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [customizeMode, setCustomizeMode] = useState(false);

  const [filters, setFilters] = useState<DashboardFilters>({
    locationType: 'All',
    unitFilter: 'All',
    accuracyBand: 'All',
    statusFilter: 'All',
    searchQuery: '',
  });

  const [selectedLocation, setSelectedLocation] = useState<LocationRow | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [draggingKpi, setDraggingKpi] = useState<KpiId | null>(null);
  const [dropTargetKpi, setDropTargetKpi] = useState<KpiId | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<WidgetId | null>(null);
  const [dropTargetWidget, setDropTargetWidget] = useState<WidgetId | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [{user: me}, initialSnap] = await Promise.all([
          api.getMe(),
          api.getSnapshot(),
        ]);
        if (!active) return;
        setUser(me);
        setSnapshot(initialSnap);
        if (me) {
          const {layout: savedLayout} = await api.getLayout();
          if (active) setLayout(sanitizeDashboardLayout(savedLayout));
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        if (active) setAuthChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleAuthenticated = useCallback(async (authedUser: UserProfile) => {
    setUser(authedUser);
    try {
      const {layout: savedLayout} = await api.getLayout();
      setLayout(sanitizeDashboardLayout(savedLayout));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user || !liveStreamEnabled) {
      setStreamConnected(false);
      return;
    }

    const es = new EventSource('/api/inventory/stream', {withCredentials: true});
    es.onopen = () => setStreamConnected(true);
    es.onmessage = (event) => {
      try {
        const nextSnap = JSON.parse(event.data) as InventorySnapshot;
        setSnapshot(nextSnap);
        setStreamConnected(true);
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      es.close();
      setStreamConnected(false);
    };
  }, [user, liveStreamEnabled]);

  const computedBranchBreakdowns = useMemo(() => {
    if (!snapshot) return [];
    return computeAllBranches(snapshot);
  }, [snapshot]);

  const computedLocations = useMemo(() => {
    return computedBranchBreakdowns.map((b) => b.location);
  }, [computedBranchBreakdowns]);

  const liveKpis = useMemo(() => {
    if (!snapshot) return null;
    let totalSalesInr = 0;
    let totalSalesCollectedInr = 0;
    for (const bill of snapshot.salesBills) {
      for (const line of getSalesBillLines(bill)) {
        const amt = Math.max(0, Number(line.amountInr) || 0);
        totalSalesInr += amt;
        if (line.status === 'Paid') totalSalesCollectedInr += amt;
        else if (line.status === 'Partially Paid') totalSalesCollectedInr += Math.round(amt * 0.5);
      }
    }

    let totalPurchasesInr = 0;
    let totalPurchasesPaidInr = 0;
    for (const bill of snapshot.purchaseBills) {
      const billTotal = getPurchaseBillLines(bill).reduce(
        (sum, l) => sum + Math.max(0, Number(l.amountInr) || 0),
        0,
      );
      totalPurchasesInr += billTotal;
      if (bill.status === 'Paid') totalPurchasesPaidInr += billTotal;
      else if (bill.status === 'Partial') totalPurchasesPaidInr += Math.round(billTotal * 0.5);
    }

    const totalStockValueInr = computedBranchBreakdowns.reduce(
      (sum, b) => sum + b.net.valueInr,
      0,
    );
    const netProfitInr = totalSalesInr - totalPurchasesInr;
    const netProfitMarginPct =
      totalSalesInr > 0
        ? (netProfitInr / totalSalesInr) * 100
        : totalPurchasesInr > 0
          ? -100
          : 0;
    const lowStockItems = snapshot.varianceItems.filter(
      (i) => i.enabled !== false && (i.status === 'Low Stock' || i.status === 'Out of Stock'),
    ).length;

    return {
      ...snapshot.kpis,
      totalSalesInr: Math.round(totalSalesInr),
      totalSalesCount: snapshot.salesBills.length,
      totalSalesCollectedPct:
        totalSalesInr > 0 ? (totalSalesCollectedInr / totalSalesInr) * 100 : 0,
      totalPurchasesInr: Math.round(totalPurchasesInr),
      totalPurchasesCount: snapshot.purchaseBills.length,
      totalPurchasesPaidPct:
        totalPurchasesInr > 0 ? (totalPurchasesPaidInr / totalPurchasesInr) * 100 : 0,
      totalStockValueInr: Math.round(totalStockValueInr),
      totalStockValueCr: Number((totalStockValueInr / 10000000).toFixed(2)),
      netProfitInr: Math.round(netProfitInr),
      netProfitMarginPct,
      lowStockItems,
    };
  }, [snapshot, computedBranchBreakdowns]);

  const syncedSelectedLocation = useMemo(() => {
    if (!selectedLocation || !snapshot) return null;
    return computedLocations.find((l) => l.id === selectedLocation.id) || selectedLocation;
  }, [selectedLocation, snapshot, computedLocations]);

  const derivedView = useMemo(() => {
    if (!snapshot) return null;

    const filteredLocations = computedLocations.filter((loc) => {
      if (filters.locationType !== 'All' && loc.type !== filters.locationType) {
        return false;
      }
      if (filters.accuracyBand === '99%+' && loc.inventoryAccuracyPct < 99) {
        return false;
      }
      if (filters.accuracyBand === '<98.5%' && loc.inventoryAccuracyPct >= 98.5) {
        return false;
      }
      return true;
    });

    const filteredVarianceItems = snapshot.varianceItems.filter((item) => {
      const locMatch = filteredLocations.some((l) => l.id === item.locationId);
      if (!locMatch) return false;
      if (filters.unitFilter !== 'All' && item.unit !== filters.unitFilter) {
        return false;
      }
      if (filters.statusFilter !== 'All' && item.status !== filters.statusFilter) {
        return false;
      }
      return true;
    });

    return {
      filteredLocations,
      filteredVarianceItems,
      trends: snapshot.trends,
    };
  }, [snapshot, filters, computedLocations]);

  const persistLayout = useCallback(async (next: DashboardLayout) => {
    setLayout(next);
    try {
      await api.saveLayout(next);
    } catch {
      // ignore
    }
  }, []);

  const handleResetLayout = useCallback(async () => {
    try {
      const {layout: reset} = await api.resetLayout();
      setLayout(sanitizeDashboardLayout(reset));
      showToast('Dashboard widget layout restored to default');
    } catch {
      setLayout({
        kpiOrder: DEFAULT_KPI_ORDER,
        widgetOrder: DEFAULT_WIDGET_ORDER,
        widgetSpans: DEFAULT_SPANS,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [showToast]);

  function handleKpiDragStart(e: DragEvent<HTMLDivElement>, id: KpiId) {
    setDraggingKpi(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `kpi:${id}`);
  }

  function handleKpiDragOver(e: DragEvent<HTMLDivElement>, id: KpiId) {
    if (!draggingKpi) return;
    e.preventDefault();
    if (dropTargetKpi !== id) setDropTargetKpi(id);
  }

  function handleKpiDrop(e: DragEvent<HTMLDivElement>, targetId: KpiId) {
    e.preventDefault();
    if (!draggingKpi || draggingKpi === targetId) {
      setDraggingKpi(null);
      setDropTargetKpi(null);
      return;
    }
    const nextOrder = reorderArray(layout.kpiOrder, draggingKpi, targetId);
    setDraggingKpi(null);
    setDropTargetKpi(null);
    persistLayout({...layout, kpiOrder: nextOrder, updatedAt: new Date().toISOString()});
    showToast('KPI card order saved');
  }

  function handleWidgetDragStart(e: DragEvent<HTMLElement>, id: WidgetId) {
    setDraggingWidget(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `widget:${id}`);
  }

  function handleWidgetDragOver(e: DragEvent<HTMLElement>, id: WidgetId) {
    if (!draggingWidget) return;
    e.preventDefault();
    if (dropTargetWidget !== id) setDropTargetWidget(id);
  }

  function handleWidgetDrop(e: DragEvent<HTMLElement>, targetId: WidgetId) {
    e.preventDefault();
    if (!draggingWidget || draggingWidget === targetId) {
      setDraggingWidget(null);
      setDropTargetWidget(null);
      return;
    }
    const nextOrder = reorderArray(layout.widgetOrder, draggingWidget, targetId);
    setDraggingWidget(null);
    setDropTargetWidget(null);
    persistLayout({...layout, widgetOrder: nextOrder, updatedAt: new Date().toISOString()});
    showToast('Widget arrangement saved to your profile');
  }

  function handleToggleWidgetSpan(id: WidgetId) {
    const current = layout.widgetSpans[id] || 1;
    const nextSpan: 1 | 2 | 3 =
      id === 'outstandingPayments'
        ? current === 3
          ? 2
          : current === 2
            ? 1
            : 3
        : current === 1
          ? 2
          : 1;
    persistLayout({
      ...layout,
      widgetSpans: {...layout.widgetSpans, [id]: nextSpan},
      updatedAt: new Date().toISOString(),
    });
  }

  function handleExportCsv() {
    if (!derivedView) return;
    const headers = [
      'Branch',
      'Type',
      'Total SKUs',
      'Slabs (sq. ft)',
      'Pieces (pcs)',
      'Tiles (box)',
      'Stock Value (Cr INR)',
      'Accuracy (%)',
      'Minor Variance Items',
      'Major Variance Items',
      'Low Stock Items',
    ];
    const rows = derivedView.filteredLocations.map((l) => [
      l.name,
      l.type,
      l.totalItems,
      l.sqftQty,
      l.pcsQty,
      l.boxQty,
      l.stockValueCr.toFixed(2),
      l.inventoryAccuracyPct.toFixed(2),
      l.minorVarianceItems,
      l.majorVarianceItems,
      l.lowStockItems,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `marble-shop-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported marble & tile inventory report (.csv)');
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setActiveSection('dashboard');
  }

  async function handleReconcile(itemId: string, newPhysicalQty: number, reason: string) {
    const res = await api.reconcileItem(itemId, newPhysicalQty, reason);
    setSnapshot(res.snapshot);
    showToast(`Reconciled ${res.item.itemCode} (${res.item.unit})`);
  }

  async function handleCreateProduct(payload: {
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
  }) {
    const res = await api.createProduct(payload);
    setSnapshot(res.snapshot);
    showToast(`Added ${res.item.itemName} (${res.item.dimensions})`);
  }

  async function handleUpdateProduct(
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
  ) {
    const res = await api.updateProduct(itemId, payload);
    setSnapshot(res.snapshot);
    showToast(`Updated ${res.item.itemCode} (${res.item.category})`);
  }

  async function handleToggleProductEnabled(itemId: string) {
    const res = await api.toggleProductEnabled(itemId);
    setSnapshot(res.snapshot);
    showToast(
      `${res.item.enabled !== false ? 'Enabled' : 'Disabled'} ${res.item.itemCode} (${res.item.itemName})`,
    );
  }

  async function handleDeleteProduct(itemId: string) {
    const res = await api.deleteProduct(itemId);
    setSnapshot(res.snapshot);
    showToast(`Deleted product ${res.itemCode}`);
  }

  async function handleCreateSlabLot(payload: {
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
    imageUrl?: string;
  }) {
    const res = await api.createSlabLot(payload);
    setSnapshot(res.snapshot);
    showToast(`Registered ${res.slab.lotNumber} (${res.slab.totalSqFt} sq. ft · ${res.slab.status})`);
  }

  async function handleUpdateSlabLot(
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
      imageUrl?: string;
    },
  ) {
    const res = await api.updateSlabLot(slabId, payload);
    setSnapshot(res.snapshot);
    showToast(`Updated slab ${res.slab.lotNumber} (${res.slab.status})`);
  }

  async function handleToggleSlabEnabled(slabId: string) {
    const res = await api.toggleSlabEnabled(slabId);
    setSnapshot(res.snapshot);
    showToast(
      `${res.slab.enabled !== false ? 'Enabled' : 'Disabled'} slab ${res.slab.lotNumber} (${res.slab.stoneName})`,
    );
  }

  async function handleDeleteSlabLot(slabId: string) {
    const res = await api.deleteSlabLot(slabId);
    setSnapshot(res.snapshot);
    showToast(`Deleted slab ${res.lotNumber}`);
  }

  async function handleCreatePurchaseBill(payload: {
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
  }) {
    const res = await api.createPurchaseBill(payload);
    setSnapshot(res.snapshot);
    showToast(
      `Posted purchase bill ${res.bill.billNo} (${res.bill.items?.length || 1} item${(res.bill.items?.length || 1) === 1 ? '' : 's'})`,
    );
  }

  async function handleUpdatePurchaseBill(
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
  ): Promise<PurchaseBill> {
    const res = await api.updatePurchaseBill(billId, payload);
    setSnapshot(res.snapshot);
    showToast(
      `Updated purchase bill ${res.bill.billNo} (${res.bill.items?.length || 1} item${(res.bill.items?.length || 1) === 1 ? '' : 's'})`,
    );
    return res.bill;
  }

  async function handleCreatePurchaseReturn(payload: {
    returnNo: string;
    supplierName: string;
    branchName: string;
    purchaseBillId?: string;
    reason: string;
    notes?: string;
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
      reason?: string;
    }>;
  }) {
    const res = await api.createPurchaseReturn(payload);
    setSnapshot(res.snapshot);
    const affectedText =
      res.purchaseReturn.affectedBills && res.purchaseReturn.affectedBills.length > 0
        ? ` · reduced ${res.purchaseReturn.affectedBills.join(', ')}`
        : '';
    showToast(
      `Recorded return ${res.purchaseReturn.returnNo} (${res.purchaseReturn.items.length} item${res.purchaseReturn.items.length === 1 ? '' : 's'})${affectedText}`,
    );
  }

  async function handleCreateSalesReturn(payload: {
    returnNo: string;
    customerName: string;
    branchName: string;
    salesBillId?: string;
    reason: string;
    notes?: string;
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
      reason?: string;
    }>;
  }) {
    const res = await api.createSalesReturn(payload);
    setSnapshot(res.snapshot);
    const affectedText =
      res.salesReturn.affectedBills && res.salesReturn.affectedBills.length > 0
        ? ` · reduced ${res.salesReturn.affectedBills.join(', ')}`
        : '';
    showToast(
      `Recorded sales return ${res.salesReturn.returnNo} (${res.salesReturn.items.length} item${res.salesReturn.items.length === 1 ? '' : 's'})${affectedText}`,
    );
  }

  async function handleCreateSalesBill(payload: {
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
  }) {
    const res = await api.createSalesBill(payload);
    setSnapshot(res.snapshot);
    showToast(
      `Issued sales invoice ${res.bill.invoiceNo} (${res.bill.items?.length || 1} item${(res.bill.items?.length || 1) === 1 ? '' : 's'} · ${res.bill.status})`,
    );
  }

  async function handleUpdateSalesBill(
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
  ): Promise<SalesBill> {
    const res = await api.updateSalesBill(billId, payload);
    setSnapshot(res.snapshot);
    showToast(`Updated sales invoice ${res.bill.invoiceNo} (${res.bill.status})`);
    return res.bill;
  }

  async function handleCreateTransfer(payload: {
    itemCode: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }) {
    const res = await api.createTransfer(payload);
    setSnapshot(res.snapshot);
    showToast(`Transfer ${res.transfer.transferCode} dispatched`);
  }

  async function handleCreateCustomer(payload: {
    name: string;
    segment: CustomerRecord['segment'];
    phone: string;
    city: string;
  }) {
    const res = await api.createCustomer(payload);
    setSnapshot(res.snapshot);
    showToast(`Added customer ${res.customer.name}`);
  }

  async function handleCreateSupplier(payload: {
    name: string;
    origin: string;
    specialty: string;
    phone: string;
  }) {
    const res = await api.createSupplier(payload);
    setSnapshot(res.snapshot);
    showToast(`Added supplier ${res.supplier.name}`);
  }

  async function handleUpdateSupplier(
    supplierId: string,
    payload: {
      name: string;
      origin: string;
      specialty: string;
      phone: string;
    },
  ) {
    const res = await api.updateSupplier(supplierId, payload);
    setSnapshot(res.snapshot);
    showToast(`Updated supplier ${res.supplier.name}`);
  }

  async function handleDeleteSupplier(supplierId: string) {
    const res = await api.deleteSupplier(supplierId);
    setSnapshot(res.snapshot);
    showToast(`Deleted supplier ${res.name}`);
  }

  async function handleToggleAcknowledgeAlert(alertId: string) {
    const res = await api.toggleAcknowledgeAlert(alertId);
    setSnapshot(res.snapshot);
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center text-[13px] text-[#64748B]">
        Loading StonePulse workspace...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (!snapshot || !derivedView) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center text-[13px] text-[#64748B]">
        Connecting to marble shop telemetry...
      </div>
    );
  }

  const unacknowledgedAlerts = snapshot.alerts.filter((a) => !a.acknowledged).length;
  const formattedSyncTime = new Date(snapshot.lastUpdatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const isLayoutModified =
    JSON.stringify(layout.kpiOrder) !== JSON.stringify(DEFAULT_KPI_ORDER) ||
    JSON.stringify(layout.widgetOrder) !== JSON.stringify(DEFAULT_WIDGET_ORDER) ||
    JSON.stringify(layout.widgetSpans) !== JSON.stringify(DEFAULT_SPANS);

  function renderWidgetContent(
    id: WidgetId,
    currentSnapshot: InventorySnapshot,
    currentDerived: NonNullable<typeof derivedView>,
  ) {
    switch (id) {
      case 'outstandingPayments':
        return (
          <OutstandingPaymentsWidget
            salesBills={currentSnapshot.salesBills}
            purchaseBills={currentSnapshot.purchaseBills}
            onNavigate={(sec) => setActiveSection(sec)}
          />
        );
      case 'salesTrend':
        return <SalesTrendChart salesBills={currentSnapshot.salesBills} />;
      case 'topProducts':
        return (
          <TopProductsWidget
            salesBills={currentSnapshot.salesBills}
            varianceItems={currentSnapshot.varianceItems}
            slabs={currentSnapshot.slabs}
            onViewProducts={() => setActiveSection('products')}
          />
        );
      case 'recentActivities':
        return (
          <RecentActivitiesWidget
            salesBills={currentSnapshot.salesBills}
            purchaseBills={currentSnapshot.purchaseBills}
            purchaseReturns={currentSnapshot.purchaseReturns || []}
            salesReturns={currentSnapshot.salesReturns || []}
            transfers={currentSnapshot.transfers}
            onNavigate={(sec) => setActiveSection(sec)}
          />
        );
      case 'accuracyOverview':
        return null;
      case 'valueTrend':
        return (
          <TrendLineChart
            points={currentDerived.trends}
            metric="valueCr"
            strokeColor="#2563EB"
            yMin={0}
            yMax={30}
            yTicks={[0, 10, 20, 30]}
            formatYTick={(v) => (v === 0 ? '0' : `${v}Cr`)}
            formatTooltipVal={(v) => `₹ ${v.toFixed(2)} Cr`}
          />
        );
      case 'stockValueByLocation':
        return (
          <LocationBarChart
            locations={currentDerived.filteredLocations}
            selectedLocationId={syncedSelectedLocation?.id || null}
            onSelectLocation={(loc) => setSelectedLocation(loc)}
          />
        );
      case 'inventoryByLocation':
        return null;
      case 'stockStatusSummary':
        return (
          <StockStatusDonutChart
            data={currentSnapshot.stockStatus}
            activeStatus={filters.statusFilter}
            onSelectStatus={(status) => setFilters({...filters, statusFilter: status})}
          />
        );
      case 'accuracyTrend':
        return null;
      case 'topVarianceItems':
        return (
          <TopVarianceWidget
            items={currentDerived.filteredVarianceItems}
            onSelectItem={(item) => {
              const loc = currentSnapshot.locations.find((l) => l.id === item.locationId);
              if (loc) setSelectedLocation(loc);
            }}
            onViewAll={() => setActiveSection('inventory')}
          />
        );
      case 'recentAlerts':
        return (
          <RecentAlertsWidget
            alerts={currentSnapshot.alerts}
            onToggleAcknowledge={handleToggleAcknowledgeAlert}
            onViewAll={() => setActiveSection('inventory')}
          />
        );
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F6F8FB] text-[#0F172A]">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        unacknowledgedAlerts={unacknowledgedAlerts}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          user={user}
          activeSection={activeSection}
          onExportCsv={handleExportCsv}
          onResetLayout={handleResetLayout}
          onLogout={handleLogout}
          onBackToOverview={() => setActiveSection('dashboard')}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenAccountSettings={() => setActiveSection('settings')}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1480px] w-full mx-auto">
          {activeSection === 'dashboard' ? (
            <div className="space-y-5">
              <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
                <div>
                  <h1 className="text-[20px] sm:text-[22px] font-bold text-[#0F172A] tracking-tight text-balance">
                    Maintain Accurate Marble &amp; Tile Stock Across Branches
                  </h1>
                  <p className="mt-0.5 text-[13px] text-[#64748B]">
                    Track slabs (sq. ft), cut pieces (pcs), and boxed tiles (box) across all showrooms, yards, and godowns in real time.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">

                  <button
                    type="button"
                    onClick={() => setLiveStreamEnabled((v) => !v)}
                    className={`h-8 px-3 rounded-lg border text-[12px] font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
                      liveStreamEnabled && streamConnected
                        ? 'bg-emerald-50/80 border-emerald-200 text-[#15803D]'
                        : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-slate-50'
                    }`}
                  >
                    {liveStreamEnabled ? (
                      <>
                        <Radio className="w-3.5 h-3.5" />
                        <span>Live Sync · {formattedSyncTime}</span>
                        <Pause className="w-3 h-3 opacity-70" />
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume Live Feed</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomizeMode((v) => !v)}
                    className={`h-8 px-3 rounded-lg border text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      customizeMode
                        ? 'bg-[#EEF4FF] border-blue-300 text-[#1D63ED]'
                        : 'bg-white border-[#E2E8F0] text-[#334155] hover:bg-slate-50'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>{customizeMode ? 'Done Arranging' : 'Customize Widgets'}</span>
                  </button>

                  {isLayoutModified && (
                    <button
                      type="button"
                      onClick={handleResetLayout}
                      className="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[12px] font-medium text-[#475569] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {customizeMode && (
                <div className="px-4 py-2.5 rounded-xl bg-[#EEF4FF] border border-blue-200 text-[12.5px] text-[#1E40AF] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Drag any KPI card or dashboard widget to rearrange it. Use the width button on widget headers to toggle 1-column or 2-column spans. Changes save automatically to {user.name}&rsquo;s profile.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
                {layout.kpiOrder
                  .filter((kpiId) => DEFAULT_KPI_ORDER.includes(kpiId))
                  .map((kpiId) => (
                    <KpiCard
                      key={kpiId}
                      id={kpiId}
                      metrics={liveKpis || snapshot.kpis}
                      isDragging={draggingKpi === kpiId}
                      isDropTarget={dropTargetKpi === kpiId && draggingKpi !== kpiId}
                      onDragStart={handleKpiDragStart}
                      onDragOver={handleKpiDragOver}
                      onDrop={handleKpiDrop}
                      onDragEnd={() => {
                        setDraggingKpi(null);
                        setDropTargetKpi(null);
                      }}
                    />
                  ))}
              </div>

              {(filters.locationType !== 'All' ||
                filters.unitFilter !== 'All' ||
                filters.accuracyBand !== 'All' ||
                filters.statusFilter !== 'All') && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 rounded-lg bg-white border border-[#E5E9F0] text-[12px]">
                  <div className="text-[#475569]">
                    Active filters:{' '}
                    <span className="font-semibold text-[#0F172A]">
                      {[
                        filters.unitFilter !== 'All' ? `Unit: ${filters.unitFilter}` : null,
                        filters.locationType !== 'All' ? `Branch: ${filters.locationType}` : null,
                        filters.accuracyBand !== 'All'
                          ? `Accuracy: ${filters.accuracyBand}`
                          : null,
                        filters.statusFilter !== 'All'
                          ? `Status: ${filters.statusFilter}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters({
                        locationType: 'All',
                        unitFilter: 'All',
                        accuracyBand: 'All',
                        statusFilter: 'All',
                        searchQuery: '',
                      })
                    }
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                {layout.widgetOrder
                  .filter((widgetId) => DEFAULT_WIDGET_ORDER.includes(widgetId))
                  .map((widgetId) => (
                    <DraggableWidgetShell
                      key={widgetId}
                      id={widgetId}
                      title={WIDGET_TITLES[widgetId]}
                      span={layout.widgetSpans[widgetId] || 1}
                      customizeMode={customizeMode}
                      isDragging={draggingWidget === widgetId}
                      isDropTarget={
                        dropTargetWidget === widgetId && draggingWidget !== widgetId
                      }
                      headerExtra={
                        widgetId === 'outstandingPayments' ? (
                          <div className="ml-auto flex items-center gap-3 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveSection('sales-bills')}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline whitespace-nowrap"
                            >
                              <span>Sales Bills</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveSection('purchase-bills')}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#475569] hover:text-[#0F172A] hover:underline whitespace-nowrap"
                            >
                              <span>Purchase Bills</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : widgetId === 'recentActivities' ? (
                          <button
                            type="button"
                            onClick={() => setActiveSection('sales-bills')}
                            className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
                          >
                            <span>View Details</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : undefined
                      }
                      onToggleSpan={handleToggleWidgetSpan}
                      onDragStart={handleWidgetDragStart}
                      onDragOver={handleWidgetDragOver}
                      onDrop={handleWidgetDrop}
                      onDragEnd={() => {
                        setDraggingWidget(null);
                        setDropTargetWidget(null);
                      }}
                    >
                      {renderWidgetContent(widgetId, snapshot, derivedView)}
                    </DraggableWidgetShell>
                  ))}
              </div>
            </div>
          ) : (
            <SecondaryViews
              section={activeSection}
              snapshot={snapshot}
              user={user}
              liveStreamEnabled={liveStreamEnabled}
              selectedLocationId={syncedSelectedLocation?.id || null}
              onToggleLiveStream={() => setLiveStreamEnabled((v) => !v)}
              onSelectLocation={(loc) => setSelectedLocation(loc)}
              onCreateProduct={handleCreateProduct}
              onUpdateProduct={handleUpdateProduct}
              onToggleProductEnabled={handleToggleProductEnabled}
              onDeleteProduct={handleDeleteProduct}
              onCreateSlabLot={handleCreateSlabLot}
              onUpdateSlabLot={handleUpdateSlabLot}
              onToggleSlabEnabled={handleToggleSlabEnabled}
              onDeleteSlabLot={handleDeleteSlabLot}
              onCreatePurchaseBill={handleCreatePurchaseBill}
              onUpdatePurchaseBill={handleUpdatePurchaseBill}
              onCreatePurchaseReturn={handleCreatePurchaseReturn}
              onCreateSalesReturn={handleCreateSalesReturn}
              onCreateSalesBill={handleCreateSalesBill}
              onUpdateSalesBill={handleUpdateSalesBill}
              onCreateTransfer={handleCreateTransfer}
              onCreateCustomer={handleCreateCustomer}
              onCreateSupplier={handleCreateSupplier}
              onUpdateSupplier={handleUpdateSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onToggleAcknowledgeAlert={handleToggleAcknowledgeAlert}
              onExportCsv={handleExportCsv}
              onResetLayout={handleResetLayout}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      <LocationDetailDrawer
        location={syncedSelectedLocation}
        items={snapshot.varianceItems}
        slabs={snapshot.slabs}
        purchaseBills={snapshot.purchaseBills}
        salesBills={snapshot.salesBills}
        onClose={() => setSelectedLocation(null)}
        onReconcile={handleReconcile}
      />

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#0F172A] text-white text-[12.5px] font-medium shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
