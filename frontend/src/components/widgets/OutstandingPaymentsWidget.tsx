import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {NavSection, PurchaseBill, SalesBill} from '../../types/inventory';
import {
  formatInrCompact,
  formatInrExact,
  getPurchaseBillLines,
  getSalesBillLines,
} from '../../utils/branchMetrics';

interface OutstandingPaymentsWidgetProps {
  salesBills: SalesBill[];
  purchaseBills: PurchaseBill[];
  onNavigate: (section: NavSection) => void;
}

type PaymentBucket = 'overdue' | 'due_week' | 'upcoming';
type LedgerTab = 'all' | 'overdue' | 'due_week' | 'customers' | 'suppliers';

interface OutstandingEntry {
  id: string;
  kind: 'customer' | 'supplier';
  docNo: string;
  partyName: string;
  branchName: string;
  billDateLabel: string;
  dueDateLabel: string;
  dueTimestamp: number;
  daysUntilDue: number;
  bucket: PaymentBucket;
  statusLabel: string;
  totalAmountInr: number;
  pendingAmountInr: number;
  targetSection: NavSection;
}

const NET_CREDIT_DAYS = 7;

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseLocalMidnight(dateIso?: string, dateLabel?: string): Date | null {
  if (dateIso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  if (dateLabel) {
    const labelMatch = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(dateLabel.trim());
    if (labelMatch) {
      const day = Number(labelMatch[1]);
      const mon = MONTH_INDEX[labelMatch[2].slice(0, 3).toLowerCase()];
      const year = Number(labelMatch[3]);
      if (mon !== undefined && !Number.isNaN(day) && !Number.isNaN(year)) {
        return new Date(year, mon, day);
      }
    }
  }
  return null;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return next;
}

export function OutstandingPaymentsWidget({
  salesBills,
  purchaseBills,
  onNavigate,
}: OutstandingPaymentsWidgetProps) {
  const [activeTab, setActiveTab] = useState<LedgerTab>('all');

  const summary = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayMs = today.getTime();
    const msPerDay = 24 * 60 * 60 * 1000;

    const entries: OutstandingEntry[] = [];
    let customerOutstandingInr = 0;
    let customerOpenCount = 0;
    let supplierOutstandingInr = 0;
    let supplierOpenCount = 0;

    let overdueTotalInr = 0;
    let overdueCustomerInr = 0;
    let overdueSupplierInr = 0;
    let overdueCount = 0;

    let dueThisWeekTotalInr = 0;
    let dueThisWeekCustomerInr = 0;
    let dueThisWeekSupplierInr = 0;
    let dueThisWeekCount = 0;

    for (const bill of salesBills) {
      const lines = getSalesBillLines(bill);
      let totalAmt = 0;
      let pendingAmt = 0;
      for (const line of lines) {
        const amt = Math.max(0, Number(line.amountInr) || 0);
        totalAmt += amt;
        if (line.status === 'Due') pendingAmt += amt;
        else if (line.status === 'Partially Paid') pendingAmt += Math.round(amt * 0.5);
      }
      if (pendingAmt <= 0) continue;

      const billDate = parseLocalMidnight(bill.dateIso, bill.dateLabel) || today;
      const dueDate = addDays(billDate, NET_CREDIT_DAYS);
      const daysUntilDue = Math.round((dueDate.getTime() - todayMs) / msPerDay);
      const bucket: PaymentBucket =
        daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 7 ? 'due_week' : 'upcoming';

      customerOutstandingInr += pendingAmt;
      customerOpenCount += 1;
      if (bucket === 'overdue') {
        overdueTotalInr += pendingAmt;
        overdueCustomerInr += pendingAmt;
        overdueCount += 1;
      } else if (bucket === 'due_week') {
        dueThisWeekTotalInr += pendingAmt;
        dueThisWeekCustomerInr += pendingAmt;
        dueThisWeekCount += 1;
      }

      entries.push({
        id: `cust-${bill.id}`,
        kind: 'customer',
        docNo: bill.invoiceNo,
        partyName: bill.customerName,
        branchName: bill.branchName,
        billDateLabel: bill.dateLabel || formatShortDate(billDate),
        dueDateLabel: formatShortDate(dueDate),
        dueTimestamp: dueDate.getTime(),
        daysUntilDue,
        bucket,
        statusLabel: bill.status,
        totalAmountInr: totalAmt,
        pendingAmountInr: pendingAmt,
        targetSection: 'sales-bills',
      });
    }

    for (const bill of purchaseBills) {
      const billTotal = getPurchaseBillLines(bill).reduce(
        (sum, line) => sum + Math.max(0, Number(line.amountInr) || 0),
        0,
      );
      let pendingAmt = 0;
      if (bill.status === 'Pending') pendingAmt = billTotal;
      else if (bill.status === 'Partial') pendingAmt = Math.round(billTotal * 0.5);

      if (pendingAmt <= 0) continue;

      const billDate = parseLocalMidnight(bill.dateIso, bill.dateLabel) || today;
      const dueDate = addDays(billDate, NET_CREDIT_DAYS);
      const daysUntilDue = Math.round((dueDate.getTime() - todayMs) / msPerDay);
      const bucket: PaymentBucket =
        daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 7 ? 'due_week' : 'upcoming';

      supplierOutstandingInr += pendingAmt;
      supplierOpenCount += 1;
      if (bucket === 'overdue') {
        overdueTotalInr += pendingAmt;
        overdueSupplierInr += pendingAmt;
        overdueCount += 1;
      } else if (bucket === 'due_week') {
        dueThisWeekTotalInr += pendingAmt;
        dueThisWeekSupplierInr += pendingAmt;
        dueThisWeekCount += 1;
      }

      entries.push({
        id: `supp-${bill.id}`,
        kind: 'supplier',
        docNo: bill.billNo,
        partyName: bill.supplierName,
        branchName: bill.branchName,
        billDateLabel: bill.dateLabel || formatShortDate(billDate),
        dueDateLabel: formatShortDate(dueDate),
        dueTimestamp: dueDate.getTime(),
        daysUntilDue,
        bucket,
        statusLabel: bill.status,
        totalAmountInr: billTotal,
        pendingAmountInr: pendingAmt,
        targetSection: 'purchase-bills',
      });
    }

    // Sort: Due this week & most recently overdue first (closest due date first, or highest pending first)
    const bucketRank: Record<PaymentBucket, number> = {
      due_week: 0,
      overdue: 1,
      upcoming: 2,
    };
    entries.sort((a, b) => {
      if (bucketRank[a.bucket] !== bucketRank[b.bucket]) {
        return bucketRank[a.bucket] - bucketRank[b.bucket];
      }
      if (b.dueTimestamp !== a.dueTimestamp) {
        return b.dueTimestamp - a.dueTimestamp;
      }
      return b.pendingAmountInr - a.pendingAmountInr;
    });

    return {
      customerOutstandingInr,
      customerOpenCount,
      supplierOutstandingInr,
      supplierOpenCount,
      overdueTotalInr,
      overdueCustomerInr,
      overdueSupplierInr,
      overdueCount,
      dueThisWeekTotalInr,
      dueThisWeekCustomerInr,
      dueThisWeekSupplierInr,
      dueThisWeekCount,
      entries,
    };
  }, [salesBills, purchaseBills]);

  const filteredEntries = useMemo(() => {
    switch (activeTab) {
      case 'overdue':
        return summary.entries.filter((e) => e.bucket === 'overdue');
      case 'due_week':
        return summary.entries.filter((e) => e.bucket === 'due_week');
      case 'customers':
        return summary.entries.filter((e) => e.kind === 'customer');
      case 'suppliers':
        return summary.entries.filter((e) => e.kind === 'supplier');
      default:
        return summary.entries;
    }
  }, [summary.entries, activeTab]);

  const visibleRows = filteredEntries.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('sales-bills')}
          className="text-left rounded-lg border border-[#E5E9F0] bg-[#FAFBFD] hover:bg-white hover:border-blue-300 p-3.5 transition-colors group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Customer Outstanding
            </span>
            <span className="w-7 h-7 rounded-md bg-blue-50 text-[#2563EB] inline-flex items-center justify-center shrink-0">
              <ArrowDownLeft className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-[20px] font-bold text-[#0F172A] tabular-nums leading-tight">
            {formatInrExact(summary.customerOutstandingInr)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-[#64748B]">
            <span className="tabular-nums">
              {summary.customerOpenCount} open invoice
              {summary.customerOpenCount === 1 ? '' : 's'} · Receivable
            </span>
            <span className="text-[#2563EB] font-medium opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">
              Invoices <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('purchase-bills')}
          className="text-left rounded-lg border border-[#E5E9F0] bg-[#FAFBFD] hover:bg-white hover:border-slate-300 p-3.5 transition-colors group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Supplier Outstanding
            </span>
            <span className="w-7 h-7 rounded-md bg-slate-100 text-[#334155] inline-flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-[20px] font-bold text-[#0F172A] tabular-nums leading-tight">
            {formatInrExact(summary.supplierOutstandingInr)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-[#64748B]">
            <span className="tabular-nums">
              {summary.supplierOpenCount} open bill
              {summary.supplierOpenCount === 1 ? '' : 's'} · Payable
            </span>
            <span className="text-[#2563EB] font-medium opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">
              Bills <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('overdue')}
          className="text-left rounded-lg border border-[#E5E9F0] bg-[#FAFBFD] hover:bg-white hover:border-rose-300 p-3.5 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Overdue Payments
            </span>
            <span
              className={`w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0 ${
                summary.overdueCount > 0
                  ? 'bg-rose-50 text-[#DC2626]'
                  : 'bg-emerald-50 text-[#16A34A]'
              }`}
            >
              {summary.overdueCount > 0 ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </span>
          </div>
          <div
            className={`mt-2 text-[20px] font-bold tabular-nums leading-tight ${
              summary.overdueTotalInr > 0 ? 'text-[#DC2626]' : 'text-[#0F172A]'
            }`}
          >
            {formatInrExact(summary.overdueTotalInr)}
          </div>
          <div className="mt-1.5 text-[11.5px] text-[#64748B] tabular-nums truncate">
            {summary.overdueCount > 0
              ? `${summary.overdueCount} past Net-${NET_CREDIT_DAYS}d · Cust ${formatInrCompact(
                  summary.overdueCustomerInr,
                )} · Supp ${formatInrCompact(summary.overdueSupplierInr)}`
              : `No bills past Net-${NET_CREDIT_DAYS}d credit terms`}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('due_week')}
          className="text-left rounded-lg border border-[#E5E9F0] bg-[#FAFBFD] hover:bg-white hover:border-amber-300 p-3.5 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#64748B]">
              Payments Due This Week
            </span>
            <span
              className={`w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0 ${
                summary.dueThisWeekCount > 0
                  ? 'bg-amber-50 text-[#D97706]'
                  : 'bg-slate-100 text-[#64748B]'
              }`}
            >
              <CalendarClock className="w-4 h-4" />
            </span>
          </div>
          <div
            className={`mt-2 text-[20px] font-bold tabular-nums leading-tight ${
              summary.dueThisWeekTotalInr > 0 ? 'text-[#D97706]' : 'text-[#0F172A]'
            }`}
          >
            {formatInrExact(summary.dueThisWeekTotalInr)}
          </div>
          <div className="mt-1.5 text-[11.5px] text-[#64748B] tabular-nums truncate">
            {summary.dueThisWeekCount > 0
              ? `${summary.dueThisWeekCount} due in 7d · Cust ${formatInrCompact(
                  summary.dueThisWeekCustomerInr,
                )} · Supp ${formatInrCompact(summary.dueThisWeekSupplierInr)}`
              : 'No receivables or payables due in next 7 days'}
          </div>
        </button>
      </div>

      <div className="border-t border-[#E5E9F0] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex flex-wrap items-center gap-1 border-b border-[#E5E9F0] w-full sm:w-auto">
            {(
              [
                {key: 'all', label: `All Open (${summary.entries.length})`},
                {key: 'overdue', label: `Overdue (${summary.overdueCount})`},
                {key: 'due_week', label: `Due This Week (${summary.dueThisWeekCount})`},
                {key: 'customers', label: `Customers (${summary.customerOpenCount})`},
                {key: 'suppliers', label: `Suppliers (${summary.supplierOpenCount})`},
              ] as Array<{key: LedgerTab; label: string}>
            ).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-2.5 py-1.5 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
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

          <span className="text-[11px] text-[#64748B]">
            Credit baseline: Net {NET_CREDIT_DAYS} days from bill date
          </span>
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-5 px-3 text-center rounded-lg border border-dashed border-[#E2E8F0] bg-[#FAFBFD] text-[12.5px] text-[#64748B]">
            {activeTab === 'due_week'
              ? 'No customer invoices or supplier bills are scheduled due within the next 7 days.'
              : activeTab === 'overdue'
                ? 'No overdue customer or supplier balances.'
                : 'All customer sales invoices and supplier purchase bills are settled.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#E5E9F0] text-[11px] font-medium text-[#64748B]">
                  <th className="py-2 pr-3">Account &amp; Party</th>
                  <th className="py-2 px-2">Bill / Invoice</th>
                  <th className="py-2 px-2">Branch</th>
                  <th className="py-2 px-2">Due Status</th>
                  <th className="py-2 px-2">Payment Status</th>
                  <th className="py-2 px-2 text-right">Pending Balance</th>
                  <th className="py-2 pl-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                {visibleRows.map((row) => {
                  const dueText =
                    row.daysUntilDue < 0
                      ? `Overdue · Due ${row.dueDateLabel}`
                      : row.daysUntilDue === 0
                        ? `Due today · ${row.dueDateLabel}`
                        : `Due in ${row.daysUntilDue}d · ${row.dueDateLabel}`;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded inline-flex items-center justify-center shrink-0 ${
                              row.kind === 'customer'
                                ? 'bg-blue-50 text-[#2563EB]'
                                : 'bg-slate-100 text-[#475569]'
                            }`}
                            title={row.kind === 'customer' ? 'Customer Receivable' : 'Supplier Payable'}
                          >
                            {row.kind === 'customer' ? (
                              <ArrowDownLeft className="w-3 h-3" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-[#0F172A] truncate">
                              {row.partyName}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {row.kind === 'customer' ? 'Customer Receivable' : 'Supplier Payable'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="font-mono text-[11.5px] font-medium text-[#0F172A]">
                          {row.docNo}
                        </div>
                        <div className="text-[11px] text-[#64748B]">{row.billDateLabel}</div>
                      </td>
                      <td className="py-2.5 px-2 text-[#475569] whitespace-nowrap">
                        {row.branchName}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium text-[11.5px] tabular-nums ${
                            row.bucket === 'overdue'
                              ? 'text-[#DC2626]'
                              : row.bucket === 'due_week'
                                ? 'text-[#D97706]'
                                : 'text-[#475569]'
                          }`}
                        >
                          {row.bucket === 'overdue' ? (
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{dueText}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            row.statusLabel === 'Due' || row.statusLabel === 'Pending'
                              ? 'text-[#DC2626]'
                              : 'text-[#D97706]'
                          }`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                        {formatInrExact(row.pendingAmountInr)}
                      </td>
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onNavigate(row.targetSection)}
                          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#2563EB] hover:text-[#1D4ED8] hover:underline"
                        >
                          <span>Settle</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
