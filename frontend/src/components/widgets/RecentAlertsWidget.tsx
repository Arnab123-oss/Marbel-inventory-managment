import {AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info} from 'lucide-react';
import type {InventoryAlert} from '../../types/inventory';

interface RecentAlertsWidgetProps {
  alerts: InventoryAlert[];
  onToggleAcknowledge: (alertId: string) => void;
  onViewAll: () => void;
}

export function RecentAlertsWidget({
  alerts,
  onToggleAcknowledge,
  onViewAll,
}: RecentAlertsWidgetProps) {
  const visible = alerts.slice(0, 3);

  function renderIcon(severity: InventoryAlert['severity'], acknowledged: boolean) {
    if (acknowledged) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    if (severity === 'critical') {
      return <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />;
    }
    if (severity === 'warning') {
      return <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0" />;
    }
    return <Info className="w-4 h-4 text-[#7C3AED] shrink-0" />;
  }

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      <div className="space-y-2.5">
        {visible.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => onToggleAcknowledge(alert.id)}
            title={alert.acknowledged ? 'Click to reopen alert' : 'Click to acknowledge alert'}
            className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              alert.acknowledged
                ? 'bg-slate-50/60 border-slate-100 opacity-65'
                : 'bg-[#FAFBFD] border-[#E5E9F0] hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {renderIcon(alert.severity, alert.acknowledged)}
              <span
                className={`text-[12px] font-medium truncate ${
                  alert.acknowledged ? 'line-through text-slate-500' : 'text-[#1E293B]'
                }`}
              >
                {alert.title}
              </span>
            </div>
            <span className="text-[11px] text-[#64748B] whitespace-nowrap shrink-0 tabular-nums">
              {alert.timestampLabel}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onViewAll}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] w-fit transition-colors"
      >
        <span>View all alerts</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
