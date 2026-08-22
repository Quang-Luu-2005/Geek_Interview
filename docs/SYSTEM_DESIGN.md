# System Design

## Scope of this design

This document records the architecture decisions completed in Trello list
`01 - Architecture & Design`. It describes the current assessment baseline,
not future infrastructure presented as already implemented.

## Architecture summary

The system is a modular monolith exposing a stateless REST API. PostgreSQL is
the source of truth for all correctness-sensitive state. The reservation expiry
worker uses the same booking and repository modules as the API. The current
component/module view is in [`architecture.mmd`](diagrams/architecture.mmd).

Current modules:

| Module | Responsibility | May depend on |
|---|---|---|
| Concert | Published concerts, ticket categories, prices, availability reads | shared, persistence ports |
| Booking | Create/read/confirm/cancel booking workflow | concert, inventory, voucher, idempotency |
| Inventory | Atomic ticket reservation/release | shared, persistence ports |
| Voucher | Eligibility, quota reservation, redemption/release | shared, persistence ports |
| Idempotency | Request fingerprint, claim, response replay | shared, persistence ports |
| Operation | Operator booking queries and guarded manual actions | booking, concert, voucher |
| Expiry worker | Claim expired reservations and release resources | booking, inventory, voucher |

The dependency direction is `Controller -> Application/Use Case -> Domain and
Repository ports -> Infrastructure`. Controllers map HTTP concerns only; they
do not open transactions or implement business rules.

## Booking transaction boundary

`POST /bookings` follows this boundary:

1. Outside the transaction: parse/authenticate the request, validate the DTO,
   and calculate a deterministic request fingerprint.
2. Inside one transaction: claim idempotency, validate the concert, reserve all
   ticket categories in sorted order, reserve voucher quota, calculate server-
   side prices, insert `bookings` and `booking_items`, and store the response.
3. Commit before returning success. Any sold-out result, voucher rejection,
   uniqueness conflict, or database exception rolls back all mutations.

The canonical sequence is [`booking-sequence.mmd`](diagrams/booking-sequence.mmd).
No payment provider, email service, or other external network call is allowed
inside this transaction.

### Pseudo-transaction

```text
validate HTTP input and fingerprint
BEGIN
  claim idempotency key (unique user + key)
  validate concert is published and bookable
  for category in sort(category_ids):
    conditional inventory decrement
    if zero rows: raise INVENTORY_EXHAUSTED
  if voucher supplied:
    validate eligibility
    conditional quota decrement
    insert redemption
  calculate subtotal/discount/final amount on the server
  insert booking and immutable booking-item price snapshots
  persist replayable idempotency response
COMMIT
return response
```

## State machine

The lifecycle is `RESERVED -> CONFIRMED | EXPIRED | CANCELLED`. `CONFIRMED` may
be cancelled only if the documented product policy allows it. `EXPIRED` and
`CANCELLED` are terminal for the current scope. See
[`booking-state.mmd`](diagrams/booking-state.mmd).

Every transition is a conditional update that includes the current status. The
affected-row count is the arbitration result for racing commands; a loser gets
a stable conflict such as `BOOKING_NOT_CONFIRMABLE` rather than overwriting a
terminal state.

## Failure and race scenarios

| Scenario | Database/application rule | Expected outcome |
|---|---|---|
| Two users reserve the last ticket | Conditional inventory update requires `available_quantity >= qty` | One succeeds; the other receives `INVENTORY_EXHAUSTED`; stock never negative |
| Same user retries same key | Unique idempotency scope plus fingerprint | One booking; later same-payload requests replay it |
| Same key with changed payload | Compare stored fingerprint | `IDEMPOTENCY_KEY_REUSED` (`409`); no new mutation |
| Last voucher raced by many users | Conditional `used_count < usage_limit` update | At most quota successes; rejected attempts roll back their booking |
| Confirm races expiry worker | Both update `WHERE status = RESERVED` and check expiry guard | Exactly one terminal transition; only the winner releases/keeps resources |
| Multi-category deadlock risk | Sort category IDs before acquiring/mutating rows | Consistent lock order; retry only explicitly classified transient DB errors |
| Voucher fails after inventory reservation | One transaction covers both mutations | Inventory reservation is rolled back |
| Database exception mid-flow | Transaction rollback and no success response | No partial booking, resource leak, or replayable false success |

## Current vs future components

Current: REST API, PostgreSQL, modular application modules, and expiry worker.

Future options: Redis for measured cache/rate limiting, transactional outbox
for asynchronous integrations, read replicas, or service extraction. These are
not dependencies of the current correctness path.
