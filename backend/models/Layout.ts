import mongoose from 'mongoose';
import {isMongoConnected} from '../config/db.ts';
import {getActiveStore} from '../services/storeState.ts';
import type {DashboardLayout} from '../types/inventory.ts';

export interface StoredLayoutDoc extends DashboardLayout {
  userId: string;
}

export const layoutSchema = new mongoose.Schema<StoredLayoutDoc>(
  {
    userId: {type: String, required: true, unique: true, index: true},
    kpiOrder: {type: [String], required: true},
    widgetOrder: {type: [String], required: true},
    widgetSpans: {type: mongoose.Schema.Types.Mixed, required: true},
    updatedAt: {type: String, required: true},
  },
  {timestamps: true},
);

export const LayoutDocModel =
  (mongoose.models.Layout as mongoose.Model<StoredLayoutDoc>) ||
  mongoose.model<StoredLayoutDoc>('Layout', layoutSchema);

class LayoutModel {
  readonly mongoModel = LayoutDocModel;

  findByUserId(userId: string): DashboardLayout | undefined {
    return getActiveStore().layouts[userId];
  }

  upsertByUserId(userId: string, layout: DashboardLayout): DashboardLayout {
    getActiveStore().layouts[userId] = layout;
    if (isMongoConnected()) {
      void this.mongoModel
        .findOneAndUpdate(
          {userId},
          {$set: {userId, ...layout}},
          {upsert: true, new: true},
        )
        .catch((err) => console.warn(`MongoDB sync skipped for Layout/${userId}:`, err));
    }
    return layout;
  }
}

export const Layout = new LayoutModel();
export default Layout;
