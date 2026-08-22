import { Client } from 'pg';

describe('foundation database', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('contains deterministic foundation seed data', async () => {
    const result = await client.query<{
      users: string;
      concerts: string;
      categories: string;
      vouchers: string;
    }>(`SELECT
      (SELECT COUNT(*)::text FROM users) AS users,
      (SELECT COUNT(*)::text FROM concerts) AS concerts,
      (SELECT COUNT(*)::text FROM ticket_categories) AS categories,
      (SELECT COUNT(*)::text FROM vouchers) AS vouchers`);

    expect(Number(result.rows[0].users)).toBeGreaterThanOrEqual(2);
    expect(Number(result.rows[0].concerts)).toBeGreaterThanOrEqual(1);
    expect(Number(result.rows[0].categories)).toBeGreaterThanOrEqual(2);
    expect(Number(result.rows[0].vouchers)).toBeGreaterThanOrEqual(3);
  });
});
