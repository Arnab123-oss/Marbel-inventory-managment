import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import type {AuthenticatedRequest} from '../middleware/auth.ts';
import Branch from '../models/Branch.ts';
import Customer from '../models/Customer.ts';
import Product from '../models/Product.ts';
import SalesBillModel from '../models/SalesBill.ts';
import SalesReturnModel from '../models/SalesReturn.ts';
import Slab from '../models/Slab.ts';
import {estimateSlabRateInr, syncLocationsFromLedger} from '../services/branchService.ts';
import {
  computeSalesBillStatusServer,
  formatSalesReturnNoServer,
  parseDateLabelToIsoServer,
} from '../services/dateService.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {
  getStore,
  pushHistory,
  recomputeItemMetrics,
  saveStore,
} from '../services/storeService.ts';
import type {SalesReturn, SalesReturnItem, UnitType} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';

export const getSalesReturns = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({salesReturns: SalesReturnModel.findAll()});
  } catch (error) {
    console.error('Get sales returns error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createSalesReturn = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const authReq = req as Partial<AuthenticatedRequest>;
    const body = req.body as {
      returnNo?: string;
      customerName?: string;
      branchName?: string;
      salesBillId?: string;
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

    const {returnNo, customerName, branchName, salesBillId, reason, notes, dateLabel, dateIso} =
      body;

    if (
      !customerName?.trim() ||
      !branchName?.trim() ||
      !reason?.trim() ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      return res.status(400).json({
        error: 'Customer, branch, return reason, and at least one return item are required.',
      });
    }

    const normalizedItems: SalesReturnItem[] = [];
    for (const raw of body.items) {
      if (!raw.itemCode?.trim() || !raw.qty || Number(raw.qty) <= 0 || !raw.unit) {
        return res.status(400).json({
          error: 'Every returned item requires a product, positive quantity, and unit.',
        });
      }
      const matchedProduct =
        Product.findByCode(raw.itemCode, branchName) || Product.findByCode(raw.itemCode);
      const matchedSlab = !matchedProduct
        ? Slab.findByLotNumber(raw.itemCode, branchName) || Slab.findByLotNumber(raw.itemCode)
        : undefined;

      const qtyRounded = Math.round(Number(raw.qty));
      const fallbackRate = matchedProduct
        ? matchedProduct.unitPriceInr
        : matchedSlab
          ? estimateSlabRateInr(matchedSlab, Product.findAll())
          : 500;
      const parsedAmt =
        raw.amountInr !== undefined && !Number.isNaN(Number(raw.amountInr))
          ? Number(raw.amountInr)
          : qtyRounded * fallbackRate;
      if (parsedAmt < 0) {
        return res.status(400).json({
          error: 'Return amount cannot be negative.',
        });
      }
      const amountRounded = Math.max(0, Math.round(parsedAmt));

      normalizedItems.push({
        id: `sri-${crypto.randomUUID().slice(0, 6)}`,
        productId: matchedProduct?.id,
        slabIds: matchedSlab ? [matchedSlab.id] : undefined,
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
    const formattedReturnNo = formatSalesReturnNoServer(returnNo, resolvedIso, dateLabel);

    const existingDuplicate = SalesReturnModel.findAll().find(
      (r) => r.returnNo.trim().toLowerCase() === formattedReturnNo.toLowerCase(),
    );
    if (existingDuplicate) {
      return res.status(409).json({
        error: `Sales Return ${formattedReturnNo} already exists. Please use another return number.`,
      });
    }

    const customerKey = customerName.trim().toLowerCase();
    const branchKey = branchName.trim().toLowerCase();
    const candidateBills = SalesBillModel.findAll()
      .filter((b) => b.customerName.trim().toLowerCase() === customerKey)
      .sort((a, b) => {
        if (salesBillId) {
          if (a.id === salesBillId && b.id !== salesBillId) return -1;
          if (b.id === salesBillId && a.id !== salesBillId) return 1;
        }
        const aBranch = a.branchName.trim().toLowerCase() === branchKey ? 1 : 0;
        const bBranch = b.branchName.trim().toLowerCase() === branchKey ? 1 : 0;
        return bBranch - aBranch;
      });

    const touchedBillIds = new Set<string>();
    const affectedBillNos: string[] = [];
    let totalDeductedFromBillsInr = 0;
    let totalDeductedDueInr = 0;

    for (const line of normalizedItems) {
      let remainingQty = line.qty;
      let remainingAmt = line.amountInr;

      for (const bill of candidateBills) {
        if (remainingQty <= 0 && remainingAmt <= 0) break;
        if (!Array.isArray(bill.items) || bill.items.length === 0) {
          bill.items = [
            {
              id: `sbi-${bill.id}`,
              itemCode: '',
              itemName: bill.itemSummary,
              dimensions: 'Standard',
              qty: bill.qty,
              unit: bill.unit,
              amountInr: bill.totalInr,
              status: bill.status,
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
            totalDeductedFromBillsInr += deductAmt;
            if (bi.status === 'Due') {
              totalDeductedDueInr += deductAmt;
            } else if (bi.status === 'Partially Paid') {
              totalDeductedDueInr += Math.round(deductAmt * 0.5);
            }
            touchedBillIds.add(bill.id);
            if (!affectedBillNos.includes(bill.invoiceNo)) {
              affectedBillNos.push(bill.invoiceNo);
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
              totalDeductedFromBillsInr += deductAmt;
              if (bi.status === 'Due') {
                totalDeductedDueInr += deductAmt;
              } else if (bi.status === 'Partially Paid') {
                totalDeductedDueInr += Math.round(deductAmt * 0.5);
              }
              touchedBillIds.add(bill.id);
              if (!affectedBillNos.includes(bill.invoiceNo)) {
                affectedBillNos.push(bill.invoiceNo);
              }
            }
          }
        }
      }
    }

    for (const bill of SalesBillModel.findAll()) {
      if (!touchedBillIds.has(bill.id)) continue;
      const lines = Array.isArray(bill.items) ? bill.items : [];
      bill.qty = lines.reduce((sum, it) => sum + Math.max(0, Number(it.qty) || 0), 0);
      bill.totalInr = lines.reduce((sum, it) => sum + Math.max(0, Number(it.amountInr) || 0), 0);
      if (bill.subtotalInr !== undefined) {
        bill.subtotalInr = bill.totalInr;
      }
      if (bill.paidAmountInr !== undefined || bill.dueAmountInr !== undefined) {
        const paid = Math.min(bill.totalInr, Math.max(0, Number(bill.paidAmountInr) || 0));
        bill.paidAmountInr = paid;
        bill.dueAmountInr = Math.max(0, bill.totalInr - paid);
      }

      const activeLines = lines.filter((it) => it.qty > 0 || it.amountInr > 0);
      if (activeLines.length === 0) {
        bill.itemSummary = `Returned (${lines[0]?.itemName || 'All items'})`;
        bill.status = 'Paid';
      } else if (activeLines.length === 1) {
        bill.itemSummary = `${activeLines[0].itemName} (${activeLines[0].dimensions})`;
        bill.unit = activeLines[0].unit;
        bill.status = computeSalesBillStatusServer(activeLines);
      } else {
        bill.itemSummary = `${activeLines[0].itemName} + ${activeLines.length - 1} more`;
        bill.unit = activeLines[0].unit;
        bill.status = computeSalesBillStatusServer(activeLines);
      }
      void SalesBillModel.syncDoc(bill);
    }

    const matchedBranch = Branch.findByName(branchName);
    const matchedCustomer = Customer.findAll().find(
      (c) => c.name.trim().toLowerCase() === customerKey,
    );
    if (matchedCustomer && totalDeductedFromBillsInr > 0) {
      matchedCustomer.totalPurchasedInr = Math.max(
        0,
        matchedCustomer.totalPurchasedInr - totalDeductedFromBillsInr,
      );
      matchedCustomer.outstandingInr = Math.max(
        0,
        matchedCustomer.outstandingInr - totalDeductedDueInr,
      );
      void Customer.syncDoc(matchedCustomer);
    }

    const explicitBill = salesBillId ? SalesBillModel.findById(salesBillId) : undefined;

    const salesReturn: SalesReturn = {
      id: `sret-${crypto.randomUUID().slice(0, 6)}`,
      companyId: DEFAULT_COMPANY_ID,
      branchId: matchedBranch?.id,
      customerId: matchedCustomer?.id,
      createdBy: authReq.userId,
      returnNo: formattedReturnNo,
      customerName: customerName.trim(),
      branchName: branchName.trim(),
      salesBillId: explicitBill?.id,
      salesBillNo: explicitBill?.invoiceNo || affectedBillNos[0],
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

    SalesReturnModel.prepend(salesReturn);

    // Customer returning goods back to branch stock => ADD back to System & Physical inventory
    for (const line of normalizedItems) {
      const item =
        Product.findByCode(line.itemCode, branchName) || Product.findByCode(line.itemCode);
      if (item) {
        item.systemQty = Math.max(0, item.systemQty + line.qty);
        item.physicalQty = Math.max(0, item.physicalQty + line.qty);
        recomputeItemMetrics(item);
        item.lastCountedAt = 'Sales return restocked';
        void Product.syncDoc(item);

        pushHistory({
          itemId: item.id,
          itemCode: item.itemCode,
          type: 'Return',
          referenceNo: salesReturn.returnNo,
          quantityDelta: line.qty,
          unit: line.unit,
          systemAfter: item.systemQty,
          physicalAfter: item.physicalQty,
          branchName: salesReturn.branchName,
          partyOrNote: `Customer return · ${salesReturn.customerName} · ${salesReturn.reason}${
            affectedBillNos.length > 0 ? ` (Reduced ${affectedBillNos.join(', ')})` : ''
          }`,
          timestampLabel: 'Just now',
        });
      } else {
        const slab =
          Slab.findByLotNumber(line.itemCode, branchName) || Slab.findByLotNumber(line.itemCode);
        if (slab) {
          const prevSqft = Math.max(0, slab.totalSqFt);
          const avgAreaPerPiece =
            slab.slabCountPcs > 0 && prevSqft > 0 ? prevSqft / slab.slabCountPcs : 50;
          slab.systemSqFt = Math.max(
            0,
            Math.round((slab.systemSqFt ?? slab.totalSqFt) + line.qty),
          );
          slab.totalSqFt = Math.max(0, Math.round(slab.totalSqFt + line.qty));
          slab.slabCountPcs =
            slab.totalSqFt === 0
              ? 0
              : Math.max(1, Math.round(slab.totalSqFt / Math.max(1, avgAreaPerPiece)));
          slab.status = slab.totalSqFt > 0 ? 'In Stock' : 'Out of Stock';
          void Slab.syncDoc(slab);

          pushHistory({
            itemId: slab.id,
            itemCode: slab.lotNumber,
            type: 'Return',
            referenceNo: salesReturn.returnNo,
            quantityDelta: line.qty,
            unit: line.unit,
            systemAfter: slab.systemSqFt,
            physicalAfter: slab.totalSqFt,
            branchName: salesReturn.branchName,
            partyOrNote: `Customer return · ${salesReturn.customerName} · ${salesReturn.reason}${
              affectedBillNos.length > 0 ? ` (Reduced ${affectedBillNos.join(', ')})` : ''
            }`,
            timestampLabel: 'Just now',
          });
        }
      }
    }

    syncLocationsFromLedger(store.snapshot);
    store.snapshot.lastUpdatedAt = new Date().toISOString();
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({salesReturn, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create sales return error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
