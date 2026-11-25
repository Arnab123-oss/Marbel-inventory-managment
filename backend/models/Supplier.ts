import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {SupplierRecord} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const supplierSchema = new mongoose.Schema<SupplierRecord>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    name: {type: String, required: true, trim: true},
    origin: {type: String, required: true, trim: true},
    specialty: {type: String, required: true},
    phone: {type: String, required: false},
    email: {type: String, required: false, trim: true, lowercase: true},
    address: {type: String, required: false, trim: true},
    gstin: {type: String, required: false, trim: true, uppercase: true},
    totalSuppliedInr: {type: Number, default: 0, min: 0},
    payableInr: {type: Number, default: 0, min: 0},
    totalSuppliedPaise: {type: Number, required: false, min: 0},
    payablePaise: {type: Number, required: false, min: 0},
    lastDeliveryLabel: {type: String, required: true},
    enabled: {type: Boolean, default: true},
  },
  {timestamps: true},
);

supplierSchema.index({companyId: 1, name: 1});
supplierSchema.index({companyId: 1, phone: 1});

export const SupplierDocModel =
  (mongoose.models.Supplier as mongoose.Model<SupplierRecord>) ||
  mongoose.model<SupplierRecord>('Supplier', supplierSchema);

class SupplierModel extends MongooseRepositoryBase<SupplierRecord> {
  constructor() {
    super('Supplier', SupplierDocModel);
  }

  findAll(companyId?: string): SupplierRecord[] {
    const suppliers = getActiveStore().snapshot.suppliers;
    if (!companyId) return suppliers;
    return suppliers.filter((s) => (s.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): SupplierRecord | undefined {
    return getActiveStore().snapshot.suppliers.find((s) => s.id === id);
  }

  prepend(supplier: SupplierRecord): SupplierRecord {
    const snap = getActiveStore().snapshot;
    const normalized: SupplierRecord = {
      ...supplier,
      companyId: supplier.companyId || DEFAULT_COMPANY_ID,
      enabled: supplier.enabled !== false,
    };
    snap.suppliers = [normalized, ...snap.suppliers];
    void this.syncDoc(normalized);
    return normalized;
  }

  removeById(id: string): SupplierRecord | null {
    const snap = getActiveStore().snapshot;
    const idx = snap.suppliers.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const [removed] = snap.suppliers.splice(idx, 1);
    void this.deleteDoc(removed.id);
    return removed;
  }
}

export const Supplier = new SupplierModel();
export default Supplier;
