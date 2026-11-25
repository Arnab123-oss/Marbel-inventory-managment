import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Branch from '../models/Branch.ts';
import History from '../models/History.ts';
import Product from '../models/Product.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {sanitizeSafeImageUrl} from '../services/storageService.ts';
import {getStore, pushHistory, saveStore} from '../services/storeService.ts';
import type {StoneCategory, UnitType, VarianceItem} from '../types/inventory.ts';

export const getProducts = async (_req: Request, res: Response) => {
  try {
    const products = Product.findAll().filter((p) => p.enabled !== false);
    const enriched = products.map((product) => ({
      ...product,
      branch: Branch.findById(product.locationId) || null,
    }));
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({products: enriched});
  } catch (error) {
    console.error('Get products error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const {id} = req.params;
    if (!id) {
      return res.status(400).json({error: 'Product ID is required'});
    }
    const product = Product.findById(id);
    if (!product) {
      return res.status(404).json({error: 'Product not found'});
    }
    const history = History.findAll().filter((h) => h.itemId === product.id);
    return res.status(200).json({
      product: {
        ...product,
        branch: Branch.findById(product.locationId) || null,
        history,
      },
    });
  } catch (error) {
    console.error('Get product details error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const {
      itemCode,
      itemName,
      dimensions,
      category,
      finish,
      thickness,
      locationId,
      unit,
      qty,
      unitPriceInr,
      imageUrl,
    } = req.body as {
      itemCode?: string;
      itemName?: string;
      dimensions?: string;
      category?: StoneCategory;
      finish?: VarianceItem['finish'];
      thickness?: string;
      locationId?: string;
      unit?: UnitType;
      qty?: number;
      unitPriceInr?: number;
      imageUrl?: string;
    };

    if (
      !itemCode?.trim() ||
      !itemName?.trim() ||
      !dimensions?.trim() ||
      !locationId ||
      !unit ||
      qty === undefined ||
      qty < 0
    ) {
      return res
        .status(400)
        .json({error: 'Item code, name, dimensions, branch, unit, and quantity are required.'});
    }

    const loc = Branch.findById(locationId);
    if (!loc) {
      return res.status(404).json({error: 'Branch not found.'});
    }

    const normalizedDim = dimensions.trim();
    const normalizedName = itemName.trim();
    const duplicate = Product.findAll().find(
      (i) =>
        i.locationId === loc.id &&
        i.itemName.toLowerCase() === normalizedName.toLowerCase() &&
        i.dimensions.toLowerCase() === normalizedDim.toLowerCase(),
    );
    if (duplicate) {
      return res.status(409).json({
        error: `${normalizedName} (${normalizedDim}) already exists at ${loc.name}. Use a different dimension or branch.`,
      });
    }

    const newItem: VarianceItem = {
      id: `var-${crypto.randomUUID().slice(0, 6)}`,
      itemCode: itemCode.trim().toUpperCase(),
      itemName: normalizedName,
      dimensions: normalizedDim,
      category: category || 'Marble',
      finish: finish || 'Polished',
      thickness: thickness || '18 mm',
      locationId: loc.id,
      locationName: loc.name,
      unit,
      systemQty: Math.round(qty),
      physicalQty: Math.round(qty),
      variance: 0,
      variancePct: 0,
      unitPriceInr: unitPriceInr || 450,
      status: qty === 0 ? 'Out of Stock' : 'In Stock',
      lastCountedAt: 'Added just now',
      stockedDateIso: new Date().toISOString().slice(0, 10),
      imageUrl: sanitizeSafeImageUrl(imageUrl),
      enabled: true,
    };

    Product.prepend(newItem);
    loc.totalItems += 1;
    if (unit === 'sq. ft') loc.sqftQty += newItem.physicalQty;
    if (unit === 'pcs') loc.pcsQty += newItem.physicalQty;
    if (unit === 'box') loc.boxQty += newItem.physicalQty;
    store.snapshot.kpis.totalProducts += 1;
    store.snapshot.stockStatus.totalItems += 1;
    store.snapshot.stockStatus.inStockCount += 1;

    pushHistory({
      itemId: newItem.id,
      itemCode: newItem.itemCode,
      type: 'Adjustment',
      referenceNo: `INIT-${newItem.itemCode}`,
      quantityDelta: newItem.physicalQty,
      unit: newItem.unit,
      systemAfter: newItem.systemQty,
      physicalAfter: newItem.physicalQty,
      branchName: loc.name,
      partyOrNote: `Initial product variant created (${newItem.dimensions})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({item: newItem, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create product error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const item = Product.findById(req.params.id);
    if (!item) {
      return res.status(404).json({error: 'Product not found.'});
    }
    const {
      itemName,
      dimensions,
      category,
      finish,
      thickness,
      locationId,
      unitPriceInr,
      imageUrl,
      enabled,
    } = req.body as Partial<VarianceItem>;

    if (itemName?.trim()) item.itemName = itemName.trim();
    if (dimensions?.trim()) item.dimensions = dimensions.trim();
    if (category) item.category = category;
    if (finish) item.finish = finish;
    if (thickness?.trim()) item.thickness = thickness.trim();
    if (typeof unitPriceInr === 'number' && unitPriceInr > 0) {
      item.unitPriceInr = Math.round(unitPriceInr);
    }
    if (imageUrl !== undefined) {
      item.imageUrl = sanitizeSafeImageUrl(imageUrl);
    }
    if (typeof enabled === 'boolean') {
      item.enabled = enabled;
    }
    if (locationId) {
      const loc = Branch.findById(locationId);
      if (loc) {
        item.locationId = loc.id;
        item.locationName = loc.name;
      }
    }

    pushHistory({
      itemId: item.id,
      itemCode: item.itemCode,
      type: 'Adjustment',
      referenceNo: `EDT-${item.itemCode}`,
      quantityDelta: 0,
      unit: item.unit,
      systemAfter: item.systemQty,
      physicalAfter: item.physicalQty,
      branchName: item.locationName,
      partyOrNote: `Updated product info (${item.category} · ${item.dimensions})`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({item, snapshot: store.snapshot});
  } catch (error) {
    console.error('Update product error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const toggleProduct = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const item = Product.findById(req.params.id);
    if (!item) {
      return res.status(404).json({error: 'Product not found.'});
    }
    const nextEnabled = item.enabled === false;
    item.enabled = nextEnabled;

    pushHistory({
      itemId: item.id,
      itemCode: item.itemCode,
      type: 'Adjustment',
      referenceNo: `${nextEnabled ? 'ENB' : 'DSB'}-${item.itemCode}`,
      quantityDelta: 0,
      unit: item.unit,
      systemAfter: item.systemQty,
      physicalAfter: item.physicalQty,
      branchName: item.locationName,
      partyOrNote: `Product ${nextEnabled ? 'enabled' : 'disabled'} in catalog`,
      timestampLabel: 'Just now',
    });

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({item, snapshot: store.snapshot});
  } catch (error) {
    console.error('Toggle product error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const removed = Product.removeById(req.params.id);
    if (!removed) {
      return res.status(404).json({error: 'Product not found.'});
    }

    const loc = Branch.findById(removed.locationId);
    if (loc) {
      loc.totalItems = Math.max(0, loc.totalItems - 1);
      if (removed.unit === 'sq. ft') loc.sqftQty = Math.max(0, loc.sqftQty - removed.physicalQty);
      if (removed.unit === 'pcs') loc.pcsQty = Math.max(0, loc.pcsQty - removed.physicalQty);
      if (removed.unit === 'box') loc.boxQty = Math.max(0, loc.boxQty - removed.physicalQty);
    }
    store.snapshot.kpis.totalProducts = Math.max(0, store.snapshot.kpis.totalProducts - 1);
    store.snapshot.stockStatus.totalItems = Math.max(
      0,
      store.snapshot.stockStatus.totalItems - 1,
    );
    if (removed.status === 'In Stock') {
      store.snapshot.stockStatus.inStockCount = Math.max(
        0,
        store.snapshot.stockStatus.inStockCount - 1,
      );
    } else if (removed.status === 'Low Stock') {
      store.snapshot.stockStatus.lowStockCount = Math.max(
        0,
        store.snapshot.stockStatus.lowStockCount - 1,
      );
    } else if (removed.status === 'Out of Stock') {
      store.snapshot.stockStatus.outOfStockCount = Math.max(
        0,
        store.snapshot.stockStatus.outOfStockCount - 1,
      );
    } else if (removed.status === 'Overstock') {
      store.snapshot.stockStatus.overstockCount = Math.max(
        0,
        store.snapshot.stockStatus.overstockCount - 1,
      );
    }

    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({
      deletedId: removed.id,
      itemCode: removed.itemCode,
      snapshot: store.snapshot,
    });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
