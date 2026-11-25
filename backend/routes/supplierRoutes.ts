import express from 'express';
import {
  createSupplier,
  deleteSupplier,
  getSuppliers,
  updateSupplier,
} from '../controllers/supplierController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getSuppliers);
router.post('/', requireAuth, createSupplier);
router.put('/:id', requireAuth, updateSupplier);
router.delete('/:id', requireAuth, deleteSupplier);

export default router;
