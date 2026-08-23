# Performance Report

Generated at **2026-08-23T07:21:26.850Z** from benchmark commit **edf61fa3dc2f3047c83a4af578a6c53a81b61bfb**.

## Reproduction

```bash
export DATABASE_URL=postgresql://ticket:ticket@localhost:5432/ticket_booking
export RATE_LIMIT_BOOKING_MAX=1000
export BASE_URL=http://localhost:3000
npm run db:migrate && npm run db:seed
npm run test:load
```

The runner resolves the seeded customer and STANDARD category automatically. It uses a native k6 binary when available, otherwise Docker image `grafana/k6:0.53.0`. Reset the local database after a run if the booking rows are not disposable.

## Environment and scenarios

| Field | Value |
|---|---|
| API base URL | `http://host.docker.internal:3300` |
| Runtime | `win32/x64, v22.17.1` |
| Load engine | `grafana/k6:0.53.0` via Docker |
| PostgreSQL | `PostgreSQL 16.14 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit` |
| Concert | `summer-festival-2026` |
| Workload | steady 5 req/s, then burst 15 req/s |
| Steady duration | `30s` |
| Burst stages | 3 x `10s` |
| Commit | `edf61fa3dc2f3047c83a4af578a6c53a81b61bfb` |

## Results

| Metric | Result |
|---|---:|
| Requests | 500 |
| Throughput | 8 req/s |
| p50 latency | 13.21 ms |
| p95 latency | 22.01 ms |
| p99 latency | 29.72 ms |
| Booking successes | 500 |
| Expected business rejects (400/409/429) | 0 |
| System error rate | 0.000% |

## Interpretation

Business rejects are not counted as system failures because sold-out, validation and rate-limit responses are expected outcomes under contention. A non-zero system error rate indicates an HTTP 5xx, auth/configuration failure, or another unexpected status and should block a performance claim. This report is a local reproducibility baseline, not a capacity guarantee; CPU, memory, database locality and Docker networking materially affect the numbers.
