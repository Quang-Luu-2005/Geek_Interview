import 'dotenv/config';

import { Client } from 'pg';

import { migrate } from './migrate';
import { seed } from './seed';

async function resetDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Database schema reset');
  } finally {
    await client.end();
  }

  await migrate();
  await seed();
}

resetDatabase().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
