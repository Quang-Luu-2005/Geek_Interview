import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/database/prisma.service';

export interface BookingItemReadRow {
  id: string;
  ticketCategoryId: string;
  categoryCode: string;
  categoryName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface BookingReadRow {
  id: string;
  bookingCode: string;
  concertId: string;
  concertSlug: string;
  concertName: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  finalAmount: string;
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  items: BookingItemReadRow[];
}

export interface BookingListRow extends BookingReadRow {
  totalCount: number;
}

interface RawBookingRow {
  id: string;
  booking_code: string;
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
  items: BookingItemReadRow[];
}

interface RawBookingListRow extends RawBookingRow {
  total_count: number;
}

@Injectable()
export class BookingReadRepository {
  constructor(private readonly database: PrismaService) {}

  async findByUserPage(userId: string, page: number, limit: number): Promise<BookingListRow[]> {
    const offset = (page - 1) * limit;
    const rows = await this.database.$queryRaw<RawBookingListRow[]>(Prisma.sql`
      SELECT
        b.id::text AS id,
        b.booking_code,
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
        COUNT(*) OVER()::int AS total_count,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', bi.id::text,
              'ticketCategoryId', bi.ticket_category_id::text,
              'categoryCode', tc.code,
              'categoryName', tc.name,
              'quantity', bi.quantity,
              'unitPrice', bi.unit_price::text,
              'lineTotal', bi.line_total::text
            ) ORDER BY bi.id
          ) FILTER (WHERE bi.id IS NOT NULL),
          '[]'::jsonb
        ) AS items
      FROM bookings b
      JOIN concerts c ON c.id = b.concert_id
      LEFT JOIN booking_items bi ON bi.booking_id = b.id
      LEFT JOIN ticket_categories tc ON tc.id = bi.ticket_category_id
      WHERE b.user_id = ${userId}::uuid
      GROUP BY b.id, c.id
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    return rows.map((row) => ({
      ...this.mapRow(row),
      totalCount: row.total_count,
    }));
  }

  async findOwnedByIdentifier(userId: string, identifier: string): Promise<BookingReadRow | null> {
    const rows = await this.database.$queryRaw<RawBookingRow[]>(Prisma.sql`
      SELECT
        b.id::text AS id,
        b.booking_code,
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
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', bi.id::text,
              'ticketCategoryId', bi.ticket_category_id::text,
              'categoryCode', tc.code,
              'categoryName', tc.name,
              'quantity', bi.quantity,
              'unitPrice', bi.unit_price::text,
              'lineTotal', bi.line_total::text
            ) ORDER BY bi.id
          ) FILTER (WHERE bi.id IS NOT NULL),
          '[]'::jsonb
        ) AS items
      FROM bookings b
      JOIN concerts c ON c.id = b.concert_id
      LEFT JOIN booking_items bi ON bi.booking_id = b.id
      LEFT JOIN ticket_categories tc ON tc.id = bi.ticket_category_id
      WHERE b.user_id = ${userId}::uuid
        AND (b.id::text = ${identifier} OR b.booking_code = ${identifier})
      GROUP BY b.id, c.id
      LIMIT 1
    `);

    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private mapRow(row: RawBookingRow): BookingReadRow {
    return {
      id: row.id,
      bookingCode: row.booking_code,
      concertId: row.concert_id,
      concertSlug: row.concert_slug,
      concertName: row.concert_name,
      status: row.status,
      subtotal: row.subtotal,
      discountAmount: row.discount_amount,
      finalAmount: row.final_amount,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: row.items ?? [],
    };
  }
}
