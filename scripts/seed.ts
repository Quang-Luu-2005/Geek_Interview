import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Client } from 'pg';

export async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const sql = await readFile(join(process.cwd(), 'database', 'seeds', 'seed.sql'), 'utf8');
    await client.query(sql);
    console.log('Seed completed');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
