import type mongoose from 'mongoose';
import {isMongoConnected} from '../config/db.ts';
import {AlertDocModel} from '../models/Alert.ts';
import {BranchDocModel} from '../models/Branch.ts';
import {CustomerDocModel} from '../models/Customer.ts';
import {HistoryDocModel} from '../models/History.ts';
import {InventoryMetaDocModel} from '../models/InventoryMeta.ts';
import {LayoutDocModel} from '../models/Layout.ts';
import {ProductDocModel} from '../models/Product.ts';
import {PurchaseBillDocModel} from '../models/PurchaseBill.ts';
import {PurchaseReturnDocModel} from '../models/PurchaseReturn.ts';
import {SalesBillDocModel} from '../models/SalesBill.ts';
import {SlabDocModel} from '../models/Slab.ts';
import {SupplierDocModel} from '../models/Supplier.ts';
import {TransferDocModel} from '../models/Transfer.ts';
import {UserDocModel} from '../models/User.ts';
import type {StoreSchema} from '../types/inventory.ts';
import {syncLocationsFromLedger, syncSuppliersFromPurchaseBills} from './branchService.ts';
import {getActiveStore, writeLocalStoreFile} from './storeState.ts';

async function replaceCollectionDocs<T extends {id: string}>(
  model: mongoose.Model<T>,
  docs: T[],
): Promise<void> {
  if (!docs || docs.length === 0) {
    await model.deleteMany({});
    return;
  }
  const bulkOps = docs.map((doc) => ({
    replaceOne: {
      filter: {id: doc.id},
      replacement: {...doc},
      upsert: true,
    },
  }));
  await model.bulkWrite(bulkOps as Parameters<typeof model.bulkWrite>[0]);
  const ids = docs.map((d) => d.id);
  await model.deleteMany({id: {$nin: ids}});
}

export async function syncStoreToMongo(store: StoreSchema): Promise<void> {
  if (!isMongoConnected()) return;

  try {
    const {snapshot, users, layouts} = store;

    await Promise.all([
      InventoryMetaDocModel.findOneAndUpdate(
        {key: 'primary'},
        {
          $set: {
            key: 'primary',
            domainVersion: snapshot.domainVersion,
            dateRange: snapshot.dateRange,
            lastUpdatedAt: snapshot.lastUpdatedAt,
            crossBranchSeedApplied: snapshot.crossBranchSeedApplied ?? true,
            kpis: snapshot.kpis,
            accuracyBreakdown: snapshot.accuracyBreakdown,
            stockStatus: snapshot.stockStatus,
            trends: snapshot.trends,
          },
        },
        {upsert: true, new: true},
      ),
      replaceCollectionDocs(UserDocModel, Object.values(users)),
      (async () => {
        const entries = Object.entries(layouts);
        if (entries.length > 0) {
          await Promise.all(
            entries.map(([userId, layout]) =>
              LayoutDocModel.findOneAndUpdate(
                {userId},
                {$set: {userId, ...layout}},
                {upsert: true, new: true},
              ),
            ),
          );
        }
      })(),
      replaceCollectionDocs(BranchDocModel, snapshot.locations),
      replaceCollectionDocs(ProductDocModel, snapshot.varianceItems),
      replaceCollectionDocs(SlabDocModel, snapshot.slabs),
      replaceCollectionDocs(PurchaseBillDocModel, snapshot.purchaseBills),
      replaceCollectionDocs(PurchaseReturnDocModel, snapshot.purchaseReturns || []),
      replaceCollectionDocs(SalesBillDocModel, snapshot.salesBills),
      replaceCollectionDocs(CustomerDocModel, snapshot.customers),
      replaceCollectionDocs(SupplierDocModel, snapshot.suppliers),
      replaceCollectionDocs(TransferDocModel, snapshot.transfers),
      replaceCollectionDocs(AlertDocModel, snapshot.alerts),
      replaceCollectionDocs(HistoryDocModel, snapshot.history || []),
    ]);
  } catch (err) {
    console.warn('MongoDB Atlas sync deferred:', err);
  }
}

export async function hydrateStoreFromMongo(): Promise<void> {
  if (!isMongoConnected()) return;

  const store = getActiveStore();
  try {
    const existingMeta = await InventoryMetaDocModel.findOne({key: 'primary'}).lean();
    if (!existingMeta) {
      await syncStoreToMongo(store);
      console.log('Seeded initial StonePulse collections to MongoDB Atlas.');
      return;
    }

    const [
      usersDocs,
      layoutsDocs,
      branches,
      products,
      slabs,
      purchaseBills,
      purchaseReturns,
      salesBills,
      customers,
      suppliers,
      transfers,
      alerts,
      history,
    ] = await Promise.all([
      UserDocModel.find({}).lean(),
      LayoutDocModel.find({}).lean(),
      BranchDocModel.find({}).lean(),
      ProductDocModel.find({}).lean(),
      SlabDocModel.find({}).lean(),
      PurchaseBillDocModel.find({}).lean(),
      PurchaseReturnDocModel.find({}).lean(),
      SalesBillDocModel.find({}).lean(),
      CustomerDocModel.find({}).lean(),
      SupplierDocModel.find({}).lean(),
      TransferDocModel.find({}).lean(),
      AlertDocModel.find({}).lean(),
      HistoryDocModel.find({}).lean(),
    ]);

    if (usersDocs.length > 0) {
      store.users = Object.fromEntries(usersDocs.map((u) => [u.id, u]));
    }
    if (layoutsDocs.length > 0) {
      store.layouts = Object.fromEntries(
        layoutsDocs.map((l) => [
          l.userId,
          {
            kpiOrder: l.kpiOrder,
            widgetOrder: l.widgetOrder,
            widgetSpans: l.widgetSpans,
            updatedAt: l.updatedAt,
          },
        ]),
      );
    }

    store.snapshot = {
      domainVersion: existingMeta.domainVersion,
      dateRange: existingMeta.dateRange,
      lastUpdatedAt: existingMeta.lastUpdatedAt,
      crossBranchSeedApplied: existingMeta.crossBranchSeedApplied,
      kpis: existingMeta.kpis,
      accuracyBreakdown: existingMeta.accuracyBreakdown,
      stockStatus: existingMeta.stockStatus,
      trends: existingMeta.trends,
      locations: branches.length > 0 ? branches : store.snapshot.locations,
      varianceItems: products,
      slabs,
      purchaseBills,
      purchaseReturns,
      salesBills,
      customers,
      suppliers,
      transfers,
      alerts,
      history,
    };

    syncSuppliersFromPurchaseBills(store.snapshot);
    syncLocationsFromLedger(store.snapshot);
    writeLocalStoreFile(store);
    console.log('Hydrated StonePulse ledger from MongoDB Atlas.');
  } catch (err) {
    console.warn('MongoDB Atlas hydration deferred:', err);
  }
}
