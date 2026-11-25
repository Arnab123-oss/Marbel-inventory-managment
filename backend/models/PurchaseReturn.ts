import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {PurchaseReturn, PurchaseReturnItem} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

const purchaseReturnItemSchema = new mongoose.Schema<PurchaseReturnItem>(
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

export const purchaseReturnSchema = new mongoose.Schema<PurchaseReturn>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    supplierId: {type: String, required: false, index: true},
    createdBy: {type: String, required: false},
    returnNo: {type: String, required: true, trim: true, index: true},
    supplierName: {type: String, required: true, trim: true},
    branchName: {type: String, required: true},
    purchaseBillId: {type: String, required: false},
    purchaseBillNo: {type: String, required: false},
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
    items: {type: [purchaseReturnItemSchema], default: []},
  },
  {timestamps: true},
);

purchaseReturnSchema.index({companyId: 1, returnNo: 1}, {unique: true});
purchaseReturnSchema.index({companyId: 1, dateIso: -1});

export const PurchaseReturnDocModel =
  (mongoose.models.PurchaseReturn as mongoose.Model<PurchaseReturn>) ||
  mongoose.model<PurchaseReturn>('PurchaseReturn', purchaseReturnSchema);

class PurchaseReturnModel extends MongooseRepositoryBase<PurchaseReturn> {
  constructor() {
    super('PurchaseReturn', PurchaseReturnDocModel);
  }

  findAll(companyId?: string): PurchaseReturn[] {
    const returns = getActiveStore().snapshot.purchaseReturns || [];
    if (!companyId) return returns;
    return returns.filter((r) => (r.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  prepend(ret: PurchaseReturn): PurchaseReturn {
    const snap = getActiveStore().snapshot;
    const normalized: PurchaseReturn = {
      ...ret,
      companyId: ret.companyId || DEFAULT_COMPANY_ID,
    };
    snap.purchaseReturns = [normalized, ...(snap.purchaseReturns || [])];
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const PurchaseReturnRecord = new PurchaseReturnModel();
export default PurchaseReturnRecord;
