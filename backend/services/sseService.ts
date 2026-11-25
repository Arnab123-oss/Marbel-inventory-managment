import type {Response} from 'express';
import {syncLocationsFromLedger} from './branchService.ts';
import {getStore} from './storeService.ts';

export const sseClients = new Set<Response>();

export function broadcastSnapshot(): void {
  const store = getStore();
  const payload = `data: ${JSON.stringify(store.snapshot)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

let syncTimer: NodeJS.Timeout | null = null;

export function startSnapshotSyncLoop(): void {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    const store = getStore();
    syncLocationsFromLedger(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();

    if (sseClients.size > 0) {
      broadcastSnapshot();
    }
  }, 5000);
}
