import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';
import { ReservationExpiryWorker } from '../../src/workers/reservation-expiry/reservation-expiry.worker';

describe('booking lifecycle and expiry', () => {
  interface ApiResponse {
    data?: { id: string; status: string };
    code?: string;
  }

  let app: INestApplication;
  let baseUrl: string;
  let client: Client;
  let userId: string;
  let concertId: string;
  let categoryId: string;
  const runId = randomUUID();
  const bookingIds: string[] = [];
  const voucherCodes: string[] = [];

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
    await client.query('DELETE FROM voucher_redemptions WHERE booking_id = ANY($1::uuid[])', [
      bookingIds,
    ]);
    await client.query('DELETE FROM booking_status_history WHERE booking_id = ANY($1::uuid[])', [
      bookingIds,
    ]);
    await client.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [bookingIds]);
    await client.query('DELETE FROM vouchers WHERE code = ANY($1::text[])', [voucherCodes]);
    await app.close();
    await client.end();
  });

  it('expires a reservation, restores inventory and releases voucher quota exactly once', async () => {
    const voucherCode = `LIFE-${runId.slice(0, 8)}`.toUpperCase();
    voucherCodes.push(voucherCode);
    await client.query(
      `INSERT INTO vouchers
        (code, discount_type, discount_value, usage_limit, used_count, status, starts_at, expires_at)
       VALUES ($1, 'PERCENT', 10, 1, 0, 'ACTIVE', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour')`,
      [voucherCode],
    );

    const beforeInventory = await inventory();
    const created = await post('/api/bookings', {
      concertId,
      voucherCode,
      items: [{ ticketCategoryId: categoryId, quantity: 2 }],
    });
    expect(created.status).toBe(201);
    const bookingId = created.body.data!.id;
    bookingIds.push(bookingId);

    await client.query(
      "UPDATE bookings SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [bookingId],
    );
    const processed = await app.get(ReservationExpiryWorker).runOnce(100);
    expect(processed).toBeGreaterThanOrEqual(1);

    const state = await client.query<{ status: string }>(
      'SELECT status FROM bookings WHERE id = $1',
      [bookingId],
    );
    const redemption = await client.query<{ status: string; released_reason: string }>(
      'SELECT status, released_reason FROM voucher_redemptions WHERE booking_id = $1',
      [bookingId],
    );
    const voucher = await client.query<{ used_count: number }>(
      'SELECT used_count FROM vouchers WHERE code = $1',
      [voucherCode],
    );
    expect(state.rows[0].status).toBe('EXPIRED');
    expect(redemption.rows[0]).toEqual({
      status: 'RELEASED',
      released_reason: 'RESERVATION_EXPIRED',
    });
    expect(voucher.rows[0].used_count).toBe(0);
    expect(await inventory()).toBe(beforeInventory);
    expect(await app.get(ReservationExpiryWorker).runOnce(100)).toBe(0);
    expect(await inventory()).toBe(beforeInventory);
  });

  it('confirms a live reservation and rejects a second terminal transition', async () => {
    const beforeInventory = await inventory();
    const created = await post('/api/bookings', {
      concertId,
      items: [{ ticketCategoryId: categoryId, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    const bookingId = created.body.data!.id;
    bookingIds.push(bookingId);

    const confirmed = await fetch(`${baseUrl}/api/bookings/${bookingId}/confirm`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    });
    expect(confirmed.status).toBe(201);
    const confirmedBody = (await confirmed.json()) as ApiResponse;
    expect(confirmedBody.data!.status).toBe('CONFIRMED');
    expect(await inventory()).toBe(beforeInventory - 1);

    const replay = await fetch(`${baseUrl}/api/bookings/${bookingId}/confirm`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    });
    expect(replay.status).toBe(409);
    const replayBody = (await replay.json()) as ApiResponse;
    expect(replayBody.code).toBe('BOOKING_NOT_CONFIRMABLE');

    await client.query(
      'UPDATE ticket_inventories SET available_quantity = available_quantity + 1 WHERE ticket_category_id = $1',
      [categoryId],
    );
  });

  it('cancels a live reservation and releases its inventory once', async () => {
    const beforeInventory = await inventory();
    const created = await post('/api/bookings', {
      concertId,
      items: [{ ticketCategoryId: categoryId, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    const bookingId = created.body.data!.id;
    bookingIds.push(bookingId);

    const cancelled = await fetch(`${baseUrl}/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    });
    expect(cancelled.status).toBe(201);
    expect(((await cancelled.json()) as ApiResponse).data!.status).toBe('CANCELLED');
    expect(await inventory()).toBe(beforeInventory);

    const retry = await fetch(`${baseUrl}/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    });
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as ApiResponse).code).toBe('BOOKING_NOT_CANCELLABLE');
    expect(await inventory()).toBe(beforeInventory);
  });

  async function post(path: string, payload: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': `lifecycle-${runId}-${randomUUID()}`,
      },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: (await response.json()) as ApiResponse };
  }

  async function inventory(): Promise<number> {
    const result = await client.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1',
      [categoryId],
    );
    return result.rows[0].available_quantity;
  }
});
