import { Client } from 'pg';

const bookingOne = '40000000-0000-0000-0000-000000000001';
const bookingTwo = '40000000-0000-0000-0000-000000000002';
const itemOne = '50000000-0000-0000-0000-000000000001';
const idemOne = '60000000-0000-0000-0000-000000000001';
const redemptionOne = '70000000-0000-0000-0000-000000000001';

describe('persistence invariants', () => {
  let client: Client;
  let userId: string;
  let concertId: string;
  let categoryId: string;
  let voucherId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const seed = await client.query<{
      user_id: string;
      concert_id: string;
      category_id: string;
      voucher_id: string;
    }>(`SELECT
      (SELECT id FROM users WHERE email = 'customer@example.com') AS user_id,
      (SELECT id FROM concerts WHERE slug = 'summer-festival-2026') AS concert_id,
      (SELECT tc.id FROM ticket_categories tc JOIN concerts c ON c.id = tc.concert_id
       WHERE c.slug = 'summer-festival-2026' AND tc.code = 'VIP') AS category_id,
      (SELECT id FROM vouchers WHERE code = 'FLASH10') AS voucher_id`);
    userId = seed.rows[0].user_id;
    concertId = seed.rows[0].concert_id;
    categoryId = seed.rows[0].category_id;
    voucherId = seed.rows[0].voucher_id;

    await client.query(
      `INSERT INTO bookings
        (id, booking_code, user_id, concert_id, status, subtotal, discount_amount, final_amount, expires_at)
       VALUES
        ($1, 'PERSISTENCE-001', $2, $3, 'RESERVED', 150, 0, 150, NOW() + INTERVAL '10 minutes'),
        ($4, 'PERSISTENCE-002', $2, $3, 'RESERVED', 150, 0, 150, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [bookingOne, userId, concertId, bookingTwo],
    );
    await client.query(
      `INSERT INTO idempotency_records
        (id, user_id, idempotency_key, request_hash, status)
       VALUES ($1, $2, 'persistence-key', 'hash-a', 'COMPLETED')
       ON CONFLICT (id) DO NOTHING`,
      [idemOne, userId],
    );
    await client.query(
      `INSERT INTO voucher_redemptions (id, voucher_id, user_id, booking_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [redemptionOne, voucherId, userId, bookingOne],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM idempotency_records WHERE id = $1', [idemOne]);
    await client.query('DELETE FROM voucher_redemptions WHERE id = $1', [redemptionOne]);
    await client.query('DELETE FROM booking_items WHERE id = $1', [itemOne]);
    await client.query('DELETE FROM bookings WHERE id IN ($1, $2)', [bookingOne, bookingTwo]);
    await client.end();
  });

  it('rejects inventory above total quantity', async () => {
    await expect(
      client.query(
        'UPDATE ticket_inventories SET available_quantity = total_quantity + 1 WHERE ticket_category_id = $1',
        [categoryId],
      ),
    ).rejects.toThrow();
  });

  it('rejects non-positive booking item quantity', async () => {
    await expect(
      client.query(
        `INSERT INTO booking_items
          (id, booking_id, ticket_category_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, 0, 150, 0)`,
        [itemOne, bookingOne, categoryId],
      ),
    ).rejects.toThrow();
  });

  it('rejects same user and idempotency key twice', async () => {
    await expect(
      client.query(
        `INSERT INTO idempotency_records
          (user_id, idempotency_key, request_hash, status)
         VALUES ($1, 'persistence-key', 'hash-b', 'PROCESSING')`,
        [userId],
      ),
    ).rejects.toThrow();
  });

  it('rejects one-use voucher redemption by the same user', async () => {
    await expect(
      client.query(
        `INSERT INTO voucher_redemptions (voucher_id, user_id, booking_id)
         VALUES ($1, $2, $3)`,
        [voucherId, userId, bookingTwo],
      ),
    ).rejects.toThrow();
  });

  it('rejects inconsistent monetary snapshots', async () => {
    await expect(
      client.query('UPDATE bookings SET final_amount = 99 WHERE id = $1', [bookingOne]),
    ).rejects.toThrow();
  });

  it('keeps booking item price immutable when catalog price changes', async () => {
    await client.query(
      `INSERT INTO booking_items
        (id, booking_id, ticket_category_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, 1, 150, 150)
       ON CONFLICT (id) DO NOTHING`,
      [itemOne, bookingOne, categoryId],
    );
    const before = await client.query(
      'SELECT unit_price, line_total FROM booking_items WHERE id = $1',
      [itemOne],
    );
    await client.query('UPDATE ticket_categories SET price = 175 WHERE id = $1', [categoryId]);
    const after = await client.query(
      'SELECT unit_price, line_total FROM booking_items WHERE id = $1',
      [itemOne],
    );
    await client.query('UPDATE ticket_categories SET price = 150 WHERE id = $1', [categoryId]);

    expect(after.rows).toEqual(before.rows);
  });

  it('rolls back inventory when the voucher step fails in the same transaction', async () => {
    const before = await client.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1',
      [categoryId],
    );

    await client.query('BEGIN');
    try {
      await client.query(
        `UPDATE ticket_inventories
         SET available_quantity = available_quantity - 1
         WHERE ticket_category_id = $1 AND available_quantity >= 1`,
        [categoryId],
      );
      const voucher = await client.query(
        `UPDATE vouchers
         SET used_count = used_count + 1
         WHERE code = 'EXHAUSTED' AND used_count < usage_limit
         RETURNING id`,
      );
      expect(voucher.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }

    const after = await client.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM ticket_inventories WHERE ticket_category_id = $1',
      [categoryId],
    );
    expect(after.rows[0].available_quantity).toBe(before.rows[0].available_quantity);
  });
});
