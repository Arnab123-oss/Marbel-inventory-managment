import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Building2,
  GripVertical,
  IndianRupee,
  Layers,
  ShoppingBag,
  Target,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import type {DragEvent} from 'react';
import type {KpiId, KpiMetrics} from '../../types/inventory';
import {formatInrExact} from '../../utils/branchMetrics';

interface KpiCardProps {
  id: KpiId;
  metrics: KpiMetrics;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: KpiId) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, id: KpiId) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, id: KpiId) => void;
  onDragEnd: () => void;
}

interface KpiMeta {
  tag: string;
  title: string;
  value: string;
  exactTooltip?: string;
  trendValue: string;
  trendPositive: boolean;
  trendContext: string;
  iconBg: string;
  iconRing: string;
  iconColor: string;
  headerTint: string;
  renderIcon: (className: string) => React.ReactNode;
}

function getKpiMeta(id: KpiId, metrics: KpiMetrics): KpiMeta {
  switch (id) {
    case 'totalSales': {
      const salesInr = Math.round(metrics.totalSalesInr ?? 0);
      const collectedPct = metrics.totalSalesCollectedPct ?? 0;
      const count = metrics.totalSalesCount ?? 0;
      return {
        tag: 'Sales',
        title: 'Total Sales',
        value: formatInrExact(salesInr),
        exactTooltip: formatInrExact(salesInr),
        trendValue: `${collectedPct.toFixed(0)}%`,
        trendPositive: true,
        trendContext: `collected · ${count} inv`,
        iconBg: 'bg-emerald-50',
        iconRing: 'ring-emerald-200',
        iconColor: 'text-emerald-600',
        headerTint: 'bg-emerald-50/40',
        renderIcon: (c) => <TrendingUp className={c} />,
      };
    }
    case 'totalPurchases': {
      const purchaseInr = Math.round(metrics.totalPurchasesInr ?? 0);
      const paidPct = metrics.totalPurchasesPaidPct ?? 0;
      const count = metrics.totalPurchasesCount ?? 0;
      return {
        tag: 'Purchase',
        title: 'Total Purchases',
        value: formatInrExact(purchaseInr),
        exactTooltip: formatInrExact(purchaseInr),
        trendValue: `${paidPct.toFixed(0)}%`,
        trendPositive: true,
        trendContext: `paid · ${count} bills`,
        iconBg: 'bg-blue-50',
        iconRing: 'ring-blue-200',
        iconColor: 'text-blue-600',
        headerTint: 'bg-blue-50/40',
        renderIcon: (c) => <ShoppingBag className={c} />,
      };
    }
    case 'totalStockValue': {
      const stockInr = Math.round(
        metrics.totalStockValueInr ?? metrics.totalStockValueCr * 10000000,
      );
      return {
        tag: 'Stock',
        title: 'Total Stock Value',
        value: formatInrExact(stockInr),
        exactTooltip: formatInrExact(stockInr),
        trendValue: `${Math.abs(metrics.totalStockValueDelta).toFixed(1)}%`,
        trendPositive: metrics.totalStockValueDelta >= 0,
        trendContext: 'vs last month',
        iconBg: 'bg-fuchsia-50',
        iconRing: 'ring-fuchsia-200',
        iconColor: 'text-fuchsia-600',
        headerTint: 'bg-fuchsia-50/40',
        renderIcon: (c) => <Layers className={c} />,
      };
    }
    case 'netProfit': {
      const profitInr = Math.round(metrics.netProfitInr ?? 0);
      const marginPct = metrics.netProfitMarginPct ?? 0;
      const isPositive = profitInr >= 0;
      return {
        tag: 'Profit',
        title: 'Profit',
        value: `${profitInr < 0 ? '-' : ''}${formatInrExact(Math.abs(profitInr))}`,
        exactTooltip: `Sales − Purchases = ${profitInr > 0 ? '+' : ''}${formatInrExact(profitInr)}`,
        trendValue: `${Math.abs(marginPct).toFixed(1)}%`,
        trendPositive: isPositive,
        trendContext: isPositive ? 'margin' : 'deficit',
        iconBg: 'bg-amber-50',
        iconRing: 'ring-amber-200',
        iconColor: 'text-amber-600',
        headerTint: 'bg-amber-50/40',
        renderIcon: (c) => <Wallet className={c} />,
      };
    }
    case 'lowStockItems':
      return {
        tag: 'Alerts',
        title: 'Low Stock Items',
        value: String(metrics.lowStockItems),
        trendValue: `${Math.abs(metrics.lowStockItemsDelta).toFixed(1)}%`,
        trendPositive: metrics.lowStockItems === 0,
        trendContext: metrics.lowStockItems > 0 ? 'needs restock' : 'all stocked',
        iconBg: 'bg-rose-50',
        iconRing: 'ring-rose-200',
        iconColor: 'text-rose-600',
        headerTint: 'bg-rose-50/40',
        renderIcon: (c) => <AlertTriangle className={c} />,
      };
    case 'totalBranches':
      return {
        tag: 'Branches',
        title: 'Total Branches',
        value: String(metrics.totalBranches),
        trendValue: `${Math.abs(metrics.totalBranchesDelta).toFixed(1)}%`,
        trendPositive: metrics.totalBranchesDelta >= 0,
        trendContext: 'vs last month',
        iconBg: 'bg-blue-50',
        iconRing: 'ring-blue-200',
        iconColor: 'text-blue-600',
        headerTint: 'bg-blue-50/40',
        renderIcon: (c) => <Building2 className={c} />,
      };
    case 'totalProducts':
      return {
        tag: 'Catalog',
        title: 'Total Products',
        value: metrics.totalProducts.toLocaleString('en-IN'),
        trendValue: `${Math.abs(metrics.totalProductsDelta).toFixed(1)}%`,
        trendPositive: metrics.totalProductsDelta >= 0,
        trendContext: 'vs last month',
        iconBg: 'bg-violet-50',
        iconRing: 'ring-violet-200',
        iconColor: 'text-violet-600',
        headerTint: 'bg-violet-50/40',
        renderIcon: (c) => <Box className={c} />,
      };
    case 'inventoryAccuracy':
      return {
        tag: 'Audit',
        title: 'Stock Accuracy',
        value: `${metrics.inventoryAccuracyPct.toFixed(2)}%`,
        trendValue: `${Math.abs(metrics.inventoryAccuracyDelta).toFixed(1)}%`,
        trendPositive: metrics.inventoryAccuracyDelta >= 0,
        trendContext: 'vs last month',
        iconBg: 'bg-sky-50',
        iconRing: 'ring-sky-200',
        iconColor: 'text-sky-600',
        headerTint: 'bg-sky-50/40',
        renderIcon: (c) => <Target className={c} />,
      };
    case 'stockInTransit':
      return {
        tag: 'Transit',
        title: 'Stock In Transit (₹)',
        value: `₹ ${metrics.stockInTransitCr.toFixed(2)} Cr`,
        trendValue: `${Math.abs(metrics.stockInTransitDelta).toFixed(1)}%`,
        trendPositive: metrics.stockInTransitDelta >= 0,
        trendContext: 'vs last month',
        iconBg: 'bg-amber-50',
        iconRing: 'ring-amber-200',
        iconColor: 'text-amber-500',
        headerTint: 'bg-amber-50/40',
        renderIcon: (c) => <Truck className={c} />,
      };
    default:
      return {
        tag: 'Metric',
        title: 'Metric',
        value: '—',
        trendValue: '0%',
        trendPositive: true,
        trendContext: '',
        iconBg: 'bg-slate-50',
        iconRing: 'ring-slate-200',
        iconColor: 'text-slate-600',
        headerTint: 'bg-slate-50/40',
        renderIcon: (c) => <IndianRupee className={c} />,
      };
  }
}

export function KpiCard({
  id,
  metrics,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: KpiCardProps) {
  const meta = getKpiMeta(id, metrics);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, id)}
      onDragOver={(e) => onDragOver(e, id)}
      onDrop={(e) => onDrop(e, id)}
      onDragEnd={onDragEnd}
      className={`group relative rounded-xl bg-white border overflow-hidden transition-all duration-150 select-none cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-45 border-blue-400 scale-[0.98]'
          : isDropTarget
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-[#E5E9F0] hover:border-slate-300'
      }`}
    >
      {/* Top tinted header strip matching reference card design */}
      <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${meta.headerTint}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-1 ${meta.iconBg} ${meta.iconRing}`}
          >
            {meta.renderIcon(`w-3.5 h-3.5 ${meta.iconColor}`)}
          </div>
          <span className="text-[11.5px] font-semibold text-[#334155] truncate">
            {meta.tag}
          </span>
        </div>
        <GripVertical
          className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 shrink-0 transition-colors"
          aria-label="Drag to reorder metric card"
        />
      </div>

      {/* Main metric body */}
      <div className="px-4 py-3.5">
        <div className="text-[12.5px] font-medium text-[#475569] truncate">
          {meta.title}
        </div>
        <div
          title={meta.exactTooltip || meta.value}
          className="mt-1 text-[20px] font-bold text-[#0F172A] tabular-nums font-mono leading-tight tracking-tight truncate"
        >
          {meta.value}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] whitespace-nowrap">
          <span
            className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
              meta.trendPositive ? 'text-[#16A34A]' : 'text-[#DC2626]'
            }`}
          >
            {meta.trendPositive ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            {meta.trendValue}
          </span>
          {meta.trendContext && (
            <span className="text-[#64748B] truncate">{meta.trendContext}</span>
          )}
        </div>
      </div>
    </div>
  );
}
