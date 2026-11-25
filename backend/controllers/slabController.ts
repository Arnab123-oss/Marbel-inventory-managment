import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Branch from '../models/Branch.ts';
import Slab from '../models/Slab.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {sanitizeSafeImageUrl} from '../services/storageService.ts';
import {getStore, pushHistory, saveStore} from '../services/storeService.ts';
import type {SlabLot} from '../types/inventory.ts';

export const getSlabs = async (_req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({slabs: Slab.findAll()});
  } catch (error) {
    console.error('Get slabs error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createSlab = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const {
      lotNumber,
      stoneName,
      category,
      dimensionsFt,
      slabCountPcs,
      totalSqFt,
      thicknessMm,
      branchName,
      finish,
      status,
      imageUrl,
    } = req.body as Partial<SlabLot>;
    if (!stoneName?.trim() || !totalSqFt || totalSqFt <= 0 || !branchName) {
      return res.status(400).json({error: 'Product name, area (sq. ft), and branch are required.'});
    }

    const existingSlabs = Slab.findAll();
    let resolvedLotNumber = lotNumber?.trim().toUpperCase();
    if (!resolvedLotNumber) {
      let nextIdx = existingSlabs.length + 1;
      while (
        existingSlabs.some(
          (s) => s.lotNumber.toUpperCase() === `SL-${String(nextIdx).padStart(3, '0')}`,
        )
      ) {
        nextIdx += 1;
      }
      resolvedLotNumber = `SL-${String(nextIdx).padStart(3, '0')}`;
    } else if (existingSlabs.some((s) => s.lotNumber.toUpperCase() === resolvedLotNumber)) {
      return res.status(409).json({
        error: `Slab ID ${resolvedLotNumber} already exists. Please use a unique Slab ID.`,
      });
    }

    const normalizedStatus: SlabLot['status'] =
      status === 'Out of Stock' ? 'Out of Stock' : 'In Stock';

    const slab: SlabLot = {
      id: `slb-${crypto.randomUUID().slice(0, 6)}`,
      lotNumber: resolvedLotNumber,
      stoneName: stoneName.trim(),
      category: category || 'Marble',
      dimensionsFt: dimensionsFt?.trim() || '10 × 5 ft',
      slabCountPcs: Math.max(1, Math.round(slabCountPcs || 1)),
      systemSqFt: normalizedStatus === 'Out of Stock' ? 0 : Number(Number(totalSqFt).toFixed(2)),
      totalSqFt: Number(Number(totalSqFt).toFixed(2)),
      thicknessMm: Math.max(1, Math.round(Number(thicknessMm) || 18)),
      branchName,
      finish: finish || 'Polished',
      status: normalizedStatus,
      stockedDateIso: new Date().toISOString().slice(0, 10),
      imageUrl: sanitizeSafeImageUrl(imageUrl),
      enabled: true,
    };

    Slab.prepend(slab);
    const loc = Branch.findByName(branchName);
    if (loc && normalizedStatus === 'In Stock') {
      loc.sqftQty += slab.totalSqFt;
      loc.pcsQty += slab.slabCountPcs;
    }

    pushHistory({
      itemId: slab.id,
      itemCode: slab.lotNumber,
      type: 'Purchase',
      referenceNo: slab.lotNumber,
      quantityDelta: slab.totalSqFt,
      unit: 'sq. ft',
      systemAfter: slab.totalSqFt,
      physicalAfter: normalizedStatus === 'Out of Stock' ? 0 : slab.totalSqFt,
      branchName: slab.branchName,
      partyOrNote: `Registered slab ${slab.lotNumber} (${slab.stoneName} ${slab.dimensionsFt} · ${slab.status})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({slab, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create slab error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const updateSlab = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const slab = Slab.findById(req.params.id);
    if (!slab) {
      return res.status(404).json({error: 'Slab record not found.'});
    }
    const {
      stoneName,
      category,
      dimensionsFt,
      slabCountPcs,
      totalSqFt,
      thicknessMm,
      branchName,
      finish,
      status,
      imageUrl,
      enabled,
    } = req.body as Partial<SlabLot>;

    if (stoneName?.trim()) slab.stoneName = stoneName.trim();
    if (category) slab.category = category;
    if (dimensionsFt?.trim()) slab.dimensionsFt = dimensionsFt.trim();
    if (typeof slabCountPcs === 'number' && slabCountPcs > 0) {
      slab.slabCountPcs = Math.round(slabCountPcs);
    }
    if (typeof totalSqFt === 'number' && totalSqFt > 0) {
      slab.totalSqFt = Number(totalSqFt.toFixed(2));
    }
    if (typeof thicknessMm === 'number' && thicknessMm > 0) {
      slab.thicknessMm = Math.round(thicknessMm);
    }
    if (branchName?.trim()) slab.branchName = branchName.trim();
    if (finish) slab.finish = finish;
    if (status === 'In Stock' || status === 'Out of Stock') slab.status = status;
    if (imageUrl !== undefined) slab.imageUrl = sanitizeSafeImageUrl(imageUrl);
    if (typeof enabled === 'boolean') slab.enabled = enabled;

    pushHistory({
      itemId: slab.id,
      itemCode: slab.lotNumber,
      type: slab.status === 'Out of Stock' ? 'Sale' : 'Adjustment',
      referenceNo: `SLB-${slab.lotNumber}`,
      quantityDelta: 0,
      unit: 'sq. ft',
      systemAfter: slab.totalSqFt,
      physicalAfter: slab.status === 'Out of Stock' ? 0 : slab.totalSqFt,
      branchName: slab.branchName,
      partyOrNote: `Slab updated (${slab.stoneName} · ${slab.dimensionsFt} · Status: ${slab.status})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({slab, snapshot: store.snapshot});
  } catch (error) {
    console.error('Update slab error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const toggleSlab = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const slab = Slab.findById(req.params.id);
    if (!slab) {
      return res.status(404).json({error: 'Slab record not found.'});
    }
    const nextEnabled = slab.enabled === false;
    slab.enabled = nextEnabled;

    pushHistory({
      itemId: slab.id,
      itemCode: slab.lotNumber,
      type: 'Adjustment',
      referenceNo: `${nextEnabled ? 'ENB' : 'DSB'}-${slab.lotNumber}`,
      quantityDelta: 0,
      unit: 'sq. ft',
      systemAfter: slab.totalSqFt,
      physicalAfter: slab.status === 'Out of Stock' ? 0 : slab.totalSqFt,
      branchName: slab.branchName,
      partyOrNote: `Slab ${nextEnabled ? 'enabled' : 'disabled'} in register`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({slab, snapshot: store.snapshot});
  } catch (error) {
    console.error('Toggle slab error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const deleteSlab = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const removed = Slab.removeById(req.params.id);
    if (!removed) {
      return res.status(404).json({error: 'Slab record not found.'});
    }
    const loc = Branch.findByName(removed.branchName);
    if (loc && removed.status === 'In Stock') {
      loc.sqftQty = Math.max(0, loc.sqftQty - removed.totalSqFt);
      loc.pcsQty = Math.max(0, loc.pcsQty - removed.slabCountPcs);
    }

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({
      deletedId: removed.id,
      lotNumber: removed.lotNumber,
      snapshot: store.snapshot,
    });
  } catch (error) {
    console.error('Delete slab error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
