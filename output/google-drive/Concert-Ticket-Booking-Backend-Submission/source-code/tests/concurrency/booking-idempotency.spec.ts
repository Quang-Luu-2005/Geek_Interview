import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';

jest.setTimeout(30_000);

interface BookingResponseBody {
  data?: { id: string };
  code?: string;
}

describe('CONC-002 idempotent duplicate booking requests', () => {
  let app: INestApplication;
  let client: Client;
  let baseUrl: string;
  let userId: string;
  let concertId: string;
  let firstCategoryId: string;
  let secondCategoryId: string;
  let voucherId: string;
  let voucherCode: string;
  const slug = `idempotency-${randomUUID()}`;
  const keyPrefix = `task06-${slug}`;

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
         VALUES ($1, 'Idempotency Concert', 'PUBLISHED', NOW() + INTERVAL '1 day')
         RETURNING id::text AS id`,
        [slug],
      )
    ).rows[0].id;
    firstCategoryId = await createCategory('FIRST', 20);
    secondCategoryId = await createCategory('SECOND', 20);
    voucherCode = `TASK06-${randomUUID().slice(0, 8).toUpperCase()}`;
    voucherId = (
      await client.query<{ id: string }>(
        `INSERT INTO vouchers
          (code, discount_type, discount_value, usage_limit, used_count, status, starts_at, expires_at)
         VALUES ($1, 'PERCENT', 10.00, 1, 0, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day')
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
  });

  afterAll(async () => {
    await client.query('DELETE FROM voucher_redemptions WHERE voucher_id = $1', [voucherId]);
    await client.query(
      `DELETE FROM booking_status_history
       WHERE booking_id IN (SELECT id FROM bookings WHERE concert_id = $1)`,
      [concertId],
    );
    await client.query('DELETE FROM bookings WHERE concert_id = $1', [concertId]);
    await client.query(
      `DELETE FROM idempotency_records WHERE user_id = $1 AND idempotency_key LIKE $2`,
      [userId, `${keyPrefix}%`],
    );
    await client.query('DELETE FROM ticket_inventories WHERE ticket_category_id IN ($1, $2)', [
      firstCategoryId,
      secondCategoryId,
    ]);
    await client.query('DELETE FROM ticket_categories WHERE id IN ($1, $2)', [
      firstCategoryId,
      secondCategoryId,
    ]);
    await client.query('DELETE FROM concerts WHERE id = $1', [concertId]);
    await client.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    await app.close();
    await client.end();
  });

  it('replays the same booking for reordered equivalent payloads and rejects key reuse', async () => {
    const key = `${keyPrefix}-sequential`;
    const first = await post(key, [
      { ticketCategoryId: secondCategoryId, quantity: 1 },
      { ticketCategoryId: firstCategoryId, quantity: 1 },
    ]);
    const replay = await post(key, [
      { ticketCategoryId: firstCategoryId, quantity: 1 },
      { ticketCategoryId: secondCategoryId, quantity: 1 },
    ]);
    const changed = await post(key, [{ ticketCategoryId: firstCategoryId, quantity: 2 }]);

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect(replay.body.data?.id).toBe(first.body.data?.id);
    expect(changed.response.status).toBe(409);
    expect(changed.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(
      (
        await client.query<{ available_quantity: number }>(
          `SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1`,
          [firstCategoryId],
        )
      ).rows[0].available_quantity,
    ).toBe(19);
    expect(
      (
        await client.query<{ available_quantity: number }>(
          `SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1`,
          [secondCategoryId],
        )
      ).rows[0].available_quantity,
    ).toBe(19);
  });

  it('serializes concurrent requests on one key into one booking and one decrement', async () => {
    const key = `${keyPrefix}-concurrent`;
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        post(key, [{ ticketCategoryId: firstCategoryId, quantity: 1 }]),
      ),
    );
    const ids = new Set(responses.map((result) => result.body.data?.id));

    expect(responses.every((result) => result.response.status === 201)).toBe(true);
    expect(ids.size).toBe(1);
    expect(
      (
        await client.query<{ available_quantity: number }>(
          `SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1`,
          [firstCategoryId],
        )
      ).rows[0].available_quantity,
    ).toBe(18);
    expect(
      (
        await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM idempotency_records
           WHERE user_id = $1 AND idempotency_key = $2`,
          [userId, key],
        )
      ).rows[0].count,
    ).toBe('1');
  });

  it('replays a voucher booking without consuming quota twice', async () => {
    const key = `${keyPrefix}-voucher`;
    const first = await post(
      key,
      [{ ticketCategoryId: secondCategoryId, quantity: 1 }],
      voucherCode,
    );
    const replay = await post(
      key,
      [{ ticketCategoryId: secondCategoryId, quantity: 1 }],
      voucherCode.toLowerCase(),
    );
    const voucher = await client.query<{ used_count: number }>(
      `SELECT used_count FROM vouchers WHERE id = $1`,
      [voucherId],
    );

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect(replay.body.data?.id).toBe(first.body.data?.id);
    expect(voucher.rows[0].used_count).toBe(1);
  });

  async function createCategory(code: string, quantity: number): Promise<string> {
    const category = await client.query<{ id: string }>(
      `INSERT INTO ticket_categories (concert_id, code, name, price)
       VALUES ($1, $2, $2, 25.00)
       RETURNING id::text AS id`,
      [concertId, code],
    );
    await client.query(
      `INSERT INTO ticket_inventories (ticket_category_id, total_quantity, available_quantity)
       VALUES ($1, $2, $2)`,
      [category.rows[0].id, quantity],
    );
    return category.rows[0].id;
  }

  async function post(
    key: string,
    items: readonly { ticketCategoryId: string; quantity: number }[],
    requestVoucherCode?: string,
  ): Promise<{ response: Response; body: BookingResponseBody }> {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': key,
      },
      body: JSON.stringify({ concertId: slug, items, voucherCode: requestVoucherCode }),
    });
    return { response, body: (await response.json()) as BookingResponseBody };
  }
});
