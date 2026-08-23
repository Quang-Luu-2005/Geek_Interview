import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import { Client } from 'pg';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.DATABASE_URL;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!databaseUrl) {
  console.error('WOW demo requires DATABASE_URL so the target database is explicit.');
  process.exitCode = 1;
} else {
  const scenarios = [
    ['oversell race', 'tests/concurrency/booking-oversell.spec.ts'],
    ['idempotent retry', 'tests/concurrency/booking-idempotency.spec.ts'],
    ['last-voucher race', 'tests/concurrency/voucher-quota.spec.ts'],
    ['expiry release and terminal race', 'tests/concurrency/booking-expiry.spec.ts'],
  ];

  function run(commandArgs) {
    const result = spawnSync(npmCommand, ['--silent', ...commandArgs], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        RESERVATION_EXPIRY_WORKER_ENABLED: 'false',
      },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}`);
    }
  }

  async function printFinalState() {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const inventory = await client.query(`
        SELECT tc.code, ti.available_quantity, ti.total_quantity
        FROM ticket_categories tc
        JOIN concerts c ON c.id = tc.concert_id
        JOIN ticket_inventories ti ON ti.ticket_category_id = tc.id
        WHERE c.slug = 'summer-festival-2026'
        ORDER BY tc.code
      `);
      const vouchers = await client.query(`
        SELECT code, used_count, usage_limit, status
        FROM vouchers
        WHERE code IN ('FLASH10', 'EXHAUSTED', 'EXPIRED')
        ORDER BY code
      `);
      const bookings = await client.query(`
        SELECT b.status, COUNT(*)::int AS count
        FROM bookings b
        JOIN concerts c ON c.id = b.concert_id
        WHERE c.slug = 'summer-festival-2026'
        GROUP BY b.status
        ORDER BY b.status
      `);

      console.log('\nFinal seeded-state summary (post-cleanup):');
      console.table(inventory.rows);
      console.table(vouchers.rows);
      console.table(bookings.rows);
    } finally {
      await client.end();
    }
  }

  try {
    console.log('Resetting the target database to deterministic migrations + seed...');
    run(['run', 'db:reset']);

    for (const [name, testPath] of scenarios) {
      console.log(`\nWOW demo: ${name}`);
      run(['run', 'test:concurrency', '--', '--runTestsByPath', testPath, '--silent']);
      console.log(`PASS  ${name}`);
    }

    await printFinalState();
    console.log('\nWOW correctness demo passed: four database-backed scenarios are green.');
  } catch (error) {
    console.error('\nWOW correctness demo failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
