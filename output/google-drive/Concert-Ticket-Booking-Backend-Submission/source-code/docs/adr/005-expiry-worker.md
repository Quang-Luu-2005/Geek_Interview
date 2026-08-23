# ADR-005: Claim Reservation Expiry in the Database

## Status

Accepted

## Context

Reserved inventory and voucher quota must be released when a customer abandons
checkout. Confirmation, cancellation, and expiry can race, so a timer in one
API process cannot be the source of truth. The worker also needs to be safe to
run more than once or from more than one process.

## Decision

Use a database-polling worker that claims expired `RESERVED` bookings in small
batches with `FOR UPDATE SKIP LOCKED`. Each claimed booking transitions to
`EXPIRED`, releases ticket inventory, releases any reserved voucher redemption,
and writes status history in one transaction. The conditional status update and
`expires_at <= NOW()` guard arbitrate a confirm-versus-expire race.

## Alternatives considered

| Alternative | Why it is not the baseline |
|---|---|
| In-memory timer per API instance | Timers disappear on restart and duplicate work across replicas |
| External queue before reservation commit | Adds another consistency boundary and a lost-message window |
| Redis lock | Lock lease/failover semantics do not replace the booking transaction |

## Consequences

The system has bounded expiry latency equal to the poll interval and needs an
operational metric for claimed/failed batches. The database remains the source
of truth, and multiple workers can make progress without claiming the same row.

## Verification and revisit trigger

`CONC-004` proves disjoint claims, retry-safe repeated runs, resource release,
and a single terminal winner when confirmation races expiry. Revisit this
decision if expiry volume or latency requires a dedicated scheduler, while
keeping the same transactional transition semantics.
