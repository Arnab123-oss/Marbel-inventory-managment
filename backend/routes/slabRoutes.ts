import express from 'express';
import {
  createSlab,
  deleteSlab,
  getSlabs,
  toggleSlab,
  updateSlab,
} from '../controllers/slabController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getSlabs);
router.post('/', requireAuth, createSlab);
router.put('/:id', requireAuth, updateSlab);
router.patch('/:id/toggle', requireAuth, toggleSlab);
router.delete('/:id', requireAuth, deleteSlab);

export default router;
