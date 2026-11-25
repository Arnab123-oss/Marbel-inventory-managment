import express from 'express';
import {
  createPurchaseBill,
  getPurchaseBills,
  updatePurchaseBill,
} from '../controllers/purchaseBillController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getPurchaseBills);
router.post('/', requireAuth, createPurchaseBill);
router.put('/:id', requireAuth, updatePurchaseBill);

export default router;
