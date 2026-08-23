import { transitionFailure } from '../../src/modules/booking/domain/booking-lifecycle';

describe('booking lifecycle policy', () => {
  const expiresAt = new Date('2026-08-23T10:00:00.000Z');
  const beforeExpiry = new Date('2026-08-23T09:59:59.000Z');
  const atExpiry = new Date('2026-08-23T10:00:00.000Z');

  it('allows only a live RESERVED booking to confirm', () => {
    expect(transitionFailure('RESERVED', 'CONFIRM', expiresAt, beforeExpiry)).toBeNull();
    expect(transitionFailure('RESERVED', 'CONFIRM', expiresAt, atExpiry)).toBe(
      'BOOKING_NOT_CONFIRMABLE',
    );
    expect(transitionFailure('CONFIRMED', 'CONFIRM', expiresAt, beforeExpiry)).toBe(
      'BOOKING_NOT_CONFIRMABLE',
    );
    expect(transitionFailure('EXPIRED', 'CONFIRM', expiresAt, beforeExpiry)).toBe(
      'BOOKING_NOT_CONFIRMABLE',
    );
  });

  it('allows expiry only at or after the reservation boundary', () => {
    expect(transitionFailure('RESERVED', 'EXPIRE', expiresAt, beforeExpiry)).toBe(
      'BOOKING_NOT_EXPIRED',
    );
    expect(transitionFailure('RESERVED', 'EXPIRE', expiresAt, atExpiry)).toBeNull();
    expect(transitionFailure('EXPIRED', 'EXPIRE', expiresAt, atExpiry)).toBe('BOOKING_NOT_EXPIRED');
  });

  it('keeps terminal states terminal and permits cancellation only from RESERVED', () => {
    expect(transitionFailure('RESERVED', 'CANCEL', expiresAt, beforeExpiry)).toBeNull();
    expect(transitionFailure('RESERVED', 'CANCEL', expiresAt, atExpiry)).toBe(
      'BOOKING_NOT_CANCELLABLE',
    );
    expect(transitionFailure('CONFIRMED', 'CANCEL', expiresAt, beforeExpiry)).toBe(
      'BOOKING_NOT_CANCELLABLE',
    );
    expect(transitionFailure('CANCELLED', 'CONFIRM', expiresAt, beforeExpiry)).toBe(
      'BOOKING_NOT_CONFIRMABLE',
    );
  });
});
