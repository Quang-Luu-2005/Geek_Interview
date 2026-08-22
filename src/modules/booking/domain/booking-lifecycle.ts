export type BookingStatus = 'RESERVED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export type BookingTransition = 'CONFIRM' | 'EXPIRE' | 'CANCEL';

export type BookingTransitionFailure =
  'BOOKING_NOT_CONFIRMABLE' | 'BOOKING_NOT_EXPIRED' | 'BOOKING_NOT_CANCELLABLE';

/**
 * The lifecycle is deliberately small. RESERVED is the only mutable state;
 * all other states are terminal for the current product scope.
 */
export function transitionFailure(
  status: BookingStatus,
  transition: BookingTransition,
  expiresAt: Date | string,
  now: Date = new Date(),
): BookingTransitionFailure | null {
  if (status !== 'RESERVED') {
    if (transition === 'CONFIRM') return 'BOOKING_NOT_CONFIRMABLE';
    if (transition === 'EXPIRE') return 'BOOKING_NOT_EXPIRED';
    return 'BOOKING_NOT_CANCELLABLE';
  }

  const expired = new Date(expiresAt).getTime() <= now.getTime();
  if (transition === 'CONFIRM' && expired) return 'BOOKING_NOT_CONFIRMABLE';
  if (transition === 'CANCEL' && expired) return 'BOOKING_NOT_CANCELLABLE';
  if (transition === 'EXPIRE' && !expired) return 'BOOKING_NOT_EXPIRED';

  return null;
}

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return status !== 'RESERVED';
}
