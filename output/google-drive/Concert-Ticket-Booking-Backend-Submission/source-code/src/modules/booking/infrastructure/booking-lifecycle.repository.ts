import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';

export interface BookingTransitionRow {
  id: string;
  booking_code: string;
  status: string;
  expires_at: Date | string;
}

export type OperationBookingTarget = 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface ExpiredBookingRow {
  id: string;
  expires_at: Date | string;
}

@Injectable()
export class BookingLifecycleRepository {
  async findOwnedStatus(
    transaction: TransactionClient,
    userId: string,
    identifier: string,
  ): Promise<BookingTransitionRow | null> {
    const rows = await transaction.$queryRaw<BookingTransitionRow[]>(Prisma.sql`
      SELECT id::text AS id, booking_code, status, expires_at
      FROM bookings
      WHERE user_id = ${userId}::uuid
        AND (id::text = ${identifier} OR booking_code = ${identifier})
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async findStatus(
    transaction: TransactionClient,
    identifier: string,
  ): Promise<BookingTransitionRow | null> {
    const rows = await transaction.$queryRaw<BookingTransitionRow[]>(Prisma.sql`
      SELECT id::text AS id, booking_code, status, expires_at
      FROM bookings
      WHERE id::text = ${identifier} OR booking_code = ${identifier}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async confirmOwned(
    transaction: TransactionClient,
    userId: string,
    identifier: string,
  ): Promise<BookingTransitionRow | null> {
    const rows = await transaction.$queryRaw<BookingTransitionRow[]>(Prisma.sql`
      UPDATE bookings
      SET status = 'CONFIRMED', updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND (id::text = ${identifier} OR booking_code = ${identifier})
        AND status = 'RESERVED'
        -- Evaluate the boundary after any row-lock wait. A JS timestamp
        -- captured before the wait could otherwise confirm an expired row.
        AND expires_at > NOW()
      RETURNING id::text AS id, booking_code, status, expires_at
    `);
    return rows[0] ?? null;
  }

  async cancelOwned(
    transaction: TransactionClient,
    userId: string,
    identifier: string,
  ): Promise<BookingTransitionRow | null> {
    const rows = await transaction.$queryRaw<BookingTransitionRow[]>(Prisma.sql`
      UPDATE bookings
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND (id::text = ${identifier} OR booking_code = ${identifier})
        AND status = 'RESERVED'
        AND expires_at > NOW()
      RETURNING id::text AS id, booking_code, status, expires_at
    `);
    return rows[0] ?? null;
  }

  async transitionByOperation(
    transaction: TransactionClient,
    identifier: string,
    target: OperationBookingTarget,
  ): Promise<BookingTransitionRow | null> {
    const guard =
      target === 'CONFIRMED'
        ? Prisma.sql`AND expires_at > NOW()`
        : target === 'EXPIRED'
          ? Prisma.sql`AND expires_at <= NOW()`
          : Prisma.empty;
    const rows = await transaction.$queryRaw<BookingTransitionRow[]>(Prisma.sql`
      UPDATE bookings
      SET status = ${target}, updated_at = NOW()
      WHERE (id::text = ${identifier} OR booking_code = ${identifier})
        AND status = 'RESERVED'
        ${guard}
      RETURNING id::text AS id, booking_code, status, expires_at
    `);
    return rows[0] ?? null;
  }

  /**
   * Claims a disjoint batch for one expiry worker. The row locks are held
   * until the caller commits the status/resource transitions.
   */
  async claimExpired(
    transaction: TransactionClient,
    now: Date,
    limit: number,
  ): Promise<ExpiredBookingRow[]> {
    return transaction.$queryRaw<ExpiredBookingRow[]>(Prisma.sql`
      SELECT id::text AS id, expires_at
      FROM bookings
      WHERE status = 'RESERVED'
        AND expires_at <= ${now}
      ORDER BY expires_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
  }

  async expireClaimed(
    transaction: TransactionClient,
    bookingId: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE bookings
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE id = ${bookingId}::uuid
        AND status = 'RESERVED'
        AND expires_at <= ${now}
      RETURNING id::text AS id
    `);
    return rows.length === 1;
  }

  async insertTransitionHistory(
    transaction: TransactionClient,
    bookingId: string,
    fromStatus: string,
    toStatus: string,
    changedBy: string | null,
    source: 'CUSTOMER_API' | 'OPERATION_API' | 'RESERVATION_EXPIRY_WORKER',
    reason: string,
  ): Promise<void> {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO booking_status_history
        (booking_id, from_status, to_status, changed_by, change_source, reason)
      VALUES
        (${bookingId}::uuid, ${fromStatus}, ${toStatus}, CAST(${changedBy} AS uuid), ${source}, ${reason})
    `);
  }
}
