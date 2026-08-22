import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';

jest.setTimeout(30_000);

interface BookingErrorBody {
  code?: string;
}

describe('CONC-001 atomic inventory reservation', () => {
  let app: INestApplication;
  let client: Client;
  let baseUrl: string;
  let userId: string;
  let concertId: string;
  let categoryId: string;
  const slug = `concurrency-${randomUUID()}`;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const seed = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'customer@example.com'`,
    );
    userId = seed.rows[0].id;

    const concert = await client.query<{ id: string }>(
      `INSERT INTO concerts (slug, name, status, starts_at)
       VALUES ($1, 'Concurrency Concert', 'PUBLISHED', NOW() + INTERVAL '1 day')
       RETURNING id::text AS id`,
      [slug],
    );
    concertId = concert.rows[0].id;
    const category = await client.query<{ id: string }>(
      `INSERT INTO ticket_categories (concert_id, code, name, price)
       VALUES ($1, 'RACE', 'Race', 25.00)
       RETURNING id::text AS id`,
      [concertId],
    );
    categoryId = category.rows[0].id;
    await client.query(
      `INSERT INTO ticket_inventories (ticket_category_id, total_quantity, available_quantity)
       VALUES ($1, 10, 10)`,
      [categoryId],
    );

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
      `DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM bookings WHERE concert_id = $1)`,
      [concertId],
    );
    await client.query('DELETE FROM bookings WHERE concert_id = $1', [concertId]);
    await client.query('DELETE FROM ticket_inventories WHERE ticket_category_id = $1', [
      categoryId,
    ]);
    await client.query('DELETE FROM ticket_categories WHERE id = $1', [categoryId]);
    await client.query('DELETE FROM concerts WHERE id = $1', [concertId]);
    await app.close();
    await client.end();
  });

  it('allows exactly the available stock and never creates negative inventory', async () => {
    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        fetch(`${baseUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-user-id': userId,
            // Oversell tests model distinct customer intents; idempotency is
            // covered separately with one shared key.
            'idempotency-key': `oversell-${randomUUID()}`,
          },
          body: JSON.stringify({
            concertId: slug,
            items: [{ ticketCategoryId: categoryId, quantity: 1 }],
          }),
        }).then(async (response) => ({
          status: response.status,
          body: (await response.json()) as BookingErrorBody,
        })),
      ),
    );

    const successes = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status === 409);
    expect(successes).toHaveLength(10);
    expect(rejected).toHaveLength(90);
    expect(
      rejected.every((response) => response.body.code === 'INSUFFICIENT_TICKET_INVENTORY'),
    ).toBe(true);

    const state = await client.query<{ available_quantity: number; booking_count: string }>(
      `SELECT ti.available_quantity,
          (SELECT COUNT(*)::text FROM bookings b WHERE b.concert_id = $1) AS booking_count
       FROM ticket_inventories ti WHERE ti.ticket_category_id = $2`,
      [concertId, categoryId],
    );
    expect(state.rows[0].available_quantity).toBe(0);
    expect(Number(state.rows[0].booking_count)).toBe(10);
  });
});
