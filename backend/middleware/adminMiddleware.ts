import type {NextFunction, Request, Response} from 'express';
import type {AuthenticatedRequest} from './auth.ts';

const ADMIN_ROLE_KEYWORDS = ['lead', 'admin', 'owner', 'director', 'head'];

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as Partial<AuthenticatedRequest>).authUser;
  if (!user) {
    res.status(401).json({success: false, error: 'Authentication required.'});
    return;
  }
  const roleLower = (user.role || '').toLowerCase();
  const isAdmin = ADMIN_ROLE_KEYWORDS.some((keyword) => roleLower.includes(keyword));
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Admin or Yard Ops Lead privileges required.',
    });
    return;
  }
  next();
};
