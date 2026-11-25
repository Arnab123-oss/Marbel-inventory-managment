import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import Customer from '../models/Customer.ts';
import {broadcastSnapshot} from '../services/sseService.ts';
import {getStore, saveStore} from '../services/storeService.ts';
import type {CustomerRecord} from '../types/inventory.ts';

export const getCustomers = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({customers: Customer.findAll()});
  } catch (error) {
    console.error('Get customers error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const {name, segment, phone, city} = req.body as Partial<CustomerRecord>;
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({error: 'Customer name and phone are required.'});
    }
    const customer: CustomerRecord = {
      id: `cust-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      segment: segment || 'Builder',
      phone: phone.trim(),
      city: city?.trim() || 'Mumbai',
      totalPurchasedInr: 0,
      outstandingInr: 0,
      lastOrderLabel: 'New',
    };
    Customer.prepend(customer);
    saveStore();
    broadcastSnapshot();
    return res.status(201).json({customer, snapshot: store.snapshot});
  } catch (error) {
    console.error('Create customer error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
