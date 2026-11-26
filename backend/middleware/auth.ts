import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import {getStore} from '../services/storeService.ts';
import type {StoredUser} from '../types/inventory.ts';

const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  RUNTIME_FALLBACK_SECRET;

export const SESSION_COOKIE = 'sp_session';
export const LOGOUT_COOKIE = 'sp_logged_out';

export interface AuthenticatedRequest extends Request {
  authUser: StoredUser;
  userId?: string;
}

export function signSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({uid: userId, iat: Date.now()}),
    'utf8',
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
    };
    return decoded.uid || null;
  } catch {
    return null;
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = val;
  }
  return cookies;
}

function isHttpsRequest(res: Response): boolean {
  const req = res.req;
  if (!req) return false;
  const proto = req.headers['x-forwarded-proto'];
  return Boolean(req.secure || (typeof proto === 'string' && proto.split(',')[0].trim() === 'https'));
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = signSessionToken(userId);
  const https = isHttpsRequest(res);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    ...(https ? {partitioned: true} : {}),
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
  res.clearCookie(LOGOUT_COOKIE, {path: '/'});
}

export function clearAuthCookies(res: Response): void {
  const https = isHttpsRequest(res);
  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    secure: https,
    sameSite: https ? 'none' : 'lax',
    ...(https ? {partitioned: true} : {}),
  });
  res.cookie(LOGOUT_COOKIE, '1', {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    ...(https ? {partitioned: true} : {}),
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

export async function getAuthenticatedUser(req: Request): Promise<StoredUser | null> {
  const store = getStore();
  const cookies = parseCookies(req);
  const uid = verifySessionToken(cookies[SESSION_COOKIE]);
  if (uid && store.users[uid]) {
    return store.users[uid];
  }
  if (cookies[LOGOUT_COOKIE] !== '1' && store.users['usr-demo-st']) {
    return store.users['usr-demo-st'];
  }
  return null;
}

function isCrossSiteCookieMutation(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
    const expectedHost = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    if (expectedHost && originHost === expectedHost) return false;
    return req.headers['x-requested-with'] !== 'XMLHttpRequest';
  } catch {
    return true;
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (isCrossSiteCookieMutation(req)) {
      res.status(403).json({success: false, error: 'Cross-site state mutation blocked.'});
      return;
    }
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({success: false, error: 'Authentication required.'});
      return;
    }
    (req as AuthenticatedRequest).authUser = user;
    (req as AuthenticatedRequest).userId = user.id;
    next();
  } catch (error) {
    next(error);
  }
};
