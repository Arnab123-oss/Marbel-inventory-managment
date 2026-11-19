import {
  LayoutGrid,
  Pause,
  Play,
  Radio,
  RotateCcw,
} from 'lucide-react';
import {type DragEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {AuthScreen} from './components/auth/AuthScreen';
import {AccuracyDonutChart} from './components/charts/AccuracyDonutChart';
import {LocationBarChart} from './components/charts/LocationBarChart';
import {StockStatusDonutChart} from './components/charts/StockStatusDonutChart';
import {TrendLineChart} from './components/charts/TrendLineChart';
import {LocationDetailDrawer} from './components/modals/LocationDetailDrawer';
import {Sidebar} from './components/Sidebar';
import {TopHeader} from './components/TopHeader';
import {SecondaryViews} from './components/views/SecondaryViews';
import {DraggableWidgetShell} from './components/widgets/DraggableWidgetShell';
import {KpiCard} from './components/widgets/KpiCard';
import {LocationTableWidget} from './components/widgets/LocationTableWidget';
import {RecentAlertsWidget} from './components/widgets/RecentAlertsWidget';
import {TopVarianceWidget} from './components/widgets/TopVarianceWidget';
import {api} from './services/api';
import type {
  CustomerRecord,
  DashboardFilters,
  DashboardLayout,
  DateRangeKey,
  InventorySnapshot,
  KpiId,
  LocationRow,
  NavSection,
  SlabLot,
  StoneCategory,
  SupplierRecord,
  UnitType,
  UserProfile,
  VarianceItem,
  WidgetId,
} from './types/inventory';

const DEFAULT_KPI_ORDER: KpiId[] = [
  'totalBranches',
  'totalProducts',
  'totalStockValue',
  'inventoryAccuracy',
  'stockInTransit',
  'lowStockItems',
];

const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  'accuracyOverview',
  'valueTrend',
  'stockValueByLocation',
  'inventoryByLocation',
  'stockStatusSummary',
  'accuracyTrend',
  'topVarianceItems',
  'recentAlerts',
];

const DEFAULT_SPANS: Record<WidgetId, 1 | 2 | 3> = {
  accuracyOverview: 1,
  valueTrend: 1,
  stockValueByLocation: 1,
  inventoryByLocation: 2,
  stockStatusSummary: 1,
  accuracyTrend: 1,
  topVarianceItems: 1,
  recentAlerts: 1,
};

const WIDGET_TITLES: Record<WidgetId, string> = {
  accuracyOverview: 'Stock Accuracy Overview',
  valueTrend: 'Inventory Value Trend (₹)',
  stockValueByLocation: 'Stock Value by Branch (₹)',
  inventoryByLocation: 'Inventory by Branch (sq. ft · pcs · box)',
  stockStatusSummary: 'Stock Status Summary',
  accuracyTrend: 'Stock Accuracy Trend (%)',
  topVarianceItems: 'Top Variance Items (sq. ft / pcs / box)',
  recentAlerts: 'Recent Shop Alerts',
};

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

  const [dateRangeKey, setDateRangeKey] = useState<DateRangeKey>('apr_2024');
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
          if (active) setLayout(savedLayout);
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
      setLayout(savedLayout);
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

  const syncedSelectedLocation = useMemo(() => {
    if (!selectedLocation || !snapshot) return null;
    return snapshot.locations.find((l) => l.id === selectedLocation.id) || selectedLocation;
  }, [selectedLocation, snapshot]);

  const derivedView = useMemo(() => {
    if (!snapshot) return null;

    const filteredLocations = snapshot.locations.filter((loc) => {
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

    const trends =
      dateRangeKey === 'last_7_days'
        ? snapshot.trends.slice(-7)
        : dateRangeKey === 'mar_2024'
          ? snapshot.trends.map((pt, i) => ({
              date: pt.date.replace('Apr', 'Mar'),
              valueCr: Number((pt.valueCr * (0.91 + (i % 3) * 0.015)).toFixed(2)),
              accuracyPct: Number(Math.max(96.5, pt.accuracyPct - 0.6).toFixed(2)),
            }))
          : dateRangeKey === 'q1_2024'
            ? snapshot.trends.map((pt, i) => ({
                date: `W${i + 1}`,
                valueCr: Number((pt.valueCr * 0.88 + (i % 4) * 0.4).toFixed(2)),
                accuracyPct: Number(Math.max(96.0, pt.accuracyPct - 0.8).toFixed(2)),
              }))
            : snapshot.trends;

    return {
      filteredLocations,
      filteredVarianceItems,
      trends,
    };
  }, [snapshot, filters, dateRangeKey]);

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
      setLayout(reset);
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
    const nextSpan: 1 | 2 = current === 1 ? 2 : 1;
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
    link.download = `marble-shop-inventory-${dateRangeKey}.csv`;
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
    },
  ) {
    const res = await api.updateProduct(itemId, payload);
    setSnapshot(res.snapshot);
    showToast(`Updated ${res.item.itemCode} (${res.item.category})`);
  }

  async function handleCreateSlabLot(payload: {
    stoneName: string;
    category: StoneCategory;
    dimensionsFt: string;
    slabCountPcs: number;
    totalSqFt: number;
    thicknessMm: number;
    branchName: string;
    finish: 'Polished' | 'Honed' | 'Leather';
  }) {
    const res = await api.createSlabLot(payload);
    setSnapshot(res.snapshot);
    showToast(`Registered ${res.slab.lotNumber} (${res.slab.totalSqFt} sq. ft)`);
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
    },
  ) {
    const res = await api.updateSlabLot(slabId, payload);
    setSnapshot(res.snapshot);
    showToast(`Updated slab ${res.slab.lotNumber} (${res.slab.status})`);
  }

  async function handleCreatePurchaseBill(payload: {
    supplierName: string;
    branchName: string;
    itemCode: string;
    qty: number;
    unit: UnitType;
    totalInr: number;
  }) {
    const res = await api.createPurchaseBill(payload);
    setSnapshot(res.snapshot);
    showToast(`Posted purchase bill ${res.bill.billNo}`);
  }

  async function handleCreateSalesBill(payload: {
    customerName: string;
    branchName: string;
    itemCode: string;
    qty: number;
    unit: UnitType;
    totalInr: number;
  }) {
    const res = await api.createSalesBill(payload);
    setSnapshot(res.snapshot);
    showToast(`Issued sales invoice ${res.bill.invoiceNo}`);
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
      case 'accuracyOverview':
        return <AccuracyDonutChart data={currentSnapshot.accuracyBreakdown} />;
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
        return (
          <LocationTableWidget
            locations={currentDerived.filteredLocations}
            selectedLocationId={syncedSelectedLocation?.id || null}
            onViewLocation={(loc) => setSelectedLocation(loc)}
          />
        );
      case 'stockStatusSummary':
        return (
          <StockStatusDonutChart
            data={currentSnapshot.stockStatus}
            activeStatus={filters.statusFilter}
            onSelectStatus={(status) => setFilters({...filters, statusFilter: status})}
          />
        );
      case 'accuracyTrend':
        return (
          <TrendLineChart
            points={currentDerived.trends}
            metric="accuracyPct"
            strokeColor="#16A34A"
            yMin={92}
            yMax={100}
            yTicks={[92, 94, 96, 98, 100]}
            formatYTick={(v) => `${v}%`}
            formatTooltipVal={(v) => `${v.toFixed(2)}% Accurate`}
          />
        );
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
          dateRangeKey={dateRangeKey}
          onChangeDateRange={setDateRangeKey}
          filters={filters}
          onChangeFilters={setFilters}
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
                  {/* Inline Quick Unit Filter */}
                  <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg">
                    {(['All', 'sq. ft', 'pcs', 'box'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setFilters({...filters, unitFilter: u})}
                        className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
                          filters.unitFilter === u
                            ? 'bg-[#EEF4FF] text-[#1D63ED]'
                            : 'text-[#64748B] hover:text-[#0F172A]'
                        }`}
                      >
                        {u === 'All' ? 'All Units' : u}
                      </button>
                    ))}
                  </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
                {layout.kpiOrder.map((kpiId) => (
                  <KpiCard
                    key={kpiId}
                    id={kpiId}
                    metrics={snapshot.kpis}
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
                {layout.widgetOrder.map((widgetId) => (
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
              onToggleLiveStream={() => setLiveStreamEnabled((v) => !v)}
              onSelectLocation={(loc) => setSelectedLocation(loc)}
              onReconcileItem={handleReconcile}
              onCreateProduct={handleCreateProduct}
              onUpdateProduct={handleUpdateProduct}
              onCreateSlabLot={handleCreateSlabLot}
              onUpdateSlabLot={handleUpdateSlabLot}
              onCreatePurchaseBill={handleCreatePurchaseBill}
              onCreateSalesBill={handleCreateSalesBill}
              onCreateTransfer={handleCreateTransfer}
              onCreateCustomer={handleCreateCustomer}
              onCreateSupplier={handleCreateSupplier}
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
