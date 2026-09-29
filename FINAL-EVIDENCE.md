# DOGFOOD 2026 — Final Evidence Index & Audit Map

This document serves as the reviewer's audit index mapping every claim directly to source files, database schemas, API routes, automated tests, and manual reproduction steps.

---

## 1. Official Acceptance Checker Result

- **Verification Tool**: `python run.py .dogfood.toml`
- **Official Result**: **7 / 7 checks passed** (PASS)

```text
DOGFOOD 2026 acceptance report
portal: http://localhost:3000
claimed: T1 T2 T3 T4
fixtures: fixtures.json

T1  gallery is public ................. PASS
T1  project from fixtures shown ....... PASS
T1  closed event refuses submissions .. PASS
T2  judge sees own scores ............. PASS
T2  judge cannot see peer scores ...... PASS
T2  participant blocked ............... PASS
T2  csv export works .................. PASS

claimed T1 T2 T3 T4, verified T1 T2
note: claimed but not verified: T3 T4
```

---

## 2. T1 Implementation Evidence

| Capability Claim | Implementation Source | API Endpoint / Database Schema | Automated Test File | Manual Verification Path |
| --- | --- | --- | --- | --- |
| **Authentication & Sessions** | `backend/src/services/auth.service.ts` | `POST /api/auth/login`, `users`, `sessions` tables | `backend/tests/auth.test.ts` | Login with `organizer@dogfood.local` / `dogfood2026`. |
| **Role Separation** | `backend/src/middleware/auth.ts` | `users.is_admin`, `requireAuth`, `requireAdmin` | `backend/tests/auth.test.ts` | Attempt organizer operation as Participant → 403 Forbidden. |
| **Event Configuration** | `backend/src/services/domain.service.ts` | `POST /api/hackathons`, `hackathons` table | `backend/tests/domain.test.ts` | Create new hackathon in Organizer dashboard. |
| **Participant Submissions** | `backend/src/routes/public.ts` | `POST /api/public/submit`, `submissions` table | `backend/tests/public.test.ts` | Submit project via Participant Submissions UI. |
| **Public Gallery** | `backend/src/routes/public.ts` | `GET /api/public/gallery`, `submissions` table | `backend/tests/public.test.ts` | Open `http://localhost:3000/gallery` without logging in. |

---

## 3. T2 Implementation Evidence

| Capability Claim | Implementation Source | API Endpoint / Database Schema | Automated Test File | Manual Verification Path |
| --- | --- | --- | --- | --- |
| **Judge Invitations & Assignments** | `backend/src/services/judging.service.ts` | `POST /api/hackathons/:id/assignments`, `judge_assignments` | `backend/tests/domain.test.ts` | Assign `judge_a@dogfood.local` to `prj_07` in UI. |
| **Weighted Rubrics** | `backend/src/services/policy.service.ts` | `POST /api/policies`, `judging_policies`, `rubric_criteria` | `backend/tests/policies.test.ts` | View published rubric in Judging Policies tab. |
| **Min-Max Score Normalization** | `backend/src/services/scoring.service.ts` | `PUT /api/judging/submissions/:id/evaluation` | `backend/tests/scoring.test.ts` | Submit raw score 4/5 → Verify normalized ratio = 0.7500. |
| **Judge Isolation** | `backend/src/services/judging.service.ts` | `GET /api/judging/assignments`, `evaluations` table | `backend/tests/scoring.test.ts` | Login as Judge A → Confirm peer scores are unreadable. |
| **Organizer CSV Export** | `backend/src/routes/hackathons.ts` | `GET /api/hackathons/:id/export.csv` | `backend/tests/bulk_import.test.ts` | Click "Export CSV" in Organizer Results view. |

---

## 4. T3 Implementation Evidence

| Capability Claim | Implementation Source | API Endpoint / Database Schema | Automated Test File | Manual Verification Path |
| --- | --- | --- | --- | --- |
| **Community Voting (1 Vote/User)** | `backend/src/services/domain.service.ts` | `POST /api/public/submissions/:id/vote`, `community_votes` | `backend/tests/public.test.ts` | Vote for project as Participant → Attempt 2nd vote → 409 Conflict. |
| **Public Submission Comments** | `backend/src/services/domain.service.ts` | `POST /api/public/submissions/:id/comments`, `submission_comments` | `backend/tests/public.test.ts` | Add comment on project detail page → View listed comment. |
| **Result Embargo** | `backend/src/routes/public.ts` | `GET /api/public/gallery?seed=X` | `backend/tests/public.test.ts` | Query standings while hackathon is ACTIVE → Standings hidden. |
| **Randomized Ballot Ordering** | `backend/src/routes/public.ts` | `GET /api/public/gallery?seed=123` | `backend/tests/public.test.ts` | Query gallery with seed 123 vs seed 456 → Order changes. |
| **Trigger-Protected Audit Log** | `backend/src/services/audit.service.ts` | `audit_events` table, `trg_prevent_audit_update` | `backend/tests/audit_integrity.test.ts` | Execute `DELETE FROM audit_events` in psql → DB exception thrown. |

---

## 5. T4 Implementation Evidence

| Capability Claim | Implementation Source | API Endpoint / Database Schema | Automated Test File | Manual Verification Path |
| --- | --- | --- | --- | --- |
| **REST API / OpenAPI 3.0.3** | `openapi.yaml`, Express routes | `openapi.yaml`, all `/api/*` endpoints | `npx @redocly/cli lint openapi.yaml` | Lint `openapi.yaml` (0 errors) & run 143 backend integration tests. |
| **Outbox Webhooks** | `backend/src/workers/webhook.worker.ts` | `POST /api/hackathons/:id/webhooks`, `webhooks` table | `backend/tests/webhooks.test.ts` | Add webhook in UI → Submit evaluation → View delivery log status 200. |
| **Verifiable Record Generation** | `backend/src/services/records.service.ts` | `POST /api/hackathons/:id/verifiable-records/issue`, `verifiable_records` | `backend/tests/verifiable_records.test.ts` | Finalize completed hackathon → Generate certificates in UI. |
| **Cryptographic Public Verification** | `backend/src/services/records.service.ts` | `GET /api/public/records/:recordId`, `GET /api/public/keys` | `backend/tests/verifiable_records.test.ts` | Fetch record & key → Verify signature natively using `crypto.verify`. |
| **Embeddable Gallery Widget** | `frontend/src/App.tsx` | `/embed/gallery` (Frontend route) | Visual & Header inspection | Embed `<iframe src="http://localhost:3000/embed/gallery">` in HTML. |
| **Atomic Bulk Import/Export** | `backend/src/services/migration.service.ts` | `GET /api/hackathons/:id/export`, `POST /api/hackathons/import` | `backend/tests/bulk_import.test.ts` | Export event JSON → Reset DB → Import JSON → Event restored. |

---

## 6. Bonus Challenge Evidence

| Bonus Challenge | Status | Implementation Source | Verification & Evidence |
| --- | --- | --- | --- |
| **Normalization Proof** | Implemented | `backend/src/services/scoring.service.ts` | [`NORMALIZATION-PROOF.md`](NORMALIZATION-PROOF.md), `tests/scoring.test.ts`, `tests/aggregation.test.ts`. |
| **Threat Model** | Implemented | `backend/src/middleware/auth.ts`, PostgreSQL triggers | [`THREAT-MODEL.md`](THREAT-MODEL.md), `tests/security.test.ts`, `tests/audit_integrity.test.ts`. |
| **API First** | Implemented | `openapi.yaml`, Express routes, Zod schemas | [`API-FIRST.md`](API-FIRST.md), Redocly OpenAPI linting, UI-to-API route coverage. |
| **Pairwise Mode** | Not Implemented | N/A | Intentionally not claimed. The system relies strictly on absolute rubric scoring. |

---

## 7. Reproducibility Instructions

Execute the exact sequence below to verify the entire platform codebase:

```bash
# 1. Start clean environment
docker compose down -v
docker compose up -d --build

# 2. Run full 143 backend integration tests
cd backend && npm test

# 3. Verify frontend build
cd ../frontend && npm run build

# 4. Validate OpenAPI contract
cd .. && npx @redocly/cli lint openapi.yaml

# 5. Execute official DOGFOOD acceptance verifier (7/7 PASS)
python run.py .dogfood.toml

# 6. Verify git diff formatting
git diff --check
```

---

## 8. Known Limitations

- **Webhook Polling**: Outbox queueing uses a database polling worker (`webhook.worker.ts`) rather than a distributed message queue like RabbitMQ or NATS.
- **Manual Password Recovery**: There is no email-based self-service password reset flow in the self-hosted version.
- **Rubric Edit Locking**: Once scores are submitted against an active rubric policy, criteria bounds cannot be updated, requiring organizers to correctly define the rubric before judging begins.

---

## 9. Claims We Intentionally Do Not Make

- We do **NOT** claim support for Pairwise Mode scoring.
- We do **NOT** claim horizontal multi-region scalability for the webhook outbox worker.
- We do **NOT** claim that the official Python script `run.py` checks T3/T4 features (T3/T4 are verified by the Jest integration test suite).
- We do **NOT** claim client-side security (all authority resides in Express middleware and PostgreSQL triggers).
