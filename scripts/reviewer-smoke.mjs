import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const userId = process.env.SMOKE_USER_ID || '00000000-0000-4000-8000-000000000001';
const concertId = process.env.SMOKE_CONCERT_ID || 'summer-festival-2026';
const checks = [];

function pass(name, detail = '') {
  checks.push({ name, detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const raw = await response.text();
  let body = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep non-JSON responses (OpenAPI and Prometheus) as text.
  }
  return { response, body };
}

function expectStatus(result, expected, name) {
  assert(expected.includes(result.response.status), `${name}: expected ${expected.join('/')} but got ${result.response.status}`);
  pass(name, `HTTP ${result.response.status}`);
}

try {
  const live = await request('/health/live');
  expectStatus(live, [200], 'liveness probe');
  assert(live.body?.service === 'ticket-booking-api', 'liveness probe: service marker missing');

  const ready = await request('/health/ready');
  expectStatus(ready, [200], 'readiness probe');
  assert(ready.body?.database === 'up', 'readiness probe: database is not up');

  const openapi = await request('/openapi.yaml');
  expectStatus(openapi, [200], 'OpenAPI contract');
  assert(String(openapi.body).includes('openapi: 3.0.3'), 'OpenAPI contract: invalid version marker');

  const metrics = await request('/metrics');
  expectStatus(metrics, [200], 'metrics endpoint');
  assert(typeof metrics.body === 'string', 'metrics endpoint: expected text exposition');

  const browse = await request('/api/concerts?page=1&limit=20');
  expectStatus(browse, [200], 'published concert browse');
  assert(browse.body?.data?.some((concert) => concert.slug === concertId), 'published concert browse: seeded concert missing');

  const categories = await request(`/api/concerts/${encodeURIComponent(concertId)}/ticket-categories`);
  expectStatus(categories, [200], 'ticket category lookup');
  const standard = categories.body?.categories?.find((category) => category.code === 'STANDARD');
  assert(standard?.id, 'ticket category lookup: STANDARD category missing');

  const idempotencyKey = `reviewer-smoke-${Date.now()}-${randomUUID()}`;
  const requestId = `smoke-${randomUUID()}`;
  const headers = {
    'content-type': 'application/json',
    'x-user-id': userId,
    'Idempotency-Key': idempotencyKey,
    'X-Request-ID': requestId,
  };
  const payload = JSON.stringify({
    concertId,
    items: [{ ticketCategoryId: standard.id, quantity: 1 }],
  });

  const first = await request('/api/bookings', { method: 'POST', headers, body: payload });
  expectStatus(first, [201], 'booking create');
  const bookingId = first.body?.data?.id;
  assert(bookingId, 'booking create: booking ID missing');
  assert(first.response.headers.get('x-request-id') === requestId, 'booking create: X-Request-ID was not propagated');

  const replay = await request('/api/bookings', { method: 'POST', headers, body: payload });
  expectStatus(replay, [200, 201], 'idempotent replay');
  assert(replay.body?.data?.id === bookingId, 'idempotent replay: booking ID changed');

  const cancelled = await request(`/api/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: { 'x-user-id': userId },
  });
  expectStatus(cancelled, [200, 201], 'booking cancellation cleanup');
  assert(cancelled.body?.data?.status === 'CANCELLED', 'booking cancellation cleanup: status mismatch');

  const history = await request('/api/me/bookings?page=1&limit=20', {
    headers: { 'x-user-id': userId },
  });
  expectStatus(history, [200], 'customer booking history');

  console.log(`Reviewer smoke passed against ${baseUrl} (${checks.length} checks)`);
  checks.forEach(({ name, detail }) => console.log(`PASS  ${name}: ${detail}`));
} catch (error) {
  console.error(`Reviewer smoke failed against ${baseUrl}`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
