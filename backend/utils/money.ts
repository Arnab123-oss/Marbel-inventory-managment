/**
 * Integer paise arithmetic helpers to avoid IEEE-754 floating-point drift
 * across billing, tax, discount, partial payment, and ledger calculations.
 *
 * 1 INR = 100 paise
 */

export const DEFAULT_COMPANY_ID = 'cmp-default';

export function inrToPaise(amountInr: number | undefined | null): number {
  if (typeof amountInr !== 'number' || !Number.isFinite(amountInr)) return 0;
  return Math.round(amountInr * 100);
}

export function paiseToInr(paise: number | undefined | null): number {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) return 0;
  return Number((Math.round(paise) / 100).toFixed(2));
}

export function sumPaise(values: ReadonlyArray<number | undefined | null>): number {
  let total = 0;
  for (const val of values) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      total += Math.round(val);
    }
  }
  return total;
}

export function computeBillTotalsPaise(params: {
  lineAmountsPaise: ReadonlyArray<number>;
  discountPaise?: number;
  taxPaise?: number;
  additionalChargesPaise?: number;
  paidAmountPaise?: number;
}): {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  additionalChargesPaise: number;
  totalPaise: number;
  paidAmountPaise: number;
  dueAmountPaise: number;
} {
  const subtotalPaise = Math.max(0, sumPaise(params.lineAmountsPaise));
  const discountPaise = Math.max(0, Math.min(subtotalPaise, Math.round(params.discountPaise || 0)));
  const taxPaise = Math.max(0, Math.round(params.taxPaise || 0));
  const additionalChargesPaise = Math.max(0, Math.round(params.additionalChargesPaise || 0));
  const totalPaise = Math.max(0, subtotalPaise - discountPaise + taxPaise + additionalChargesPaise);
  const paidAmountPaise = Math.max(0, Math.min(totalPaise, Math.round(params.paidAmountPaise || 0)));
  const dueAmountPaise = Math.max(0, totalPaise - paidAmountPaise);
  return {
    subtotalPaise,
    discountPaise,
    taxPaise,
    additionalChargesPaise,
    totalPaise,
    paidAmountPaise,
    dueAmountPaise,
  };
}
