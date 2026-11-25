import express from 'express';
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  toggleProduct,
  updateProduct,
} from '../controllers/productController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', requireAuth, createProduct);
router.put('/:id', requireAuth, updateProduct);
router.patch('/:id/toggle', requireAuth, toggleProduct);
router.delete('/:id', requireAuth, deleteProduct);

export default router;
