# Operation APIs

Operation endpoints are mounted below `/api/admin` and require a valid
development `x-user-id` header for a seeded `OPERATOR` or `ADMIN`. Customers
receive `403`; unknown identities receive `401`. A production deployment
should replace this header with the authenticated principal from an access
token guard.

## Booking monitoring

### `GET /api/admin/bookings`

Supports `page`, `limit`, `status`, `concertId` (UUID or slug), `userId`,
`from`, and `to` ISO-8601 filters. Results are sorted by
`createdAt DESC, id DESC` and expose safe operational metadata only.

### `GET /api/admin/bookings/:id`

`:id` accepts a booking UUID or booking code. The detail includes immutable
amount/item snapshots, status history, voucher redemption lifecycle, and
idempotency outcome timestamps. It deliberately omits request hashes and
stored response bodies.

## Guarded status command

### `PATCH /api/admin/bookings/:id/status`

Body:

```json
{ "status": "CANCELLED", "reason": "Fraud review cancellation" }
```

Allowed targets are `CONFIRMED`, `EXPIRED`, and `CANCELLED`. Every command is a
conditional transition from `RESERVED`; `CONFIRMED` requires a live
reservation, `EXPIRED` requires an elapsed TTL, and cancellation releases
inventory/voucher resources atomically. A terminal booking cannot be mutated.
Every successful command inserts `booking_status_history` with the operator
actor, `OPERATION_API` source, reason, and timestamp in the same transaction.

## Minimal catalog/promotion operations

- `POST /api/admin/concerts` creates a future `DRAFT` concert.
- `POST /api/admin/concerts/:id/ticket-categories` creates a category and its
  initial inventory atomically; categories can only be added while `DRAFT`.
- `POST /api/admin/concerts/:id/publish` publishes a future concert only when
  it has at least one category/inventory row.
- `POST /api/admin/vouchers` creates an `ACTIVE` voucher, validates dates,
  percentage bounds, scope references, and duplicate codes.

Full concert/category/voucher update and delete APIs are intentionally omitted:
there is no safe business policy for changing published inventory, historical
prices, or a voucher already used by customers in this assessment scope.
