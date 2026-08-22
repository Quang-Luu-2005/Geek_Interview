# Customer APIs

These endpoints are the read side of the customer flow implemented in task
04. The API is mounted below `/api`.

## Identity used in the current assessment build

The authentication/authorization task has not been implemented yet. Customer
booking endpoints therefore require a development-only `x-user-id` header
containing the seeded customer's UUID. The header is validated as a UUID and
is always included in the SQL ownership predicate. When the auth guard is
added, it should replace this header at the presentation boundary without
changing the repository queries.

## Endpoints

### `GET /api/concerts?page=1&limit=20`

Only `PUBLISHED` concerts are returned. Results are ordered by `startsAt` and
then `id`, making page boundaries deterministic.

```json
{
  "data": [
    {
      "id": "...",
      "slug": "summer-festival-2026",
      "name": "Summer Festival 2026",
      "status": "PUBLISHED",
      "startsAt": "2026-12-31T12:00:00.000Z",
      "bookable": true
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `GET /api/concerts/:id`

`:id` accepts either the concert UUID or its stable slug. Draft and archived
concerts are deliberately indistinguishable from an unknown concert and return
`404` to customer callers.

### `GET /api/concerts/:id/ticket-categories`

Returns categories ordered by `code`, with current catalog price and current
inventory counters. Money is returned as a decimal string to avoid binary
floating-point rounding. Availability is informational and may be stale as
soon as it is read; `POST /api/bookings` is the authoritative reservation
decision and must recalculate price server-side.

```json
{
  "concert": { "id": "...", "slug": "summer-festival-2026", "name": "Summer Festival 2026", "status": "PUBLISHED", "startsAt": "2026-12-31T12:00:00.000Z", "bookable": true },
  "categories": [
    { "id": "...", "code": "STANDARD", "name": "Standard", "price": "50.00", "totalQuantity": 1000, "availableQuantity": 1000 }
  ]
}
```

### `GET /api/me/bookings?page=1&limit=20`

Requires `x-user-id`. The query filters by `bookings.user_id` in SQL, orders
newest first by `(created_at DESC, id DESC)`, and returns amount and item price
snapshots. A page with no rows returns `total: 0` and `totalPages: 0`.

### `GET /api/bookings/:id`

Requires `x-user-id`. `:id` accepts a booking UUID or booking code. The same
ownership predicate is applied to the detail query. A missing or cross-user
booking returns the same `404 Booking not found` response, preventing existence
leaks.

### `POST /api/bookings`

Requires `x-user-id` and `Idempotency-Key` headers. The key is scoped to the
authenticated customer, stored with a database uniqueness constraint, and may
be safely retried after a timeout. `concertId` accepts either the concert UUID
or stable slug. The request contains only category IDs and quantities; price
and totals are always read and calculated inside the database transaction.

```json
{
  "concertId": "summer-festival-2026",
  "items": [
    { "ticketCategoryId": "...", "quantity": 2 }
  ],
  "voucherCode": "FLASH10"
}
```

The transaction validates the published/not-started concert, rejects duplicate
categories and quantities above 10, sorts category UUIDs before conditional
inventory updates, reserves an optional voucher, snapshots prices, inserts the
booking/items/status history, and commits or rolls back as one unit. New
reservations are `RESERVED` for 10 minutes.

For the same customer and key, an equivalent request (including a different
item order or voucher casing) replays the original booking response without
decrementing inventory or voucher quota again. Reusing the key with a different
canonical payload returns `409 IDEMPOTENCY_KEY_REUSED`. Concurrent requests with
the same key wait for the first transaction and replay its committed result;
the claim is rolled back if the booking transaction fails, so a key cannot be
left permanently stuck in `PROCESSING` by an application error.

Business rejections use a stable `{ code, message, details? }` body and do not
become HTTP 500s:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_ITEM` | Category does not belong to the concert or request has duplicate items |
| 409 | `CONCERT_NOT_BOOKABLE` | Concert is not published or has already started |
| 409 | `INSUFFICIENT_TICKET_INVENTORY` | Conditional decrement affected zero rows |
| 409 | `VOUCHER_NOT_APPLICABLE` | Voucher is invalid, expired, disabled, or exhausted |
| 409 | `VOUCHER_ALREADY_REDEEMED` | One-use-per-customer voucher was already used |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key was used with a different request payload |
| 409 | `IDEMPOTENCY_REQUEST_IN_PROGRESS` | A legacy/stale processing record has no replayable result |

Inventory availability is never checked with a separate SELECT-before-UPDATE
operation. The affected row from `UPDATE ... WHERE available_quantity >= qty
RETURNING ...` is the concurrency decision. This prevents overselling and
rolls back earlier category reservations if a later category or voucher fails.

## Postman

Import [`postman/customer-apis.collection.json`](../postman/customer-apis.collection.json)
and set `baseUrl` (default `http://localhost:3000`), `customerUserId` to the
seeded customer UUID, `standardCategoryId` to a seeded category UUID, and
`idempotencyKey` to a fresh value for each logical booking intent. The
collection includes browse, detail, categories, create booking, own history,
and booking detail requests.
