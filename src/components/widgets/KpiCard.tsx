import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Building2,
  GripVertical,
  IndianRupee,
  Target,
  Truck,
} from 'lucide-react';
import type {DragEvent} from 'react';
import type {KpiId, KpiMetrics} from '../../types/inventory';

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
  title: string;
  value: string;
  delta: number;
  iconBg: string;
  iconRing: string;
  iconColor: string;
  renderIcon: (className: string) => React.ReactNode;
}

function getKpiMeta(id: KpiId, metrics: KpiMetrics): KpiMeta {
  switch (id) {
    case 'totalBranches':
      return {
        title: 'Total Branches',
        value: String(metrics.totalBranches),
        delta: metrics.totalBranchesDelta,
        iconBg: 'bg-blue-50',
        iconRing: 'ring-blue-200',
        iconColor: 'text-blue-600',
        renderIcon: (c) => <Building2 className={c} />,
      };
    case 'totalProducts':
      return {
        title: 'Total Products',
        value: metrics.totalProducts.toLocaleString('en-IN'),
        delta: metrics.totalProductsDelta,
        iconBg: 'bg-violet-50',
        iconRing: 'ring-violet-200',
        iconColor: 'text-violet-600',
        renderIcon: (c) => <Box className={c} />,
      };
    case 'totalStockValue':
      return {
        title: 'Total Stock Value (₹)',
        value: `₹ ${metrics.totalStockValueCr.toFixed(2)} Cr`,
        delta: metrics.totalStockValueDelta,
        iconBg: 'bg-emerald-50',
        iconRing: 'ring-emerald-200',
        iconColor: 'text-emerald-600',
        renderIcon: (c) => <IndianRupee className={c} />,
      };
    case 'inventoryAccuracy':
      return {
        title: 'Stock Accuracy',
        value: `${metrics.inventoryAccuracyPct.toFixed(2)}%`,
        delta: metrics.inventoryAccuracyDelta,
        iconBg: 'bg-sky-50',
        iconRing: 'ring-sky-200',
        iconColor: 'text-sky-600',
        renderIcon: (c) => <Target className={c} />,
      };
    case 'stockInTransit':
      return {
        title: 'Stock In Transit (₹)',
        value: `₹ ${metrics.stockInTransitCr.toFixed(2)} Cr`,
        delta: metrics.stockInTransitDelta,
        iconBg: 'bg-amber-50',
        iconRing: 'ring-amber-200',
        iconColor: 'text-amber-500',
        renderIcon: (c) => <Truck className={c} />,
      };
    case 'lowStockItems':
      return {
        title: 'Low Stock Items',
        value: String(metrics.lowStockItems),
        delta: metrics.lowStockItemsDelta,
        iconBg: 'bg-rose-50',
        iconRing: 'ring-rose-200',
        iconColor: 'text-rose-600',
        renderIcon: (c) => <AlertTriangle className={c} />,
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
  const isPositive = meta.delta >= 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, id)}
      onDragOver={(e) => onDragOver(e, id)}
      onDrop={(e) => onDrop(e, id)}
      onDragEnd={onDragEnd}
      className={`group relative rounded-xl bg-white border px-4 py-3.5 transition-all duration-150 select-none cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-45 border-blue-400 scale-[0.98]'
          : isDropTarget
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-[#E5E9F0] hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ring-1 ${meta.iconBg} ${meta.iconRing}`}
        >
          {meta.renderIcon(`w-[18px] h-[18px] ${meta.iconColor}`)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-medium text-[#64748B] truncate">
              {meta.title}
            </span>
            <GripVertical
              className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 shrink-0 transition-colors"
              aria-label="Drag to reorder metric card"
            />
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-[#0F172A] tabular-nums leading-tight tracking-tight truncate">
            {meta.value}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] whitespace-nowrap">
            <span className="text-[#64748B]">vs last month</span>
            <span
              className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
                isPositive ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {isPositive ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )}
              {Math.abs(meta.delta).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
