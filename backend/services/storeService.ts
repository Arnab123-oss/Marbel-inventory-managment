import crypto from 'node:crypto';
import fs from 'node:fs';
import {DATA_DIR, STORE_PATH} from '../config/db.ts';
import type {
  ProductHistoryEntry,
  StoreSchema,
  StoredUser,
  UserProfile,
  VarianceItem,
} from '../types/inventory.ts';
import {syncLocationsFromLedger, syncSuppliersFromPurchaseBills} from './branchService.ts';
import {
  computeSalesBillStatusServer,
  formatInvoiceNoServer,
  formatPurchaseBillNoServer,
  normalizeSalesItemStatusServer,
  parseDateLabelToIsoServer,
} from './dateService.ts';
import {hydrateStoreFromMongo, syncStoreToMongo} from './mongoSyncService.ts';
import {
  buildInitialSnapshot,
  createDefaultLayout,
  DOMAIN_VERSION,
  ensureCrossBranchTrendingBillsServer,
  ensureStockedDatesServer,
  migrateUnifiedSlabs,
  sanitizeLayoutServer,
} from './seedService.ts';
import {getActiveStore, setActiveStore, writeLocalStoreFile} from './storeState.ts';

export function hashPassword(password: string, existingSalt?: string): {salt: string; hash: string} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return {salt, hash};
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const {hash} = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function sanitizeUser(u: StoredUser): UserProfile {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    initials: u.initials,
    role: u.role,
    facilityScope: u.facilityScope,
  };
}

function loadStoreFromDisk(): StoreSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }

  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StoreSchema;
      if (parsed && parsed.users && parsed.snapshot && parsed.layouts) {
        if (parsed.snapshot.domainVersion !== DOMAIN_VERSION) {
          parsed.snapshot = buildInitialSnapshot();
          for (const uid of Object.keys(parsed.layouts)) {
            parsed.layouts[uid] = createDefaultLayout();
          }
          for (const u of Object.values(parsed.users)) {
            u.facilityScope = 'All 7 Marble Showrooms, Yards & Depots';
          }
          fs.writeFileSync(STORE_PATH, JSON.stringify(parsed, null, 2));
        } else if (Array.isArray(parsed.snapshot.slabs)) {
          let migratedSlabs = false;
          for (const s of parsed.snapshot.slabs) {
            const rawStatus = s.status as string;
            if (rawStatus !== 'In Stock' && rawStatus !== 'Out of Stock') {
              s.status = rawStatus === 'Sold' ? 'Out of Stock' : 'In Stock';
              migratedSlabs = true;
            }
            if (s.enabled === undefined) {
              s.enabled = true;
              migratedSlabs = true;
            }
          }
          if (Array.isArray(parsed.snapshot.purchaseBills)) {
            for (const b of parsed.snapshot.purchaseBills) {
              if (!b.dateIso) {
                b.dateIso = parseDateLabelToIsoServer(b.dateLabel);
                migratedSlabs = true;
              }
              if (!/^PB-\d{2}-\d{4}-.+$/i.test(b.billNo)) {
                b.billNo = formatPurchaseBillNoServer(b.billNo, b.dateIso, b.dateLabel);
                migratedSlabs = true;
              }
              if (!Array.isArray(b.items) || b.items.length === 0) {
                b.items = [
                  {
                    id: `pbi-${b.id}`,
                    itemCode: '',
                    itemName: b.itemSummary,
                    dimensions: 'Standard',
                    qty: b.qty,
                    unit: b.unit,
                    amountInr: b.totalInr,
                  },
                ];
                migratedSlabs = true;
              }
            }
          }
          if (Array.isArray(parsed.snapshot.salesBills)) {
            for (const sb of parsed.snapshot.salesBills) {
              const normalizedSbStatus = normalizeSalesItemStatusServer(sb.status as string);
              if (sb.status !== normalizedSbStatus) {
                sb.status = normalizedSbStatus;
                migratedSlabs = true;
              }
              if (!sb.dateIso) {
                sb.dateIso = parseDateLabelToIsoServer(sb.dateLabel);
                migratedSlabs = true;
              }
              if (!/^INV-.+$/i.test(sb.invoiceNo)) {
                sb.invoiceNo = formatInvoiceNoServer(sb.invoiceNo);
                migratedSlabs = true;
              }
              if (sb.customerPhone === undefined) {
                const matchedCust = parsed.snapshot.customers?.find(
                  (c) => c.name.toLowerCase() === sb.customerName.toLowerCase(),
                );
                sb.customerPhone = matchedCust?.phone || '';
                migratedSlabs = true;
              }
              if (sb.customerAddress === undefined) {
                const matchedCust = parsed.snapshot.customers?.find(
                  (c) => c.name.toLowerCase() === sb.customerName.toLowerCase(),
                );
                sb.customerAddress = matchedCust?.city ? `${matchedCust.city}, Maharashtra` : '';
                migratedSlabs = true;
              }
              if (!Array.isArray(sb.items) || sb.items.length === 0) {
                sb.items = [
                  {
                    id: `sbi-${sb.id}`,
                    itemCode: '',
                    itemName: sb.itemSummary,
                    dimensions: 'Standard',
                    qty: sb.qty,
                    unit: sb.unit,
                    amountInr: sb.totalInr,
                    status: normalizedSbStatus,
                  },
                ];
                migratedSlabs = true;
              } else {
                const recomputed = computeSalesBillStatusServer(sb.items);
                if (sb.status !== recomputed) {
                  sb.status = recomputed;
                  migratedSlabs = true;
                }
              }
            }
          }
          if (!Array.isArray(parsed.snapshot.purchaseReturns)) {
            parsed.snapshot.purchaseReturns = [];
            migratedSlabs = true;
          }
          if (!Array.isArray(parsed.snapshot.salesReturns)) {
            parsed.snapshot.salesReturns = [];
            migratedSlabs = true;
          }
          if (migrateUnifiedSlabs(parsed.snapshot)) {
            migratedSlabs = true;
          }
          if (ensureStockedDatesServer(parsed.snapshot)) {
            migratedSlabs = true;
          }
          if (ensureCrossBranchTrendingBillsServer(parsed.snapshot)) {
            migratedSlabs = true;
          }
          if (syncSuppliersFromPurchaseBills(parsed.snapshot)) {
            migratedSlabs = true;
          }
          if (syncLocationsFromLedger(parsed.snapshot)) {
            migratedSlabs = true;
          }
          for (const uid of Object.keys(parsed.layouts)) {
            const {layout: sanitized, changed} = sanitizeLayoutServer(parsed.layouts[uid]);
            if (changed) {
              parsed.layouts[uid] = sanitized;
              migratedSlabs = true;
            }
          }
          if (migratedSlabs) {
            fs.writeFileSync(STORE_PATH, JSON.stringify(parsed, null, 2));
          }
        }
        return parsed;
      }
    } catch {
      // Fall through to re-seed on corrupted JSON
    }
  }

  const demoUserId = 'usr-demo-st';
  const {salt, hash} = hashPassword('password123');
  const initialStore: StoreSchema = {
    users: {
      [demoUserId]: {
        id: demoUserId,
        name: 'Siddharth Thakur',
        email: 'siddharth.thakur@marble-ops.com',
        initials: 'ST',
        role: 'Showroom & Yard Ops Lead',
        facilityScope: 'All 7 Marble Showrooms, Yards & Depots',
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      },
    },
    layouts: {
      [demoUserId]: createDefaultLayout(),
    },
    snapshot: buildInitialSnapshot(),
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  return initialStore;
}

setActiveStore(loadStoreFromDisk());

export async function initializeStorePersistence(): Promise<void> {
  await hydrateStoreFromMongo();
}

export function getStore(): StoreSchema {
  return getActiveStore();
}

export function saveStore(): void {
  try {
    const storeState = getActiveStore();
    syncLocationsFromLedger(storeState.snapshot);
    writeLocalStoreFile(storeState);
    void syncStoreToMongo(storeState);
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

export function recomputeItemMetrics(item: VarianceItem): void {
  item.variance = item.physicalQty - item.systemQty;
  item.variancePct =
    item.systemQty > 0
      ? Number(((item.variance / item.systemQty) * 100).toFixed(2))
      : item.physicalQty > 0
        ? 100
        : 0;
  if (item.physicalQty === 0) {
    item.status = 'Out of Stock';
  } else if (item.variancePct < -2.5) {
    item.status = 'Low Stock';
  } else if (item.variancePct > 3.5) {
    item.status = 'Overstock';
  } else {
    item.status = 'In Stock';
  }
}

export function pushHistory(entry: Omit<ProductHistoryEntry, 'id'>): void {
  const storeState = getActiveStore();
  const record: ProductHistoryEntry = {
    id: `hist-${crypto.randomUUID().slice(0, 6)}`,
    ...entry,
  };
  storeState.snapshot.history = [record, ...(storeState.snapshot.history || [])].slice(0, 120);
}
