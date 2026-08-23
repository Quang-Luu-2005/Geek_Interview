# ADR-006: Keep the Transactional Outbox Optional

## Status

Proposed / not implemented in the assessment scope

## Context

Booking confirmation and expiry may eventually publish email, analytics, or
message-broker events. Writing PostgreSQL and a broker independently would
create a dual-write failure window.

## Decision

Do not add Kafka, a broker, or an outbox table to the current correctness path.
When asynchronous integration becomes a real requirement, add an outbox row in
the same transaction as the booking or expiry state change, then publish with a
claim/retry worker. The API and tests must continue to work without a broker.

## Alternatives considered

| Alternative | Trade-off |
|---|---|
| Direct broker publish after commit | Fast to prototype, but a process crash can lose the event |
| Broker-first then database write | Can publish an event for a transaction that later rolls back |
| Implement outbox now | More infrastructure and migration surface without a current consumer |

## Consequences and revisit trigger

The current repository has no asynchronous delivery guarantee; that limitation
is explicit in the scope document. Add this ADR's proposed schema and worker
only when a concrete integration needs durable delivery. The transactional
booking and expiry invariants remain independently proven today.
