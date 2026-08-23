# Test evidence index

This folder provides a concise reviewer-readable summary. The executable test
code remains under `../source-code/tests/`, and the full strategy is documented
in `../source-code/docs/TEST_STRATEGY.md`.

Submission snapshot commit:
`fd76c7f99d1879f0e6bf8add46b19bb48e8257a6`.

Primary commands:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:concurrency`
- `npm run test:load`
- `npm run verify:submission`
- `npm run verify:delivery`

See `concurrency-results.txt` for invariant evidence and
`performance-results.txt` for the measured local k6 baseline. Environment and
hardware materially affect performance results; the numbers are a reproducible
local baseline, not a production capacity guarantee.

