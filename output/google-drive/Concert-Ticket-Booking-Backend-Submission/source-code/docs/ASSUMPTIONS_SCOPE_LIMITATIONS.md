# Assumptions, Scope & Limitations

This document is the reviewer-facing boundary for the assessment build. It
separates guarantees implemented in the repository from production capabilities
that deliberately remain out of scope.

## Implemented now

| Capability | Status | Evidence |
|---|---|---|
| Published concert browse/detail/category availability | Implemented | Customer API, OpenAPI, integration tests |
| Category-capacity booking | Implemented | Atomic inventory update and CONC-001 |
| Retry-safe booking | Implemented | DB idempotency record, fingerprint and CONC-002 |
| Voucher eligibility, quota and release | Implemented | Voucher policy tests and CONC-003 |
| Reservation lifecycle | Implemented | Confirm/cancel/expiry worker and CONC-004 |
| Operator booking monitoring/actions | Implemented | Operation API and role/integration tests |
| Request IDs, error contract, logs, metrics and rate limiting | Implemented | Task 10 quality tests and observability docs |
| Local OpenAPI/Postman workflow | Implemented | `openapi/openapi.yaml`, `postman/` and local environment |

## Explicit assumptions

- The current identity boundary is a development-only `x-user-id` UUID header.
  It is validated against `users`; customer ownership and operator role checks
  are still enforced server-side.
- Inventory is capacity-based by ticket category. There is no seat map or
  exact-seat hold.
- A new reservation is `RESERVED` for 10 minutes. The expiry worker polls every
  30 seconds by default, so release timing is bounded by the poll interval.
- Confirmation is a simulated lifecycle action. No payment provider is called
  inside the booking transaction.
- A voucher redemption reserves global quota, is one-use per customer while
  active, and is released exactly once if the reservation expires or is
  cancelled.
- PostgreSQL is the correctness boundary. The process-local rate limiter and
  in-memory metrics are intentionally not distributed guarantees.

## Out of scope

| Capability | Impact today | Production evolution |
|---|---|---|
| JWT/OIDC authentication | Header identity is not production authentication | Replace the header with a verified access-token principal |
| Payment, refund and settlement | Confirmation does not move money | Add payment state machine and an idempotent payment provider adapter |
| Exact seat selection | Only category quantities are reserved | Add seat inventory rows and a seat-level allocation policy |
| Distributed rate limiting | Limits reset per API process | Move the limiter to an API gateway or Redis-backed shared store |
| Distributed metrics/log aggregation | Metrics are process-local; logs go to stdout | Export to Prometheus/OpenTelemetry and a centralized log sink |
| Multi-region active-active | One PostgreSQL consistency boundary | Partition ownership or introduce a globally coordinated inventory service |
| Async notifications/outbox | No email/message broker dependency | Add a transactional outbox and retrying publisher |

These limitations describe deployment maturity, not known correctness defects.
The critical invariants and their automated evidence are listed in
[TEST_STRATEGY.md](TEST_STRATEGY.md); performance numbers are a local baseline
in [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md), not a capacity promise.
