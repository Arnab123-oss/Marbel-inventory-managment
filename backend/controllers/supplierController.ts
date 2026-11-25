import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Supplier from '../models/Supplier.ts';
import {syncSuppliersFromPurchaseBills} from '../services/branchService.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {getStore, saveStore} from '../services/storeService.ts';
import type {SupplierRecord} from '../types/inventory.ts';

export const getSuppliers = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({suppliers: Supplier.findAll()});
  } catch (error) {
    console.error('Get suppliers error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const {name, origin, specialty, phone} = req.body as Partial<SupplierRecord>;
    if (!name?.trim() || !origin?.trim()) {
      return res.status(400).json({error: 'Supplier name and origin are required.'});
    }
    const supplier: SupplierRecord = {
      id: `sup-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      origin: origin.trim(),
      specialty: specialty?.trim() || 'Marble & Granite Slabs (sq. ft)',
      phone: phone?.trim() || '+91 98000 00000',
      totalSuppliedInr: 0,
      payableInr: 0,
      lastDeliveryLabel: 'New',
    };
    Supplier.prepend(supplier);
    syncSuppliersFromPurchaseBills(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({supplier, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create supplier error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const supplier = Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({error: 'Supplier not found.'});
    }
    const {name, origin, specialty, phone} = req.body as Partial<SupplierRecord>;
    if (!name?.trim() || !origin?.trim()) {
      return res.status(400).json({error: 'Supplier name and origin are required.'});
    }

    const oldName = supplier.name.trim().toLowerCase();
    const newName = name.trim();
    supplier.name = newName;
    supplier.origin = origin.trim();
    supplier.specialty = specialty?.trim() || supplier.specialty;
    supplier.phone = phone?.trim() || '';

    if (oldName !== newName.toLowerCase()) {
      for (const bill of store.snapshot.purchaseBills) {
        if (bill.supplierName.trim().toLowerCase() === oldName) {
          bill.supplierName = newName;
        }
      }
    }

    syncSuppliersFromPurchaseBills(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({supplier, snapshot: store.snapshot});
  } catch (error) {
    console.error('Update supplier error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const deleteSupplier = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const removed = Supplier.removeById(req.params.id);
    if (!removed) {
      return res.status(404).json({error: 'Supplier not found.'});
    }
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({
      deletedId: removed.id,
      name: removed.name,
      snapshot: store.snapshot,
    });
  } catch (error) {
    console.error('Delete supplier error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
