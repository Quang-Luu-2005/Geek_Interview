import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/database/prisma.service';

export interface TicketCategoryAvailabilityRow {
  id: string;
  code: string;
  name: string;
  price: string;
  total_quantity: number;
  available_quantity: number;
}

@Injectable()
export class InventoryReadRepository {
  constructor(private readonly database: PrismaService) {}

  async findForPublishedConcert(
    concertIdentifier: string,
  ): Promise<TicketCategoryAvailabilityRow[]> {
    return this.database.$queryRaw<TicketCategoryAvailabilityRow[]>(Prisma.sql`
      SELECT
        tc.id::text AS id,
        tc.code,
        tc.name,
        tc.price::text AS price,
        COALESCE(ti.total_quantity, 0)::int AS total_quantity,
        COALESCE(ti.available_quantity, 0)::int AS available_quantity
      FROM ticket_categories tc
      JOIN concerts c ON c.id = tc.concert_id
      LEFT JOIN ticket_inventories ti ON ti.ticket_category_id = tc.id
      WHERE c.status = 'PUBLISHED'
        AND (c.slug = ${concertIdentifier} OR c.id::text = ${concertIdentifier})
      ORDER BY tc.code ASC, tc.id ASC
    `);
  }
}
