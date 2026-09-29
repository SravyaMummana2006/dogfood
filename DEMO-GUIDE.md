# DOGFOOD 2026 — Technical Demonstration & Verification Guide

This document provides a step-by-step technical walkthrough for evaluating, testing, and demonstrating DOGFOOD 2026. It includes exact UI navigation paths, cURL API commands, technical talking points, and verification checks.

---

## 1. Demo Preparation

Start a clean self-hosted instance using Docker Compose:

```bash
# 1. Reset existing volumes & boot fresh environment
docker compose down -v
docker compose up -d --build

# 2. Confirm containers are healthy
docker compose ps
```

- **Web UI**: Open [http://localhost:3000](http://localhost:3000)
- **API Endpoint**: `http://localhost:8080/api`

---

## 2. Seeded Demo Accounts

All accounts are pre-seeded in `fixtures.json` and authenticate with password **`dogfood2026`**:

| Role | Email | Password | Primary Capabilities |
| --- | --- | --- | --- |
| **Organizer** | `organizer@dogfood.local` | `dogfood2026` | Event creation, rubric policies, judge assignments, CSV export, webhooks, records |
| **Judge A** | `judge_a@dogfood.local` | `dogfood2026` | View assigned projects, submit scores for assigned projects |
| **Judge B** | `judge_b@dogfood.local` | `dogfood2026` | View assigned projects, submit scores for assigned projects |
| **Participant** | `participant@dogfood.local` | `dogfood2026` | Project submission, community voting, submission comments |

---

## 3. Step-by-Step Technical Demonstration Flow

### Part 1 — Organizer Event & Policy Configuration
1. Open [http://localhost:3000](http://localhost:3000) and log in as `organizer@dogfood.local` (`dogfood2026`).
2. Navigate to **Dashboard** → View active hackathon `Sample Hack 2026`.
3. Navigate to **Judging Policies** → Inspect published policy `Sample Hackathon Judging Policy`.
4. Point out the rubric criteria:
   - *Technical Complexity* (min=1, max=10, weight=50%)
   - *Design & Usability* (min=1, max=5, weight=30%)
   - *Impact & Presentation* (min=0, max=100, weight=20%)
   - Total Weight Sum = **100%**.

> **What to Say**: *"The policy locks editing as soon as it is marked PUBLISHED. Criteria bounds can differ across criteria, but the total weight must sum to exactly 100%. All score math is calculated server-side based on these published weights."*

---

### Part 2 — Participant Submission & Community Features (T3)
1. Log out, then log in as `participant@dogfood.local` (`dogfood2026`).
2. Open **Gallery** (`http://localhost:3000/gallery`).
3. Click on a submission (e.g. `prj_02` - *EchoSphere*).
4. Click **Vote for Submission** → Vote counter increases by 1.
5. Attempt to click **Vote for Submission** again → Toast displays *"User has already voted for this submission"*.
6. Add a public comment: *"Great technical implementation!"* → Click **Post Comment** → Comment appears in the discussion thread.

> **What to Say**: *"Community voting is enforced at the database level by a composite UNIQUE constraint on (submission_id, user_id). A user cannot double-vote by refreshing the page or firing parallel API requests."*

---

### Part 3 — Judge Assignment & Isolation (T2)
1. Log out, then log in as `judge_a@dogfood.local` (`dogfood2026`).
2. Open **Judging Dashboard** (`http://localhost:3000/judging`).
3. Observe assigned submission: `prj_07` (*Dry Harbour*).
4. Notice that Judge A **cannot** see submissions assigned strictly to Judge B or unassigned projects.

> **What to Say**: *"Judge isolation is strictly enforced in SQL via `WHERE judge_user_id = $auth_user_id`. Judges cannot view unassigned projects, nor can they view peer scores submitted by other judges."*

---

### Part 4 — Score Integrity: Draft → Submitted → Locked (T2)
1. As Judge A, click **Evaluate** on `prj_07`.
2. Input raw scores:
   - Technical Complexity: `8` (out of 10)
   - Design & Usability: `4` (out of 5)
   - Impact & Presentation: `75` (out of 100)
3. Click **Save Draft** → Status displays `DRAFT`.
4. Open a second browser tab as `organizer@dogfood.local` → Check **Results** → Notice `prj_07` score is `N/A`. Draft scores do not affect rankings.
5. Switch back to Judge A tab → Click **Submit Evaluation** → Status transitions to `SUBMITTED`.
6. Attempt to edit the form fields → Inputs are disabled and locked.

> **What to Say**: *"Draft scores never impact the leaderboard. Once marked SUBMITTED, the evaluation is permanently locked by both scoring.service.ts and frontend guards. Re-submitting to an already submitted evaluation endpoint returns a 409 Conflict error."*

---

### Part 5 — Deterministic Aggregation & Results Export (T2)
1. Log in as `organizer@dogfood.local` (`dogfood2026`).
2. Navigate to **Results** (`http://localhost:3000/results`).
3. Observe `prj_07` calculated total score:
   - Technical: $(8 - 1)/(10 - 1) \times 50 = 38.8889$
   - Design: $(4 - 1)/(5 - 1) \times 30 = 22.5000$
   - Impact: $(75 - 0)/(100 - 0) \times 20 = 15.0000$
   - Evaluation Total = **76.3889**.
4. Click **Export CSV** → Browser downloads `export.csv` containing standings.

> **What to Say**: *"Min-max normalization maps raw scores of varying ranges onto a 0.0 to 1.0 ratio before weighting. Aggregation is deterministic and calculated entirely on the server using 4-decimal NUMERIC precision."*

---

### Part 6 — Audit Log Immutability Verification (T3)
1. In the Organizer dashboard, navigate to **Audit Log** (`http://localhost:3000/audit`).
2. View recorded events for evaluation submission, policy publishing, and team creation.
3. Open a terminal and query PostgreSQL directly:
   ```bash
   docker exec -it dogfood-db psql -U dogfood -d dogfood -c "DELETE FROM audit_events;"
   ```
4. Observe output:
   `ERROR: Audit events are immutable and cannot be updated or deleted`

> **What to Say**: *"Audit trail immutability is not just an application convention. It is backed by a PostgreSQL trigger `trg_prevent_audit_update` executing `prevent_audit_modification()` that throws a database exception on any SQL UPDATE or DELETE attempt."*

---

### Part 7 — Advanced Integrations: Webhooks & Verifiable Records (T4)

#### 1. Webhook Outbox Execution
- Navigate to **Settings** → Webhooks → Add URL `http://localhost:8080/api/health` → Click **Save**.
- Trigger a submission action → Check Webhook Deliveries log → Status displays `200 OK`.

#### 2. Ed25519 Signed Certificate Verification
- Navigate to **Results** → Click **Finalize Event & Generate Records**.
- Issue API call `POST /api/hackathons/:id/verifiable-records/issue`.
- Open verification page: `http://localhost:3000/records/<record-id>`.
- UI displays: `Status: VERIFIED (Ed25519 Cryptographic Signature Valid)`.

#### 3. Embeddable Gallery Widget
- Open `http://localhost:3000/embed/gallery`.
- Renders lightweight, borderless public gallery secured with `Content-Security-Policy: frame-ancestors *`.

---

## 4. Summary of Verification Statements

| Verification Action | Expected System Result | Technical Guarantee |
| --- | --- | --- |
| **Submit after deadline** | HTTP 403 Forbidden | Server timestamp query against `submissions_close` |
| **Double vote** | HTTP 409 Conflict | Database `UNIQUE(submission_id, user_id)` constraint |
| **Edit submitted score** | HTTP 409 Conflict | Service checks `evaluations.status === 'SUBMITTED'` |
| **Delete audit log** | PostgreSQL Error | Database trigger `trg_prevent_audit_update` |
| **Verify tampered record** | Status: INVALID | Ed25519 signature mathematical mismatch |
