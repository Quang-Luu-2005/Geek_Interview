import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { BookingLifecycleService } from '../../modules/booking/application/booking-lifecycle.service';
import { ObservabilityService } from '../../shared/observability/observability.service';

const DEFAULT_INTERVAL_MS = 30_000;

@Injectable()
export class ReservationExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationExpiryWorker.name);
  private readonly workerId = `expiry-${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly lifecycleService: BookingLifecycleService,
    @Optional() private readonly observability?: ObservabilityService,
  ) {}

  onModuleInit(): void {
    if (process.env.RESERVATION_EXPIRY_WORKER_ENABLED === 'false') return;
    const interval = Number(process.env.RESERVATION_EXPIRY_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const intervalMs =
      Number.isFinite(interval) && interval >= 1_000 ? interval : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(limit = 100, now = new Date()): Promise<number> {
    const processed = await this.lifecycleService.expireBatch(limit, now);
    this.observability?.recordExpiry(processed);
    return processed;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const processed = await this.runOnce();
      if (processed > 0) {
        if (this.observability) {
          this.observability.log('booking.expiry.completed', {
            workerId: this.workerId,
            processed,
          });
        } else {
          this.logger.log(`${this.workerId} expired ${processed} reservation(s)`);
        }
      }
    } catch (error) {
      if (this.observability) {
        this.observability.log('booking.expiry.failed', {
          workerId: this.workerId,
          error: error instanceof Error ? error.name : 'unknown',
        });
      } else {
        this.logger.error(`${this.workerId} failed to expire reservations`);
      }
    } finally {
      this.running = false;
    }
  }

  get id(): string {
    return this.workerId;
  }
}
