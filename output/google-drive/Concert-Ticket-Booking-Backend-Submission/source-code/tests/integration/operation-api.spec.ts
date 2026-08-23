import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { AppModule } from '../../src/app/app.module';

interface OperationApiData {
  id?: string;
  status?: string;
  userId?: string;
  statusHistory?: Array<Record<string, unknown>>;
  discountType?: string;
  applicableConcertId?: string;
  applicableTicketCategoryId?: string;
}

interface OperationApiBody {
  data?: OperationApiData;
  code?: string;
}

describe('operation APIs', () => {
  let app: INestApplication;
  let baseUrl: string;
  let client: Client;
  let operatorId: string;
  let customerId: string;
  let concertId: string;
  let categoryId: string;
  let bookingId: string;
  let voucherId: string;
  const runId = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const users = await client.query<{ operator_id: string; customer_id: string }>(`SELECT
      (SELECT id FROM users WHERE email = 'operator@example.com') AS operator_id,
      (SELECT id FROM users WHERE email = 'customer@example.com') AS customer_id`);
    operatorId = users.rows[0].operator_id;
    customerId = users.rows[0].customer_id;

    const seed = await client.query<{ concert_id: string; category_id: string }>(`SELECT
      (SELECT id FROM concerts WHERE slug = 'summer-festival-2026') AS concert_id,
      (SELECT tc.id FROM ticket_categories tc JOIN concerts c ON c.id = tc.concert_id
        WHERE c.slug = 'summer-festival-2026' AND tc.code = 'STANDARD') AS category_id`);
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
    if (bookingId) {
      await client.query('DELETE FROM booking_status_history WHERE booking_id = $1', [bookingId]);
      await client.query("DELETE FROM idempotency_records WHERE response_body->>'id' = $1", [
        bookingId,
      ]);
      await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
    }
    if (voucherId) await client.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    if (categoryId && concertId !== (await seededConcertId())) {
      await client.query('DELETE FROM ticket_inventories WHERE ticket_category_id = $1', [
        categoryId,
      ]);
      await client.query('DELETE FROM ticket_categories WHERE id = $1', [categoryId]);
      await client.query('DELETE FROM concerts WHERE id = $1', [concertId]);
    }
    await app.close();
    await client.end();
  });

  it('lists and details bookings for an operator with filters and audit metadata', async () => {
    const response = await createCustomerBooking();
    expect(response.status).toBe(201);
    bookingId = response.body.data!.id!;

    const list = await request('/api/admin/bookings?status=RESERVED&userId=' + customerId, {
      headers: { 'x-user-id': operatorId },
    });
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bookingId, status: 'RESERVED' })]),
    );

    const detail = await request(`/api/admin/bookings/${bookingId}`, {
      headers: { 'x-user-id': operatorId },
    });
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: bookingId,
      userId: customerId,
      status: 'RESERVED',
      idempotency: { status: 'COMPLETED', responseStatus: 201 },
    });
    expect(detail.body.data!.statusHistory!.at(-1)).toMatchObject({
      toStatus: 'RESERVED',
      changeSource: 'CUSTOMER_API',
    });
  });

  it('requires an elevated role and atomically guards manual cancellation', async () => {
    const before = await inventory(categoryId);
    const status = await request(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'x-user-id': customerId, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED', reason: 'Fraud review cancellation' }),
    });
    expect(status.status).toBe(403);

    const updated = await request(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'x-user-id': operatorId, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED', reason: 'Fraud review cancellation' }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data!.status).toBe('CANCELLED');
    expect(updated.body.data!.statusHistory!.at(-1)).toMatchObject({
      fromStatus: 'RESERVED',
      toStatus: 'CANCELLED',
      changedBy: operatorId,
      changeSource: 'OPERATION_API',
      reason: 'Fraud review cancellation',
    });
    expect(await inventory(categoryId)).toBe(before + 1);

    const invalid = await request(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'x-user-id': operatorId, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED', reason: 'Should be rejected' }),
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.code).toBe('BOOKING_NOT_TRANSITIONABLE');
  });

  it('creates draft concert resources, validates publish, and creates a scoped voucher', async () => {
    const slug = `ops-${runId.slice(0, 8)}`;
    const created = await request('/api/admin/concerts', {
      method: 'POST',
      headers: { 'x-user-id': operatorId, 'content-type': 'application/json' },
      body: JSON.stringify({
        slug,
        name: 'Operations Demo Concert',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    expect(created.status).toBe(201);
    concertId = created.body.data!.id!;

    const premature = await request(`/api/admin/concerts/${concertId}/publish`, {
      method: 'POST',
      headers: { 'x-user-id': operatorId },
    });
    expect(premature.status).toBe(409);
    expect(premature.body.code).toBe('CONCERT_NOT_PUBLISHABLE');

    const category = await request(`/api/admin/concerts/${concertId}/ticket-categories`, {
      method: 'POST',
      headers: { 'x-user-id': operatorId, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EARLY', name: 'Early Access', price: 25, totalQuantity: 20 }),
    });
    expect(category.status).toBe(201);
    categoryId = category.body.data!.id!;

    const published = await request(`/api/admin/concerts/${concertId}/publish`, {
      method: 'POST',
      headers: { 'x-user-id': operatorId },
    });
    expect(published.status).toBe(201);
    expect(published.body.data!.status).toBe('PUBLISHED');

    const voucher = await request('/api/admin/vouchers', {
      method: 'POST',
      headers: { 'x-user-id': operatorId, 'content-type': 'application/json' },
      body: JSON.stringify({
        code: `OPS-${runId.slice(0, 8)}`,
        discountType: 'PERCENT',
        discountValue: 15,
        usageLimit: 10,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        applicableConcertId: concertId,
        applicableTicketCategoryId: categoryId,
      }),
    });
    expect(voucher.status).toBe(201);
    expect(voucher.body.data).toMatchObject({
      discountType: 'PERCENT',
      applicableConcertId: concertId,
      applicableTicketCategoryId: categoryId,
    });
    voucherId = voucher.body.data!.id!;

    const duplicate = await request('/api/admin/vouchers', {
      method: 'POST',
      headers: { 'x-user-id': operatorId, 'content-type': 'application/json' },
      body: JSON.stringify({
        code: `OPS-${runId.slice(0, 8)}`,
        discountType: 'PERCENT',
        discountValue: 15,
        usageLimit: 10,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        applicableConcertId: concertId,
        applicableTicketCategoryId: categoryId,
      }),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('VOUCHER_CODE_CONFLICT');
  });

  async function createCustomerBooking() {
    return request('/api/bookings', {
      method: 'POST',
      headers: {
        'x-user-id': customerId,
        'idempotency-key': `operation-${runId}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        concertId: 'summer-festival-2026',
        items: [{ ticketCategoryId: categoryId, quantity: 1 }],
      }),
    });
  }

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, init);
    return { status: response.status, body: (await response.json()) as OperationApiBody };
  }

  async function inventory(category: string): Promise<number> {
    const result = await client.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1',
      [category],
    );
    return result.rows[0].available_quantity;
  }

  async function seededConcertId(): Promise<string> {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM concerts WHERE slug = 'summer-festival-2026'",
    );
    return result.rows[0].id;
  }
});
