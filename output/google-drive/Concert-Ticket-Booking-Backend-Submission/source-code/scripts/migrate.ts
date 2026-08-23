import 'dotenv/config';

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export async function migrate(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const directory = join(process.cwd(), 'database', 'migrations');
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const existing = await client.query('SELECT 1 FROM _schema_migrations WHERE version = $1', [
        version,
      ]);
      if (existing.rowCount) continue;

      const sql = await readFile(join(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
