# ADR-004: Make `POST /bookings` Idempotent

## Status

Accepted

## Decision

Every booking request requires an `Idempotency-Key` scoped to the authenticated
customer. Store the request fingerprint and the final response in
`idempotency_records` with a unique `(user_id, idempotency_key)` constraint.

- Same key and same fingerprint: replay the original response.
- Same key and different fingerprint: return `IDEMPOTENCY_KEY_REUSED` (`409`).
- Same key while the first request is processing: wait/retry according to the
  application policy; never create a second booking.

The uniqueness constraint is authoritative. An in-memory map or Redis key may be
used as an optimization later, but it cannot be the correctness mechanism.

## Consequences

The first request and idempotency record must be coordinated in the same
transaction. Persisting the response makes client retries deterministic. The
record needs a retention policy so the table does not grow without bound; the
policy must not expire keys while clients can legitimately retry them.

## Verification

`CONC-002` will send concurrent requests with the same key and assert exactly one
booking, one inventory reservation, and replayed responses for the duplicates.
