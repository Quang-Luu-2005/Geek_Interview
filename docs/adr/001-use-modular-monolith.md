# ADR-001: Use a Modular Monolith for the Assessment

## Status

Accepted

## Context

The assessment has a 48-hour delivery window and evaluates backend reasoning,
code organization, and correctness under booking races. The core workflow needs
one consistency boundary across booking, inventory, voucher, and idempotency.
The expected traffic is meaningful, but it does not justify operating a
distributed platform before the correctness proof exists.

## Decision

Implement a **modular monolith** with a REST API and a reservation-expiry
worker. The initial technology baseline is:

| Concern | Decision | Rationale |
|---|---|---|
| Runtime | Node.js with TypeScript | Fast feedback, strong typing, good HTTP/test tooling |
| HTTP framework | NestJS | Explicit modules, dependency injection, validation and Swagger integration |
| Persistence | PostgreSQL | Transactional source of truth and row-level locking |
| Data access | Prisma with targeted SQL for atomic updates | Productive repositories while preserving database-level guarantees |
| API contract | REST + OpenAPI | Easy to review, run locally, and exercise with Postman |
| Expiry | Worker process using the same application modules | Keeps expiry semantics close to booking logic and is easy to run locally |
| Cache/rate limit | Redis only if a measured need appears | Not part of the correctness boundary |

Each business module owns its application and domain rules. Modules communicate
through explicit use cases and ports; controllers do not contain business logic.
The API and worker may be deployed as separate processes later, but they share
the same codebase and PostgreSQL boundary now.

## Alternatives considered

### Microservices

Microservices would provide independent deployment and scaling, but would make
the booking transaction cross service boundaries. That adds messaging, eventual
consistency, distributed tracing, and compensation logic before the assessment
requires them. Revisit when module ownership or independent scaling becomes a
measured bottleneck.

### Event-first / asynchronous booking

An asynchronous command flow can absorb bursts, but it makes the initial booking
response and failure semantics harder to explain. The critical reservation path
remains synchronous; an outbox can be added after the core path is proven.

### Redis as the inventory lock

A Redis lock would add another consistency boundary and lease failure modes.
PostgreSQL already owns the inventory rows and can perform the conditional
mutation atomically, so a distributed lock is unnecessary for this scope.

## Consequences

Positive:

- One deployable system is reproducible with Docker Compose.
- Booking, inventory, voucher, and idempotency can share one transaction.
- Module boundaries make a later extraction possible without pretending that
  future services already exist.

Negative:

- All modules scale and deploy together initially.
- A process-local worker needs operational coordination if multiple replicas run
  it; row claiming with `FOR UPDATE SKIP LOCKED` is required before scaling it.
- Prisma does not replace explicit SQL design for conditional inventory and quota
  updates.

## Verification

- `docs/diagrams/architecture.mmd` reflects only current components.
- `tests/concurrency/` will prove inventory, idempotency, voucher, and expiry
  invariants.
- Revisit this decision when database contention, deployment independence, or
  asynchronous integration is demonstrated as a real constraint.
