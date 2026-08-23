# Test result artifacts

Raw Jest and k6 output is intentionally ignored because it is machine-specific
and can be large. The commands and invariant assertions are versioned in
`docs/TEST_STRATEGY.md`; a successful k6 run generates the tracked
`docs/PERFORMANCE_REPORT.md` with its commit SHA and measured summary.
