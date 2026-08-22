import { createHash } from 'node:crypto';

export interface FingerprintItem {
  ticketCategoryId: string;
  quantity: number;
}

export interface CanonicalBookingIntent {
  userId: string;
  concertId: string;
  items: FingerprintItem[];
  voucherCode: string | null;
}

/**
 * Canonicalizes only the request identity. Business validation remains in the
 * booking use case, but equivalent item ordering and voucher casing must hash
 * to the same logical intent.
 */
export function canonicalizeBookingIntent(
  userId: string,
  concertId: string,
  items: readonly FingerprintItem[],
  voucherCode?: string,
): CanonicalBookingIntent {
  return {
    userId: userId.trim().toLowerCase(),
    concertId: concertId.trim().toLowerCase(),
    items: [...items]
      .map((item) => ({
        ticketCategoryId: item.ticketCategoryId.trim().toLowerCase(),
        quantity: item.quantity,
      }))
      .sort((left, right) => left.ticketCategoryId.localeCompare(right.ticketCategoryId, 'en')),
    voucherCode: voucherCode?.trim().toUpperCase() || null,
  };
}

export function fingerprintBookingIntent(intent: CanonicalBookingIntent): string {
  return createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex');
}
