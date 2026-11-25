import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {SlabLot} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const slabSchema = new mongoose.Schema<SlabLot>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    productId: {type: String, required: false, index: true},
    purchaseBillId: {type: String, required: false, index: true},
    lotNumber: {type: String, required: true, trim: true, index: true},
    slabCode: {type: String, required: false, trim: true},
    stoneName: {type: String, required: true, trim: true},
    category: {type: String, required: true},
    dimensionsFt: {type: String, required: true},
    lengthFt: {type: Number, required: false, min: 0},
    widthFt: {type: Number, required: false, min: 0},
    slabCountPcs: {type: Number, required: true, min: 0},
    systemSqFt: {type: Number, required: false, min: 0},
    totalSqFt: {type: Number, required: true, min: 0},
    thicknessMm: {type: Number, required: true, min: 1},
    costPriceInr: {type: Number, required: false, min: 0},
    costPricePaise: {type: Number, required: false, min: 0},
    unitPriceInr: {type: Number, required: false, min: 0},
    unitPricePaise: {type: Number, required: false, min: 0},
    branchName: {type: String, required: true, index: true},
    finish: {type: String, enum: ['Polished', 'Honed', 'Leather'], required: true},
    status: {type: String, enum: ['In Stock', 'Out of Stock'], required: true},
    slabStatus: {
      type: String,
      enum: ['In Stock', 'Out of Stock', 'Available', 'Reserved', 'Sold', 'In Transit', 'Damaged'],
      required: false,
    },
    stockedDateIso: {type: String, required: false},
    imageUrl: {type: String, required: false},
    enabled: {type: Boolean, default: true},
  },
  {timestamps: true},
);

slabSchema.index({companyId: 1, branchName: 1, status: 1});
slabSchema.index(
  {companyId: 1, slabCode: 1},
  {unique: true, partialFilterExpression: {slabCode: {$type: 'string'}}},
);

export const SlabDocModel =
  (mongoose.models.Slab as mongoose.Model<SlabLot>) ||
  mongoose.model<SlabLot>('Slab', slabSchema);

class SlabModel extends MongooseRepositoryBase<SlabLot> {
  constructor() {
    super('Slab', SlabDocModel);
  }

  findAll(companyId?: string): SlabLot[] {
    const slabs = getActiveStore().snapshot.slabs;
    if (!companyId) return slabs;
    return slabs.filter((s) => (s.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): SlabLot | undefined {
    return getActiveStore().snapshot.slabs.find((s) => s.id === id);
  }

  findByLotNumber(
    lotNumber: string,
    branchName?: string,
    companyId?: string,
  ): SlabLot | undefined {
    const codeNorm = lotNumber.trim().toLowerCase();
    const slabs = this.findAll(companyId);
    if (branchName) {
      const branchNorm = branchName.trim().toLowerCase();
      return slabs.find(
        (s) =>
          (s.lotNumber.toLowerCase() === codeNorm ||
            s.slabCode?.toLowerCase() === codeNorm) &&
          (s.branchName.trim().toLowerCase() === branchNorm ||
            s.branchId?.trim().toLowerCase() === branchNorm),
      );
    }
    return slabs.find(
      (s) =>
        s.lotNumber.toLowerCase() === codeNorm ||
        s.slabCode?.toLowerCase() === codeNorm,
    );
  }

  prepend(slab: SlabLot): SlabLot {
    const snap = getActiveStore().snapshot;
    const normalized: SlabLot = {
      ...slab,
      companyId: slab.companyId || DEFAULT_COMPANY_ID,
    };
    snap.slabs = [normalized, ...snap.slabs];
    void this.syncDoc(normalized);
    return normalized;
  }

  removeById(id: string): SlabLot | null {
    const snap = getActiveStore().snapshot;
    const idx = snap.slabs.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const [removed] = snap.slabs.splice(idx, 1);
    void this.deleteDoc(removed.id);
    return removed;
  }
}

export const Slab = new SlabModel();
export default Slab;
