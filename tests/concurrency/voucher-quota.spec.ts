import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';

jest.setTimeout(30_000);

interface ResponseBody {
  data?: { id: string };
  code?: string;
}

describe('CONC-003 atomic voucher quota', () => {
  let app: INestApplication;
  let client: Client;
  let baseUrl: string;
  let concertId: string;
  let categoryId: string;
  let voucherId: string;
  let voucherCode: string;
  let userIds: string[];
  const slug = `voucher-race-${randomUUID()}`;
  const keyPrefix = `task07-${slug}`;
  const userPrefix = `task07-${randomUUID()}`;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    concertId = (
      await client.query<{ id: string }>(
        `INSERT INTO concerts (slug, name, status, starts_at)
         VALUES ($1, 'Voucher Race Concert', 'PUBLISHED', NOW() + INTERVAL '1 day')
         RETURNING id::text AS id`,
        [slug],
      )
    ).rows[0].id;
    categoryId = (
      await client.query<{ id: string }>(
        `INSERT INTO ticket_categories (concert_id, code, name, price)
         VALUES ($1, 'RACE', 'Race', 25.00)
         RETURNING id::text AS id`,
        [concertId],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO ticket_inventories (ticket_category_id, total_quantity, available_quantity)
       VALUES ($1, 20, 20)`,
      [categoryId],
    );
    voucherCode = `RACE-${randomUUID().slice(0, 8).toUpperCase()}`;
    voucherId = (
      await client.query<{ id: string }>(
        `INSERT INTO vouchers
          (code, discount_type, discount_value, usage_limit, used_count, status, starts_at, expires_at)
         VALUES ($1, 'FIXED', 5.00, 1, 0, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 day')
         RETURNING id::text AS id`,
        [voucherCode],
      )
    ).rows[0].id;
    userIds = [];
    for (let index = 0; index < 20; index += 1) {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, role) VALUES ($1, 'CUSTOMER') RETURNING id::text AS id`,
        [`${userPrefix}-${index}@example.com`],
      );
      userIds.push(user.rows[0].id);
    }

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
    await client.query(`DELETE FROM idempotency_records WHERE idempotency_key LIKE $1`, [
      `${keyPrefix}%`,
    ]);
    await client.query('DELETE FROM ticket_inventories WHERE ticket_category_id = $1', [
      categoryId,
    ]);
    await client.query('DELETE FROM ticket_categories WHERE id = $1', [categoryId]);
    await client.query('DELETE FROM concerts WHERE id = $1', [concertId]);
    await client.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [`${userPrefix}%`]);
    await app.close();
    await client.end();
  });

  it('allows exactly one redemption when twenty users race the final quota', async () => {
    const responses = await Promise.all(
      userIds.map((userId, index) =>
        post(userId, `${keyPrefix}-${index}`).then(async (response) => ({
          status: response.status,
          body: (await response.json()) as ResponseBody,
        })),
      ),
    );

    const successes = responses.filter((response) => response.status === 201);
    const exhausted = responses.filter(
      (response) => response.status === 409 && response.body.code === 'VOUCHER_EXHAUSTED',
    );
    const voucher = await client.query<{ used_count: number }>(
      `SELECT used_count FROM vouchers WHERE id = $1`,
      [voucherId],
    );
    const redemptions = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM voucher_redemptions WHERE voucher_id = $1`,
      [voucherId],
    );
    const inventory = await client.query<{ available_quantity: number }>(
      `SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1`,
      [categoryId],
    );

    expect(successes).toHaveLength(1);
    expect(exhausted).toHaveLength(19);
    expect(voucher.rows[0].used_count).toBe(1);
    expect(redemptions.rows[0].count).toBe('1');
    expect(inventory.rows[0].available_quantity).toBe(19);
  });

  async function post(userId: string, key: string): Promise<Response> {
    return fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': key,
      },
      body: JSON.stringify({
        concertId: slug,
        voucherCode,
        items: [{ ticketCategoryId: categoryId, quantity: 1 }],
      }),
    });
  }
});
