# Concert Ticket Booking Backend

Backend for the 48-hour technical assessment. The repository establishes the
modular-monolith boundaries, PostgreSQL consistency boundary, reproducible
migration/seed flow, customer APIs, atomic booking, retry safety, and quality
gates.

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

The health endpoint is `GET http://localhost:3000/health`. It returns `503` when
the database cannot be reached. The `/api` prefix is reserved for business APIs.
The static OpenAPI contract is available at `http://localhost:3000/openapi.yaml`;
Prometheus-compatible counters are at `http://localhost:3000/metrics`.

## Customer read APIs

Tasks 04–05 implement the published-concert browse/detail flow, ticket category
price/availability reads, ownership-scoped booking history/detail, and the
atomic `POST /api/bookings` reservation path. See
[docs/API_CUSTOMER.md](docs/API_CUSTOMER.md) for response contracts and the
importable [Postman collection](postman/customer-apis.collection.json).

Operation/admin workflows are documented in
[docs/API_OPERATION.md](docs/API_OPERATION.md) with a separate importable
[Postman collection](postman/operation-apis.collection.json). They require the
seeded operator UUID in `x-user-id`.

Until the authentication task adds a real access-token guard, booking reads use
the seeded customer's UUID in an `x-user-id` header. The SQL query always
enforces that ownership predicate; an unknown or cross-user booking returns
`404` to avoid existence leaks.

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
```

Database-backed checks require PostgreSQL plus migration and seed:

```bash
npm run db:migrate
npm run db:seed
npm run test:integration
npm run test:concurrency
```

`npm run test:load` intentionally exits non-zero until the k6 task adds the load
script and reproducible report.

## Repository conventions

See [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) for module boundaries,
naming, transactions, errors, and the checklist for adding an API. The design
decisions and current architecture are in [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md).

## Seeded records

The seed is deterministic and safe to run repeatedly. It provides a customer,
operator, one published concert with VIP/Standard inventory, and active,
exhausted, and expired voucher examples. IDs are resolved through stable natural
keys in the seed script rather than being required by API clients.
