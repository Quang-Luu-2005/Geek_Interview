import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';
import { ReservationExpiryWorker } from '../../src/workers/reservation-expiry/reservation-expiry.worker';

describe('expiry worker concurrency', () => {
  let app: INestApplication;
  let baseUrl: string;
  let client: Client;
  let userId: string;
  let concertId: string;
  let categoryId: string;
  const runId = randomUUID();
  const bookingIds: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const seed = await client.query<{
      user_id: string;
      concert_id: string;
      category_id: string;
    }>(`SELECT
      (SELECT id FROM users WHERE email = 'customer@example.com') AS user_id,
      (SELECT id FROM concerts WHERE slug = 'summer-festival-2026') AS concert_id,
      (SELECT tc.id FROM ticket_categories tc JOIN concerts c ON c.id = tc.concert_id
        WHERE c.slug = 'summer-festival-2026' AND tc.code = 'VIP') AS category_id`);
    userId = seed.rows[0].user_id;
    concertId = seed.rows[0].concert_id;
    categoryId = seed.rows[0].category_id;

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await client.query('DELETE FROM booking_status_history WHERE booking_id = ANY($1::uuid[])', [
      bookingIds,
    ]);
    await client.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
    await app.close();
    await client.end();
  });

  it('claims disjoint expired rows with SKIP LOCKED and is retry-safe', async () => {
    const beforeInventory = await inventory();
    for (let index = 0; index < 4; index += 1) {
      const response = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': userId,
          'idempotency-key': `expiry-conc-${runId}-${index}`,
        },
        body: JSON.stringify({
          concertId,
          items: [{ ticketCategoryId: categoryId, quantity: 1 }],
        }),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as { data: { id: string } };
      bookingIds.push(body.data.id);
    }

    await client.query(
      "UPDATE bookings SET expires_at = NOW() - INTERVAL '1 second' WHERE id = ANY($1::uuid[])",
      [bookingIds],
    );
    const worker = app.get(ReservationExpiryWorker);
    const processed = await Promise.all([worker.runOnce(2), worker.runOnce(2)]);
    expect(processed.reduce((sum, count) => sum + count, 0)).toBe(4);

    const statuses = await client.query<{ status: string }>(
      'SELECT status FROM bookings WHERE id = ANY($1::uuid[]) ORDER BY id',
      [bookingIds],
    );
    expect(statuses.rows.map((row) => row.status)).toEqual([
      'EXPIRED',
      'EXPIRED',
      'EXPIRED',
      'EXPIRED',
    ]);
    expect(await inventory()).toBe(beforeInventory);
    expect(await worker.runOnce(2)).toBe(0);
  });

  it('allows only one terminal outcome when confirm races expiry', async () => {
    const beforeInventory = await inventory();
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': `expire-confirm-${runId}`,
      },
      body: JSON.stringify({
        concertId,
        items: [{ ticketCategoryId: categoryId, quantity: 1 }],
      }),
    });
    expect(response.status).toBe(201);
    const bookingId = ((await response.json()) as { data: { id: string } }).data.id;
    bookingIds.push(bookingId);
    await client.query(
      "UPDATE bookings SET expires_at = NOW() - INTERVAL '1 millisecond' WHERE id = $1",
      [bookingId],
    );

    const worker = app.get(ReservationExpiryWorker);
    const [confirmResponse, processed] = await Promise.all([
      fetch(`${baseUrl}/api/bookings/${bookingId}/confirm`, {
        method: 'POST',
        headers: { 'x-user-id': userId },
      }),
      worker.runOnce(1),
    ]);
    expect(processed).toBe(1);
    expect(confirmResponse.status).toBe(409);
    expect(((await confirmResponse.json()) as { code: string }).code).toBe(
      'BOOKING_NOT_CONFIRMABLE',
    );
    expect(
      (
        await client.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [
          bookingId,
        ])
      ).rows[0].status,
    ).toBe('EXPIRED');
    expect(await inventory()).toBe(beforeInventory);
  });

  async function inventory(): Promise<number> {
    const result = await client.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1',
      [categoryId],
    );
    return result.rows[0].available_quantity;
  }
});
