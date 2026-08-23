import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadTestFile = join(repositoryRoot, 'load-tests', 'booking.js');
const resultDirectory = join(repositoryRoot, 'test-results', 'load');
const summaryFile = join(resultDirectory, 'k6-summary.json');
const reportFile = join(repositoryRoot, 'docs', 'PERFORMANCE_REPORT.md');

await mkdir(resultDirectory, { recursive: true });

const databaseUrl = process.env.DATABASE_URL;
const context = await resolveLoadContext(databaseUrl);
const requestedBaseUrl = process.env.BASE_URL || 'http://localhost:3000';
const hasNativeK6 = commandExists('k6');
const hasDocker = commandExists('docker');

if (!hasNativeK6 && !hasDocker) {
  console.error(
    'k6 is not installed and Docker is unavailable. Install k6 or start Docker Desktop, then rerun npm run test:load.',
  );
  process.exitCode = 1;
} else {
  const useDocker = !hasNativeK6;
  const baseUrl = useDocker ? toDockerHostUrl(requestedBaseUrl) : requestedBaseUrl;
  const command = useDocker ? 'docker' : 'k6';
  const args = useDocker
    ? dockerArguments(baseUrl, context)
    : nativeArguments();

  console.log(`Running k6 with ${useDocker ? 'Docker image grafana/k6:0.53.0' : 'local binary'}`);
  console.log(`BASE_URL=${baseUrl}`);
  console.log(`USER_ID=${context.userId}`);
  console.log(`CONCERT_ID=${context.concertId}`);
  console.log(`CATEGORY_ID=${context.categoryId}`);

  const exitCode = await run(command, args, {
    ...process.env,
    BASE_URL: baseUrl,
    USER_ID: context.userId,
    CONCERT_ID: context.concertId,
    CATEGORY_ID: context.categoryId,
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  } else {
    await writePerformanceReport(context, baseUrl, useDocker);
    console.log(`Performance report written to ${reportFile}`);
  }
}

async function resolveLoadContext(connectionString) {
  const userId = process.env.USER_ID || process.env.K6_USER_ID;
  const concertId = process.env.CONCERT_ID || process.env.K6_CONCERT_ID || 'summer-festival-2026';
  const categoryId = process.env.CATEGORY_ID || process.env.K6_CATEGORY_ID;

  if (userId && categoryId) return { userId, concertId, categoryId, databaseVersion: 'not queried' };
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required when USER_ID/CATEGORY_ID are not supplied. Copy .env.example or export the IDs explicitly.',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT
         (SELECT id::text FROM users WHERE role = 'CUSTOMER' ORDER BY email LIMIT 1) AS user_id,
         (SELECT tc.id::text
          FROM ticket_categories tc
          JOIN concerts c ON c.id = tc.concert_id
          WHERE c.slug = $1 AND tc.code = 'STANDARD') AS category_id,
         version() AS database_version`,
      [concertId],
    );
    const row = result.rows[0];
    if (!row?.user_id || !row?.category_id) {
      throw new Error(`Could not resolve seeded CUSTOMER and STANDARD category for concert ${concertId}.`);
    }
    return {
      userId: row.user_id,
      concertId,
      categoryId: row.category_id,
      databaseVersion: row.database_version,
    };
  } finally {
    await client.end();
  }
}

function nativeArguments() {
  return ['run', '--summary-export', summaryFile, loadTestFile];
}

function dockerArguments(baseUrl, context) {
  const k6Environment = [
    'K6_STEADY_RATE',
    'K6_STEADY_DURATION',
    'K6_BURST_START_RATE',
    'K6_BURST_TARGET_RATE',
    'K6_BURST_STAGE_DURATION',
    'K6_PRE_ALLOCATED_VUS',
    'K6_MAX_VUS',
  ].flatMap((name) => (process.env[name] ? ['-e', `${name}=${process.env[name]}`] : []));

  return [
    'run',
    '--rm',
    '--add-host=host.docker.internal:host-gateway',
    '-v',
    `${join(repositoryRoot, 'load-tests')}:/scripts:ro`,
    '-v',
    `${resultDirectory}:/results`,
    '-e',
    `BASE_URL=${baseUrl}`,
    '-e',
    `USER_ID=${context.userId}`,
    '-e',
    `CONCERT_ID=${context.concertId}`,
    '-e',
    `CATEGORY_ID=${context.categoryId}`,
    ...k6Environment,
    'grafana/k6:0.53.0',
    'run',
    '--summary-export',
    '/results/k6-summary.json',
    '/scripts/booking.js',
  ];
}

function toDockerHostUrl(value) {
  const parsed = new URL(value);
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'host.docker.internal';
  }
  return parsed.toString().replace(/\/$/, '');
}

function commandExists(command) {
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [command], { stdio: 'ignore' });
    } else {
      execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env) {
  return new Promise((resolveExit) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env, stdio: 'inherit', shell: false });
    child.on('error', (error) => {
      console.error(error);
      resolveExit(1);
    });
    child.on('close', (code) => resolveExit(code ?? 1));
  });
}

async function writePerformanceReport(context, baseUrl, useDocker) {
  if (!existsSync(summaryFile)) {
    throw new Error(`k6 completed without creating ${summaryFile}`);
  }
  const summary = JSON.parse(await readFile(summaryFile, 'utf8'));
  const metrics = summary.metrics || {};
  const requests = metric(metrics.http_reqs);
  const duration = {
    ...metric(metrics.http_req_duration),
    count: requests.count,
    rate: requests.rate,
  };
  const systemErrorRate = metric(metrics.booking_system_error_rate);
  const successes = metric(metrics.booking_success_total);
  const businessRejects = metric(metrics.booking_business_reject_total);
  const sha = gitSha();
  const generatedAt = new Date().toISOString();

  const report = `# Performance Report\n\nGenerated at **${generatedAt}** from commit **${sha}**.\n\n## Reproduction\n\n\`\`\`bash\nDATABASE_URL=postgresql://ticket:ticket@localhost:5432/ticket_booking \\\nnpm run db:migrate && npm run db:seed \\\nRATE_LIMIT_BOOKING_MAX=1000 BASE_URL=http://localhost:3000 npm run test:load\n\`\`\`\n\nThe runner resolves the seeded customer and STANDARD category automatically. It uses a native k6 binary when available, otherwise Docker image \`grafana/k6:0.53.0\`. Reset the local database after a run if the booking rows are not disposable.\n\n## Environment and scenarios\n\n| Field | Value |\n|---|---|\n| API base URL | \`${baseUrl}\` |\n| Concert | \`${context.concertId}\` |\n| Workload | steady ${process.env.K6_STEADY_RATE || 5} req/s, then burst ${process.env.K6_BURST_TARGET_RATE || 15} req/s |\n| Steady duration | \`${process.env.K6_STEADY_DURATION || '30s'}\` |\n| Burst stages | 3 × \`${process.env.K6_BURST_STAGE_DURATION || '10s'}\` |\n| Commit | \`${sha}\` |\n\n## Results\n\n| Metric | Result |\n|---|---:|\n| Requests | ${formatNumber(duration.count)} |\n| Throughput | ${formatNumber(duration.rate)} req/s |\n| p50 latency | ${formatMs(duration.med)} |\n| p95 latency | ${formatMs(duration['p(95)'])} |\n| p99 latency | ${formatMs(duration['p(99)'])} |\n| Booking successes | ${formatNumber(successes.count)} |\n| Expected business rejects (400/409/429) | ${formatNumber(businessRejects.count)} |\n| System error rate | ${formatPercent(systemErrorRate.rate)} |\n\n## Interpretation\n\nBusiness rejects are not counted as system failures because sold-out, validation and rate-limit responses are expected outcomes under contention. A non-zero system error rate indicates an HTTP 5xx, auth/configuration failure, or another unexpected status and should block a performance claim. This report is a local reproducibility baseline, not a capacity guarantee; CPU, memory, database locality and Docker networking materially affect the numbers.\n`;

  const environmentRows = `| Runtime | \`${process.platform}/${process.arch}, ${process.version}\` |\n| Load engine | ${useDocker ? '`grafana/k6:0.53.0` via Docker' : '`k6` binary'} |\n| PostgreSQL | \`${context.databaseVersion || 'not queried'}\` |\n`;
  const normalizedReport = report
    .replace(`| API base URL | \`${baseUrl}\` |\n`, `| API base URL | \`${baseUrl}\` |\n${environmentRows}`)
    .replaceAll('Ă—', 'x');
  await writeFile(reportFile, normalizedReport, 'utf8');
}

function metric(value) {
  if (!value) return { count: 0, rate: 0 };
  const data = value?.values || value || {};
  return data.rate === undefined && data.value !== undefined
    ? { ...data, rate: data.value }
    : data;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : 'n/a';
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : 'n/a';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(3)}%` : 'n/a';
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
