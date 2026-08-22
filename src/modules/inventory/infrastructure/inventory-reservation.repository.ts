import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';

export interface TicketPricingRow {
  id: string;
  code: string;
  name: string;
  price: string;
}

export interface InventoryReservationRow {
  ticket_category_id: string;
  available_quantity: number;
}

@Injectable()
export class InventoryReservationRepository {
  async findCategoriesForConcert(
    transaction: TransactionClient,
    concertId: string,
    categoryIds: readonly string[],
  ): Promise<TicketPricingRow[]> {
    const categoryIdParams = Prisma.join(
      categoryIds.map((categoryId) => Prisma.sql`CAST(${categoryId} AS uuid)`),
    );

    return transaction.$queryRaw<TicketPricingRow[]>(Prisma.sql`
      SELECT tc.id::text AS id, tc.code, tc.name, tc.price::text AS price
      FROM ticket_categories tc
      JOIN ticket_inventories ti ON ti.ticket_category_id = tc.id
      WHERE tc.concert_id = ${concertId}::uuid
        AND tc.id IN (${categoryIdParams})
      ORDER BY tc.id ASC
    `);
  }

  async reserve(
    transaction: TransactionClient,
    categoryId: string,
    quantity: number,
  ): Promise<InventoryReservationRow | null> {
    const rows = await transaction.$queryRaw<InventoryReservationRow[]>(Prisma.sql`
      UPDATE ticket_inventories
      SET available_quantity = available_quantity - ${quantity}, updated_at = NOW()
      WHERE ticket_category_id = ${categoryId}::uuid
        AND available_quantity >= ${quantity}
      RETURNING ticket_category_id::text AS ticket_category_id, available_quantity
    `);

    return rows[0] ?? null;
  }

  /**
   * Restores every line reserved by a booking. The lifecycle service invokes
   * this only after the RESERVED -> terminal status update in the same
   * transaction, so a retry cannot release the same line twice.
   */
  async releaseForBooking(transaction: TransactionClient, bookingId: string): Promise<number> {
    const items = await transaction.$queryRaw<
      {
        ticket_category_id: string;
        quantity: number;
      }[]
    >(Prisma.sql`
      SELECT ticket_category_id::text AS ticket_category_id, quantity
      FROM booking_items
      WHERE booking_id = ${bookingId}::uuid
      ORDER BY ticket_category_id ASC
    `);

    let released = 0;
    for (const item of items) {
      const rows = await transaction.$queryRaw<{ ticket_category_id: string }[]>(Prisma.sql`
        UPDATE ticket_inventories
        SET available_quantity = available_quantity + ${item.quantity}, updated_at = NOW()
        WHERE ticket_category_id = ${item.ticket_category_id}::uuid
          AND available_quantity + ${item.quantity} <= total_quantity
        RETURNING ticket_category_id::text AS ticket_category_id
      `);
      if (rows.length !== 1) {
        throw new Error('Inventory release invariant violated');
      }
      released += item.quantity;
    }
    return released;
  }
}
