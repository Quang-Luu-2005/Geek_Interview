# WOW / Plus Points

Task 13 adds reviewer-facing capabilities that make the correctness work easy
to verify without weakening the core booking path.

## 1. One-command submission verifier

```bash
npm run verify:submission
```

The verifier is deterministic and read-only. It checks the required handoff
files, parses all Postman JSON, verifies the OpenAPI routes, confirms stable seed
IDs, checks the retry/voucher/sold-out examples, and validates local Markdown
links. It intentionally does not contact the network or mutate PostgreSQL.

Implementation: [`scripts/verify-submission.mjs`](../scripts/verify-submission.mjs).

## 2. Reviewer smoke journey

With the API and seeded database running:

```bash
# Default target: http://localhost:3000
npm run demo:smoke

# Alternate host port
$env:BASE_URL = 'http://localhost:3300'; npm run demo:smoke
```

The journey proves process liveness, PostgreSQL readiness, OpenAPI and metrics
availability, published-concert/category reads, booking creation, request-ID
propagation, same-key idempotent replay, cancellation cleanup, and customer
history. It creates one short-lived demo booking and cancels it before exit; it
does not drop or reset the database.

Implementation: [`scripts/reviewer-smoke.mjs`](../scripts/reviewer-smoke.mjs).

## 3. Production-minded runtime probes

The API now separates orchestration concerns:

| Probe | Meaning | Database dependency |
|---|---|---|
| `GET /health/live` | Process is serving HTTP | None |
| `GET /health/ready` | Process can reach PostgreSQL | Required |
| `GET /health` | Backwards-compatible readiness alias | Required |

The static contract documents all three probes. A container platform can restart
an unhealthy process using liveness while keeping it out of service when the
database is unavailable.

## Why these are plus points

They improve the assessment signal without hiding limitations: the verifier is
not a substitute for Jest concurrency evidence, the smoke journey is not a load
test, and the health probes do not claim distributed observability. The
correctness proof remains the PostgreSQL transaction plus the unit/integration/
concurrency suites documented in [`TEST_STRATEGY.md`](TEST_STRATEGY.md).
