import express from 'express';
import {
  acknowledgeAlert,
  createAdjustment,
  getHealth,
  getSnapshot,
  streamInventory,
} from '../controllers/inventoryController.ts';
import {requireAuth} from '../middleware/auth.ts';
import customerRoutes from './customerRoutes.ts';
import productRoutes from './productRoutes.ts';
import purchaseBillRoutes from './purchaseBillRoutes.ts';
import purchaseReturnRoutes from './purchaseReturnRoutes.ts';
import salesBillRoutes from './salesBillRoutes.ts';
import salesReturnRoutes from './salesReturnRoutes.ts';
import slabRoutes from './slabRoutes.ts';
import supplierRoutes from './supplierRoutes.ts';
import transferRoutes from './transferRoutes.ts';
import uploadRoutes from './uploadRoutes.ts';

const router = express.Router();

router.get('/health', getHealth);
router.get('/snapshot', getSnapshot);
router.get('/stream', streamInventory);
router.post('/adjustments', requireAuth, createAdjustment);
router.post('/alerts/:id/acknowledge', requireAuth, acknowledgeAlert);

router.use('/products', productRoutes);
router.use('/slabs', slabRoutes);
router.use('/purchase-bills', purchaseBillRoutes);
router.use('/returns', purchaseReturnRoutes);
router.use('/sales-bills', salesBillRoutes);
router.use('/sales-returns', salesReturnRoutes);
router.use('/transfers', transferRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/uploads', uploadRoutes);

export default router;
