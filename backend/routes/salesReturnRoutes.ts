import express from 'express';
import {
  createSalesReturn,
  getSalesReturns,
} from '../controllers/salesReturnController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getSalesReturns);
router.post('/', requireAuth, createSalesReturn);

export default router;
