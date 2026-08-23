# Concurrency evidence

Verified locally against PostgreSQL 16 on 2026-08-23 with:

```powershell
$env:DATABASE_URL = 'postgresql://ticket:ticket@localhost:55432/ticket_booking'
npm run test:concurrency
```

Result: **4 suites passed, 7 tests passed**.

| ID | Assertion |
|---|---|
| CONC-001 | 100 requests compete for stock 10; 10 bookings succeed, 90 receive controlled inventory conflicts, final inventory is 0 |
| CONC-002 | 20 same-key requests produce one logical booking and one resource decrement; changed payload is rejected |
| CONC-003 | 20 users compete for quota 1; exactly one voucher redemption succeeds |
| CONC-004 | Confirm-vs-expire has one terminal winner; repeated expiry worker claims do not double-release inventory or voucher quota |
