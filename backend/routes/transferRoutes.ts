import express from 'express';
import {createTransfer, getTransfers} from '../controllers/transferController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getTransfers);
router.post('/', requireAuth, createTransfer);

export default router;
