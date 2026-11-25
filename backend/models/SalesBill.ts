import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {SalesBill, SalesBillItem} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

const salesBillItemSchema = new mongoose.Schema<SalesBillItem>(
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
    status: {type: String, enum: ['Paid', 'Partially Paid', 'Due'], required: true},
  },
  {_id: false},
);

export const salesBillSchema = new mongoose.Schema<SalesBill>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    customerId: {type: String, required: false, index: true},
    createdBy: {type: String, required: false},
    invoiceNo: {type: String, required: true, trim: true, index: true},
    customerName: {type: String, required: true, trim: true},
    customerPhone: {type: String, required: false},
    customerAddress: {type: String, required: false},
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
    status: {type: String, enum: ['Paid', 'Partially Paid', 'Due'], required: true},
    dateLabel: {type: String, required: true},
    dateIso: {type: String, required: false, index: true},
    notes: {type: String, required: false},
    items: {type: [salesBillItemSchema], default: []},
  },
  {timestamps: true},
);

salesBillSchema.index({companyId: 1, invoiceNo: 1}, {unique: true});
salesBillSchema.index({companyId: 1, dateIso: -1});

export const SalesBillDocModel =
  (mongoose.models.SalesBill as mongoose.Model<SalesBill>) ||
  mongoose.model<SalesBill>('SalesBill', salesBillSchema);

class SalesBillModel extends MongooseRepositoryBase<SalesBill> {
  constructor() {
    super('SalesBill', SalesBillDocModel);
  }

  findAll(companyId?: string): SalesBill[] {
    const bills = getActiveStore().snapshot.salesBills;
    if (!companyId) return bills;
    return bills.filter((b) => (b.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): SalesBill | undefined {
    return getActiveStore().snapshot.salesBills.find((b) => b.id === id);
  }

  findIndexById(id: string): number {
    return getActiveStore().snapshot.salesBills.findIndex((b) => b.id === id);
  }

  prepend(bill: SalesBill): SalesBill {
    const snap = getActiveStore().snapshot;
    const normalized: SalesBill = {
      ...bill,
      companyId: bill.companyId || DEFAULT_COMPANY_ID,
    };
    snap.salesBills = [normalized, ...snap.salesBills];
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const SalesBillRecord = new SalesBillModel();
export default SalesBillRecord;
