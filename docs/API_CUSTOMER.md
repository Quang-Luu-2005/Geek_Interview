# Customer read APIs

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

## Postman

Import [`postman/customer-apis.collection.json`](../postman/customer-apis.collection.json)
and set `baseUrl` (default `http://localhost:3000`) and `customerUserId` to the
seeded customer UUID. The collection includes browse, detail, categories, own
history, and booking detail requests.
