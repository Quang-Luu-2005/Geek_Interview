import { Injectable } from '@nestjs/common';

export type MetricLabels = Readonly<Record<string, string>>;

interface Counter {
  name: string;
  labels: MetricLabels;
  value: number;
}

/**
 * Small, dependency-free observability facade.
 *
 * Counters are intentionally kept in memory because this assessment runs as a
 * single API process. Production deployments should replace this storage with
 * a Prometheus/OpenTelemetry exporter.
 */
@Injectable()
export class ObservabilityService {
  private readonly counters = new Map<string, Counter>();

  increment(name: string, labels: MetricLabels = {}, amount = 1): void {
    const normalizedLabels = this.normalizeLabels(labels);
    const key = `${name}|${JSON.stringify(normalizedLabels)}`;
    const current = this.counters.get(key);
    if (current) {
      current.value += amount;
      return;
    }
    this.counters.set(key, { name, labels: normalizedLabels, value: amount });
  }

  recordRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
    requestId?: string,
  ): void {
    this.increment('http_requests_total', {
      method,
      route: this.normalizeRoute(route),
      status: String(statusCode),
    });
    this.log('http.request.completed', {
      method,
      route: this.normalizeRoute(route),
      statusCode,
      durationMs: Math.round(durationMs),
      requestId,
    });
  }

  recordBookingAttempt(userId?: string): void {
    this.increment('booking_attempts_total');
    this.log('booking.attempt', userId ? { userId } : {});
  }

  recordBookingOutcome(
    outcome: 'success' | 'replayed' | 'failure',
    code?: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): void {
    this.increment(`booking_${outcome}_total`, code ? { code } : {});
    this.log('booking.outcome', { outcome, ...(code ? { code } : {}), ...fields });
    if (outcome !== 'failure' || !code) return;
    if (code === 'INSUFFICIENT_TICKET_INVENTORY') {
      this.increment('booking_sold_out_total');
      this.increment('inventory_conflicts_total');
    }
    if (code === 'VOUCHER_EXHAUSTED') this.increment('voucher_exhausted_total');
    if (code.startsWith('IDEMPOTENCY_')) this.increment('idempotency_conflicts_total', { code });
  }

  recordExpiry(count: number): void {
    if (count > 0) this.increment('booking_expired_total', {}, count);
  }

  log(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'ticket-booking-api',
      event,
      ...fields,
    };
    // Keep test output quiet while retaining JSON logs in development and production.
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const counter of this.counters.values()) {
      const labelEntries = Object.entries(counter.labels).map(
        ([key, value]) => `${key}="${this.escapePrometheus(value)}"`,
      );
      lines.push(
        `${counter.name}${labelEntries.length > 0 ? `{${labelEntries.join(',')}}` : ''} ${counter.value}`,
      );
    }
    return `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`;
  }

  private normalizeLabels(labels: MetricLabels): MetricLabels {
    return Object.fromEntries(
      Object.entries(labels)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, value.slice(0, 64)]),
    );
  }

  private normalizeRoute(route: string): string {
    const normalized = route
      .split('?')[0]
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(?=\/|$)/gi, '/:id')
      .replace(/\/BK-[A-Z0-9-]+(?=\/|$)/gi, '/:id');
    return normalized || '/';
  }

  private escapePrometheus(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
  }
}
