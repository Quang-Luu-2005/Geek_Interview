import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';

import { ApiExceptionFilter } from '../../src/shared/http/api-exception.filter';
import { BookingRateLimitGuard } from '../../src/shared/http/booking-rate-limit.guard';
import type { HttpRequestLike, HttpResponseLike } from '../../src/shared/http/http-types';
import { resolveRequestId } from '../../src/shared/observability/request-id.middleware';
import { ObservabilityService } from '../../src/shared/observability/observability.service';

describe('API quality boundary', () => {
  it('propagates a safe request ID and generates one for unsafe input', () => {
    expect(resolveRequestId('client-trace-123')).toBe('client-trace-123');
    expect(resolveRequestId('bad trace')).not.toBe('bad trace');
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the standard validation error contract without a stack', () => {
    const request: HttpRequestLike = {
      method: 'POST',
      url: '/api/bookings',
      headers: {},
      requestId: 'trace-validation',
    };
    let body: unknown;
    let statusCode = 200;
    const setHeader = jest.fn();
    const response: HttpResponseLike = {
      statusCode,
      setHeader,
      status: (status: number) => {
        statusCode = status;
        response.statusCode = status;
        return response;
      },
      json: (value: unknown) => {
        body = value;
        return response;
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(
      new BadRequestException({ message: ['items must contain at least 1 elements'] }),
      host,
    );

    expect(statusCode).toBe(400);
    expect(body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: { messages: ['items must contain at least 1 elements'] },
      traceId: 'trace-validation',
    });
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('limits booking attempts and returns Retry-After', () => {
    const request: HttpRequestLike = {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'x-user-id': 'customer-1' },
      ip: '127.0.0.1',
    };
    const setHeader = jest.fn();
    const response: HttpResponseLike = {
      statusCode: 200,
      setHeader,
      status: () => response,
      json: () => response,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const guard = new BookingRateLimitGuard(2, 60_000);

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow('Too many booking attempts');
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('exports low-cardinality Prometheus counters', () => {
    const observability = new ObservabilityService();
    observability.increment('booking_failure_total', { code: 'CONFLICT' });
    observability.increment('booking_failure_total', { code: 'CONFLICT' });

    expect(observability.toPrometheus()).toContain('booking_failure_total{code="CONFLICT"} 2');
  });
});
