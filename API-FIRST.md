# API-First Architecture & Specification

## 1. What API-First Means Here

DOGFOOD 2026 is engineered strictly as an **API-first** platform. Every feature, administrative operation, submission pipeline, score evaluation, and export utility is exposed via a formally documented REST API. The React Single-Page Application (SPA) functions as an unprivileged client consumer with zero direct database connections, zero authority over permissions, and zero client-side score calculations.

---

## 2. Trust Boundary Diagram

```mermaid
flowchart TD

    subgraph CLIENT["Untrusted Client Zone"]
        UI["React 19 SPA"]
        CURL["cURL / External HTTP Client"]
    end

    subgraph ROUTER["Express Router Layer (openapi.yaml)"]
        ROUTER_IN["HTTP Dispatcher"]
        AUTH_MW["auth.ts (Token Verification)"]
        AUTHZ_MW["auth.ts (requireAdmin / Role Check)"]
        ZOD_MW["validate.ts (Zod Input Validation)"]
    end

    subgraph BUSINESS["Server Business Logic"]
        NORM["Scoring & Normalization Engine"]
        DEADLINE["Deadline Enforcement"]
        AUDIT_SVC["Audit Log Generator"]
        SIGN_SVC["Ed25519 Signing Engine"]
    end

    subgraph DATA["Protected Persistence"]
        DB[("PostgreSQL 16")]
    end

    UI -->|HTTP / JSON + Bearer Token| ROUTER_IN
    CURL -->|HTTP / JSON + Bearer Token| ROUTER_IN
    ROUTER_IN --> AUTH_MW
    AUTH_MW --> AUTHZ_MW
    AUTHZ_MW --> ZOD_MW
    ZOD_MW --> BUSINESS
    BUSINESS --> NORM & DEADLINE & AUDIT_SVC & SIGN_SVC
    NORM & DEADLINE & AUDIT_SVC & SIGN_SVC <-->|Parameterized SQL| DB
```

---

## 3. Layer Separation (Frontend → API → Database)

1. **Frontend Layer (`frontend/src/`)**: Renders UI components, captures user input, and issues HTTP requests via Axios (`src/services/api.ts`). Performs client-side UX routing only.
2. **API Layer (`backend/src/routes/`)**: Express controllers validate request schemas (Zod), verify session tokens in the database, check permissions, execute business logic, open DB transactions, and format standard JSON responses.
3. **Database Layer (`backend/migrations/`)**: PostgreSQL 16 executes parameterized SQL queries, enforcing foreign keys, uniqueness constraints, and audit immutability triggers.

---

## 4. UI Action to API Endpoint Mapping

| UI Action | HTTP Method & Endpoint | Auth Required | Server-Side Validation | Persistent Database Effect |
| --- | --- | --- | --- | --- |
| **Register User** | `POST /api/auth/register` | Public | Email format, password length 8-128 chars | Inserts into `users` table |
| **Login** | `POST /api/auth/login` | Public | Verifies Argon2id password hash | Inserts into `sessions` table |
| **List Hackathons** | `GET /api/public/hackathons` | Public | Filters status = 'ACTIVE' or 'COMPLETED' | Read-only |
| **Create Submission** | `POST /api/public/submit` | Participant | Checks `submissions_close` deadline | Inserts into `submissions` table |
| **View Assignments** | `GET /api/judging/assignments` | Judge | Filters by requesting `judge_user_id` | Read-only |
| **Submit Evaluation** | `PUT /api/judging/submissions/:id/evaluation` | Judge | Validates assignment & rubric min/max bounds | Inserts into `evaluations` & `evaluation_scores` |
| **Export Standings CSV** | `GET /api/hackathons/:id/export.csv` | Organizer | Verifies `is_admin === true` | Reads aggregated standings |
| **Cast Vote** | `POST /api/public/submissions/:id/vote` | Participant | Verifies 1 vote per user per submission | Inserts into `community_votes` table |
| **Create Comment** | `POST /api/public/submissions/:id/comments` | Participant | Verifies comment non-empty & length | Inserts into `submission_comments` table |
| **Generate Records** | `POST /api/hackathons/:id/verifiable-records/issue` | Organizer | Verifies hackathon status = 'COMPLETED' | Inserts Ed25519-signed record into `verifiable_records` |
| **Fetch Record** | `GET /api/public/records/:recordId` | Public | Verifies recordId UUID format | Read-only |
| **Fetch Signing Keys** | `GET /api/public/keys` | Public | None | Returns active & historical public keys |
| **Create Webhook** | `POST /api/hackathons/:id/webhooks` | Organizer | Zod URL schema validation | Inserts into `webhooks` table |
| **Bulk Import** | `POST /api/hackathons/import` | Organizer | Atomic transaction & relational integrity check | Reconstructs relational tree |

---

## 5. Example Complete Request & Response Flow

### Request: Submit Judge Evaluation
```http
PUT /api/judging/submissions/37c676c2-52b2-4474-ae90-25039d610169/evaluation HTTP/1.1
Host: localhost:8080
Authorization: Bearer 4a6b090e5802855d27e4b2140175c0fa1f9d96a7d6b79ffa294e67598cbe54a9
Content-Type: application/json

{
  "submit": true,
  "scores": [
    {
      "criterion_id": "c1a2b3c4-0000-0000-0000-000000000001",
      "raw_score": 4
    },
    {
      "criterion_id": "c1a2b3c4-0000-0000-0000-000000000002",
      "raw_score": 8
    }
  ]
}
```

### Response: Success HTTP 200 OK
```json
{
  "data": {
    "id": "e9f8a7b6-1111-2222-3333-444455556666",
    "assignment_id": "a1b2c3d4-4444-5555-6666-777788889999",
    "status": "SUBMITTED",
    "total_score": 75.0000,
    "scores": [
      {
        "criterion_id": "c1a2b3c4-0000-0000-0000-000000000001",
        "raw_score": 4.0000,
        "normalized_score": 0.7500,
        "weighted_score": 30.0000
      },
      {
        "criterion_id": "c1a2b3c4-0000-0000-0000-000000000002",
        "raw_score": 8.0000,
        "normalized_score": 0.7500,
        "weighted_score": 45.0000
      }
    ]
  }
}
```

---

## 6. Server-Side Validation, Scoring & Deadline Enforcement

- **Validation**: Input bodies are parsed through Zod schemas in `backend/src/middleware/validate.ts`. Invalid payloads return HTTP `400 Bad Request` with an itemized array of error details.
- **Score Calculation**: The React UI never calculates normalized or weighted scores. The API receives raw integers in `scoring.service.ts` (`saveEvaluation`), fetches criterion min/max bounds and percentage weights from PostgreSQL, computes the normalized ratio `(raw - min)/(max - min)`, and stores 4-decimal precision values.
- **Deadline Enforcement**: Project creation and community voting endpoints query `hackathons.submissions_close`. If `NOW() > submissions_close`, the API returns HTTP `403 Forbidden` (`"Submissions are closed for this hackathon"`).

---

## 7. OpenAPI Specification & Validation

- **Specification Standard**: OpenAPI 3.0.3.
- **File Location**: `openapi.yaml` in the root repository directory.
- **Validation**: Evaluated using `@redocly/cli`.
- **Validation Command**:
  ```bash
  npx @redocly/cli lint openapi.yaml
  ```
- **Validation Output**: `openapi.yaml: validated in 56ms. Woohoo! Your API description is valid.`

---

## 8. Reproducing API Calls (cURL & PowerShell Examples)

### Check Health Endpoint
```bash
curl -X GET http://localhost:8080/api/health
```

### Authenticate & Get Bearer Token
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"judge_a@dogfood.local","password":"dogfood2026"}'
```

### Fetch Assigned Submissions (PowerShell Example)
```powershell
$headers = @{ "Authorization" = "Bearer 4a6b090e5802855d27e4b2140175c0fa1f9d96a7d6b79ffa294e67598cbe54a9" }
Invoke-RestMethod -Uri "http://localhost:8080/api/judging/assignments" -Headers $headers -Method Get
```
