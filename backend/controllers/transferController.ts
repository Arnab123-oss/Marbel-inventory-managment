import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Product from '../models/Product.ts';
import Slab from '../models/Slab.ts';
import Transfer from '../models/Transfer.ts';
import {estimateSlabRateInr} from '../services/branchService.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {getStore, pushHistory, saveStore} from '../services/storeService.ts';
import type {StockTransfer, UnitType} from '../types/inventory.ts';

export const getTransfers = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({transfers: Transfer.findAll()});
  } catch (error) {
    console.error('Get transfers error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createTransfer = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const {itemCode, fromLocation, toLocation, quantity} = req.body as {
      itemCode?: string;
      fromLocation?: string;
      toLocation?: string;
      quantity?: number;
    };
    if (!itemCode || !fromLocation || !toLocation || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({error: 'Item, source, destination, and positive quantity are required.'});
    }
    const refItem = Product.findByCode(itemCode);
    const refSlab = !refItem ? Slab.findByLotNumber(itemCode) : undefined;
    const unit: UnitType = refItem?.unit || 'sq. ft';
    const rate = refItem
      ? refItem.unitPriceInr
      : refSlab
        ? estimateSlabRateInr(refSlab, Product.findAll())
        : 450;
    const valueCr = Number(((rate * quantity) / 10000000).toFixed(2));
    const transfer: StockTransfer = {
      id: `tr-${crypto.randomUUID().slice(0, 6)}`,
      transferCode: `TRF-2024-${Math.floor(8850 + Math.random() * 900)}`,
      itemCode: refSlab ? refSlab.lotNumber : refItem ? refItem.itemCode : itemCode,
      itemName: refSlab
        ? `${refSlab.stoneName} · ${refSlab.thicknessMm}mm`
        : refItem?.itemName || itemCode,
      fromLocation,
      toLocation,
      quantity: Math.round(quantity),
      unit,
      valueCr: Math.max(0.02, valueCr),
      status: 'In Transit',
      etaLabel: 'Dispatched just now',
    };

    Transfer.prepend(transfer);

    if (refItem) {
      pushHistory({
        itemId: refItem.id,
        itemCode: refItem.itemCode,
        type: 'Transfer',
        referenceNo: transfer.transferCode,
        quantityDelta: transfer.quantity,
        unit: transfer.unit,
        systemAfter: refItem.systemQty,
        physicalAfter: refItem.physicalQty,
        branchName: `${fromLocation} → ${toLocation}`,
        partyOrNote: `Inter-branch transfer (${transfer.status})`,
        timestampLabel: 'Just now',
      });
    } else if (refSlab) {
      pushHistory({
        itemId: refSlab.id,
        itemCode: refSlab.lotNumber,
        type: 'Transfer',
        referenceNo: transfer.transferCode,
        quantityDelta: transfer.quantity,
        unit: transfer.unit,
        systemAfter: refSlab.totalSqFt,
        physicalAfter: refSlab.totalSqFt,
        branchName: `${fromLocation} → ${toLocation}`,
        partyOrNote: `Inter-branch slab transfer (${transfer.status})`,
        timestampLabel: 'Just now',
      });
    }

    store.snapshot.kpis.stockInTransitCr = Number(
      (store.snapshot.kpis.stockInTransitCr + transfer.valueCr).toFixed(2),
    );
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({transfer, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create transfer error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
