# ADR-002: Use PostgreSQL as the Consistency Boundary

## Status

Accepted

## Context

The platform must prevent negative inventory, duplicate logical bookings, and
voucher quota violations while requests race. These guarantees involve several
rows and must survive application retries and process failures.

## Decision

PostgreSQL is the source of truth for booking state, inventory, voucher quota,
redemption records, and idempotency records. Critical mutations happen in one
short database transaction. Correctness is enforced by both:

1. constraints (`UNIQUE`, `CHECK`, and foreign keys); and
2. conditional writes or row locks whose affected-row count is checked.

The baseline transaction isolation is PostgreSQL `READ COMMITTED`, with explicit
row locking or conditional updates where the invariant needs it. Multi-category
resources are locked in sorted identifier order to reduce deadlock risk.

## Alternatives considered

| Alternative | Why it is not the baseline |
|---|---|
| Redis/distributed lock | Adds a second source of truth, lease expiry, and split-brain failure modes |
| Application-only mutex | Protects only one process and fails with multiple replicas or restarts |
| Serializable for every request | Stronger than necessary and can increase aborts/latency; use targeted locking instead |
| Separate inventory service | Makes the booking transaction distributed before a real scaling boundary exists |

## Consequences

PostgreSQL becomes a deliberate bottleneck and must be indexed around real query
patterns. The benefit is that the reviewer can inspect one transaction and prove
the guarantees directly from SQL. Read replicas, partitioning, or a separate
inventory service are future options, not current components.

## Verification

- ERD and constraints are documented in `docs/DATABASE_DESIGN.md` when the
  persistence task is implemented.
- Conditional inventory and voucher statements return a success/failure signal.
- Integration and concurrency tests assert final database state, not only HTTP
  status codes.
