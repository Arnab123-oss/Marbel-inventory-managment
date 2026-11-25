import express from 'express';
import {getLayout, resetLayout, updateLayout} from '../controllers/layoutController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', requireAuth, getLayout);
router.put('/', requireAuth, updateLayout);
router.post('/reset', requireAuth, resetLayout);

export default router;
