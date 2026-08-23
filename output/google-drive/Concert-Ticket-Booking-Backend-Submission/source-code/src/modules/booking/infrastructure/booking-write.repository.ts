import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';

export interface CreatedBookingRow {
  id: string;
  booking_code: string;
  status: string;
  subtotal: string;
  discount_amount: string;
  final_amount: string;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateBookingItemInput {
  id: string;
  bookingId: string;
  categoryId: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

@Injectable()
export class BookingWriteRepository {
  async customerExists(transaction: TransactionClient, userId: string): Promise<boolean> {
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id::text AS id
      FROM users
      WHERE id = ${userId}::uuid AND role = 'CUSTOMER'
      LIMIT 1
    `);
    return rows.length > 0;
  }

  async insertBooking(
    transaction: TransactionClient,
    input: {
      id: string;
      bookingCode: string;
      userId: string;
      concertId: string;
      subtotal: string;
      discountAmount: string;
      finalAmount: string;
      expiresAt: Date;
    },
  ): Promise<CreatedBookingRow> {
    const rows = await transaction.$queryRaw<CreatedBookingRow[]>(Prisma.sql`
      INSERT INTO bookings
        (id, booking_code, user_id, concert_id, status, subtotal, discount_amount,
         final_amount, expires_at)
      VALUES
        (${input.id}::uuid, ${input.bookingCode}, ${input.userId}::uuid, ${input.concertId}::uuid,
         'RESERVED', CAST(${input.subtotal} AS numeric), CAST(${input.discountAmount} AS numeric),
         CAST(${input.finalAmount} AS numeric), ${input.expiresAt})
      RETURNING id::text AS id, booking_code, status, subtotal::text AS subtotal,
        discount_amount::text AS discount_amount, final_amount::text AS final_amount,
        expires_at, created_at, updated_at
    `);

    return rows[0];
  }

  async insertItems(
    transaction: TransactionClient,
    items: readonly CreateBookingItemInput[],
  ): Promise<void> {
    for (const item of items) {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO booking_items
          (id, booking_id, ticket_category_id, quantity, unit_price, line_total)
        VALUES
          (${item.id}::uuid, ${item.bookingId}::uuid, ${item.categoryId}::uuid,
           ${item.quantity}, CAST(${item.unitPrice} AS numeric), CAST(${item.lineTotal} AS numeric))
      `);
    }
  }

  async insertStatusHistory(
    transaction: TransactionClient,
    bookingId: string,
    userId: string,
  ): Promise<void> {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO booking_status_history
        (booking_id, from_status, to_status, changed_by, change_source, reason)
      VALUES
        (${bookingId}::uuid, NULL, 'RESERVED', ${userId}::uuid, 'CUSTOMER_API', 'Booking created')
    `);
  }
}
