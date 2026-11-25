import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Product from '../models/Product.ts';
import PurchaseBillModel from '../models/PurchaseBill.ts';
import PurchaseReturnModel from '../models/PurchaseReturn.ts';
import Slab from '../models/Slab.ts';
import {
  estimateSlabRateInr,
  syncLocationsFromLedger,
  syncSuppliersFromPurchaseBills,
} from '../services/branchService.ts';
import {
  formatPurchaseReturnNoServer,
  parseDateLabelToIsoServer,
} from '../services/dateService.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {
  getStore,
  pushHistory,
  recomputeItemMetrics,
  saveStore,
} from '../services/storeService.ts';
import type {PurchaseReturn, PurchaseReturnItem, UnitType} from '../types/inventory.ts';

export const getPurchaseReturns = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({purchaseReturns: PurchaseReturnModel.findAll()});
  } catch (error) {
    console.error('Get purchase returns error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createPurchaseReturn = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const body = req.body as {
      returnNo?: string;
      supplierName?: string;
      branchName?: string;
      purchaseBillId?: string;
      reason?: string;
      notes?: string;
      dateLabel?: string;
      dateIso?: string;
      items?: Array<{
        itemCode?: string;
        qty?: number;
        unit?: UnitType;
        amountInr?: number;
        reason?: string;
      }>;
    };

    const {returnNo, supplierName, branchName, purchaseBillId, reason, notes, dateLabel, dateIso} =
      body;

    if (
      !supplierName?.trim() ||
      !branchName?.trim() ||
      !reason?.trim() ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      return res.status(400).json({
        error: 'Supplier, branch, return reason, and at least one return item are required.',
      });
    }

    const normalizedItems: PurchaseReturnItem[] = [];
    for (const raw of body.items) {
      if (!raw.itemCode || !raw.qty || raw.qty <= 0 || !raw.unit) {
        return res.status(400).json({
          error: 'Every returned item requires a product, positive quantity, and unit.',
        });
      }
      const matchedProduct = Product.findByCode(raw.itemCode, branchName);
      const matchedSlab = !matchedProduct
        ? Slab.findByLotNumber(raw.itemCode, branchName)
        : undefined;

      const qtyRounded = Math.round(raw.qty);
      const fallbackRate = matchedProduct
        ? matchedProduct.unitPriceInr
        : matchedSlab
          ? estimateSlabRateInr(matchedSlab, Product.findAll())
          : 450;
      const amountRounded = Math.max(
        0,
        Math.round(
          raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
            ? Number(raw.amountInr)
            : qtyRounded * fallbackRate,
        ),
      );

      normalizedItems.push({
        id: `pri-${crypto.randomUUID().slice(0, 6)}`,
        itemCode: matchedSlab
          ? matchedSlab.lotNumber
          : matchedProduct
            ? matchedProduct.itemCode
            : raw.itemCode.trim(),
        itemName: matchedSlab
          ? `${matchedSlab.stoneName} · ${matchedSlab.thicknessMm}mm`
          : matchedProduct
            ? matchedProduct.itemName
            : raw.itemCode.trim(),
        dimensions: matchedSlab
          ? matchedSlab.dimensionsFt
          : matchedProduct
            ? matchedProduct.dimensions
            : 'Standard',
        qty: qtyRounded,
        unit: raw.unit,
        amountInr: amountRounded,
        reason: raw.reason?.trim() || undefined,
      });
    }

    const totalInr = normalizedItems.reduce((sum, it) => sum + it.amountInr, 0);
    const totalQty = normalizedItems.reduce((sum, it) => sum + it.qty, 0);
    const firstItem = normalizedItems[0];
    const itemSummary =
      normalizedItems.length === 1
        ? `${firstItem.itemName} (${firstItem.dimensions})`
        : `${firstItem.itemName} + ${normalizedItems.length - 1} more`;

    const resolvedIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())
        ? dateIso.trim()
        : parseDateLabelToIsoServer(dateLabel);
    const formattedReturnNo = formatPurchaseReturnNoServer(returnNo, resolvedIso, dateLabel);

    const supplierKey = supplierName.trim().toLowerCase();
    const branchKey = branchName.trim().toLowerCase();
    const candidateBills = PurchaseBillModel.findAll()
      .filter((b) => b.supplierName.trim().toLowerCase() === supplierKey)
      .sort((a, b) => {
        if (purchaseBillId) {
          if (a.id === purchaseBillId && b.id !== purchaseBillId) return -1;
          if (b.id === purchaseBillId && a.id !== purchaseBillId) return 1;
        }
        const aBranch = a.branchName.trim().toLowerCase() === branchKey ? 1 : 0;
        const bBranch = b.branchName.trim().toLowerCase() === branchKey ? 1 : 0;
        return bBranch - aBranch;
      });

    const touchedBillIds = new Set<string>();
    const affectedBillNos: string[] = [];

    for (const line of normalizedItems) {
      let remainingQty = line.qty;
      let remainingAmt = line.amountInr;

      for (const bill of candidateBills) {
        if (remainingQty <= 0 && remainingAmt <= 0) break;
        if (!Array.isArray(bill.items) || bill.items.length === 0) {
          bill.items = [
            {
              id: `pbi-${bill.id}`,
              itemCode: '',
              itemName: bill.itemSummary,
              dimensions: 'Standard',
              qty: bill.qty,
              unit: bill.unit,
              amountInr: bill.totalInr,
            },
          ];
        }
        for (const bi of bill.items) {
          if (remainingQty <= 0 && remainingAmt <= 0) break;
          if (bi.qty <= 0 && bi.amountInr <= 0) continue;
          const matchesCode =
            bi.itemCode &&
            bi.itemCode.trim().toLowerCase() === line.itemCode.trim().toLowerCase();
          const matchesName =
            bi.itemName &&
            bi.itemName.trim().toLowerCase() === line.itemName.trim().toLowerCase();
          if (!matchesCode && !matchesName) continue;

          const deductQty = Math.min(bi.qty, remainingQty);
          const deductAmt =
            deductQty === bi.qty && remainingAmt >= bi.amountInr
              ? bi.amountInr
              : Math.min(bi.amountInr, Math.max(0, Math.round(remainingAmt)));

          if (deductQty > 0 || deductAmt > 0) {
            bi.qty = Math.max(0, bi.qty - deductQty);
            bi.amountInr = Math.max(0, bi.amountInr - deductAmt);
            remainingQty = Math.max(0, remainingQty - deductQty);
            remainingAmt = Math.max(0, remainingAmt - deductAmt);
            touchedBillIds.add(bill.id);
            if (!affectedBillNos.includes(bill.billNo)) {
              affectedBillNos.push(bill.billNo);
            }
          }
        }
      }

      if (remainingAmt > 0 || remainingQty > 0) {
        for (const bill of candidateBills) {
          if (remainingAmt <= 0 && remainingQty <= 0) break;
          if (!Array.isArray(bill.items)) continue;
          for (const bi of bill.items) {
            if (remainingAmt <= 0 && remainingQty <= 0) break;
            if (bi.qty <= 0 && bi.amountInr <= 0) continue;

            const deductQty = Math.min(bi.qty, remainingQty);
            const deductAmt = Math.min(bi.amountInr, Math.max(0, Math.round(remainingAmt)));
            if (deductQty > 0 || deductAmt > 0) {
              bi.qty = Math.max(0, bi.qty - deductQty);
              bi.amountInr = Math.max(0, bi.amountInr - deductAmt);
              remainingQty = Math.max(0, remainingQty - deductQty);
              remainingAmt = Math.max(0, remainingAmt - deductAmt);
              touchedBillIds.add(bill.id);
              if (!affectedBillNos.includes(bill.billNo)) {
                affectedBillNos.push(bill.billNo);
              }
            }
          }
        }
      }
    }

    for (const bill of PurchaseBillModel.findAll()) {
      if (!touchedBillIds.has(bill.id)) continue;
      const lines = Array.isArray(bill.items) ? bill.items : [];
      bill.qty = lines.reduce((sum, it) => sum + Math.max(0, Number(it.qty) || 0), 0);
      bill.totalInr = lines.reduce((sum, it) => sum + Math.max(0, Number(it.amountInr) || 0), 0);
      const activeLines = lines.filter((it) => it.qty > 0 || it.amountInr > 0);
      if (activeLines.length === 0) {
        bill.itemSummary = `Returned (${lines[0]?.itemName || 'All items'})`;
      } else if (activeLines.length === 1) {
        bill.itemSummary = `${activeLines[0].itemName} (${activeLines[0].dimensions})`;
        bill.unit = activeLines[0].unit;
      } else {
        bill.itemSummary = `${activeLines[0].itemName} + ${activeLines.length - 1} more`;
        bill.unit = activeLines[0].unit;
      }
    }

    const explicitBill = purchaseBillId ? PurchaseBillModel.findById(purchaseBillId) : undefined;

    const purchaseReturn: PurchaseReturn = {
      id: `ret-${crypto.randomUUID().slice(0, 6)}`,
      returnNo: formattedReturnNo,
      supplierName: supplierName.trim(),
      branchName: branchName.trim(),
      purchaseBillId: explicitBill?.id,
      purchaseBillNo: explicitBill?.billNo || affectedBillNos[0],
      affectedBills: affectedBillNos,
      reason: reason.trim(),
      notes: notes?.trim() || undefined,
      itemSummary,
      qty: totalQty,
      unit: firstItem.unit,
      totalInr,
      status: affectedBillNos.length > 0 ? 'Adjusted' : 'Completed',
      dateLabel: dateLabel?.trim() || 'Today',
      dateIso: resolvedIso,
      items: normalizedItems,
    };

    PurchaseReturnModel.prepend(purchaseReturn);

    for (const line of normalizedItems) {
      const item = Product.findByCode(line.itemCode, branchName);
      if (item) {
        item.systemQty = Math.max(0, item.systemQty - line.qty);
        item.physicalQty = Math.max(0, item.physicalQty - line.qty);
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Supplier return posted';

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Return',
          referenceNo: purchaseReturn.returnNo,
          quantityDelta: -line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: purchaseReturn.branchName,
          partyOrNote: `${purchaseReturn.supplierName} · ${purchaseReturn.reason}${
            affectedBillNos.length > 0 ? ` (Reduced ${affectedBillNos.join(', ')})` : ''
          }`,
          timestampLabel: 'Just now',
        });
      } else {
        const slab = Slab.findByLotNumber(line.itemCode, branchName);
        if (slab) {
          const prevSqft = Math.max(0, slab.totalSqFt);
          const avgAreaPerPiece =
            slab.slabCountPcs > 0 && prevSqft > 0 ? prevSqft / slab.slabCountPcs : 50;
          slab.systemSqFt = Math.max(
            0,
            Math.round((slab.systemSqFt ?? slab.totalSqFt) - line.qty),
          );
          slab.totalSqFt = Math.max(0, Math.round(slab.totalSqFt - line.qty));
          slab.slabCountPcs =
            slab.totalSqFt === 0
              ? 0
              : Math.max(1, Math.round(slab.totalSqFt / Math.max(1, avgAreaPerPiece)));
          slab.status = slab.totalSqFt > 0 ? 'In Stock' : 'Out of Stock';

          pushHistory({
            itemId: slab.id,
            itemCode: slab.lotNumber,
            type: 'Return',
            referenceNo: purchaseReturn.returnNo,
            quantityDelta: -line.qty,
            unit: line.unit,
            systemAfter: slab.systemSqFt,
            physicalAfter: slab.totalSqFt,
            branchName: purchaseReturn.branchName,
            partyOrNote: `${purchaseReturn.supplierName} · ${purchaseReturn.reason}${
              affectedBillNos.length > 0 ? ` (Reduced ${affectedBillNos.join(', ')})` : ''
            }`,
            timestampLabel: 'Just now',
          });
        }
      }
    }

    syncSuppliersFromPurchaseBills(store.snapshot);
    syncLocationsFromLedger(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({purchaseReturn, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create purchase return error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
