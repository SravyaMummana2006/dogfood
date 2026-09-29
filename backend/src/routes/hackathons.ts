import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, requireOrganizer } from '../middleware/auth';
import * as domainService from '../services/domain.service';
import * as scoringService from '../services/scoring.service';
import { issueVerifiableRecords } from '../services/records.service';
import { exportEvent, importEvent } from '../services/migration.service';

const router = Router();

router.post('/import', requireAuth, requireOrganizer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await importEvent(req.body, req.user!.id);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/context', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = require('../db').getPool();
    const userId = req.user!.id;
    const hackathonId = req.params.id;
    
    const { rows: hRows } = await pool.query('SELECT id FROM hackathons WHERE id = $1', [hackathonId]);
    if (hRows.length === 0) return res.status(404).json({ error: 'Hackathon not found' });

    const { rows: pRows } = await pool.query(
      `SELECT 1 FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE t.hackathon_id = $1 AND tm.user_id = $2 LIMIT 1`,
      [hackathonId, userId]
    );

    const { rows: jRows } = await pool.query(
      `SELECT 1 FROM judge_assignments WHERE hackathon_id = $1 AND judge_user_id = $2 LIMIT 1`,
      [hackathonId, userId]
    );
    
    const { rows: iRows } = await pool.query(
      `SELECT 1 FROM judge_invitations WHERE hackathon_id = $1 AND judge_user_id = $2 LIMIT 1`,
      [hackathonId, userId]
    );

    res.json({ 
      data: { 
        is_participant: pRows.length > 0, 
        is_judge: jRows.length > 0 || iRows.length > 0 
      } 
    });
  } catch (err) {
    next(err);
  }
});

// Zod schemas
const createHackathonSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).default(''),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

const createSubmissionSchema = z.object({
  team_id: z.string().uuid(),
  title: z.string().trim().min(1).max(255),
});

const createAssignmentSchema = z.object({
  judge_user_id: z.string().uuid(),
  submission_id: z.string().uuid(),
});

// Protect all hackathon routes
router.use(requireAuth, requireOrganizer);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const hackathons = await domainService.listHackathons();
    res.json({ data: hackathons });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createHackathonSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hackathon = await domainService.createHackathon(req.body.name, req.body.description, req.user!.id);
    res.status(201).json({ data: hackathon });
  } catch (err) {
    next(err);
  }
});

const setPolicySchema = z.object({
  policy_id: z.string().uuid(),
});

router.put('/:id/policy', validate(setPolicySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hackathon = await domainService.setHackathonPolicy(req.params.id, req.body.policy_id, req.user!.id);
    res.json({ data: hackathon });
  } catch (err) {
    next(err);
  }
});

const setStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']),
});

router.put('/:id/status', validate(setStatusSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hackathon = await domainService.updateHackathonStatus(req.params.id, req.body.status, req.user!.id);
    res.json({ data: hackathon });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/teams', requireAuth, requireOrganizer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = require('../db').getPool();
    const hackathonId = req.params.id;
    
    // Verify hackathon exists
    const { rows: hRows } = await pool.query('SELECT id FROM hackathons WHERE id = $1', [hackathonId]);
    if (hRows.length === 0) return res.status(404).json({ error: 'Hackathon not found' });
    
    const { rows } = await pool.query(
      `SELECT 
        t.id, 
        t.name, 
        t.created_at, 
        s.id as submission_id,
        s.title as submission_title,
        (
          SELECT json_agg(json_build_object(
            'id', u.id, 
            'email', u.email, 
            'display_name', u.display_name
          ))
          FROM team_members tm
          JOIN users u ON tm.user_id = u.id
          WHERE tm.team_id = t.id
        ) as members
      FROM teams t
      LEFT JOIN submissions s ON s.team_id = t.id
      WHERE t.hackathon_id = $1
      ORDER BY t.created_at DESC`,
      [hackathonId]
    );
    
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/teams', validate(createTeamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await domainService.createTeam(req.params.id, req.body.name);
    res.status(201).json({ data: team });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submissions', validate(createSubmissionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = await domainService.createSubmission(req.params.id, req.body.team_id, req.body.title);
    res.status(201).json({ data: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/assignments', validate(createAssignmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assignment = await domainService.assignJudge(req.params.id, req.body.submission_id, req.body.judge_user_id, req.user!.id);
    res.status(201).json({ data: assignment });
  } catch (err) {
    next(err);
  }
});

const createInvitationSchema = z.object({
  judge_user_id: z.string().uuid(),
  submission_id: z.string().uuid(),
});

router.post('/:id/invitations', validate(createInvitationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitation = await domainService.createJudgeInvitation(req.params.id, req.body.submission_id, req.body.judge_user_id, req.user!.id);
    res.status(201).json({ data: invitation });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/export', requireAuth, requireOrganizer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artifact = await exportEvent(req.params.id, req.user!.id);
    res.json(artifact);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/results', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await scoringService.getHackathonResults(req.params.id, req.user!.id);
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/export.csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await scoringService.getHackathonResults(req.params.id, req.user!.id);
    
    const fields = [
      'submission_id', 'title', 'team_id', 'total_assignments', 
      'submitted_evaluations', 'missing_evaluations', 'aggregate_score', 'status'
    ];
    
    let csv = fields.join(',') + '\n';
    
    for (const row of data.results) {
      const line = fields.map(field => {
        let val = (row as any)[field];
        if (val === null || val === undefined) {
          return '';
        }
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csv += line.join(',') + '\n';
    }
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hackathon-results.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});


const setSettingsSchema = z.object({
  required_judges: z.number().int().min(1).nullable(),
});

router.put('/:id/judging-settings', validate(setSettingsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hackathon = await domainService.updateHackathonJudgingSettings(req.params.id, req.body.required_judges, req.user!.id);
    res.json({ data: hackathon });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/verifiable-records/issue', requireAuth, requireOrganizer, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await issueVerifiableRecords(req.params.id, req.user!.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

import webhooksRouter from './webhooks';
router.use('/:id/webhooks', webhooksRouter);

export default router;

