# Final QA & Delivery

This is the final reviewer handoff record for the delivery candidate. The
database-backed checks were run against a fresh PostgreSQL 16 schema after
`npm run db:reset`; the load run was performed against the Compose API with
`RATE_LIMIT_BOOKING_MAX=1000`.

The QA source baseline is the commit recorded by `git log -1` immediately
before the final evidence-only packaging commit. The performance report stores
the exact benchmark commit SHA separately.

## Quality gate result

| Gate | Result |
|---|---|
| Prettier format check | PASS |
| ESLint | PASS |
| TypeScript typecheck | PASS |
| Unit suites | PASS - 12 suites / 32 tests |
| Integration suites | PASS - 7 suites / 22 tests |
| Concurrency suites | PASS - 4 suites / 7 tests |
| Production build | PASS |
| Newman customer API smoke | PASS - 5 requests / 7 assertions |
| Submission verifier | PASS - 41 checks |
| Delivery verifier | PASS - 49 checks |
| Reviewer API smoke | PASS - 10 checks |
| WOW correctness showcase | PASS - oversell, retry, voucher and expiry races |
| Representative k6 run | PASS - 501 requests, 0.000% system errors |

The performance numbers and environment are recorded in
[`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md). Expected business rejects
(400/409/429) are reported separately from unexpected system errors.

## Cross-contract audit

- Controller routes, [OpenAPI](../openapi/openapi.yaml), Postman URLs and API
  guides use the same `/api` prefix and endpoint names.
- Public operational endpoints are `/health/live`, `/health/ready`, `/health`,
  `/metrics` and `/openapi.yaml`; the Compose healthcheck uses readiness.
- The reservation TTL is 10 minutes and the default expiry poll interval is 30
  seconds across implementation and scope documentation.
- Seed UUIDs, concert slug, category IDs and `FLASH10` are consistent between
  seed SQL, Postman environment, smoke scripts and README examples.
- Current guarantees are separated from future JWT/OIDC, payment, distributed
  rate limiting/observability, and transactional-outbox evolution.
- Local Markdown links and reviewer-facing placeholders pass the submission
  verifier.

## Repository hygiene

- `.env`, `node_modules`, `dist`, coverage, local database volumes and raw k6
  output are ignored and are not tracked.
- `package-lock.json` is committed; `npm ci` is the clean-install command.
- The committed source contains no private key material or cloud/API tokens.
- The delivery root is `README.md`; the canonical handoff map is
  [`submission/README.md`](../submission/README.md).
- The production image installs with `--omit=dev --omit=optional`; Prisma CLI
  and its `deepmerge-ts` advisory chain remain build-only. The generated Prisma
  client is copied into the runtime image, which passes
  `npm audit --omit=dev --omit=optional --audit-level=high` with zero findings.
- CI boots the built API and runs a pinned Newman 6.2.2 customer smoke covering
  browse, category discovery, booking creation, idempotent replay and cleanup.

## Clean-clone rehearsal

Use a disposable clone and an isolated Compose project/host-port pair so the
rehearsal cannot alter another local database:

```powershell
git clone <repository-url> final-qa-clone
cd final-qa-clone
Copy-Item .env.example .env
npm ci
$env:API_HOST_PORT = '3400'
$env:POSTGRES_HOST_PORT = '55442'
docker compose -p finalqa up --build -d
$env:DATABASE_URL = 'postgresql://ticket:ticket@localhost:55442/ticket_booking'
npm run db:reset
npm run verify:submission
npm run verify:delivery
$env:BASE_URL = 'http://localhost:3400'; npm run demo:smoke
docker compose -p finalqa down -v --remove-orphans
```

The rehearsal required no source or command edits in this environment:

| Step | Measured result |
|---|---:|
| `npm ci` | 58 seconds |
| Compose build/start | 2 minutes 53 seconds |
| Readiness | first poll (about 2 seconds) |
| Reset + verifier + delivery verifier + smoke | 5 seconds |

The timings are local Windows/Docker measurements, not an SLA.

## Interview-defense prompts

The implementation can be defended directly from code and evidence:

1. PostgreSQL is the consistency boundary because conditional inventory/quota
   updates and constraints survive process races.
2. The modular monolith keeps booking, voucher, inventory and idempotency in one
   transaction; extraction is a measured future decision.
3. Idempotency is database-backed and fingerprinted, so retries replay without
   a second reservation.
4. `CONC-001` through `CONC-004` prove oversell, retry, voucher and expiry
   invariants using final database state, not only HTTP messages.
5. Redis/Kafka/Kubernetes are not correctness prerequisites; their trade-offs
   and revisit triggers are documented in the ADRs and limitations.
