# API quality, observability and flash-sale policy

## Runtime probes

The service exposes separate orchestration probes: `GET /health/live` answers
from process memory only, while `GET /health/ready` checks PostgreSQL and
returns `503` when the dependency is unavailable. `GET /health` is retained as
a backwards-compatible readiness alias. This lets a deployment restart an
unhealthy process without routing traffic to an API that cannot commit a
booking.

## Request tracing and logs

Every request receives or propagates `X-Request-ID`. The response carries the
same value, and the standard error contract exposes it as `traceId`. Requests
emit one-line JSON records with only low-risk fields:

```json
{"timestamp":"2026-08-23T10:00:00.000Z","level":"info","service":"ticket-booking-api","event":"http.request.completed","method":"POST","route":"/api/bookings","statusCode":201,"durationMs":42}
```

No request body, access token, voucher code, or payment data is logged. Business
booking counters record attempts, successes, idempotent replays, and failures by
bounded error code.

## Metrics

`GET /metrics` exposes the in-process Prometheus text format. Current metric
names are:

- `http_requests_total{method,route,status}`
- `booking_attempts_total`
- `booking_success_total`
- `booking_replayed_total`
- `booking_failure_total{code}`
- `booking_sold_out_total`
- `inventory_conflicts_total`
- `voucher_exhausted_total`
- `idempotency_conflicts_total{code}`
- `booking_expired_total`

Labels are deliberately low cardinality; IDs are never labels. This storage is
single-instance and resets on restart. A production deployment should export
the same counters to Prometheus/OpenTelemetry and alert on sustained 5xx,
`booking_failure_total` conflict spikes, and rate-limit saturation.

## Rate limiting

`POST /api/bookings` is limited per authenticated customer (`x-user-id`) and
falls back to source IP when no identity is present. Defaults are 60 attempts
per 60 seconds and can be changed with `RATE_LIMIT_BOOKING_MAX` and
`RATE_LIMIT_WINDOW_MS`. A rejected request returns `429`, `code: RATE_LIMITED`,
and `Retry-After` seconds. Operations/admin endpoints are not counted by this
flash-sale limiter.

The limiter is an in-memory, single-process guard. It is suitable for the
assessment and protects one API instance; a multi-instance deployment must use
a shared Redis/API-gateway limiter with the same key and response policy.
