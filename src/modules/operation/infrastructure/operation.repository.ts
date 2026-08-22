import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/database/prisma.service';

export type OperationRole = 'OPERATOR' | 'ADMIN';

export interface OperationBookingListFilter {
  page: number;
  limit: number;
  status?: 'RESERVED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  concertId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}

export interface OperationBookingListRow {
  id: string;
  booking_code: string;
  user_id: string;
  concert_id: string;
  concert_slug: string;
  concert_name: string;
  status: string;
  subtotal: string;
  discount_amount: string;
  final_amount: string;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  total_count: number;
}

export interface OperationBookingItemRow {
  id: string;
  ticket_category_id: string;
  category_code: string;
  category_name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface OperationStatusHistoryRow {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  change_source: string;
  reason: string | null;
  created_at: Date | string;
}

export interface OperationVoucherRow {
  code: string;
  status: string;
  redeemed_at: Date | string;
  released_at: Date | string | null;
  released_reason: string | null;
}

export interface OperationIdempotencyRow {
  status: string;
  response_status: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface OperationBookingDetailRow {
  id: string;
  booking_code: string;
  user_id: string;
  concert_id: string;
  concert_slug: string;
  concert_name: string;
  status: string;
  subtotal: string;
  discount_amount: string;
  final_amount: string;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  items: OperationBookingItemRow[];
  status_history: OperationStatusHistoryRow[];
  voucher: OperationVoucherRow | null;
  idempotency: OperationIdempotencyRow | null;
}

export interface ConcertOperationRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  starts_at: Date | string;
}

export interface TicketCategoryOperationRow {
  id: string;
  concert_id: string;
  code: string;
  name: string;
  price: string;
  total_quantity: number;
  available_quantity: number;
}

export interface VoucherOperationRow {
  id: string;
  code: string;
  discount_type: string;
  discount_value: string;
  usage_limit: number;
  used_count: number;
  status: string;
  starts_at: Date | string;
  expires_at: Date | string;
  applicable_concert_id: string | null;
  applicable_ticket_category_id: string | null;
}

@Injectable()
export class OperationRepository {
  constructor(private readonly database: PrismaService) {}

  async findRole(userId: string): Promise<OperationRole | 'CUSTOMER' | null> {
    const rows = await this.database.$queryRaw<{ role: OperationRole | 'CUSTOMER' }[]>(Prisma.sql`
      SELECT role
      FROM users
      WHERE id = ${userId}::uuid
      LIMIT 1
    `);
    return rows[0]?.role ?? null;
  }

  async findBookings(filter: OperationBookingListFilter): Promise<OperationBookingListRow[]> {
    const predicates: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (filter.status) predicates.push(Prisma.sql`b.status = ${filter.status}`);
    if (filter.concertId) {
      predicates.push(
        Prisma.sql`(b.concert_id::text = ${filter.concertId} OR c.slug = ${filter.concertId})`,
      );
    }
    if (filter.userId) predicates.push(Prisma.sql`b.user_id = ${filter.userId}::uuid`);
    if (filter.from) predicates.push(Prisma.sql`b.created_at >= ${filter.from}`);
    if (filter.to) predicates.push(Prisma.sql`b.created_at < ${filter.to}`);
    const where = Prisma.join(predicates, ' AND ');
    const offset = (filter.page - 1) * filter.limit;

    return this.database.$queryRaw<OperationBookingListRow[]>(Prisma.sql`
      SELECT
        b.id::text AS id,
        b.booking_code,
        b.user_id::text AS user_id,
        b.concert_id::text AS concert_id,
        c.slug AS concert_slug,
        c.name AS concert_name,
        b.status,
        b.subtotal::text AS subtotal,
        b.discount_amount::text AS discount_amount,
        b.final_amount::text AS final_amount,
        b.expires_at,
        b.created_at,
        b.updated_at,
        COUNT(*) OVER()::int AS total_count
      FROM bookings b
      JOIN concerts c ON c.id = b.concert_id
      WHERE ${where}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ${filter.limit}
      OFFSET ${offset}
    `);
  }

  async findBookingDetail(identifier: string): Promise<OperationBookingDetailRow | null> {
    const bookingRows = await this.database.$queryRaw<
      Omit<OperationBookingDetailRow, 'items' | 'status_history' | 'voucher' | 'idempotency'>[]
    >(Prisma.sql`
      SELECT
        b.id::text AS id,
        b.booking_code,
        b.user_id::text AS user_id,
        b.concert_id::text AS concert_id,
        c.slug AS concert_slug,
        c.name AS concert_name,
        b.status,
        b.subtotal::text AS subtotal,
        b.discount_amount::text AS discount_amount,
        b.final_amount::text AS final_amount,
        b.expires_at,
        b.created_at,
        b.updated_at
      FROM bookings b
      JOIN concerts c ON c.id = b.concert_id
      WHERE b.id::text = ${identifier} OR b.booking_code = ${identifier}
      LIMIT 1
    `);
    const booking = bookingRows[0];
    if (!booking) return null;

    const [items, history, voucherRows, idempotencyRows] = await Promise.all([
      this.database.$queryRaw<OperationBookingItemRow[]>(Prisma.sql`
        SELECT bi.id::text AS id, bi.ticket_category_id::text AS ticket_category_id,
               tc.code AS category_code, tc.name AS category_name, bi.quantity,
               bi.unit_price::text AS unit_price, bi.line_total::text AS line_total
        FROM booking_items bi
        JOIN ticket_categories tc ON tc.id = bi.ticket_category_id
        WHERE bi.booking_id = ${booking.id}::uuid
        ORDER BY bi.id ASC
      `),
      this.database.$queryRaw<OperationStatusHistoryRow[]>(Prisma.sql`
        SELECT id::text AS id, from_status, to_status, changed_by::text AS changed_by,
               change_source, reason, created_at
        FROM booking_status_history
        WHERE booking_id = ${booking.id}::uuid
        ORDER BY created_at ASC, id ASC
      `),
      this.database.$queryRaw<OperationVoucherRow[]>(Prisma.sql`
        SELECT v.code, vr.status, vr.redeemed_at, vr.released_at, vr.released_reason
        FROM voucher_redemptions vr
        JOIN vouchers v ON v.id = vr.voucher_id
        WHERE vr.booking_id = ${booking.id}::uuid
        LIMIT 1
      `),
      this.database.$queryRaw<OperationIdempotencyRow[]>(Prisma.sql`
        SELECT ir.status, ir.response_status, ir.created_at, ir.updated_at
        FROM idempotency_records ir
        WHERE ir.user_id = ${booking.user_id}::uuid
          AND ir.response_body->>'id' = ${booking.id}
        ORDER BY ir.updated_at DESC
        LIMIT 1
      `),
    ]);

    return {
      ...booking,
      items,
      status_history: history,
      voucher: voucherRows[0] ?? null,
      idempotency: idempotencyRows[0] ?? null,
    };
  }

  async createConcert(input: {
    slug: string;
    name: string;
    startsAt: Date;
  }): Promise<ConcertOperationRow> {
    const rows = await this.database.$queryRaw<ConcertOperationRow[]>(Prisma.sql`
      INSERT INTO concerts (slug, name, status, starts_at)
      VALUES (${input.slug}, ${input.name}, 'DRAFT', ${input.startsAt})
      RETURNING id::text AS id, slug, name, status, starts_at
    `);
    return rows[0];
  }

  async createTicketCategory(
    concertIdentifier: string,
    input: { code: string; name: string; price: string; totalQuantity: number },
  ): Promise<TicketCategoryOperationRow> {
    return this.database.$transaction(async (transaction) => {
      const concerts = await transaction.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
        SELECT id::text AS id, status
        FROM concerts
        WHERE id::text = ${concertIdentifier} OR slug = ${concertIdentifier}
        FOR UPDATE
      `);
      const concert = concerts[0];
      if (!concert) throw new Error('CONCERT_NOT_FOUND');
      if (concert.status !== 'DRAFT') throw new Error('CONCERT_NOT_EDITABLE');

      const categories = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO ticket_categories (concert_id, code, name, price)
        VALUES (${concert.id}::uuid, ${input.code}, ${input.name}, CAST(${input.price} AS numeric))
        RETURNING id::text AS id
      `);
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO ticket_inventories (ticket_category_id, total_quantity, available_quantity)
        VALUES (${categories[0].id}::uuid, ${input.totalQuantity}, ${input.totalQuantity})
      `);
      const rows = await transaction.$queryRaw<TicketCategoryOperationRow[]>(Prisma.sql`
        SELECT tc.id::text AS id, tc.concert_id::text AS concert_id, tc.code, tc.name,
               tc.price::text AS price, ti.total_quantity, ti.available_quantity
        FROM ticket_categories tc
        JOIN ticket_inventories ti ON ti.ticket_category_id = tc.id
        WHERE tc.id = ${categories[0].id}::uuid
      `);
      return rows[0];
    });
  }

  async publishConcert(identifier: string): Promise<ConcertOperationRow | null> {
    const rows = await this.database.$queryRaw<ConcertOperationRow[]>(Prisma.sql`
      UPDATE concerts c
      SET status = 'PUBLISHED'
      WHERE (c.id::text = ${identifier} OR c.slug = ${identifier})
        AND c.status = 'DRAFT'
        AND c.starts_at > NOW()
        AND EXISTS (
          SELECT 1 FROM ticket_categories tc
          JOIN ticket_inventories ti ON ti.ticket_category_id = tc.id
          WHERE tc.concert_id = c.id
        )
      RETURNING c.id::text AS id, c.slug, c.name, c.status, c.starts_at
    `);
    return rows[0] ?? null;
  }

  async findConcert(
    identifier: string,
  ): Promise<{ id: string; status: string; starts_at: Date | string } | null> {
    const rows = await this.database.$queryRaw<
      { id: string; status: string; starts_at: Date | string }[]
    >(Prisma.sql`
      SELECT id::text AS id, status, starts_at
      FROM concerts
      WHERE id::text = ${identifier} OR slug = ${identifier}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async createVoucher(input: {
    code: string;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: string;
    usageLimit: number;
    startsAt: Date;
    expiresAt: Date;
    applicableConcertId: string | null;
    applicableTicketCategoryId: string | null;
  }): Promise<VoucherOperationRow> {
    return this.database.$transaction(async (transaction) => {
      if (input.applicableConcertId) {
        const concerts = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id::text AS id FROM concerts WHERE id = ${input.applicableConcertId}::uuid
        `);
        if (!concerts[0]) throw new Error('CONCERT_NOT_FOUND');
      }
      if (input.applicableTicketCategoryId) {
        const categories = await transaction.$queryRaw<
          { id: string; concert_id: string }[]
        >(Prisma.sql`
          SELECT id::text AS id, concert_id::text AS concert_id
          FROM ticket_categories
          WHERE id = ${input.applicableTicketCategoryId}::uuid
        `);
        if (!categories[0]) throw new Error('TICKET_CATEGORY_NOT_FOUND');
        if (input.applicableConcertId && categories[0].concert_id !== input.applicableConcertId) {
          throw new Error('VOUCHER_SCOPE_MISMATCH');
        }
      }

      const rows = await transaction.$queryRaw<VoucherOperationRow[]>(Prisma.sql`
        INSERT INTO vouchers
          (code, discount_type, discount_value, usage_limit, used_count, status,
           starts_at, expires_at, applicable_concert_id, applicable_ticket_category_id)
        VALUES
          (${input.code}, ${input.discountType}, CAST(${input.discountValue} AS numeric),
           ${input.usageLimit}, 0, 'ACTIVE', ${input.startsAt}, ${input.expiresAt},
           ${input.applicableConcertId}::uuid, ${input.applicableTicketCategoryId}::uuid)
        RETURNING id::text AS id, code, discount_type, discount_value::text AS discount_value,
          usage_limit, used_count, status, starts_at, expires_at,
          applicable_concert_id::text AS applicable_concert_id,
          applicable_ticket_category_id::text AS applicable_ticket_category_id
      `);
      return rows[0];
    });
  }
}
