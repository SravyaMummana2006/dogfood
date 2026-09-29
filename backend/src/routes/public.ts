import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import { requireAuth } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// GET /api/public/hackathons
router.get('/hackathons', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, name, description, status, submissions_close
       FROM hackathons
       WHERE status = 'ACTIVE' OR status = 'COMPLETED'
       ORDER BY created_at ASC`
    );
    return res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching public hackathons:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/my-submission
router.get('/my-submission', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `SELECT s.id, s.title, s.hackathon_id 
       FROM submissions s
       JOIN team_members tm ON s.team_id = tm.team_id
       WHERE tm.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No submission found' });
    }
    return res.json({ data: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 votes per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many votes cast from this IP, please try again later.' }
});

// B. PUBLIC GALLERY
// NO authentication required. Returns real project titles from the DB.
// T3: Supports ?seed= parameter for deterministic pseudo-random ballot ordering.
router.get('/gallery', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const seed = req.query.seed ? String(req.query.seed) : null;
    
    let query = `
      SELECT s.id, s.title, t.name as team_name 
      FROM submissions s 
      JOIN teams t ON s.team_id = t.id
    `;
    const params: string[] = [];

    if (seed) {
      // Deterministic random order using MD5 hash of (submission_id + seed)
      query += ` ORDER BY md5(s.id::text || $1::text)`;
      params.push(seed);
    } else {
      query += ` ORDER BY s.created_at ASC`;
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Gallery error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// G. PUBLIC RESULTS (T3 Embargoed)
// GET /api/public/hackathons/:hackathonId/results
router.get('/hackathons/:hackathonId/results', async (req: Request, res: Response) => {
  const pool = getPool();
  const { hackathonId } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(hackathonId)) {
    return res.status(404).json({ error: 'Hackathon not found' });
  }

  try {
    const { rows: hRows } = await pool.query('SELECT status, submissions_close FROM hackathons WHERE id = $1', [hackathonId]);
    if (hRows.length === 0) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    const hackathon = hRows[0];
    const closeTime = hackathon.submissions_close ? new Date(hackathon.submissions_close).getTime() : null;

    // Embargo logic: results are hidden until the window closes
    if (hackathon.status !== 'COMPLETED' && (!closeTime || Date.now() < closeTime)) {
      return res.status(403).json({ error: 'Results are embargoed until the hackathon window closes.' });
    }

    // Return public results (aggregate scores and vote counts)
    const { rows: submissions } = await pool.query(
      `SELECT s.id, s.title, t.name as team_name
       FROM submissions s
       JOIN teams t ON s.team_id = t.id
       WHERE s.hackathon_id = $1`,
      [hackathonId]
    );

    const { rows: votes } = await pool.query(
      `SELECT submission_id, count(*)::int as count FROM community_votes WHERE hackathon_id = $1 GROUP BY submission_id`,
      [hackathonId]
    );
    const votesMap = new Map(votes.map(v => [v.submission_id, v.count]));

    const { rows: evals } = await pool.query(
      `SELECT submission_id, total_score FROM evaluations WHERE hackathon_id = $1 AND status = 'SUBMITTED'`,
      [hackathonId]
    );
    
    const evalsMap = new Map<string, number[]>();
    evals.forEach(e => {
      if (!evalsMap.has(e.submission_id)) evalsMap.set(e.submission_id, []);
      evalsMap.get(e.submission_id)!.push(parseFloat(e.total_score));
    });

    const results = submissions.map(sub => {
      const subEvals = evalsMap.get(sub.id) || [];
      let aggregateScore = null;
      if (subEvals.length > 0) {
        const sum = subEvals.reduce((a, b) => a + b, 0);
        aggregateScore = Number((sum / subEvals.length).toFixed(4));
      }
      return {
        submission_id: sub.id,
        title: sub.title,
        team_name: sub.team_name,
        aggregate_score: aggregateScore,
        community_votes: votesMap.get(sub.id) || 0
      };
    });

    results.sort((a, b) => {
      const scoreA = a.aggregate_score || 0;
      const scoreB = b.aggregate_score || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.community_votes - a.community_votes;
    });

    return res.json({ results });
  } catch (err) {
    console.error('Public results error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// C. PARTICIPANT SUBMISSION ENDPOINT
// Requires participant auth, no organizer auth
router.post('/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, summary } = req.body;
    
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid title' });
    }

    const pool = getPool();
    
    // Find active hackathon (we just pick the most recent one for the sandbox)
    const { rows: hRows } = await pool.query(
      `SELECT id, submissions_close FROM hackathons ORDER BY created_at DESC LIMIT 1`
    );
    
    if (hRows.length === 0) {
      return res.status(400).json({ error: 'No active hackathon found' });
    }
    
    const hackathon = hRows[0];

    // D. REAL DEADLINE ENFORCEMENT
    // Check if submissions_close is set and in the past
    if (hackathon.submissions_close) {
      const closeTime = new Date(hackathon.submissions_close).getTime();
      const now = Date.now();
      if (now > closeTime) {
        return res.status(403).json({ error: 'Submission deadline has passed' });
      }
    }

    // Determine team_id for the participant.
    // If they don't have a team in this hackathon, we create one inline to satisfy constraints.
    const userId = req.user!.id;
    let teamId;
    const { rows: tRows } = await pool.query(
      `SELECT t.id FROM teams t 
       JOIN team_members tm ON t.id = tm.team_id 
       WHERE t.hackathon_id = $1 AND tm.user_id = $2 LIMIT 1`,
      [hackathon.id, userId]
    );

    if (tRows.length > 0) {
      teamId = tRows[0].id;
    } else {
      // Create personal team
      const { rows: newTRows } = await pool.query(
        `INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`,
          [hackathon.id, req.user!.display_name + "'s Team"]
        );
        const { emitWebhookEvent } = await import('../services/webhook.service');
        await emitWebhookEvent(pool as any, hackathon.id, 'event.team_created', { id: newTRows[0].id, name: req.user!.display_name + "'s Team" });
      teamId = newTRows[0].id;
      await pool.query(
        `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`,
        [teamId, userId]
      );
    }

    // Insert submission
    const { rows: sRows } = await pool.query(
      `INSERT INTO submissions (hackathon_id, team_id, title)
       VALUES ($1, $2, $3)
       RETURNING id, title`,
        [hackathon.id, teamId, title]
      );
      const { emitWebhookEvent } = await import('../services/webhook.service');
      await emitWebhookEvent(pool as any, hackathon.id, 'event.submission_created', { id: sRows[0].id, title });

    // We do not store `summary` or `repo_url` in the database as per instructions to not redesign the DB.
    res.status(201).json(sRows[0]);
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/submissions/:submissionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const { submissionId } = req.params;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid title' });
    }

    const pool = getPool();
    const userId = req.user!.id;

    const { rows: subRows } = await pool.query(
      `SELECT s.id, s.team_id, s.hackathon_id, h.submissions_close,
       EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = s.team_id AND tm.user_id = $2) as is_member
       FROM submissions s
       JOIN hackathons h ON s.hackathon_id = h.id
       WHERE s.id = $1`,
      [submissionId, userId]
    );

    if (subRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const sub = subRows[0];

    if (!sub.is_member) {
      return res.status(403).json({ error: 'Not authorized to edit this submission' });
    }

    if (sub.submissions_close) {
      const closeTime = new Date(sub.submissions_close).getTime();
      const now = Date.now();
      if (now > closeTime) {
        return res.status(403).json({ error: 'Submission deadline has passed' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { rows: updatedRows } = await client.query(
        `UPDATE submissions
         SET title = $1
         WHERE id = $2
         RETURNING id, title`,
        [title, submissionId]
      );

      const { recordAudit } = await import('../services/audit.service');
      await recordAudit(client, userId, 'SUBMISSION_EDITED', 'submissions', submissionId, { title });

      await client.query('COMMIT');
      res.status(200).json(updatedRows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// E. COMMUNITY VOTING (T3)
// POST /api/public/submissions/:submissionId/vote
router.post('/submissions/:submissionId/vote', requireAuth, voteLimiter, async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = req.user!.id;
  const { submissionId } = req.params;
  const { hackathon_id } = req.body || {};

  // Validate UUID formats to avoid database syntax errors
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(submissionId)) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  if (hackathon_id && !uuidRegex.test(hackathon_id)) {
    return res.status(400).json({ error: 'Invalid hackathon ID format' });
  }

  try {
    // 1. Fetch submission with team, hackathon, and deadline details
    const { rows: subRows } = await pool.query(
      `SELECT s.id, s.team_id, s.hackathon_id, h.status as hackathon_status, h.submissions_close,
       EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = s.team_id AND tm.user_id = $2) as is_own_team
       FROM submissions s
       JOIN hackathons h ON s.hackathon_id = h.id
       WHERE s.id = $1`,
      [submissionId, userId]
    );

    if (subRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const sub = subRows[0];

    // 2. Validate hackathon match if provided by client
    if (hackathon_id && sub.hackathon_id !== hackathon_id) {
      return res.status(400).json({ error: 'Submission does not belong to specified hackathon' });
    }

    // 3. Prevent self-voting (anti-cheating rule)
    if (sub.is_own_team) {
      return res.status(403).json({ error: 'Participants cannot vote for their own team submission' });
    }

    // 4. Enforce voting deadline (submissions_close)
    if (sub.submissions_close) {
      const closeTime = new Date(sub.submissions_close).getTime();
      if (Date.now() > closeTime) {
        return res.status(403).json({ error: 'Voting is closed for this event' });
      }
    }

    // 5. Insert vote within transaction with conflict handling
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: voteRows } = await client.query(
        `INSERT INTO community_votes (hackathon_id, submission_id, user_id)
         VALUES ($1, $2, $3)
         RETURNING id, hackathon_id, submission_id, created_at`,
        [sub.hackathon_id, submissionId, userId]
      );

      const { recordAudit } = await import('../services/audit.service');
      await recordAudit(client, userId, 'COMMUNITY_VOTE_CAST', 'submissions', submissionId, {
        hackathon_id: sub.hackathon_id
      });

      await client.query('COMMIT');
      return res.status(201).json({ data: voteRows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'You have already voted for this submission' });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Vote error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/submissions/:submissionId/votes
router.get('/submissions/:submissionId/votes', async (req: Request, res: Response) => {
  const pool = getPool();
  const { submissionId } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(submissionId)) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  try {
    const { rows: subRows } = await pool.query('SELECT id FROM submissions WHERE id = $1', [submissionId]);
    if (subRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const { rows } = await pool.query(
      `SELECT count(*)::int as count FROM community_votes WHERE submission_id = $1`,
      [submissionId]
    );

    return res.json({ submission_id: submissionId, votes: rows[0].count });
  } catch (err) {
    console.error('Get votes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// F. PUBLIC COMMENTS (T3)
// GET /api/public/submissions/:submissionId/comments
router.get('/submissions/:submissionId/comments', async (req: Request, res: Response) => {
  const pool = getPool();
  const { submissionId } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(submissionId)) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  try {
    const { rows: subRows } = await pool.query('SELECT id FROM submissions WHERE id = $1', [submissionId]);
    if (subRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const { rows } = await pool.query(
      `SELECT c.id, c.body, c.created_at, u.id as author_id, u.display_name as author_name
       FROM submission_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.submission_id = $1
       ORDER BY c.created_at ASC`,
      [submissionId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Get comments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/submissions/:submissionId/comments
router.post('/submissions/:submissionId/comments', requireAuth, async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = req.user!.id;
  const { submissionId } = req.params;
  const { body } = req.body;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(submissionId)) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'Comment body must be a non-empty string' });
  }

  if (body.length > 2000) {
    return res.status(400).json({ error: 'Comment body exceeds maximum length of 2000 characters' });
  }

  try {
    const { rows: subRows } = await pool.query(
      `SELECT s.id, h.status as hackathon_status, h.submissions_close 
       FROM submissions s
       JOIN hackathons h ON s.hackathon_id = h.id 
       WHERE s.id = $1`, 
      [submissionId]
    );
    if (subRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const sub = subRows[0];
    if (sub.hackathon_status !== 'COMPLETED' && sub.submissions_close) {
      const closeTime = new Date(sub.submissions_close).getTime();
      if (Date.now() > closeTime) {
        return res.status(403).json({ error: 'Commenting is closed for this event' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: commentRows } = await client.query(
        `INSERT INTO submission_comments (submission_id, user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, submission_id, body, created_at`,
        [submissionId, userId, body.trim()]
      );

      const { recordAudit } = await import('../services/audit.service');
      await recordAudit(client, userId, 'SUBMISSION_COMMENT_CREATED', 'submissions', submissionId, {
        comment_id: commentRows[0].id
      });

      await client.query('COMMIT');
      return res.status(201).json({ data: commentRows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create comment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/keys
router.get('/keys', async (req: Request, res: Response) => {
  const pool = getPool();
  try {
    const { rows } = await pool.query('SELECT kid, public_key, created_at, retired_at FROM server_signing_keys ORDER BY created_at DESC');
    const keys = rows.map(r => ({ ...r, algorithm: 'Ed25519' }));
    res.json({ data: { keys } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/records/:recordId
router.get('/records/:recordId', async (req: Request, res: Response) => {
  const pool = getPool();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.params.recordId)) {
    return res.status(404).json({ error: 'Record not found' });
  }
  try {
    const { rows } = await pool.query('SELECT id, type, payload, signature, kid, issued_at FROM verifiable_records WHERE id = $1', [req.params.recordId]);
    if (!rows.length) return res.status(404).json({ error: 'Record not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as publicRouter };
