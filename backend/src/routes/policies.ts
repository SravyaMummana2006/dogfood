import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, requireOrganizer } from '../middleware/auth';
import * as policyService from '../services/policy.service';

const router = Router();

// Zod schemas
const createPolicySchema = z.object({
  name: z.string().trim().min(1, 'Policy name is required').max(255, 'Policy name cannot exceed 255 characters'),
  description: z.string().trim().max(10000, 'Description is too long').default(''),
});

const criterionSchema = z.object({
  name: z.string().trim().min(1, 'Criterion name is required').max(255, 'Criterion name cannot exceed 255 characters'),
  description: z.string().trim().max(10000, 'Description is too long').default(''),
  min_score: z.number().int('Score must be an integer'),
  max_score: z.number().int('Score must be an integer'),
  weight: z.number().int('Weight must be an integer').min(0, 'Weight must be between 0 and 100').max(100, 'Weight must be between 0 and 100'),
  display_order: z.number().int().default(0),
}).refine(data => data.max_score > data.min_score, {
  message: "Maximum score must be greater than minimum score",
  path: ["max_score"],
});

// Enforce auth and organizer permissions on all routes
router.use(requireAuth, requireOrganizer);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await policyService.getPolicies();
    res.json({ data: policies });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  validate(createPolicySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const policy = await policyService.createPolicy(
        req.body.name,
        req.body.description,
        req.user!.id
      );
      res.status(201).json({ data: policy });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await policyService.getPolicy(req.params.id);
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/criteria',
  validate(criterionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criterion = await policyService.addCriterion(req.params.id, req.body);
      res.status(201).json({ data: criterion });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/:id/criteria/:criterionId',
  validate(criterionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criterion = await policyService.updateCriterion(
        req.params.id,
        req.params.criterionId,
        req.body
      );
      res.json({ data: criterion });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id/criteria/:criterionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await policyService.deleteCriterion(req.params.id, req.params.criterionId);
    res.json({ data: { message: 'Criterion deleted' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await policyService.publishPolicy(req.params.id, req.user!.id);
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
});

export default router;
