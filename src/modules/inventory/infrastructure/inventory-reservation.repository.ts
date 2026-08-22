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
}
