import fs from 'fs';
import path from 'path';
import { getPool } from './db';
import * as argon2 from 'argon2';

const FIXTURES_PATH = path.join(__dirname, '../../fixtures.json');

// Deterministic UUIDs for entities referenced by .dogfood.toml
const STABLE_HACKATHON_ID = '0e86bb0a-b4ae-49c6-845b-83e216c4d334';
const STABLE_SUBMISSION_PRJ07_ID = '37c676c2-52b2-4474-ae90-25039d610169';

export async function seedFixtures() {
  const pool = getPool();
  console.log('Loading fixtures from', FIXTURES_PATH);
  const data = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const judgeIdMap = new Map<string, string>();
    const participantEmailMap = new Map<string, string>();
    const teamIdMap = new Map<string, string>();
    const projectIdMap = new Map<string, string>();

    const passwordHash = await argon2.hash('dogfood2026', { type: argon2.argon2id });

    console.log('Creating organizer user...');
    const { rows: orgRows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name, is_admin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET is_admin = EXCLUDED.is_admin, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['organizer@dogfood.local', passwordHash, 'Organizer', true]
    );
    const organizerId = orgRows[0].id;

    const evt = data.event;
    console.log(`Inserting event: ${evt.name}`);
    const { rows: hackathonRows } = await client.query(
      `INSERT INTO hackathons (id, name, description, status, created_by, submissions_close)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [STABLE_HACKATHON_ID, evt.name, 'Imported from fixtures', 'ACTIVE', organizerId, evt.submissions_close]
    );
    const hackathonId = hackathonRows[0].id;

    console.log('Creating test users...');
    const usersToCreate = [
      { email: 'judge_a@dogfood.local', name: 'Judge A (tomas.varga)', is_admin: false },
      { email: 'judge_b@dogfood.local', name: 'Judge B (wei.lindqvist)', is_admin: false },
      { email: 'participant@dogfood.local', name: 'Participant', is_admin: false }
    ];
    for (const u of usersToCreate) {
      await client.query(
        `INSERT INTO users (email, password_hash, display_name, is_admin)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET is_admin = EXCLUDED.is_admin, password_hash = EXCLUDED.password_hash`,
        [u.email, passwordHash, u.name, u.is_admin]
      );
    }
    
    const testJudgeA = await client.query(`SELECT id FROM users WHERE email = 'judge_a@dogfood.local'`);
    judgeIdMap.set('jdg_01', testJudgeA.rows[0].id);
    const testJudgeB = await client.query(`SELECT id FROM users WHERE email = 'judge_b@dogfood.local'`);
    judgeIdMap.set('jdg_02', testJudgeB.rows[0].id);
    
    const partRows = await client.query(`SELECT id FROM users WHERE email = 'participant@dogfood.local'`);
    const participantId = partRows.rows[0].id;
    
    const insertSession = async (uid: string, tok: string) => {
      await client.query(`INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '100 years') ON CONFLICT DO NOTHING`, [uid, tok]);
    };
    
    await insertSession(organizerId, '32b27833a966cd6444bf08bdb6f0320259e0ffd0a4c04e8c4c94ee3c195a6961');
    await insertSession(testJudgeA.rows[0].id, '4a6b090e5802855d27e4b2140175c0fa1f9d96a7d6b79ffa294e67598cbe54a9');
    await insertSession(testJudgeB.rows[0].id, '0f44a38f9c1b544503d2d75dafc16a9e1496ccbdc8f08329c8678c9f5e63482a');
    await insertSession(participantId, '458e21e5ba6722f8c579e34af0e81bcb5987e1d485c6b3a1c04bb7ab1d38f37f');

    console.log(`Inserting ${data.judges.length} judges...`);
    for (const jdg of data.judges) {
      if (jdg.id === 'jdg_01' || jdg.id === 'jdg_02') continue; 

      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name, is_admin)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash
         RETURNING id`,
        [jdg.email, passwordHash, jdg.name]
      );
      judgeIdMap.set(jdg.id, rows[0].id);
    }

    console.log(`Inserting participants from teams...`);
    for (const team of data.teams) {
      for (const email of team.members) {
        if (participantEmailMap.has(email)) continue;
        const { rows } = await client.query(
          `INSERT INTO users (email, password_hash, display_name, is_admin)
           VALUES ($1, $2, $3, false)
           ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash
           RETURNING id`,
          [email, passwordHash, email.split('@')[0]]
        );
        participantEmailMap.set(email, rows[0].id);
      }
    }

    console.log(`Inserting ${data.teams.length} teams...`);
    for (const team of data.teams) {
      const { rows: tRows } = await client.query(
        `INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`,
        [hackathonId, team.name]
      );
      const teamId = tRows[0].id;
      teamIdMap.set(team.id, teamId);

      for (const email of team.members) {
        const userId = participantEmailMap.get(email);
        await client.query(
          `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [teamId, userId]
        );
      }
    }

    console.log(`Inserting ${data.projects.length} projects...`);
    for (const prj of data.projects) {
      const teamId = teamIdMap.get(prj.team);
      if (!teamId) throw new Error(`Team not found: ${prj.team}`);
      
      const isPrj07 = prj.id === 'prj_07';
      const insertQuery = isPrj07
        ? `INSERT INTO submissions (id, hackathon_id, team_id, title) VALUES ($1, $2, $3, $4) RETURNING id`
        : `INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING id`;
      const insertArgs = isPrj07
        ? [STABLE_SUBMISSION_PRJ07_ID, hackathonId, teamId, prj.title]
        : [hackathonId, teamId, prj.title];

      const { rows } = await client.query(insertQuery, insertArgs);
      projectIdMap.set(prj.id, rows[0].id);
    }
    
    const uuidA = projectIdMap.get('prj_07');
    const uuidB = projectIdMap.get('prj_41');
    if (uuidA && uuidB && uuidA === uuidB) {
       throw new Error('Verification failed: prj_07 and prj_41 mapped to the same submission UUID');
    }

    console.log(`Setting up policy and criteria for scores...`);
    const { rows: pRows } = await client.query(
      `INSERT INTO judging_policies (name, description, status, version, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Fixture Policy', 'Auto-generated from fixture scores', 'PUBLISHED', 1, organizerId]
    );
    const policyId = pRows[0].id;
    const criteriaNames = Object.keys(data.scores[0].criteria);
    const criteriaDetails = new Map<string, { id: string; weight: number; min_score: number; max_score: number }>();
    const weightPerCriterion = Math.floor(100 / criteriaNames.length);
    const maxScore = 5;

    for (const cName of criteriaNames) {
      const { rows: cRows } = await client.query(
        `INSERT INTO rubric_criteria (policy_id, name, description, min_score, max_score, weight)
         VALUES ($1, $2, $3, 1, $4, $5) RETURNING id`,
        [policyId, cName, `Score for ${cName}`, maxScore, weightPerCriterion]
      );
      criteriaDetails.set(cName, { id: cRows[0].id, weight: weightPerCriterion, min_score: 1, max_score: maxScore });
    }
    await client.query(`UPDATE hackathons SET policy_id = $1 WHERE id = $2`, [policyId, hackathonId]);

    console.log(`Inserting ${data.scores.length} scores...`);
    let importedScores = 0;
    
    for (const score of data.scores) {
      const judgeId = judgeIdMap.get(score.judge);
      const subId = projectIdMap.get(score.project);
      
      if (!judgeId) throw new Error(`Could not map judge fixture ID: ${score.judge}`);
      if (!subId) throw new Error(`Could not map project fixture ID: ${score.project}`);
      
      await client.query(
        `INSERT INTO judge_assignments (hackathon_id, judge_user_id, submission_id)
         VALUES ($1, $2, $3)`,
        [hackathonId, judgeId, subId]
      );
      
      let total_score = 0;
      const scoreRowsToInsert = [];
      
      for (const [cName, rawVal] of Object.entries(score.criteria)) {
        const crit = criteriaDetails.get(cName);
        if (!crit) throw new Error(`Criterion not found: ${cName}`);
        
        const raw_score = rawVal as number;
        const normalized_score =
          crit.max_score === crit.min_score
            ? 1
            : (raw_score - crit.min_score) /
              (crit.max_score - crit.min_score);

        const weighted_score = normalized_score * crit.weight;
        total_score += weighted_score;

        scoreRowsToInsert.push({
          criterion_id: crit.id,
          raw_score,
          normalized_score,
          weighted_score
        });
      }

      const { rows: evRows } = await client.query(
        `INSERT INTO evaluations (hackathon_id, submission_id, judge_user_id, policy_id, status, total_score)
         VALUES ($1, $2, $3, $4, 'SUBMITTED', $5) RETURNING id`,
        [hackathonId, subId, judgeId, policyId, total_score]
      );
      const evalId = evRows[0].id;

      for (const row of scoreRowsToInsert) {
        await client.query(
          `INSERT INTO evaluation_scores (evaluation_id, criterion_id, raw_score, normalized_score, weighted_score)
           VALUES ($1, $2, $3, $4, $5)`,
          [evalId, row.criterion_id, row.raw_score, row.normalized_score, row.weighted_score]
        );
      }
      importedScores++;
    }

    if (importedScores !== data.scores.length) {
      throw new Error(`Imported scores (${importedScores}) does not match fixture score count (${data.scores.length})`);
    }

    await client.query('COMMIT');
    console.log('Successfully seeded fixtures!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding fixtures:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedFixtures()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => {
      getPool().end();
    });
}
