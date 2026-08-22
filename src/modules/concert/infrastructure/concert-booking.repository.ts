import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';

export interface BookableConcertRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  starts_at: Date | string;
}

@Injectable()
export class ConcertBookingRepository {
  async findByIdentifier(
    transaction: TransactionClient,
    identifier: string,
  ): Promise<BookableConcertRow | null> {
    const rows = await transaction.$queryRaw<BookableConcertRow[]>(Prisma.sql`
      SELECT c.id::text AS id, c.slug, c.name, c.status, c.starts_at
      FROM concerts c
      WHERE c.slug = ${identifier} OR c.id::text = ${identifier}
      LIMIT 1
    `);

    return rows[0] ?? null;
  }
}
