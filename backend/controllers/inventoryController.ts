import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import {getDbHealth} from '../config/db.ts';
import Alert from '../models/Alert.ts';
import Product from '../models/Product.ts';
import {broadcastSnapshot, sseClients} from '../services/sseService.ts';
import {
  getStore,
  pushHistory,
  recomputeItemMetrics,
  saveStore,
} from '../services/storeService.ts';
import type {InventoryAlert} from '../types/inventory.ts';

export const getHealth = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({
      ok: true,
      service: 'stonepulse-backend',
      database: getDbHealth(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const getSnapshot = async (_req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(getStore().snapshot);
  } catch (error) {
    console.error('Get snapshot error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const streamInventory = async (req: Request, res: Response) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify(getStore().snapshot)}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  } catch (error) {
    console.error('Stream inventory error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createAdjustment = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const {itemId, newPhysicalQty, reason} = req.body as {
      itemId?: string;
      newPhysicalQty?: number;
      reason?: string;
    };
    if (!itemId || typeof newPhysicalQty !== 'number' || newPhysicalQty < 0) {
      return res
        .status(400)
        .json({error: 'Valid itemId and non-negative newPhysicalQty are required.'});
    }
    const item = Product.findById(itemId);
    if (!item) {
      return res.status(404).json({error: 'Inventory item not found.'});
    }

    const prevPhysical = item.physicalQty;
    item.physicalQty = Math.round(newPhysicalQty);
    recomputeItemMetrics(item);
    item.lastCountedAt = 'Reconciled just now';

    pushHistory({
      itemId: item.id,
      itemCode: item.itemCode,
      type: 'Adjustment',
      referenceNo: `ADJ-${Math.floor(1000 + Math.random() * 8999)}`,
      quantityDelta: item.physicalQty - prevPhysical,
      unit: item.unit,
      systemAfter: item.systemQty,
      physicalAfter: item.physicalQty,
      branchName: item.locationName,
      partyOrNote: reason?.trim() || 'Physical yard stock count adjustment',
      timestampLabel: 'Just now',
    });

    const newAlert: InventoryAlert = {
      id: `alt-${crypto.randomUUID().slice(0, 6)}`,
      severity: 'info',
      title: `Count reconciled for ${item.itemName} (${item.physicalQty.toLocaleString('en-IN')} ${item.unit}) at ${item.locationName}${reason ? ` — ${reason}` : ''}`,
      locationName: item.locationName,
      itemCode: item.itemCode,
      timestampLabel: 'Just now',
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };
    Alert.prepend(newAlert, 12);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();

    return res.status(200).json({item, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create adjustment error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const acknowledgeAlert = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const alert = Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({error: 'Alert not found.'});
    }
    alert.acknowledged = !alert.acknowledged;
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({alert, snapshot: store.snapshot});
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
