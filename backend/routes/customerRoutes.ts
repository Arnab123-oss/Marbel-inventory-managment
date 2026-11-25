import express from 'express';
import {createCustomer, getCustomers} from '../controllers/customerController.ts';
import {requireAuth} from '../middleware/auth.ts';

const router = express.Router();

router.get('/', getCustomers);
router.post('/', requireAuth, createCustomer);

export default router;
