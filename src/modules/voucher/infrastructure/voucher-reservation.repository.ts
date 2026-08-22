import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';

export interface ReservedVoucherRow {
  id: string;
  code: string;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: string;
}

interface VoucherRow extends ReservedVoucherRow {
  status: string;
  usage_limit: number;
  used_count: number;
  starts_at: Date | string;
  expires_at: Date | string;
}

@Injectable()
export class VoucherReservationRepository {
  async reserve(
    transaction: TransactionClient,
    code: string,
    userId: string,
  ): Promise<ReservedVoucherRow> {
    const voucherRows = await transaction.$queryRaw<VoucherRow[]>(Prisma.sql`
      SELECT id::text AS id, code, discount_type, discount_value::text AS discount_value,
             status, usage_limit, used_count, starts_at, expires_at
      FROM vouchers
      WHERE code = ${code}
      FOR UPDATE
    `);
    const voucher = voucherRows[0];

    if (!voucher || voucher.status !== 'ACTIVE') {
      throw new Error('VOUCHER_NOT_APPLICABLE');
    }

    const now = new Date();
    if (new Date(voucher.starts_at) > now || new Date(voucher.expires_at) <= now) {
      throw new Error('VOUCHER_NOT_APPLICABLE');
    }

    const redemptions = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id::text AS id
      FROM voucher_redemptions
      WHERE voucher_id = ${voucher.id}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `);
    if (redemptions.length > 0) {
      throw new Error('VOUCHER_ALREADY_REDEEMED');
    }

    if (voucher.used_count >= voucher.usage_limit) {
      throw new Error('VOUCHER_NOT_APPLICABLE');
    }

    const updated = await transaction.$queryRaw<ReservedVoucherRow[]>(Prisma.sql`
      UPDATE vouchers
      SET used_count = used_count + 1
      WHERE id = ${voucher.id}::uuid AND used_count < usage_limit
      RETURNING id::text AS id, code, discount_type, discount_value::text AS discount_value
    `);

    if (!updated[0]) {
      throw new Error('VOUCHER_NOT_APPLICABLE');
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
      INSERT INTO voucher_redemptions (voucher_id, user_id, booking_id)
      VALUES (${voucherId}::uuid, ${userId}::uuid, ${bookingId}::uuid)
    `);
  }
}
