# Concert Ticket Booking Backend

Backend for the 48-hour technical assessment. The repository establishes the
modular-monolith boundaries, PostgreSQL consistency boundary, reproducible
migration/seed flow, customer APIs, atomic booking, retry safety, and
evidence-driven quality gates.

## Reviewer-first map

| Need | Start here |
|---|---|
| Run the service | [Local setup](#local-setup) or [Docker setup](#docker-setup) |
| Understand the design | [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) |
| Understand the schema/locking | [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) |
| Try the API | [openapi/openapi.yaml](openapi/openapi.yaml), [Postman environment](postman/local.environment.json) |
| Verify correctness | [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) |
| Review measured performance | [docs/PERFORMANCE_REPORT.md](docs/PERFORMANCE_REPORT.md) |
| Check scope and limitations | [docs/ASSUMPTIONS_SCOPE_LIMITATIONS.md](docs/ASSUMPTIONS_SCOPE_LIMITATIONS.md) |
| See the WOW / plus points | [docs/WOW_PLUS_POINTS.md](docs/WOW_PLUS_POINTS.md) |
| See the submission tree | [submission/README.md](submission/README.md) |

## Problem and architecture snapshot

The service reserves concert tickets by category during flash-sale-like
contention. A booking must never oversell inventory, a client retry must not
create a second booking, voucher quota must remain bounded, and an abandoned
reservation must release its resources. The implementation is a stateless
NestJS modular monolith with PostgreSQL as the correctness boundary: HTTP
controllers call application use cases, repositories perform the atomic SQL,
and a small expiry worker reuses the booking transaction path.

The current identity boundary is the validated `x-user-id` header for this
assessment; production authentication and distributed infrastructure are
explicitly documented as future evolution in
[ASSUMPTIONS_SCOPE_LIMITATIONS.md](docs/ASSUMPTIONS_SCOPE_LIMITATIONS.md).

## Prerequisites

- Node.js 22 LTS (`.nvmrc`)
- npm 11+
- Docker Desktop with the Linux engine running for the reproducible database
  workflow

## Local setup

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run start:dev
```

The health endpoints are `GET /health/live` (process liveness) and
`GET /health/ready` (PostgreSQL readiness); `/health` remains a backwards-
compatible readiness alias and returns `503` when the database cannot be
reached. The `/api` prefix is reserved for business APIs.
This assessment exposes a static, machine-readable OpenAPI contract rather than
an interactive Swagger UI: it is available at
`http://localhost:3000/openapi.yaml`;
Prometheus-compatible counters are at `http://localhost:3000/metrics`.

## Customer read APIs

Tasks 04-05 implement the published-concert browse/detail flow, ticket category
price/availability reads, ownership-scoped booking history/detail, and the
atomic `POST /api/bookings` reservation path. See
[docs/API_CUSTOMER.md](docs/API_CUSTOMER.md) for response contracts and the
importable [Postman collection](postman/customer-apis.collection.json).

Operation/admin workflows are documented in
[docs/API_OPERATION.md](docs/API_OPERATION.md) with a separate importable
[Postman collection](postman/operation-apis.collection.json). They require the
seeded operator UUID in `x-user-id`.

Authentication is intentionally simplified for this assessment: booking reads
use the seeded customer's UUID in an `x-user-id` header. The SQL query always
enforces that ownership predicate; an unknown or cross-user booking returns
`404` to avoid existence leaks. See
[docs/SECURITY_ASSUMPTIONS.md](docs/SECURITY_ASSUMPTIONS.md) for the production
evolution path.

Task 10 documents the current security simplification in
[docs/SECURITY_ASSUMPTIONS.md](docs/SECURITY_ASSUMPTIONS.md) and the structured
logs, metrics, trace IDs, and rate-limit policy in
[docs/OBSERVABILITY.md](docs/OBSERVABILITY.md).

## Docker setup

```bash
docker compose up --build
```

Compose starts PostgreSQL, waits for its readiness check, applies migrations,
seeds deterministic data, and starts the API. Verify:

```bash
curl http://localhost:3000/health
```

If the default host ports are occupied, change `API_HOST_PORT` and
`POSTGRES_HOST_PORT` in `.env` before starting Compose. The container-to-container
database URL remains `postgres:5432`; only host-side ports change. For example,
use API `3300` and PostgreSQL `55432` when another project owns `3000/5432`.

To reset the local database from a running local PostgreSQL instance:

```bash
npm run db:reset
```

To discard the Compose volume and start completely clean, use
`docker compose down -v` deliberately; this removes local database data.

## Quality gates

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run verify:submission
```

Database-backed checks require PostgreSQL plus migration and seed:

```bash
npm run db:migrate
npm run db:seed
npm run test:integration
npm run test:concurrency
npm run demo:wow
```

`npm run test:load` runs the Task 11 k6 steady/burst scenario. It uses a local
k6 binary when available and otherwise Docker image `grafana/k6:0.53.0`; set
`RATE_LIMIT_BOOKING_MAX=1000` for an isolated benchmark API instance. See
[docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) and
[docs/PERFORMANCE_REPORT.md](docs/PERFORMANCE_REPORT.md) for evidence and
interpretation rules.

## Five-minute correctness demo

With the API running and the seeded database reset, these calls demonstrate the
happy path and the retry contract. The response from the first call contains the
booking ID used by the next calls; Postman automates this variable hand-off.

```bash
curl http://localhost:3000/api/concerts/summer-festival-2026/ticket-categories

curl -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -H 'Idempotency-Key: reviewer-demo-001' \
  -d '{"concertId":"summer-festival-2026","items":[{"ticketCategoryId":"00000000-0000-4000-8000-000000000102","quantity":1}]}'

# Repeat the exact POST above: it replays the same booking instead of
# decrementing inventory a second time.
```

For concurrency and expiry behavior, run `npm run test:concurrency`; the
four-scenario reviewer showcase is `npm run demo:wow` (it resets only the
explicit `DATABASE_URL` database). For the full request-by-request flow, use
the [Postman runbook](postman/README.md). The reviewer-facing end-to-end smoke
journey is `npm run demo:smoke`; it creates and cancels one booking without
resetting the database. See
[docs/WOW_PLUS_POINTS.md](docs/WOW_PLUS_POINTS.md).

## Repository conventions

See [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) for module boundaries,
naming, transactions, errors, and the checklist for adding an API. The design
decisions and current architecture are in [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md).

## Seeded records

The seed is deterministic and safe to run repeatedly. It provides a customer,
operator, one published concert with VIP/Standard inventory, and active,
exhausted, and expired voucher examples. Fresh databases use these stable IDs:

| Variable | Value |
|---|---|
| `customerUserId` | `00000000-0000-4000-8000-000000000001` |
| `operatorUserId` | `00000000-0000-4000-8000-000000000002` |
| `concertUuid` | `00000000-0000-4000-8000-000000000010` |
| `vipCategoryId` | `00000000-0000-4000-8000-000000000101` |
| `standardCategoryId` | `00000000-0000-4000-8000-000000000102` |

The customer API also accepts the stable concert slug
`summer-festival-2026`. Existing local volumes should be reset once after
upgrading the seed IDs: `npm run db:reset`.

## Submission package

The canonical source remains organized by purpose rather than copied into a
second tree. [submission/README.md](submission/README.md) maps every required
deliverable to its source path and records the final verification checklist.
