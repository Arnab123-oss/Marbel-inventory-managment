import fs from 'node:fs';
import {STORE_PATH} from '../config/db.ts';
import type {StoreSchema} from '../types/inventory.ts';

let activeStore: StoreSchema | null = null;

export function getActiveStore(): StoreSchema {
  if (!activeStore) {
    throw new Error('Store state has not been initialized yet.');
  }
  return activeStore;
}

export function setActiveStore(store: StoreSchema): void {
  activeStore = store;
}

export function writeLocalStoreFile(store: StoreSchema): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}
