import mongoose from 'mongoose';
import type {
  AccuracyBreakdown,
  KpiMetrics,
  StockStatusBreakdown,
  TrendPoint,
} from '../types/inventory.ts';

export interface InventoryMetaDoc {
  key: string;
  domainVersion: string;
  dateRange: string;
  lastUpdatedAt: string;
  crossBranchSeedApplied?: boolean;
  kpis: KpiMetrics;
  accuracyBreakdown: AccuracyBreakdown;
  stockStatus: StockStatusBreakdown;
  trends: TrendPoint[];
}

const trendPointSchema = new mongoose.Schema<TrendPoint>(
  {
    date: {type: String, required: true},
    valueCr: {type: Number, required: true},
    accuracyPct: {type: Number, required: true},
  },
  {_id: false},
);

export const inventoryMetaSchema = new mongoose.Schema<InventoryMetaDoc>(
  {
    key: {type: String, required: true, unique: true, index: true},
    domainVersion: {type: String, required: true},
    dateRange: {type: String, required: true},
    lastUpdatedAt: {type: String, required: true},
    crossBranchSeedApplied: {type: Boolean, default: true},
    kpis: {type: mongoose.Schema.Types.Mixed, required: true},
    accuracyBreakdown: {type: mongoose.Schema.Types.Mixed, required: true},
    stockStatus: {type: mongoose.Schema.Types.Mixed, required: true},
    trends: {type: [trendPointSchema], default: []},
  },
  {timestamps: true},
);

export const InventoryMetaDocModel =
  (mongoose.models.InventoryMeta as mongoose.Model<InventoryMetaDoc>) ||
  mongoose.model<InventoryMetaDoc>('InventoryMeta', inventoryMetaSchema);

export default InventoryMetaDocModel;
