import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {PurchaseBill, PurchaseBillItem} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

const purchaseBillItemSchema = new mongoose.Schema<PurchaseBillItem>(
  {
    id: {type: String, required: true},
    productId: {type: String, required: false},
    slabIds: {type: [String], default: undefined},
    itemCode: {type: String, required: false},
    itemName: {type: String, required: true},
    dimensions: {type: String, required: true},
    qty: {type: Number, required: true, min: 0},
    unit: {type: String, required: true},
    unitPriceInr: {type: Number, required: false, min: 0},
    unitPricePaise: {type: Number, required: false, min: 0},
    amountInr: {type: Number, required: true, min: 0},
    amountPaise: {type: Number, required: false, min: 0},
  },
  {_id: false},
);

export const purchaseBillSchema = new mongoose.Schema<PurchaseBill>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    supplierId: {type: String, required: false, index: true},
    createdBy: {type: String, required: false},
    billNo: {type: String, required: true, trim: true, index: true},
    supplierName: {type: String, required: true, trim: true},
    branchName: {type: String, required: true},
    itemSummary: {type: String, required: true},
    qty: {type: Number, required: true, min: 0},
    unit: {type: String, required: true},
    subtotalInr: {type: Number, required: false, min: 0},
    discountInr: {type: Number, required: false, min: 0, default: 0},
    taxInr: {type: Number, required: false, min: 0, default: 0},
    additionalChargesInr: {type: Number, required: false, min: 0, default: 0},
    totalInr: {type: Number, required: true, min: 0},
    paidAmountInr: {type: Number, required: false, min: 0, default: 0},
    dueAmountInr: {type: Number, required: false, min: 0, default: 0},
    subtotalPaise: {type: Number, required: false, min: 0},
    discountPaise: {type: Number, required: false, min: 0},
    taxPaise: {type: Number, required: false, min: 0},
    additionalChargesPaise: {type: Number, required: false, min: 0},
    totalPaise: {type: Number, required: false, min: 0},
    paidAmountPaise: {type: Number, required: false, min: 0},
    dueAmountPaise: {type: Number, required: false, min: 0},
    status: {type: String, enum: ['Paid', 'Pending', 'Partial'], required: true},
    dateLabel: {type: String, required: true},
    dateIso: {type: String, required: false, index: true},
    notes: {type: String, required: false},
    items: {type: [purchaseBillItemSchema], default: []},
  },
  {timestamps: true},
);

purchaseBillSchema.index({companyId: 1, branchName: 1, billNo: 1}, {unique: true});
purchaseBillSchema.index({companyId: 1, dateIso: -1});

export const PurchaseBillDocModel =
  (mongoose.models.PurchaseBill as mongoose.Model<PurchaseBill>) ||
  mongoose.model<PurchaseBill>('PurchaseBill', purchaseBillSchema);

class PurchaseBillModel extends MongooseRepositoryBase<PurchaseBill> {
  constructor() {
    super('PurchaseBill', PurchaseBillDocModel);
  }

  findAll(companyId?: string): PurchaseBill[] {
    const bills = getActiveStore().snapshot.purchaseBills;
    if (!companyId) return bills;
    return bills.filter((b) => (b.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): PurchaseBill | undefined {
    return getActiveStore().snapshot.purchaseBills.find((b) => b.id === id);
  }

  findIndexById(id: string): number {
    return getActiveStore().snapshot.purchaseBills.findIndex((b) => b.id === id);
  }

  prepend(bill: PurchaseBill): PurchaseBill {
    const snap = getActiveStore().snapshot;
    const normalized: PurchaseBill = {
      ...bill,
      companyId: bill.companyId || DEFAULT_COMPANY_ID,
    };
    snap.purchaseBills = [normalized, ...snap.purchaseBills];
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const PurchaseBillRecord = new PurchaseBillModel();
export default PurchaseBillRecord;
