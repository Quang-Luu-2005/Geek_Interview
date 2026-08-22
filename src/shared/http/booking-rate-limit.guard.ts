import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { BusinessException } from '../errors/business.exception';
import type { HttpRequestLike, HttpResponseLike } from './http-types';

interface Bucket {
  count: number;
  resetAt: number;
}

type RequestWithUser = HttpRequestLike;

/**
 * Per-process booking-attempt limiter. The key is the authenticated customer
 * when present and otherwise the source IP. Admin/operator endpoints are not
 * subject to this flash-sale limiter.
 */
@Injectable()
export class BookingRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    @Optional()
    private readonly maxAttempts = readPositiveInteger(process.env.RATE_LIMIT_BOOKING_MAX, 60),
    @Optional()
    private readonly windowMs = readPositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!this.isBookingCreation(request)) return true;

    const response = context.switchToHttp().getResponse<HttpResponseLike>();
    const key = this.keyFor(request);
    const now = Date.now();
    this.prune(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count < this.maxAttempts) {
      bucket.count += 1;
      return true;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    response.setHeader('Retry-After', retryAfterSeconds.toString());
    throw new BusinessException(
      'RATE_LIMITED',
      'Too many booking attempts; please retry later',
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfterSeconds },
    );
  }

  private isBookingCreation(request: HttpRequestLike): boolean {
    if (request.method.toUpperCase() !== 'POST') return false;
    const path = (request.originalUrl ?? request.url).split('?')[0].replace(/\/$/, '');
    return path === '/api/bookings' || path === '/bookings';
  }

  private keyFor(request: RequestWithUser): string {
    const userId = request.headers['x-user-id'];
    if (typeof userId === 'string' && userId.trim()) return `user:${userId.trim()}`;
    return `ip:${request.ip || request.socket?.remoteAddress || 'unknown'}`;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
