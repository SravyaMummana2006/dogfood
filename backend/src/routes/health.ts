import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await getPool().query('SELECT NOW() AS time');
    res.json({
      status: 'healthy',
      timestamp: rows[0].time,
      version: '0.1.0',
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
