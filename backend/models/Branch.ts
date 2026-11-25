import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {LocationRow} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const branchSchema = new mongoose.Schema<LocationRow>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    name: {type: String, required: true, trim: true},
    type: {type: String, enum: ['Showroom', 'Yard', 'Godown', 'Depot'], required: true},
    address: {type: String, required: false, trim: true},
    phone: {type: String, required: false, trim: true},
    enabled: {type: Boolean, default: true},
    totalItems: {type: Number, required: true, min: 0},
    sqftQty: {type: Number, required: true, min: 0},
    pcsQty: {type: Number, required: true, min: 0},
    boxQty: {type: Number, required: true, min: 0},
    stockValueCr: {type: Number, required: true, min: 0},
    stockValueInr: {type: Number, required: false, min: 0},
    inventoryAccuracyPct: {type: Number, required: true, min: 0},
    minorVarianceItems: {type: Number, required: true, min: 0},
    majorVarianceItems: {type: Number, required: true, min: 0},
    lowStockItems: {type: Number, required: true, min: 0},
    overstockItems: {type: Number, required: true, min: 0},
    inTransitCr: {type: Number, required: true, min: 0},
    lastAuditAt: {type: String, required: true},
  },
  {timestamps: true},
);

branchSchema.index({companyId: 1, name: 1});

export const BranchDocModel =
  (mongoose.models.Branch as mongoose.Model<LocationRow>) ||
  mongoose.model<LocationRow>('Branch', branchSchema);

class BranchModel extends MongooseRepositoryBase<LocationRow> {
  constructor() {
    super('Branch', BranchDocModel);
  }

  findAll(companyId?: string): LocationRow[] {
    const branches = getActiveStore().snapshot.locations;
    if (!companyId) return branches;
    return branches.filter((b) => (b.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): LocationRow | undefined {
    return getActiveStore().snapshot.locations.find((l) => l.id === id);
  }

  findByName(name: string, companyId?: string): LocationRow | undefined {
    const norm = name.trim().toLowerCase();
    return this.findAll(companyId).find((l) => l.name.trim().toLowerCase() === norm);
  }
}

export const Branch = new BranchModel();
export default Branch;
