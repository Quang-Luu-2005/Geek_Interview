export type VoucherEligibilityFailure =
  'VOUCHER_NOT_APPLICABLE' | 'VOUCHER_NOT_STARTED' | 'VOUCHER_EXPIRED' | 'VOUCHER_EXHAUSTED';

export interface VoucherEligibilityInput {
  status: string;
  startsAt: Date | string;
  expiresAt: Date | string;
  now: Date;
  usedCount: number;
  usageLimit: number;
  applicableConcertId: string | null;
  applicableTicketCategoryId: string | null;
  concertId: string;
  categoryIds: readonly string[];
}

export function voucherEligibilityFailure(
  input: VoucherEligibilityInput,
): VoucherEligibilityFailure | null {
  if (new Date(input.expiresAt) <= input.now || input.status === 'EXPIRED') {
    return 'VOUCHER_EXPIRED';
  }
  if (new Date(input.startsAt) > input.now) {
    return 'VOUCHER_NOT_STARTED';
  }
  if (input.status !== 'ACTIVE') {
    return 'VOUCHER_NOT_APPLICABLE';
  }
  if (
    (input.applicableConcertId && input.applicableConcertId !== input.concertId) ||
    (input.applicableTicketCategoryId &&
      !input.categoryIds.includes(input.applicableTicketCategoryId))
  ) {
    return 'VOUCHER_NOT_APPLICABLE';
  }
  if (input.usedCount >= input.usageLimit) {
    return 'VOUCHER_EXHAUSTED';
  }
  return null;
}
