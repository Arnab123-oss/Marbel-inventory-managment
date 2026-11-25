import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {StockTransfer} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const transferSchema = new mongoose.Schema<StockTransfer>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    fromBranchId: {type: String, required: false, index: true},
    toBranchId: {type: String, required: false, index: true},
    requestedBy: {type: String, required: false},
    approvedBy: {type: String, required: false},
    transferCode: {type: String, required: true, index: true},
    itemCode: {type: String, required: true},
    itemName: {type: String, required: true},
    slabIds: {type: [String], default: undefined},
    fromLocation: {type: String, required: true},
    toLocation: {type: String, required: true},
    quantity: {type: Number, required: true, min: 0},
    unit: {type: String, required: true},
    valueCr: {type: Number, required: true, min: 0},
    valuePaise: {type: Number, required: false, min: 0},
    status: {
      type: String,
      enum: [
        'In Transit',
        'Delivered',
        'Scheduled',
        'Requested',
        'Approved',
        'Dispatched',
        'Received',
        'Cancelled',
      ],
      required: true,
    },
    etaLabel: {type: String, required: true},
    dispatchedAt: {type: String, required: false},
    receivedAt: {type: String, required: false},
    notes: {type: String, required: false},
  },
  {timestamps: true},
);

transferSchema.index({companyId: 1, status: 1, createdAt: -1});

export const TransferDocModel =
  (mongoose.models.Transfer as mongoose.Model<StockTransfer>) ||
  mongoose.model<StockTransfer>('Transfer', transferSchema);

class TransferModel extends MongooseRepositoryBase<StockTransfer> {
  constructor() {
    super('Transfer', TransferDocModel);
  }

  findAll(companyId?: string): StockTransfer[] {
    const transfers = getActiveStore().snapshot.transfers;
    if (!companyId) return transfers;
    return transfers.filter((t) => (t.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): StockTransfer | undefined {
    return getActiveStore().snapshot.transfers.find((t) => t.id === id);
  }

  prepend(transfer: StockTransfer): StockTransfer {
    const snap = getActiveStore().snapshot;
    const normalized: StockTransfer = {
      ...transfer,
      companyId: transfer.companyId || DEFAULT_COMPANY_ID,
    };
    snap.transfers = [normalized, ...snap.transfers];
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const Transfer = new TransferModel();
export default Transfer;
