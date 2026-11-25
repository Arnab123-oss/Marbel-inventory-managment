import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Product from '../models/Product.ts';
import SalesBillModel from '../models/SalesBill.ts';
import Slab from '../models/Slab.ts';
import {estimateSlabRateInr, syncLocationsFromLedger} from '../services/branchService.ts';
import {
  computeSalesBillStatusServer,
  formatInvoiceNoServer,
  normalizeSalesItemStatusServer,
  parseDateLabelToIsoServer,
} from '../services/dateService.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {
  getStore,
  pushHistory,
  recomputeItemMetrics,
  saveStore,
} from '../services/storeService.ts';
import type {
  SalesBill,
  SalesBillItem,
  SalesPaymentStatus,
  UnitType,
} from '../types/inventory.ts';

export const getSalesBills = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({salesBills: SalesBillModel.findAll()});
  } catch (error) {
    console.error('Get sales bills error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createSalesBill = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const body = req.body as {
      invoiceNo?: string;
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      branchName?: string;
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
        status?: SalesPaymentStatus;
      }>;
      itemCode?: string;
      qty?: number;
      unit?: UnitType;
      totalInr?: number;
    };

    const {
      invoiceNo,
      customerName,
      customerPhone,
      customerAddress,
      branchName,
      dateLabel,
      dateIso,
    } = body;
    const rawItems =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : body.itemCode
          ? [
              {
                itemCode: body.itemCode,
                qty: body.qty,
                unit: body.unit,
                amountInr: body.totalInr,
                status: 'Paid' as SalesPaymentStatus,
              },
            ]
          : [];

    if (!customerName?.trim() || !branchName?.trim() || rawItems.length === 0) {
      return res
        .status(400)
        .json({error: 'Customer name, branch, and at least one invoice item are required.'});
    }

    const normalizedItems: SalesBillItem[] = [];
    for (const raw of rawItems) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        return res
          .status(400)
          .json({error: 'Every item requires a product, positive qty, and unit.'});
      }
      const matchedProduct = Product.findByCode(raw.itemCode);
      const matchedSlab = !matchedProduct ? Slab.findByLotNumber(raw.itemCode) : undefined;
      const qtyRounded = Math.round(raw.qty);
      const fallbackRate = matchedProduct
        ? matchedProduct.unitPriceInr
        : matchedSlab
          ? estimateSlabRateInr(matchedSlab, Product.findAll())
          : 500;
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * fallbackRate,
        ),
      );
      normalizedItems.push({
        id: `sbi-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: matchedSlab
          ? matchedSlab.lotNumber
          : matchedProduct
            ? matchedProduct.itemCode
            : raw.itemCode,
        itemName: matchedSlab
          ? `${matchedSlab.stoneName} · ${matchedSlab.thicknessMm}mm`
          : matchedProduct
            ? matchedProduct.itemName
            : raw.itemCode,
        dimensions: matchedSlab
          ? matchedSlab.dimensionsFt
          : matchedProduct
            ? matchedProduct.dimensions
            : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
        status: normalizeSalesItemStatusServer(raw.status),
      });
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;
    const computedStatus = computeSalesBillStatusServer(normalizedItems);
    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel);

    const bill: SalesBill = {
      id: `sb-${crypto.randomUUID().slice(0, 6)}`,
      invoiceNo: formatInvoiceNoServer(invoiceNo),
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || '',
      customerAddress: customerAddress?.trim() || '',
      branchName: branchName.trim(),
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: computedStatus,
      dateLabel: dateLabel?.trim() || 'Today',
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    SalesBillModel.prepend(bill);

    for (const line of normalizedItems) {
      const item = Product.findByCode(line.itemCode);
      if (item) {
        item.systemQty = Math.max(0, item.systemQty - line.qty);
        item.physicalQty = Math.max(0, item.physicalQty - line.qty);
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Sales bill dispatched';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Sale',
          referenceNo: bill.invoiceNo,
          quantityDelta: -line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: bill.branchName,
          partyOrNote: `${bill.customerName} (${line.status} · Subtracted from System & Physical)`,
          timestampLabel: 'Just now',
        });
      } else {
        const slab = Slab.findByLotNumber(line.itemCode);
        if (slab) {
          slab.systemSqFt = Math.max(
            0,
            Math.round((slab.systemSqFt ?? slab.totalSqFt) - line.qty),
          );
          slab.totalSqFt = Math.max(0, Math.round(slab.totalSqFt - line.qty));
          slab.status = slab.totalSqFt > 0 ? 'In Stock' : 'Out of Stock';
          pushHistory({
            itemId: slab.id,
            itemCode: slab.lotNumber,
            type: 'Sale',
            referenceNo: bill.invoiceNo,
            quantityDelta: -line.qty,
            unit: line.unit,
            systemAfter: slab.systemSqFt,
            physicalAfter: slab.totalSqFt,
            branchName: bill.branchName,
            partyOrNote: `${bill.customerName} (${line.status} · Subtracted from Slab Stock)`,
            timestampLabel: 'Just now',
          });
        }
      }
    }

    syncLocationsFromLedger(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({bill, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create sales bill error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const updateSalesBill = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const billIndex = SalesBillModel.findIndexById(req.params.id);
    if (billIndex === -1) {
      return res.status(404).json({error: 'Sales bill not found.'});
    }

    const existing = store.snapshot.salesBills[billIndex];
    const body = req.body as {
      invoiceNo?: string;
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      branchName?: string;
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
        status?: SalesPaymentStatus;
      }>;
    };

    const {
      invoiceNo,
      customerName,
      customerPhone,
      customerAddress,
      branchName,
      dateLabel,
      dateIso,
      items,
    } = body;

    if (
      !customerName?.trim() ||
      !branchName?.trim() ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res
        .status(400)
        .json({error: 'Customer name, branch, and at least one invoice item are required.'});
    }

    const normalizedItems: SalesBillItem[] = [];
    for (const raw of items) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        return res
          .status(400)
          .json({error: 'Every item requires a product, positive qty, and unit.'});
      }
      const matchedProduct = Product.findByCode(raw.itemCode);
      const matchedSlab = !matchedProduct ? Slab.findByLotNumber(raw.itemCode) : undefined;
      const qtyRounded = Math.round(raw.qty);
      const fallbackRate = matchedProduct
        ? matchedProduct.unitPriceInr
        : matchedSlab
          ? estimateSlabRateInr(matchedSlab, Product.findAll())
          : 500;
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * fallbackRate,
        ),
      );
      normalizedItems.push({
        id: `sbi-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: matchedSlab
          ? matchedSlab.lotNumber
          : matchedProduct
            ? matchedProduct.itemCode
            : raw.itemCode,
        itemName: matchedSlab
          ? `${matchedSlab.stoneName} · ${matchedSlab.thicknessMm}mm`
          : matchedProduct
            ? matchedProduct.itemName
            : raw.itemCode,
        dimensions: matchedSlab
          ? matchedSlab.dimensionsFt
          : matchedProduct
            ? matchedProduct.dimensions
            : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
        status: normalizeSalesItemStatusServer(raw.status),
      });
    }

    const prevItems =
      Array.isArray(existing.items) && existing.items.length > 0 ? existing.items : [];
    for (const oldLine of prevItems) {
      const oldItem = oldLine.itemCode
        ? Product.findByCode(oldLine.itemCode)
        : Product.findAll().find(
            (i) => i.itemName.toLowerCase() === oldLine.itemName.toLowerCase(),
          );
      if (oldItem) {
        oldItem.systemQty += oldLine.qty;
        oldItem.physicalQty += oldLine.qty;
        recomputeItemMetrics(oldItem);
      } else if (oldLine.itemCode) {
        const oldSlab = Slab.findByLotNumber(oldLine.itemCode);
        if (oldSlab) {
          oldSlab.systemSqFt = Math.max(
            0,
            Math.round((oldSlab.systemSqFt ?? oldSlab.totalSqFt) + oldLine.qty),
          );
          oldSlab.totalSqFt = Math.max(0, Math.round(oldSlab.totalSqFt + oldLine.qty));
          oldSlab.status = oldSlab.totalSqFt > 0 ? 'In Stock' : 'Out of Stock';
        }
      }
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;
    const computedStatus = computeSalesBillStatusServer(normalizedItems);
    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel || existing.dateLabel);

    const updatedBill: SalesBill = {
      ...existing,
      invoiceNo: formatInvoiceNoServer(invoiceNo?.trim() || existing.invoiceNo),
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() ?? existing.customerPhone ?? '',
      customerAddress: customerAddress?.trim() ?? existing.customerAddress ?? '',
      branchName: branchName.trim(),
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: computedStatus,
      dateLabel: dateLabel?.trim() || existing.dateLabel,
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    store.snapshot.salesBills[billIndex] = updatedBill;

    for (const line of normalizedItems) {
      const item = Product.findByCode(line.itemCode);
      if (item) {
        item.systemQty = Math.max(0, item.systemQty - line.qty);
        item.physicalQty = Math.max(0, item.physicalQty - line.qty);
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Sales bill updated';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Sale',
          referenceNo: updatedBill.invoiceNo,
          quantityDelta: -line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: updatedBill.branchName,
          partyOrNote: `${updatedBill.customerName} (Sales bill edited · ${line.status})`,
          timestampLabel: 'Just now',
        });
      } else {
        const slab = Slab.findByLotNumber(line.itemCode);
        if (slab) {
          slab.systemSqFt = Math.max(
            0,
            Math.round((slab.systemSqFt ?? slab.totalSqFt) - line.qty),
          );
          slab.totalSqFt = Math.max(0, Math.round(slab.totalSqFt - line.qty));
          slab.status = slab.totalSqFt > 0 ? 'In Stock' : 'Out of Stock';
          pushHistory({
            itemId: slab.id,
            itemCode: slab.lotNumber,
            type: 'Sale',
            referenceNo: updatedBill.invoiceNo,
            quantityDelta: -line.qty,
            unit: line.unit,
            systemAfter: slab.systemSqFt,
            physicalAfter: slab.totalSqFt,
            branchName: updatedBill.branchName,
            partyOrNote: `${updatedBill.customerName} (Sales bill edited · ${line.status})`,
            timestampLabel: 'Just now',
          });
        }
      }
    }

    syncLocationsFromLedger(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(200).json({bill: updatedBill, snapshot: store.snapshot});
  } catch (error) {
    console.error('Update sales bill error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
