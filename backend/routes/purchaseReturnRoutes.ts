import express from 'express';
import {
  createPurchaseReturn,
  getPurchaseReturns,
} from '../controllers/purchaseReturnController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getPurchaseReturns);
router.post('/', requireAuth, createPurchaseReturn);

export default router;
