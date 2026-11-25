import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {ProductHistoryEntry} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const historySchema = new mongoose.Schema<ProductHistoryEntry>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    itemId: {type: String, required: true, index: true},
    itemCode: {type: String, required: true, index: true},
    type: {
      type: String,
      enum: ['Purchase', 'Sale', 'Transfer', 'Adjustment', 'Return'],
      required: true,
    },
    referenceNo: {type: String, required: true},
    quantityDelta: {type: Number, required: true},
    unit: {type: String, required: true},
    systemAfter: {type: Number, required: true},
    physicalAfter: {type: Number, required: true},
    branchName: {type: String, required: true},
    partyOrNote: {type: String, required: true},
    timestampLabel: {type: String, required: true},
  },
  {timestamps: true},
);

historySchema.index({companyId: 1, itemId: 1, createdAt: -1});

export const HistoryDocModel =
  (mongoose.models.History as mongoose.Model<ProductHistoryEntry>) ||
  mongoose.model<ProductHistoryEntry>('History', historySchema);

class HistoryModel extends MongooseRepositoryBase<ProductHistoryEntry> {
  constructor() {
    super('History', HistoryDocModel);
  }

  findAll(companyId?: string): ProductHistoryEntry[] {
    const history = getActiveStore().snapshot.history || [];
    if (!companyId) return history;
    return history.filter((h) => (h.companyId || DEFAULT_COMPANY_ID) === companyId);
  }
}

export const History = new HistoryModel();
export default History;
