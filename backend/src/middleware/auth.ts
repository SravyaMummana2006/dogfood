import { Request, Response, NextFunction } from 'express';
import { getPool } from '../db';
import { AuthenticationError, AuthorizationError } from '../errors';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError();
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AuthenticationError();
    }

    const { rows } = await getPool().query(
      `SELECT u.id, u.email, u.display_name, u.is_admin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (rows.length === 0) {
      throw new AuthenticationError('Invalid or expired session');
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOrganizer(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Must be used AFTER requireAuth
  if (!req.user) {
    next(new AuthenticationError('Authentication required'));
    return;
  }
  
  if (!req.user.is_admin) {
    next(new AuthorizationError('Forbidden: Organizer access required'));
  } else {
    next();
  }
}
