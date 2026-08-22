import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';

interface ApiResponse {
  data?: { id: string; subtotal: string; discountAmount: string; finalAmount: string };
  code?: string;
}

describe('booking core API', () => {
  let app: INestApplication;
  let baseUrl: string;
  let client: Client;
  let userId: string;
  let concertId: string;
  let vipCategoryId: string;
  let standardCategoryId: string;
  let idempotencySequence = 0;
  const idempotencyRunId = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const seed = await client.query<{
      user_id: string;
      concert_id: string;
      vip_id: string;
      standard_id: string;
    }>(`SELECT
      (SELECT id FROM users WHERE email = 'customer@example.com') AS user_id,
      (SELECT id FROM concerts WHERE slug = 'summer-festival-2026') AS concert_id,
      (SELECT tc.id FROM ticket_categories tc JOIN concerts c ON c.id = tc.concert_id
        WHERE c.slug = 'summer-festival-2026' AND tc.code = 'VIP') AS vip_id,
      (SELECT tc.id FROM ticket_categories tc JOIN concerts c ON c.id = tc.concert_id
        WHERE c.slug = 'summer-festival-2026' AND tc.code = 'STANDARD') AS standard_id`);
    userId = seed.rows[0].user_id;
    concertId = seed.rows[0].concert_id;
    vipCategoryId = seed.rows[0].vip_id;
    standardCategoryId = seed.rows[0].standard_id;

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await client.query(
      `DELETE FROM idempotency_records WHERE user_id = $1 AND idempotency_key LIKE $2`,
      [userId, `booking-core-${idempotencyRunId}%`],
    );
    await app.close();
    await client.end();
  });

  it('creates a booking with server-side price snapshots and a reservation expiry', async () => {
    const before = await availability(vipCategoryId);
    const result = await postBooking({
      concertId: 'summer-festival-2026',
      items: [{ ticketCategoryId: vipCategoryId, quantity: 2 }],
    });

    expect(result.response.status).toBe(201);
    expect(result.body.data).toMatchObject({
      subtotal: '300.00',
      discountAmount: '0.00',
      finalAmount: '300.00',
    });
    expect(await availability(vipCategoryId)).toBe(before - 2);

    await cleanupBooking(result.body.data?.id, [[vipCategoryId, 2]]);
    expect(await availability(vipCategoryId)).toBe(before);
  });

  it('reserves multi-category items atomically regardless of request order', async () => {
    const vipBefore = await availability(vipCategoryId);
    const standardBefore = await availability(standardCategoryId);
    const result = await postBooking({
      concertId,
      items: [
        { ticketCategoryId: standardCategoryId, quantity: 1 },
        { ticketCategoryId: vipCategoryId, quantity: 1 },
      ],
    });

    expect(result.response.status).toBe(201);
    expect(result.body.data).toMatchObject({ subtotal: '200.00', finalAmount: '200.00' });
    expect(await availability(vipCategoryId)).toBe(vipBefore - 1);
    expect(await availability(standardCategoryId)).toBe(standardBefore - 1);

    await cleanupBooking(result.body.data?.id, [
      [vipCategoryId, 1],
      [standardCategoryId, 1],
    ]);
    expect(await availability(vipCategoryId)).toBe(vipBefore);
    expect(await availability(standardCategoryId)).toBe(standardBefore);
  });

  it('reserves an active voucher and calculates the discount from server-side prices', async () => {
    const before = await availability(vipCategoryId);
    const voucherBefore = await client.query<{ used_count: number }>(
      `SELECT used_count FROM vouchers WHERE code = 'FLASH10'`,
    );
    const result = await postBooking({
      concertId,
      voucherCode: 'flash10',
      items: [{ ticketCategoryId: vipCategoryId, quantity: 2 }],
    });

    expect(result.response.status).toBe(201);
    expect(result.body.data).toMatchObject({
      subtotal: '300.00',
      discountAmount: '30.00',
      finalAmount: '270.00',
    });
    expect(await availability(vipCategoryId)).toBe(before - 2);
    expect(
      (
        await client.query<{ used_count: number }>(
          `SELECT used_count FROM vouchers WHERE code = 'FLASH10'`,
        )
      ).rows[0].used_count,
    ).toBe(voucherBefore.rows[0].used_count + 1);

    await client.query(`DELETE FROM voucher_redemptions WHERE booking_id = $1`, [
      result.body.data?.id,
    ]);
    await cleanupBooking(result.body.data?.id, [[vipCategoryId, 2]]);
    await client.query(`UPDATE vouchers SET used_count = $1 WHERE code = 'FLASH10'`, [
      voucherBefore.rows[0].used_count,
    ]);
    expect(await availability(vipCategoryId)).toBe(before);
  });

  it('returns controlled errors and rolls back inventory on invalid or sold-out requests', async () => {
    const invalid = await postBooking({
      concertId,
      items: [{ ticketCategoryId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
    });
    expect(invalid.response.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_ITEM');

    const before = await availability(vipCategoryId);
    await client.query(
      'UPDATE ticket_inventories SET available_quantity = 0 WHERE ticket_category_id = $1',
      [vipCategoryId],
    );
    const soldOut = await postBooking({
      concertId,
      items: [{ ticketCategoryId: vipCategoryId, quantity: 1 }],
    });
    expect(soldOut.response.status).toBe(409);
    expect(soldOut.body.code).toBe('INSUFFICIENT_TICKET_INVENTORY');
    expect(await countBookingsForLastMinute()).toBe(0);
    await client.query(
      'UPDATE ticket_inventories SET available_quantity = $1 WHERE ticket_category_id = $2',
      [before, vipCategoryId],
    );
  });

  it('rejects voucher failure without leaking a ticket reservation', async () => {
    const before = await availability(vipCategoryId);
    const voucherBefore = await client.query<{ used_count: number }>(
      `SELECT used_count FROM vouchers WHERE code = 'EXHAUSTED'`,
    );
    const result = await postBooking({
      concertId,
      voucherCode: 'EXHAUSTED',
      items: [{ ticketCategoryId: vipCategoryId, quantity: 1 }],
    });

    expect(result.response.status).toBe(409);
    expect(result.body.code).toBe('VOUCHER_NOT_APPLICABLE');
    expect(await availability(vipCategoryId)).toBe(before);
    const voucherAfter = await client.query<{ used_count: number }>(
      `SELECT used_count FROM vouchers WHERE code = 'EXHAUSTED'`,
    );
    expect(voucherAfter.rows[0].used_count).toBe(voucherBefore.rows[0].used_count);
  });

  async function postBooking(payload: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': `booking-core-${idempotencyRunId}-${++idempotencySequence}`,
      },
      body: JSON.stringify(payload),
    });
    return { response, body: (await response.json()) as ApiResponse };
  }

  async function availability(categoryId: string): Promise<number> {
    const result = await client.query<{ available_quantity: number }>(
      `SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1`,
      [categoryId],
    );
    return result.rows[0].available_quantity;
  }

  async function cleanupBooking(
    bookingId: string | undefined,
    reservations: readonly (readonly [string, number])[],
  ): Promise<void> {
    if (bookingId) {
      await client.query('DELETE FROM booking_status_history WHERE booking_id = $1', [bookingId]);
      await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
    }
    for (const [categoryId, quantity] of reservations) {
      await client.query(
        'UPDATE ticket_inventories SET available_quantity = available_quantity + $1 WHERE ticket_category_id = $2',
        [quantity, categoryId],
      );
    }
  }

  async function countBookingsForLastMinute(): Promise<number> {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM bookings WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
      [userId],
    );
    return Number(result.rows[0].count);
  }
});
