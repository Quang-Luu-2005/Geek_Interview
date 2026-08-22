import {
  canonicalizeBookingIntent,
  fingerprintBookingIntent,
} from '../../src/modules/idempotency/application/request-fingerprint';

describe('booking request fingerprint', () => {
  it('normalizes item order, identifiers, and voucher casing', () => {
    const first = canonicalizeBookingIntent(
      'USER-1',
      ' Summer-Festival-2026 ',
      [
        { ticketCategoryId: 'B-CATEGORY', quantity: 1 },
        { ticketCategoryId: 'a-category', quantity: 2 },
      ],
      ' flash10 ',
    );
    const second = canonicalizeBookingIntent(
      'user-1',
      'summer-festival-2026',
      [
        { ticketCategoryId: 'A-CATEGORY', quantity: 2 },
        { ticketCategoryId: 'b-category', quantity: 1 },
      ],
      'FLASH10',
    );

    expect(first).toEqual(second);
    expect(fingerprintBookingIntent(first)).toBe(fingerprintBookingIntent(second));
  });

  it('changes the hash when a logical booking intent changes', () => {
    const first = canonicalizeBookingIntent('user-1', 'concert', [
      { ticketCategoryId: 'category', quantity: 1 },
    ]);
    const changed = canonicalizeBookingIntent('user-1', 'concert', [
      { ticketCategoryId: 'category', quantity: 2 },
    ]);

    expect(fingerprintBookingIntent(first)).not.toBe(fingerprintBookingIntent(changed));
  });
});
