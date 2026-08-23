import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/database/prisma.service';

export interface ConcertReadRow {
  id: string;
  slug: string;
  name: string;
  status: 'PUBLISHED';
  starts_at: Date | string;
}

export interface ConcertListRow extends ConcertReadRow {
  total_count: number;
}

@Injectable()
export class ConcertReadRepository {
  constructor(private readonly database: PrismaService) {}

  async findPublishedPage(page: number, limit: number): Promise<ConcertListRow[]> {
    const offset = (page - 1) * limit;

    return this.database.$queryRaw<ConcertListRow[]>(Prisma.sql`
      SELECT
        c.id::text AS id,
        c.slug,
        c.name,
        c.status,
        c.starts_at,
        COUNT(*) OVER()::int AS total_count
      FROM concerts c
      WHERE c.status = 'PUBLISHED'
      ORDER BY c.starts_at ASC, c.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
  }

  async findPublishedByIdentifier(identifier: string): Promise<ConcertReadRow | null> {
    const rows = await this.database.$queryRaw<ConcertReadRow[]>(Prisma.sql`
      SELECT
        c.id::text AS id,
        c.slug,
        c.name,
        c.status,
        c.starts_at
      FROM concerts c
      WHERE c.status = 'PUBLISHED'
        AND (c.slug = ${identifier} OR c.id::text = ${identifier})
      LIMIT 1
    `);

    return rows[0] ?? null;
  }
}
