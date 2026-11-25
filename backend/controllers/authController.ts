import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import {
  clearAuthCookies,
  getAuthenticatedUser,
  setSessionCookie,
} from '../middleware/auth.ts';
import Layout from '../models/Layout.ts';
import User from '../models/User.ts';
import {createDefaultLayout} from '../services/seedService.ts';
import {
  computeInitials,
  hashPassword,
  sanitizeUser,
  saveStore,
  verifyPassword,
} from '../services/storeService.ts';
import type {StoredUser} from '../types/inventory.ts';

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(200).json({user: null});
    }
    setSessionCookie(res, user.id);
    return res.status(200).json({user: sanitizeUser(user)});
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const {email, password} = req.body as {email?: string; password?: string};
    if (!email || !password) {
      return res.status(400).json({error: 'Email and password are required.'});
    }
    const user = User.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({error: 'Invalid email or password.'});
    }
    setSessionCookie(res, user.id);
    return res.status(200).json({user: sanitizeUser(user)});
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const {name, email, password, role} = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return res.status(400).json({
        error: 'Name, valid email, and password (min 6 characters) are required.',
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (User.findByEmail(normalizedEmail)) {
      return res.status(409).json({error: 'An account with this email already exists.'});
    }

    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const {salt, hash} = hashPassword(password);
    const newUser: StoredUser = {
      id,
      name: name.trim(),
      email: normalizedEmail,
      initials: computeInitials(name),
      role: role?.trim() || 'Showroom Manager',
      facilityScope: 'All 7 Marble Showrooms, Yards & Depots',
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };

    User.upsert(newUser);
    Layout.upsertByUserId(id, createDefaultLayout());
    saveStore();

    setSessionCookie(res, id);
    return res.status(201).json({user: sanitizeUser(newUser)});
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const demoLogin = async (_req: Request, res: Response) => {
  try {
    const demoUser = User.findById('usr-demo-st');
    if (!demoUser) {
      return res.status(404).json({error: 'Demo operator account unavailable.'});
    }
    setSessionCookie(res, demoUser.id);
    return res.status(200).json({user: sanitizeUser(demoUser)});
  } catch (error) {
    console.error('Demo login error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const logout = async (_req: Request, res: Response) => {
  try {
    clearAuthCookies(res);
    return res.status(200).json({ok: true});
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
