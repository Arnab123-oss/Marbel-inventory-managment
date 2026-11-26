import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {SalesReturn, SalesReturnItem} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

const salesReturnItemSchema = new mongoose.Schema<SalesReturnItem>(
  {
    id: {type: String, required: true},
    productId: {type: String, required: false},
    slabIds: {type: [String], default: undefined},
    itemCode: {type: String, required: false},
    itemName: {type: String, required: true},
    dimensions: {type: String, required: true},
    qty: {type: Number, required: true, min: 0},
    unit: {type: String, required: true},
    amountInr: {type: Number, required: true, min: 0},
    amountPaise: {type: Number, required: false, min: 0},
    reason: {type: String, required: false},
  },
  {_id: false},
);

export const salesReturnSchema = new mongoose.Schema<SalesReturn>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    customerId: {type: String, required: false, index: true},
    createdBy: {type: String, required: false},
    returnNo: {type: String, required: true, trim: true, index: true},
    customerName: {type: String, required: true, trim: true},
    branchName: {type: String, required: true},
    salesBillId: {type: String, required: false},
    salesBillNo: {type: String, required: false},
    affectedBills: {type: [String], default: []},
    reason: {type: String, required: true},
    notes: {type: String, required: false},
    itemSummary: {type: String, required: true},
    qty: {type: Number, required: true, min: 0},
    unit: {type: String, required: true},
    totalInr: {type: Number, required: true, min: 0},
    totalPaise: {type: Number, required: false, min: 0},
    status: {type: String, enum: ['Completed', 'Adjusted'], required: true},
    dateLabel: {type: String, required: true},
    dateIso: {type: String, required: false, index: true},
    items: {type: [salesReturnItemSchema], default: []},
  },
  {timestamps: true},
);

salesReturnSchema.index({companyId: 1, returnNo: 1}, {unique: true});
salesReturnSchema.index({companyId: 1, dateIso: -1});

export const SalesReturnDocModel =
  (mongoose.models.SalesReturn as mongoose.Model<SalesReturn>) ||
  mongoose.model<SalesReturn>('SalesReturn', salesReturnSchema);

class SalesReturnModel extends MongooseRepositoryBase<SalesReturn> {
  constructor() {
    super('SalesReturn', SalesReturnDocModel);
  }

  findAll(companyId?: string): SalesReturn[] {
    const returns = getActiveStore().snapshot.salesReturns || [];
    if (!companyId) return returns;
    return returns.filter((r) => (r.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  prepend(ret: SalesReturn): SalesReturn {
    const snap = getActiveStore().snapshot;
    const normalized: SalesReturn = {
      ...ret,
      companyId: ret.companyId || DEFAULT_COMPANY_ID,
    };
    snap.salesReturns = [normalized, ...(snap.salesReturns || [])];
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const SalesReturnRecord = new SalesReturnModel();
export default SalesReturnRecord;
