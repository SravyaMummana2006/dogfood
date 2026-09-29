import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import * as authService from '../services/auth.service';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters'),
  display_name: z.string().min(1, 'Display name is required').max(255),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128, 'Password must not exceed 128 characters'),
});

router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.register(req.body);
      res.status(201).json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization!.slice(7).trim();
      await authService.logout(token);
      res.json({ data: { message: 'Logged out successfully' } });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getCurrentUser(req.user!.id);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
