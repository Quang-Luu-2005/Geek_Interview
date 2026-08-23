# Database Design

## Design goals

PostgreSQL is the consistency boundary for the current modular monolith. The
schema protects the invariants that must survive retries, concurrent requests,
and application bugs. The canonical ERD is
[`diagrams/erd.mmd`](diagrams/erd.mmd); its table/column names match the
versioned migrations in `database/migrations/`.

The current scope deliberately does not include an outbox table. An outbox can
be added later when an asynchronous integration is required; it is not needed
to make the booking transaction correct.

## Relationship and ownership model

| Relationship | Cardinality | Delete/update policy |
|---|---:|---|
| `concerts -> ticket_categories` | 1:N | Categories reference a concert; no cascade delete of published history |
| `ticket_categories -> ticket_inventories` | 1:1 | Inventory row is the mutable stock source for a category |
| `users -> bookings` | 1:N | Booking keeps ownership through a required FK |
| `bookings -> booking_items` | 1:N | Items cascade with an unsubmitted booking record |
| `vouchers -> voucher_redemptions` | 1:N | Redemption is an audit row; voucher is never deleted in the booking path |
| `users + idempotency_key -> idempotency_records` | 1:N by user, unique by scope/key | Retention is an operational policy, not a correctness bypass |
| `bookings -> booking_status_history` | 1:N | History is append-only and does not replace current booking status |

## Data dictionary

### `users`

| Column | Type | Null | Meaning |
|---|---|---:|---|
| `id` | UUID | No | Stable internal identity |
| `email` | TEXT | No | Login/ownership identity; unique |
| `role` | TEXT | No | `CUSTOMER`, `OPERATOR`, or `ADMIN` |
| `created_at` | TIMESTAMPTZ | No | Creation time in UTC |

### `concerts`

| Column | Type | Null | Meaning |
|---|---|---:|---|
| `id` | UUID | No | Concert identity |
| `slug` | TEXT | No | Stable public lookup key; unique |
| `name` | TEXT | No | Display name |
| `status` | TEXT | No | `DRAFT`, `PUBLISHED`, or `ARCHIVED` |
| `starts_at` | TIMESTAMPTZ | No | Event start in UTC |
| `created_at` | TIMESTAMPTZ | No | Creation time |

### `ticket_categories` and `ticket_inventories`

`ticket_categories` stores relatively stable product information. `price` is
the current catalog price. `ticket_inventories` stores mutable availability and
is keyed by category, making the one-to-one boundary explicit.

| Table | Important columns | Meaning |
|---|---|---|
| `ticket_categories` | `concert_id`, `code`, `price` | Category ownership and current catalog price |
| `ticket_inventories` | `total_quantity`, `available_quantity` | Stock capacity and current reservable quantity |

The inventory checks enforce `0 <= available_quantity <= total_quantity`.

### `bookings` and `booking_items`

`bookings` contains the order-level status and amount snapshots. `booking_items`
contains the immutable line-level quantity and `unit_price` used by that booking.
The current catalog price can change without rewriting historical booking data.

Amount invariants:

```text
line_total = quantity * unit_price
discount_amount <= subtotal
final_amount = subtotal - discount_amount
```

All monetary values use `NUMERIC(12,2)`; the API never trusts a client-supplied
subtotal, discount, or final amount.

### `vouchers` and `voucher_redemptions`

`vouchers.used_count` is the global quota counter. `voucher_redemptions` records
which user used which voucher for which booking. The unique `(voucher_id,
user)` partial unique index protects the one-use-per-user policy while a
`RELEASED` reservation can be retried after expiry/cancellation. Optional
`applicable_concert_id` and `applicable_ticket_category_id` scope a promotion;
NULL means globally applicable. A redemption starts `RESERVED`, becomes
`CONSUMED` on confirmation, or becomes `RELEASED` when a reserved booking
expires/cancels. Release decrements `used_count` exactly once and preserves the
row as audit evidence.

### `idempotency_records`

The unique `(user_id, idempotency_key)` scope prevents duplicate logical
requests. `request_hash` detects same-key/different-payload conflicts. A
completed record stores the HTTP status and JSON response for deterministic
replay.

### `booking_status_history`

This append-only audit table records the old status, new status, actor, source,
reason, and UTC timestamp. It does not authorize arbitrary state changes; the
booking state machine remains the authority.

## Constraint-to-invariant map

| Invariant | Enforcement | Evidence |
|---|---|---|
| Inventory never negative | Inventory `CHECK` plus conditional update in booking use case | `CONC-001` |
| Inventory cannot exceed total | `ticket_inventories` `CHECK` | Persistence constraint integration test |
| Quantity is positive | `booking_items.quantity CHECK` | Persistence constraint integration test |
| One idempotency key has one logical request | `UNIQUE(user_id, idempotency_key)` | `CONC-002` |
| Voucher code is unique | `UNIQUE(vouchers.code)` | Persistence constraint integration test |
| Voucher quota is bounded | `used_count CHECK` and conditional quota update | `CONC-003` |
| One user cannot reuse an active one-use voucher | Partial unique index on `(voucher_id, user_id)` where status is not `RELEASED` | Persistence constraint integration test |
| Booking amount is internally consistent | amount checks in migration `0002` | Price snapshot integration test |
| Booking item history is immutable by design | `unit_price` and `line_total` are stored on item | Price snapshot integration test |
| Ownership references are valid | Foreign keys | Persistence constraint integration test |

## Index strategy

Indexes are tied to the query patterns required by the API and expiry worker;
there is no index on every column.

| Query pattern | Index | Rationale |
|---|---|---|
| Browse published concerts by start time | `idx_concerts_status_starts_at` | Filters status and orders upcoming events |
| Resolve a category in a concert | unique `(concert_id, code)` constraint index | Stable category lookup and duplicate prevention without a redundant index |
| Customer booking history | `idx_bookings_user_created_at` | User filter plus newest-first pagination |
| Operation booking filters | `idx_bookings_concert_status_created_at` | Concert/status filter with time ordering |
| Expiry worker claims reservations | `idx_bookings_status_expires_at` | Finds `RESERVED` rows whose TTL elapsed |
| Voucher lookup/expiry | `UNIQUE(vouchers.code)` and `idx_vouchers_status_expires_at` | Code lookup and operational expiry scan |
| Idempotency replay/cleanup | unique `(user_id, idempotency_key)` and `idx_idempotency_records_status_updated_at` | Authoritative lookup and processing cleanup |
| Booking audit history | `idx_status_history_booking_created_at` | Detail page timeline in chronological order |
| Per-user redemption history | `idx_voucher_redemptions_user` | Abuse/ownership checks |

The next performance task may run `EXPLAIN (ANALYZE, BUFFERS)` against these
queries with representative data. Indexes should be revised only with measured
workload evidence.

## Transaction and repository primitives

`src/shared/database/transaction.ts` provides:

- one application-owned transaction boundary with bounded `maxWait` and timeout;
- opt-in retry only for PostgreSQL serialization/deadlock errors (`40001`,
  `40P01`) and Prisma `P2034`;
- deterministic resource ordering via `sortResourceIds`;
- duplicate resource rejection before row acquisition.

The booking use case will call one `withTransaction` wrapper and pass the
transaction client to all repositories. Repositories must not open independent
transactions. Network calls remain outside the transaction.

## Correctness-critical SQL

The following snippets are shortened only for presentation; predicates and
returning columns match the repository implementation.

### Atomic inventory reservation

```sql
UPDATE ticket_inventories
SET available_quantity = available_quantity - :quantity,
    updated_at = NOW()
WHERE ticket_category_id = :category_id
  AND available_quantity >= :quantity
RETURNING ticket_category_id, available_quantity;
```

Zero affected rows is the reservation decision and maps to
`INSUFFICIENT_TICKET_INVENTORY`. There is no separate read-then-write stock
check.

### Atomic voucher quota reservation

```sql
UPDATE vouchers
SET used_count = used_count + 1
WHERE id = :voucher_id
  AND status = 'ACTIVE'
  AND starts_at <= NOW()
  AND expires_at > NOW()
  AND used_count < usage_limit
RETURNING id, code, discount_type, discount_value;
```

The voucher row is locked while eligibility and the one-use-per-user
redemption check run in the same transaction. If a later booking step fails,
the quota increment rolls back.

### Expiry worker claim

```sql
SELECT id, expires_at
FROM bookings
WHERE status = 'RESERVED'
  AND expires_at <= :now
ORDER BY expires_at ASC, id ASC
LIMIT :batch_size
FOR UPDATE SKIP LOCKED;
```

The lock is held until the status history, inventory release and voucher
release commit. `SKIP LOCKED` is only for disjoint worker claims; customer
reads remain ordinary consistent queries.

## Price snapshot proof

At booking time, the application writes `ticket_categories.price` into
`booking_items.unit_price`, computes `line_total`, and stores order totals. An
integration test updates the catalog price after creating a booking and asserts
that the booking item and booking totals remain unchanged.
