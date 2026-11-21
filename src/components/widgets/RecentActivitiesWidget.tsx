import {ArrowLeftRight, FileText, ShoppingBag} from 'lucide-react';
import {useMemo} from 'react';
import type {
  NavSection,
  PurchaseBill,
  SalesBill,
  StockTransfer,
} from '../../types/inventory';
import {
  formatInrExact,
  getPurchaseBillLines,
  getSalesBillLines,
} from '../../utils/branchMetrics';

interface RecentActivitiesWidgetProps {
  salesBills: SalesBill[];
  purchaseBills: PurchaseBill[];
  transfers: StockTransfer[];
  onNavigate: (section: NavSection) => void;
}

interface ActivityItem {
  id: string;
  kind: 'sale' | 'purchase' | 'transfer';
  title: string;
  subtitle: string;
  amountLabel: string;
  dateLabel: string;
  sortKey: string;
  targetSection: NavSection;
}

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

function toSortableDate(dateLabel?: string, dateIso?: string): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) return dateIso.trim();
  if (dateLabel) {
    const trimmed = dateLabel.trim();
    if (/^today$/i.test(trimmed)) return new Date().toISOString().slice(0, 10);
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
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return '1970-01-01';
}

export function RecentActivitiesWidget({
  salesBills,
  purchaseBills,
  transfers,
  onNavigate,
}: RecentActivitiesWidgetProps) {
  const activities = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];

    for (const bill of salesBills) {
      const total = getSalesBillLines(bill).reduce(
        (sum, l) => sum + Math.max(0, Number(l.amountInr) || 0),
        0,
      );
      list.push({
        id: `sale-${bill.id}`,
        kind: 'sale',
        title: `New sale #${bill.invoiceNo}`,
        subtitle: `${bill.customerName} · ${bill.branchName}`,
        amountLabel: formatInrExact(total),
        dateLabel: bill.dateLabel,
        sortKey: `${toSortableDate(bill.dateLabel, bill.dateIso)}-3-${bill.id}`,
        targetSection: 'sales-bills',
      });
    }

    for (const bill of purchaseBills) {
      const total = getPurchaseBillLines(bill).reduce(
        (sum, l) => sum + Math.max(0, Number(l.amountInr) || 0),
        0,
      );
      list.push({
        id: `purchase-${bill.id}`,
        kind: 'purchase',
        title: `Purchase bill #${bill.billNo}`,
        subtitle: `${bill.supplierName} · ${bill.branchName}`,
        amountLabel: formatInrExact(total),
        dateLabel: bill.dateLabel,
        sortKey: `${toSortableDate(bill.dateLabel, bill.dateIso)}-2-${bill.id}`,
        targetSection: 'purchase-bills',
      });
    }

    for (const trf of transfers.slice(0, 4)) {
      list.push({
        id: `trf-${trf.id}`,
        kind: 'transfer',
        title: `Transfer #${trf.transferCode}`,
        subtitle: `${trf.fromLocation} → ${trf.toLocation} (${trf.quantity.toLocaleString('en-IN')} ${trf.unit})`,
        amountLabel: trf.status,
        dateLabel: trf.etaLabel,
        sortKey: `2024-04-01-1-${trf.id}`,
        targetSection: 'transfers',
      });
    }

    return list.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).slice(0, 5);
  }, [salesBills, purchaseBills, transfers]);

  if (activities.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#64748B]">
        No recent sales, purchases, or stock transfers recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {activities.map((item) => {
        const iconStyle =
          item.kind === 'sale'
            ? 'bg-blue-50 text-[#2563EB] ring-blue-100'
            : item.kind === 'purchase'
              ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
              : 'bg-violet-50 text-violet-600 ring-violet-100';

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.targetSection)}
            className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#FAFBFD] hover:bg-[#F1F5F9]/80 border border-[#EBF0F6] flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${iconStyle}`}
              >
                {item.kind === 'sale' ? (
                  <FileText className="w-4 h-4" />
                ) : item.kind === 'purchase' ? (
                  <ShoppingBag className="w-4 h-4" />
                ) : (
                  <ArrowLeftRight className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#0F172A] truncate">
                  {item.title}
                </div>
                <div className="text-[11.5px] text-[#64748B] truncate">
                  {item.subtitle}
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[12.5px] font-semibold text-[#0F172A] font-mono tabular-nums">
                {item.amountLabel}
              </div>
              <div className="text-[10.5px] text-[#64748B] tabular-nums">
                {item.dateLabel}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
