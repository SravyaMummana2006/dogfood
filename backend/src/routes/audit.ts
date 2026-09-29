import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireOrganizer } from '../middleware/auth';
import { getAuditLog } from '../services/audit.service';

const router = Router();

router.use(requireAuth, requireOrganizer);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await getAuditLog(100);
    res.json({ data: logs });
  } catch (err) {
    next(err);
  }
});

export default router;
