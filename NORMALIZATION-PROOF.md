# Mathematical Normalization Proof & Verification

## 1. Problem Statement

In multi-dimensional hackathon evaluation, rubric criteria often utilize different scoring scales. For example:
- **Technical Complexity**: Scored from `1` to `10` (10-point scale).
- **Presentation & Pitch**: Scored from `1` to `5` (5-point scale).

If raw scores from these criteria were summed directly without normalization, a 1-point variance in Technical Complexity (representing 10% of its range) would exert twice the mathematical influence of a 1-point variance in Presentation (representing 20% of its range). Direct raw summation distorts intended criteria weights.

To preserve intended percentage weights, every raw score must be mapped to a standardized `[0.0, 1.0]` ratio before applying percentage weights.

---

## 2. Implemented Formula

The scoring engine (`backend/src/services/scoring.service.ts` in function `saveEvaluation`) executes the following mathematical transformation:

### Min-Max Normalization Ratio
$$\text{normalized\_score} = \begin{cases} 1.0, & \text{if } \text{max\_score} = \text{min\_score} \\ \frac{\text{raw\_score} - \text{min\_score}}{\text{max\_score} - \text{min\_score}}, & \text{otherwise} \end{cases}$$

### Weighted Score Contribution
$$\text{weighted\_score} = \text{normalized\_score} \times \text{criterion\_weight}$$

### Evaluation Total
$$\text{evaluation\_total} = \sum_{c \in \text{criteria}} \text{weighted\_score}_c$$

### Aggregate Submission Score
$$\text{aggregate\_score} = \frac{1}{N} \sum_{e \in \text{submitted\_evaluations}} \text{evaluation\_total}_e$$

---

## 3. Worked Example — Single Criterion

Consider a criterion: **Code Quality**
- `min_score` = 1
- `max_score` = 5
- `raw_score` = 4
- `criterion_weight` = 40%

**Calculation Steps**:
1. **Subtract Minimum**: $\text{raw} - \text{min} = 4 - 1 = 3$
2. **Calculate Scale Range**: $\text{max} - \text{min} = 5 - 1 = 4$
3. **Compute Normalized Ratio**: $\text{normalized\_score} = \frac{3}{4} = 0.7500$
4. **Apply Percentage Weight**: $\text{weighted\_score} = 0.7500 \times 40.0 = 30.0000$

---

## 4. Worked Example — Multiple Criteria Rubric

A rubric comprises three criteria:
1. **Innovation** (min=1, max=10, weight=50%)
2. **Execution** (min=1, max=5, weight=30%)
3. **Impact** (min=0, max=100, weight=20%)
Total Policy Weight Sum = $50 + 30 + 20 = 100\%$.

**Judge's Inputs**:
- Innovation: `raw` = 8
- Execution: `raw` = 4
- Impact: `raw` = 75

**Step-by-Step Resolution**:

| Criterion | Min | Max | Raw | Normalized Ratio Calculation | Normalized | Weight | Weighted Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Innovation** | 1 | 10 | 8 | $(8 - 1) / (10 - 1) = 7/9$ | 0.7778 | 50% | $0.7778 \times 50 = 38.8889$ |
| **Execution** | 1 | 5 | 4 | $(4 - 1) / (5 - 1) = 3/4$ | 0.7500 | 30% | $0.7500 \times 30 = 22.5000$ |
| **Impact** | 0 | 100 | 75 | $(75 - 0) / (100 - 0) = 75/100$ | 0.7500 | 20% | $0.7500 \times 20 = 15.0000$ |
| **TOTAL** | | | | | | **100%** | **76.3889** |

---

## 5. Worked Example — Multiple Judge Aggregation

Submission `prj_07` is assigned to three judges. Two judges submit evaluations:

- **Judge A Evaluation Total**: `76.3889` (Status: `SUBMITTED`)
- **Judge B Evaluation Total**: `84.0000` (Status: `SUBMITTED`)
- **Judge C Evaluation Total**: `N/A` (Status: `DRAFT` or unsubmitted)

**Aggregation Resolution**:
$$\text{aggregate\_score} = \frac{76.3889 + 84.0000}{2} = \frac{160.3889}{2} = 80.1945$$

Judge C's unsubmitted evaluation is excluded; `N` equals 2.

---

## 6. Treatment of Edge Cases

1. **`max_score > min_score`**: Standard min-max normalization executes.
2. **`max_score == min_score`**: If a rubric criterion is configured with equal min/max bounds (e.g. min=5, max=5), a divide-by-zero exception is prevented by defaulting `normalized_score` to `1.0`.
3. **Missing Evaluations**: Omitted from `AVG()` calculation. Submissions are not penalized with 0.
4. **Draft Evaluations**: Ignored by `WHERE status = 'SUBMITTED'` queries.
5. **Submitted Evaluations**: Immutably locked in DB.

---

## 7. Implementation Mapping

```text
Mathematical Formula
        ↓
backend/src/services/scoring.service.ts  (Function: saveEvaluation)
        ↓
backend/src/routes/judging.ts            (Route: PUT /api/judging/submissions/:id/evaluation)
        ↓
PostgreSQL Database                       (Table: evaluation_scores, Columns: raw_score, normalized_score, weighted_score NUMERIC(10,4))
        ↓
Jest Test Suite                           (backend/tests/scoring.test.ts & aggregation.test.ts)
```

---

## 8. Reproduction Commands & Test Evidence

### Run Scoring Unit & Integration Tests
```bash
cd backend
npm test -- tests/scoring.test.ts tests/aggregation.test.ts
```

### Expected Output
```text
PASS tests/aggregation.test.ts
  Phase 5E - Score Aggregation & Result Integrity
    √ 1 & 3: Correct aggregation, normalization and weighting
    √ 4 & 5: DRAFT evaluations excluded, missing evals not treated as zero
    √ 7: Decimal precision and rounding

PASS tests/scoring.test.ts
  Deterministic Human Scoring Engine
    √ should save a valid DRAFT evaluation and verify formula calculation
    √ should successfully submit full evaluation
```
