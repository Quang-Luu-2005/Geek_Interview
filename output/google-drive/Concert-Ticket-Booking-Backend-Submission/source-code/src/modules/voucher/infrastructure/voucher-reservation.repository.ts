import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';
import { voucherEligibilityFailure } from '../application/voucher-eligibility';

export interface ReservedVoucherRow {
  id: string;
  code: string;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: string;
}

export type VoucherPolicyErrorCode =
  | 'VOUCHER_NOT_APPLICABLE'
  | 'VOUCHER_NOT_STARTED'
  | 'VOUCHER_EXPIRED'
  | 'VOUCHER_EXHAUSTED'
  | 'VOUCHER_ALREADY_REDEEMED';

export class VoucherReservationError extends Error {
  constructor(public readonly code: VoucherPolicyErrorCode) {
    super(code);
    this.name = 'VoucherReservationError';
  }
}

interface VoucherRow extends ReservedVoucherRow {
  status: string;
  usage_limit: number;
  used_count: number;
  starts_at: Date | string;
  expires_at: Date | string;
  applicable_concert_id: string | null;
  applicable_ticket_category_id: string | null;
}

@Injectable()
export class VoucherReservationRepository {
  async reserve(
    transaction: TransactionClient,
    code: string,
    userId: string,
    concertId: string,
    categoryIds: readonly string[],
  ): Promise<ReservedVoucherRow> {
    const voucherRows = await transaction.$queryRaw<VoucherRow[]>(Prisma.sql`
      SELECT id::text AS id, code, discount_type, discount_value::text AS discount_value,
             status, usage_limit, used_count, starts_at, expires_at,
             applicable_concert_id::text AS applicable_concert_id,
             applicable_ticket_category_id::text AS applicable_ticket_category_id
      FROM vouchers
      WHERE code = ${code}
      FOR UPDATE
    `);
    const voucher = voucherRows[0];

    if (!voucher) {
      throw new VoucherReservationError('VOUCHER_NOT_APPLICABLE');
    }

    const failure = voucherEligibilityFailure({
      status: voucher.status,
      startsAt: voucher.starts_at,
      expiresAt: voucher.expires_at,
      now: new Date(),
      usedCount: voucher.used_count,
      usageLimit: voucher.usage_limit,
      applicableConcertId: voucher.applicable_concert_id,
      applicableTicketCategoryId: voucher.applicable_ticket_category_id,
      concertId,
      categoryIds,
    });
    if (failure) throw new VoucherReservationError(failure);

    const redemptions = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id::text AS id
      FROM voucher_redemptions
      WHERE voucher_id = ${voucher.id}::uuid
        AND user_id = ${userId}::uuid
        AND status <> 'RELEASED'
      LIMIT 1
    `);
    if (redemptions.length > 0) {
      throw new VoucherReservationError('VOUCHER_ALREADY_REDEEMED');
    }

    const updated = await transaction.$queryRaw<ReservedVoucherRow[]>(Prisma.sql`
      UPDATE vouchers
      SET used_count = used_count + 1
      WHERE id = ${voucher.id}::uuid
        AND status = 'ACTIVE'
        AND starts_at <= NOW()
        AND expires_at > NOW()
        AND used_count < usage_limit
      RETURNING id::text AS id, code, discount_type, discount_value::text AS discount_value
    `);

    if (!updated[0]) {
      const raceFailure = voucherEligibilityFailure({
        status: voucher.status,
        startsAt: voucher.starts_at,
        expiresAt: voucher.expires_at,
        now: new Date(),
        usedCount: voucher.used_count,
        usageLimit: voucher.usage_limit,
        applicableConcertId: voucher.applicable_concert_id,
        applicableTicketCategoryId: voucher.applicable_ticket_category_id,
        concertId,
        categoryIds,
      });
      throw new VoucherReservationError(raceFailure ?? 'VOUCHER_EXHAUSTED');
    }

    return updated[0];
  }

  async insertRedemption(
    transaction: TransactionClient,
    voucherId: string,
    userId: string,
    bookingId: string,
  ): Promise<void> {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO voucher_redemptions (voucher_id, user_id, booking_id, status)
      VALUES (${voucherId}::uuid, ${userId}::uuid, ${bookingId}::uuid, 'RESERVED')
    `);
  }

  /** Mark a reserved redemption as consumed when a booking is confirmed. */
  async consumeForBooking(transaction: TransactionClient, bookingId: string): Promise<boolean> {
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE voucher_redemptions
      SET status = 'CONSUMED'
      WHERE booking_id = ${bookingId}::uuid AND status = 'RESERVED'
    `);

    return updated === 1;
  }

  /**
   * Release only RESERVED quota. The status transition is the idempotency
   * guard: a second expiry/cancel attempt affects zero rows and cannot
   * decrement the global counter twice. The row remains as audit evidence.
   */
  async releaseForBooking(
    transaction: TransactionClient,
    bookingId: string,
    reason: string,
  ): Promise<boolean> {
    const released = await transaction.$queryRaw<{ voucher_id: string }[]>(Prisma.sql`
      UPDATE voucher_redemptions
      SET status = 'RELEASED', released_at = NOW(), released_reason = ${reason}
      WHERE booking_id = ${bookingId}::uuid AND status = 'RESERVED'
      RETURNING voucher_id::text AS voucher_id
    `);

    if (!released[0]) return false;

    const decremented = await transaction.$executeRaw(Prisma.sql`
      UPDATE vouchers
      SET used_count = used_count - 1
      WHERE id = ${released[0].voucher_id}::uuid AND used_count > 0
    `);
    if (decremented !== 1) {
      throw new Error('Voucher quota release invariant violated');
    }

    return true;
  }
}
