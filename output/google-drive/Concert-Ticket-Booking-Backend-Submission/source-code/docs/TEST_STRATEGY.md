# Test Strategy & Evidence

Task 11 separates correctness evidence from performance measurement. A green
load run does not prove inventory correctness, and a concurrency test is not a
capacity benchmark.

## Commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit

# PostgreSQL must be running and DATABASE_URL must point to the test database.
npm run db:migrate
npm run db:seed
npm run test:integration
npm run test:concurrency

# Requires k6 or Docker. The runner resolves seeded CUSTOMER/STANDARD IDs.
# Bash:
RATE_LIMIT_BOOKING_MAX=1000 npm run test:load
# PowerShell:
$env:RATE_LIMIT_BOOKING_MAX = '1000'; npm run test:load
```

The integration and concurrency suites use a real PostgreSQL connection and
assert both HTTP outcomes and final database state. Tests create unique records
where necessary and clean up their own data; `db:reset` is available when a
fully clean local run is required.

## Invariant traceability

| Test ID | Critical invariant | Automated evidence |
|---|---|---|
| CONC-001 | Inventory never becomes negative or oversold | `tests/concurrency/booking-oversell.spec.ts`: 100 concurrent requests against stock 10; exactly 10 bookings and final inventory 0 |
| CONC-002 | One logical retry creates one booking | `tests/concurrency/booking-idempotency.spec.ts`: 20 same-key requests; one booking, one inventory decrement, stable replay |
| CONC-003 | Voucher quota is global and bounded | `tests/concurrency/voucher-quota.spec.ts`: 20 users compete for final quota; exactly one redemption |
| CONC-004 | Expiry and confirmation have one terminal winner | `tests/concurrency/booking-expiry.spec.ts`: confirm-vs-expire race plus repeatable worker claiming |
| INT-001 | Voucher failure rolls back inventory | `tests/integration/booking-core-api.spec.ts` and `tests/integration/persistence-invariants.spec.ts` |
| INT-002 | Historical prices are immutable | `tests/integration/persistence-invariants.spec.ts` changes catalog price and verifies booking snapshot |
| AUTH-001 | Customer data is ownership-scoped | `tests/unit/booking-read.service.spec.ts` and SQL predicate in `booking-read.repository.ts` |

## Layer responsibilities

- Unit tests cover deterministic money, voucher, lifecycle, fingerprint,
  validation and transaction policies without pretending to prove database
  locking.
- Integration tests cover PostgreSQL constraints, transaction rollback,
  repository SQL, API validation and final persisted state.
- Concurrency tests deliberately create contention and assert both response
  distribution and database accounting.
- The k6 scenario in `load-tests/booking.js` measures steady 300 req/min and a
  burst profile. It records p50/p95/p99, throughput, expected business rejects
  and unexpected system errors separately.

## Evidence rules

Every report records the command, API/database environment, commit SHA and
interpretation. Raw k6 output under `test-results/load/` is ignored to avoid
committing machine-specific data; the reproducible summary is committed as
`docs/PERFORMANCE_REPORT.md` after a successful run.
