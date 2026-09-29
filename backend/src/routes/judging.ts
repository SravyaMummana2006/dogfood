import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import * as domainService from '../services/domain.service';

const router = Router();

// Only requires standard auth (not is_admin)
router.use(requireAuth);

router.get('/assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignments = await domainService.getJudgeAssignments(req.user!.id);
    res.json({ data: assignments });
  } catch (err) {
    next(err);
  }
});

router.get('/invitations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitations = await domainService.getJudgeInvitations(req.user!.id);
    res.json({ data: invitations });
  } catch (err) {
    next(err);
  }
});

router.post('/invitations/:id/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await domainService.acceptJudgeInvitation(req.params.id, req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

router.post('/invitations/:id/decline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await domainService.declineJudgeInvitation(req.params.id, req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});


import * as scoringService from '../services/scoring.service';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const saveEvalSchema = z.object({
  submit: z.boolean().default(false),
  scores: z.array(z.object({
    criterion_id: z.string().uuid(),
    raw_score: z.number().int()
  }))
});

router.get('/submissions/:submissionId/evaluation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await scoringService.getEvaluation(req.user!.id, req.params.submissionId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.put('/submissions/:submissionId/evaluation', validate(saveEvalSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await scoringService.saveEvaluation(
      req.user!.id,
      req.params.submissionId,
      req.body.scores,
      req.body.submit
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
