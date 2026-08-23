# Performance Report

Generated at **2026-08-23T04:14:57.294Z** from commit **488e97d4f5314e73cf5670b9651b86574a0902fe**.

## Reproduction

```bash
DATABASE_URL=postgresql://ticket:ticket@localhost:5432/ticket_booking \
npm run db:migrate && npm run db:seed \
RATE_LIMIT_BOOKING_MAX=1000 BASE_URL=http://localhost:3000 npm run test:load
```

The runner resolves the seeded customer and STANDARD category automatically. It uses a native k6 binary when available, otherwise Docker image `grafana/k6:0.53.0`. Reset the local database after a run if the booking rows are not disposable.

## Environment and scenarios

| Field | Value |
|---|---|
| API base URL | `http://host.docker.internal:3300` |
| Concert | `summer-festival-2026` |
| Workload | steady 2 req/s, then burst 5 req/s |
| Steady duration | `5s` |
| Burst stages | 3 × `2s` |
| Commit | `488e97d4f5314e73cf5670b9651b86574a0902fe` |

## Results

| Metric | Result |
|---|---:|
| Requests | 39 |
| Throughput | 4 req/s |
| p50 latency | 10.80 ms |
| p95 latency | 27.55 ms |
| p99 latency | 43.93 ms |
| Booking successes | 39 |
| Expected business rejects (400/409/429) | 0 |
| System error rate | 0.000% |

## Interpretation

Business rejects are not counted as system failures because sold-out, validation and rate-limit responses are expected outcomes under contention. A non-zero system error rate indicates an HTTP 5xx, auth/configuration failure, or another unexpected status and should block a performance claim. This report is a local reproducibility baseline, not a capacity guarantee; CPU, memory, database locality and Docker networking materially affect the numbers.
