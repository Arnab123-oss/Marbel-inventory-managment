import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {InventoryAlert} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const alertSchema = new mongoose.Schema<InventoryAlert>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    severity: {type: String, enum: ['critical', 'warning', 'info'], required: true},
    title: {type: String, required: true},
    locationName: {type: String, required: true},
    itemCode: {type: String, required: false},
    timestampLabel: {type: String, required: true},
    createdAt: {type: String, required: true},
    acknowledged: {type: Boolean, default: false},
  },
  {timestamps: true},
);

alertSchema.index({companyId: 1, acknowledged: 1, createdAt: -1});

export const AlertDocModel =
  (mongoose.models.Alert as mongoose.Model<InventoryAlert>) ||
  mongoose.model<InventoryAlert>('Alert', alertSchema);

class AlertModel extends MongooseRepositoryBase<InventoryAlert> {
  constructor() {
    super('Alert', AlertDocModel);
  }

  findAll(companyId?: string): InventoryAlert[] {
    const alerts = getActiveStore().snapshot.alerts;
    if (!companyId) return alerts;
    return alerts.filter((a) => (a.companyId || DEFAULT_COMPANY_ID) === companyId);
  }

  findById(id: string): InventoryAlert | undefined {
    return getActiveStore().snapshot.alerts.find((a) => a.id === id);
  }

  prepend(alert: InventoryAlert, maxCount = 12): InventoryAlert {
    const snap = getActiveStore().snapshot;
    const normalized: InventoryAlert = {
      ...alert,
      companyId: alert.companyId || DEFAULT_COMPANY_ID,
    };
    snap.alerts = [normalized, ...snap.alerts].slice(0, maxCount);
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const Alert = new AlertModel();
export default Alert;
