import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { VoucherReservationRepository } from '../../src/modules/voucher/infrastructure/voucher-reservation.repository';

describe('voucher release semantics', () => {
  let app: INestApplication;
  let client: Client;
  let database: PrismaService;
  let voucherRepository: VoucherReservationRepository;
  let baseUrl: string;
  let userId: string;
  let concertId: string;
  let categoryId: string;
  let voucherId: string;
  let bookingId: string;
  const slug = `voucher-release-${randomUUID()}`;
  const voucherCode = `RELEASE-${randomUUID().slice(0, 8).toUpperCase()}`;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    userId = (
      await client.query<{ id: string }>(
        `SELECT id::text AS id FROM users WHERE email = 'customer@example.com'`,
      )
    ).rows[0].id;
    concertId = (
      await client.query<{ id: string }>(
        `INSERT INTO concerts (slug, name, status, starts_at)
         VALUES ($1, 'Voucher Release Concert', 'PUBLISHED', NOW() + INTERVAL '1 day')
         RETURNING id::text AS id`,
        [slug],
      )
    ).rows[0].id;
    categoryId = (
      await client.query<{ id: string }>(
        `INSERT INTO ticket_categories (concert_id, code, name, price)
         VALUES ($1, 'RELEASE', 'Release', 25.00)
         RETURNING id::text AS id`,
        [concertId],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO ticket_inventories (ticket_category_id, total_quantity, available_quantity)
       VALUES ($1, 5, 5)`,
      [categoryId],
    );
    voucherId = (
      await client.query<{ id: string }>(
        `INSERT INTO vouchers
          (code, discount_type, discount_value, usage_limit, used_count, status, starts_at, expires_at)
         VALUES ($1, 'FIXED', 5.00, 1, 0, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 day')
         RETURNING id::text AS id`,
        [voucherCode],
      )
    ).rows[0].id;

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
    database = app.get(PrismaService);
    voucherRepository = app.get(VoucherReservationRepository);

    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': `release-${randomUUID()}`,
      },
      body: JSON.stringify({
        concertId: slug,
        voucherCode,
        items: [{ ticketCategoryId: categoryId, quantity: 1 }],
      }),
    });
    const body = (await response.json()) as { data: { id: string } };
    expect(response.status).toBe(201);
    bookingId = body.data.id;
  });

  afterAll(async () => {
    await client.query('DELETE FROM voucher_redemptions WHERE voucher_id = $1', [voucherId]);
    await client.query('DELETE FROM booking_status_history WHERE booking_id = $1', [bookingId]);
    await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
    await client.query('DELETE FROM ticket_inventories WHERE ticket_category_id = $1', [
      categoryId,
    ]);
    await client.query('DELETE FROM ticket_categories WHERE id = $1', [categoryId]);
    await client.query('DELETE FROM concerts WHERE id = $1', [concertId]);
    await client.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    await app.close();
    await client.end();
  });

  it('releases reserved quota exactly once and preserves the audit row', async () => {
    const firstRelease = await database.$transaction((transaction) =>
      voucherRepository.releaseForBooking(transaction, bookingId, 'TEST_EXPIRY'),
    );
    const secondRelease = await database.$transaction((transaction) =>
      voucherRepository.releaseForBooking(transaction, bookingId, 'TEST_EXPIRY_RETRY'),
    );
    const voucher = await client.query<{ used_count: number }>(
      `SELECT used_count FROM vouchers WHERE id = $1`,
      [voucherId],
    );
    const redemption = await client.query<{ status: string; released_reason: string }>(
      `SELECT status, released_reason FROM voucher_redemptions WHERE booking_id = $1`,
      [bookingId],
    );

    expect(firstRelease).toBe(true);
    expect(secondRelease).toBe(false);
    expect(voucher.rows[0].used_count).toBe(0);
    expect(redemption.rows[0]).toEqual({ status: 'RELEASED', released_reason: 'TEST_EXPIRY' });
  });
});
