import express from 'express';
import {
  createSalesBill,
  getSalesBills,
  updateSalesBill,
} from '../controllers/salesBillController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getSalesBills);
router.post('/', requireAuth, createSalesBill);
router.put('/:id', requireAuth, updateSalesBill);

export default router;
