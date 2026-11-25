import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {CustomerRecord} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const customerSchema = new mongoose.Schema<CustomerRecord>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    branchId: {type: String, required: false, index: true},
    name: {type: String, required: true, trim: true},
    segment: {type: String, enum: ['Architect', 'Builder', 'Contractor', 'Retail'], required: true},
    phone: {type: String, required: true},
    email: {type: String, required: false, trim: true, lowercase: true},
    address: {type: String, required: false, trim: true},
    gstin: {type: String, required: false, trim: true, uppercase: true},
    city: {type: String, required: true},
    totalPurchasedInr: {type: Number, default: 0, min: 0},
    outstandingInr: {type: Number, default: 0, min: 0},
    totalPurchasedPaise: {type: Number, required: false, min: 0},
    outstandingPaise: {type: Number, required: false, min: 0},
    lastOrderLabel: {type: String, required: true},
    enabled: {type: Boolean, default: true},
  },
  {timestamps: true},
);

customerSchema.index({companyId: 1, name: 1});
customerSchema.index({companyId: 1, phone: 1});

export const CustomerDocModel =
  (mongoose.models.Customer as mongoose.Model<CustomerRecord>) ||
  mongoose.model<CustomerRecord>('Customer', customerSchema);

class CustomerModel extends MongooseRepositoryBase<CustomerRecord> {
  constructor() {
    super('Customer', CustomerDocModel);
  }

  findAll(companyId?: string): CustomerRecord[] {
    const customers = getActiveStore().snapshot.customers;
    if (!companyId) return customers;
    return customers.filter((c) => (c.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): CustomerRecord | undefined {
    return getActiveStore().snapshot.customers.find((c) => c.id === id);
  }

  prepend(customer: CustomerRecord): CustomerRecord {
    const snap = getActiveStore().snapshot;
    const normalized: CustomerRecord = {
      ...customer,
      companyId: customer.companyId || DEFAULT_COMPANY_ID,
      enabled: customer.enabled !== false,
    };
    snap.customers = [normalized, ...snap.customers];
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const Customer = new CustomerModel();
export default Customer;
