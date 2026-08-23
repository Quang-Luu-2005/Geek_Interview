import { voucherEligibilityFailure } from '../../src/modules/voucher/application/voucher-eligibility';

const base = {
  status: 'ACTIVE',
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-02-01T00:00:00.000Z',
  now: new Date('2026-01-15T00:00:00.000Z'),
  usedCount: 0,
  usageLimit: 10,
  applicableConcertId: null,
  applicableTicketCategoryId: null,
  concertId: 'concert-1',
  categoryIds: ['category-1'],
} as const;

describe('voucher eligibility policy', () => {
  it('treats validity boundaries deterministically', () => {
    expect(
      voucherEligibilityFailure({ ...base, now: new Date('2026-01-01T00:00:00.000Z') }),
    ).toBeNull();
    expect(voucherEligibilityFailure({ ...base, now: new Date('2026-02-01T00:00:00.000Z') })).toBe(
      'VOUCHER_EXPIRED',
    );
    expect(voucherEligibilityFailure({ ...base, now: new Date('2025-12-31T23:59:59.999Z') })).toBe(
      'VOUCHER_NOT_STARTED',
    );
  });

  it('enforces status, quota, and optional scope', () => {
    expect(voucherEligibilityFailure({ ...base, status: 'DISABLED' })).toBe(
      'VOUCHER_NOT_APPLICABLE',
    );
    expect(voucherEligibilityFailure({ ...base, usedCount: 10 })).toBe('VOUCHER_EXHAUSTED');
    expect(voucherEligibilityFailure({ ...base, applicableConcertId: 'other' })).toBe(
      'VOUCHER_NOT_APPLICABLE',
    );
    expect(voucherEligibilityFailure({ ...base, applicableTicketCategoryId: 'other' })).toBe(
      'VOUCHER_NOT_APPLICABLE',
    );
  });
});
