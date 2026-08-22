import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';

import { withTransaction } from '../../../shared/database/transaction';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BusinessException } from '../../../shared/errors/business.exception';
import { InventoryReservationRepository } from '../../inventory/infrastructure/inventory-reservation.repository';
import { VoucherReservationRepository } from '../../voucher/infrastructure/voucher-reservation.repository';
import { BookingReadService, BookingResponse } from './booking-read.service';
import { BookingLifecycleRepository } from '../infrastructure/booking-lifecycle.repository';

const EXPIRY_RELEASE_REASON = 'RESERVATION_EXPIRED';
const CANCEL_RELEASE_REASON = 'BOOKING_CANCELLED';

@Injectable()
export class BookingLifecycleService {
  constructor(
    private readonly database: PrismaService,
    private readonly lifecycleRepository: BookingLifecycleRepository,
    private readonly inventoryRepository: InventoryReservationRepository,
    private readonly voucherRepository: VoucherReservationRepository,
    private readonly bookingReadService: BookingReadService,
  ) {}

  async confirm(userId: string, identifier: string): Promise<BookingResponse> {
    const bookingId = await withTransaction(
      this.database,
      async (transaction) => {
        const now = new Date();
        const booking = await this.lifecycleRepository.confirmOwned(
          transaction,
          userId,
          identifier,
        );
        if (!booking) {
          await this.throwTransitionError(transaction, userId, identifier, 'CONFIRM', now);
        }

        await this.lifecycleRepository.insertTransitionHistory(
          transaction,
          booking!.id,
          'RESERVED',
          'CONFIRMED',
          userId,
          'CUSTOMER_API',
          'Booking confirmed',
        );
        await this.voucherRepository.consumeForBooking(transaction, booking!.id);
        return booking!.id;
      },
      { maxAttempts: 3 },
    );

    return this.bookingReadService.getOwned(userId, bookingId);
  }

  async cancel(userId: string, identifier: string): Promise<BookingResponse> {
    const bookingId = await withTransaction(
      this.database,
      async (transaction) => {
        const booking = await this.lifecycleRepository.cancelOwned(transaction, userId, identifier);
        if (!booking) {
          await this.throwTransitionError(transaction, userId, identifier, 'CANCEL', new Date());
        }

        await this.releaseResources(transaction, booking!.id, CANCEL_RELEASE_REASON);
        await this.lifecycleRepository.insertTransitionHistory(
          transaction,
          booking!.id,
          'RESERVED',
          'CANCELLED',
          userId,
          'CUSTOMER_API',
          'Booking cancelled',
        );
        return booking!.id;
      },
      { maxAttempts: 3 },
    );

    return this.bookingReadService.getOwned(userId, bookingId);
  }

  /** Process one worker batch inside one transaction. */
  async expireBatch(limit = 100, now = new Date()): Promise<number> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return withTransaction(
      this.database,
      async (transaction) => {
        const claimed = await this.lifecycleRepository.claimExpired(transaction, now, safeLimit);
        let processed = 0;
        for (const booking of claimed) {
          const transitioned = await this.lifecycleRepository.expireClaimed(
            transaction,
            booking.id,
            now,
          );
          if (!transitioned) continue;

          await this.releaseResources(transaction, booking.id, EXPIRY_RELEASE_REASON);
          await this.lifecycleRepository.insertTransitionHistory(
            transaction,
            booking.id,
            'RESERVED',
            'EXPIRED',
            null,
            'RESERVATION_EXPIRY_WORKER',
            'Reservation TTL elapsed',
          );
          processed += 1;
        }
        return processed;
      },
      { maxAttempts: 3 },
    );
  }

  private async releaseResources(
    transaction: Parameters<InventoryReservationRepository['releaseForBooking']>[0],
    bookingId: string,
    voucherReason: string,
  ): Promise<void> {
    await this.inventoryRepository.releaseForBooking(transaction, bookingId);
    await this.voucherRepository.releaseForBooking(transaction, bookingId, voucherReason);
  }

  private async throwTransitionError(
    transaction: Parameters<BookingLifecycleRepository['findOwnedStatus']>[0],
    userId: string,
    identifier: string,
    transition: 'CONFIRM' | 'CANCEL',
    now: Date,
  ): Promise<never> {
    const existing = await this.lifecycleRepository.findOwnedStatus(
      transaction,
      userId,
      identifier,
    );
    if (!existing) throw new NotFoundException('Booking not found');

    if (transition === 'CONFIRM') {
      throw new BusinessException(
        'BOOKING_NOT_CONFIRMABLE',
        'Booking is no longer confirmable',
        HttpStatus.CONFLICT,
        {
          status: existing.status,
          expiresAt: new Date(existing.expires_at).toISOString(),
          now: now.toISOString(),
        },
      );
    }

    throw new BusinessException(
      'BOOKING_NOT_CANCELLABLE',
      'Booking is no longer cancellable',
      HttpStatus.CONFLICT,
      { status: existing.status },
    );
  }
}
