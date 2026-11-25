import type {PurchaseBill, SalesPaymentStatus} from '../types/inventory.ts';

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export function daysAgoIsoServer(days: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatIsoToDateLabelServer(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
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
  const mon = months[Math.max(0, Math.min(11, Number(m[2]) - 1))];
  return `${Number(m[3])} ${mon} ${m[1]}`;
}

export function parseDateLabelToIsoServer(dateLabel?: string): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!dateLabel || dateLabel.trim().toLowerCase() === 'today') return todayIso;
  const isoMatch = dateLabel.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateLabel.trim();
  const labelMatch = dateLabel.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (labelMatch) {
    const day = labelMatch[1].padStart(2, '0');
    const month = MONTH_MAP[labelMatch[2].slice(0, 3).toLowerCase()];
    const year = labelMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }
  const parsed = new Date(dateLabel);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return todayIso;
}

export function extractBillNoSuffixServer(rawBillNo: string): string {
  const trimmed = rawBillNo.trim();
  const fullMatch = trimmed.match(/^PB-\d{2}-\d{4}-(.+)$/i);
  if (fullMatch) return fullMatch[1].trim();
  const legacyMatch = trimmed.match(/^PB-\d{4}-(.+)$/i);
  if (legacyMatch) return legacyMatch[1].trim();
  const pbPrefixMatch = trimmed.match(/^PB-(.+)$/i);
  if (pbPrefixMatch) return pbPrefixMatch[1].trim();
  return trimmed;
}

export function formatPurchaseBillNoServer(
  rawBillNo: string | undefined,
  dateIso?: string,
  dateLabel?: string,
): string {
  const resolvedIso =
    dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
      ? dateIso.trim()
      : parseDateLabelToIsoServer(dateLabel);
  const [year, month] = resolvedIso.split('-');
  const fallbackSuffix = String(Math.floor(1120 + Math.random() * 800));
  const suffix = rawBillNo?.trim() ? extractBillNoSuffixServer(rawBillNo) : fallbackSuffix;
  return `PB-${month}-${year}-${suffix || fallbackSuffix}`;
}

export function formatPurchaseReturnNoServer(
  rawReturnNo: string | undefined,
  dateIso?: string,
  dateLabel?: string,
): string {
  const resolvedIso =
    dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
      ? dateIso.trim()
      : parseDateLabelToIsoServer(dateLabel);
  const [year, month] = resolvedIso.split('-');
  const fallbackSuffix = String(Math.floor(2100 + Math.random() * 700));
  const trimmed = rawReturnNo?.trim() || '';
  const suffix = trimmed
    .replace(/^RET-\d{2}-\d{4}-/i, '')
    .replace(/^RET-/i, '')
    .trim();
  return `RET-${month}-${year}-${suffix || fallbackSuffix}`;
}

export function formatInvoiceNoServer(rawInvoiceNo?: string): string {
  const fallback = String(Math.floor(8850 + Math.random() * 900));
  const trimmed = rawInvoiceNo?.trim() || '';
  const suffix = trimmed.replace(/^INV-/i, '').trim() || fallback;
  return `INV-${suffix}`;
}

export function normalizeSalesItemStatusServer(raw?: string): SalesPaymentStatus {
  if (raw === 'Paid' || raw === 'Partially Paid' || raw === 'Due') return raw;
  if (raw === 'Dispatched' || raw === 'Partial') return 'Partially Paid';
  return 'Due';
}

export function computeSalesBillStatusServer(
  items: Array<{amountInr: number; status: SalesPaymentStatus}>,
): SalesPaymentStatus {
  if (!items || items.length === 0) return 'Due';
  if (items.every((it) => it.status === 'Paid')) return 'Paid';
  if (items.every((it) => it.status === 'Due')) return 'Due';
  const totalAmt = items.reduce((sum, it) => sum + Math.max(0, Number(it.amountInr) || 0), 0);
  let paidWeight = 0;
  let totalWeight = 0;
  for (const it of items) {
    const w = totalAmt > 0 ? Math.max(0, Number(it.amountInr) || 0) : 1;
    totalWeight += w;
    if (it.status === 'Paid') paidWeight += w;
    else if (it.status === 'Partially Paid') paidWeight += w * 0.5;
  }
  const paidPct = totalWeight > 0 ? (paidWeight / totalWeight) * 100 : 0;
  if (paidPct >= 100) return 'Paid';
  if (paidPct < 50) return 'Due';
  return 'Partially Paid';
}

export function getPurchaseBillAmountServer(bill: PurchaseBill): number {
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    return bill.items.reduce((sum, it) => sum + (Number(it.amountInr) || 0), 0);
  }
  return Number(bill.totalInr) || 0;
}
