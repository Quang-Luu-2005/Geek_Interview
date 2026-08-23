import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const userId = __ENV.USER_ID;
const concertId = __ENV.CONCERT_ID || 'summer-festival-2026';
const ticketCategoryId = __ENV.CATEGORY_ID;

if (!userId) {
  throw new Error('USER_ID is required; provide a seeded customer UUID.');
}

if (!ticketCategoryId) {
  throw new Error('CATEGORY_ID is required; provide a ticket category UUID.');
}

const steadyRate = numberEnv('K6_STEADY_RATE', 5);
const steadyDuration = __ENV.K6_STEADY_DURATION || '30s';
const burstStart = numberEnv('K6_BURST_START_RATE', 5);
const burstTarget = numberEnv('K6_BURST_TARGET_RATE', 15);
const burstStageDuration = __ENV.K6_BURST_STAGE_DURATION || '10s';
const preAllocatedVUs = numberEnv('K6_PRE_ALLOCATED_VUS', 20);
const maxVUs = numberEnv('K6_MAX_VUS', 100);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    steady_booking: {
      executor: 'constant-arrival-rate',
      rate: steadyRate,
      timeUnit: '1s',
      duration: steadyDuration,
      preAllocatedVUs,
      maxVUs,
      exec: 'book',
    },
    burst_booking: {
      executor: 'ramping-arrival-rate',
      startTime: steadyDuration,
      startRate: burstStart,
      timeUnit: '1s',
      preAllocatedVUs,
      maxVUs,
      stages: [
        { target: burstTarget, duration: burstStageDuration },
        { target: burstTarget, duration: burstStageDuration },
        { target: burstStart, duration: burstStageDuration },
      ],
      exec: 'book',
    },
  },
  thresholds: {
    // Expected 4xx business outcomes are tracked separately below.
    booking_system_error_rate: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
  },
};

export const bookingSuccess = new Counter('booking_success_total');
export const businessRejects = new Counter('booking_business_reject_total');
export const systemErrors = new Rate('booking_system_error_rate');

export function book() {
  const response = http.post(
    `${baseUrl}/api/bookings`,
    JSON.stringify({
      concertId,
      items: [{ ticketCategoryId, quantity: 1 }],
    }),
    {
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'idempotency-key': `load-${__VU}-${__ITER}-${Date.now()}-${Math.random()}`,
      },
      tags: { endpoint: 'create_booking' },
    },
  );

  const isSuccess = response.status === 201;
  const isExpectedBusinessReject = [400, 409, 429].includes(response.status);
  const isSystemError = !isSuccess && !isExpectedBusinessReject;

  if (isSuccess) bookingSuccess.add(1);
  if (isExpectedBusinessReject) businessRejects.add(1);
  systemErrors.add(isSystemError);

  check(response, {
    'booking response is success or expected business reject': () =>
      isSuccess || isExpectedBusinessReject,
  });
}

function numberEnv(name, fallback) {
  const value = Number(__ENV[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
