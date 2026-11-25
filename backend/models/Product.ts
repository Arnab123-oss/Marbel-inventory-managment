import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {VarianceItem} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const productSchema = new mongoose.Schema<VarianceItem>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    itemCode: {type: String, required: true, trim: true, index: true},
    itemName: {type: String, required: true, trim: true},
    dimensions: {type: String, required: true, trim: true},
    category: {type: String, required: true},
    material: {type: String, required: false, trim: true},
    trackingType: {type: String, enum: ['quantity', 'slab'], default: 'quantity'},
    finish: {type: String, required: true},
    thickness: {type: String, required: true},
    locationId: {type: String, required: true, index: true},
    locationName: {type: String, required: true},
    unit: {type: String, required: true},
    systemQty: {type: Number, required: true, min: 0},
    physicalQty: {type: Number, required: true, min: 0},
    minStockQty: {type: Number, required: false, min: 0},
    variance: {type: Number, required: true},
    variancePct: {type: Number, required: true},
    unitPriceInr: {type: Number, required: true, min: 0},
    unitPricePaise: {type: Number, required: false, min: 0},
    status: {type: String, required: true},
    lastCountedAt: {type: String, required: true},
    stockedDateIso: {type: String, required: false},
    imageUrl: {type: String, required: false},
    enabled: {type: Boolean, default: true},
  },
  {timestamps: true},
);

productSchema.index({companyId: 1, locationId: 1, itemCode: 1}, {unique: true});
productSchema.index({companyId: 1, locationId: 1, status: 1});

export const ProductDocModel =
  (mongoose.models.Product as mongoose.Model<VarianceItem>) ||
  mongoose.model<VarianceItem>('Product', productSchema);

class ProductModel extends MongooseRepositoryBase<VarianceItem> {
  constructor() {
    super('Product', ProductDocModel);
  }

  findAll(companyId?: string): VarianceItem[] {
    const items = getActiveStore().snapshot.varianceItems;
    if (!companyId) return items;
    return items.filter((i) => (i.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): VarianceItem | undefined {
    return getActiveStore().snapshot.varianceItems.find((i) => i.id === id);
  }

  findByCode(
    itemCode: string,
    branchName?: string,
    companyId?: string,
  ): VarianceItem | undefined {
    const codeNorm = itemCode.trim().toLowerCase();
    const items = this.findAll(companyId);
    if (branchName) {
      const branchNorm = branchName.trim().toLowerCase();
      return items.find(
        (i) =>
          i.itemCode.toLowerCase() === codeNorm &&
          (i.locationName.trim().toLowerCase() === branchNorm ||
            i.locationId.trim().toLowerCase() === branchNorm),
      );
    }
    return items.find((i) => i.itemCode.toLowerCase() === codeNorm);
  }

  prepend(item: VarianceItem): VarianceItem {
    const snap = getActiveStore().snapshot;
    const normalized: VarianceItem = {
      ...item,
      companyId: item.companyId || DEFAULT_COMPANY_ID,
      branchId: item.branchId || item.locationId,
    };
    snap.varianceItems = [normalized, ...snap.varianceItems];
    void this.syncDoc(normalized);
    return normalized;
  }

  removeById(id: string): VarianceItem | null {
    const snap = getActiveStore().snapshot;
    const idx = snap.varianceItems.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const [removed] = snap.varianceItems.splice(idx, 1);
    void this.deleteDoc(removed.id);
    return removed;
  }
}

export const Product = new ProductModel();
export default Product;
