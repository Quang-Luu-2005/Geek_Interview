import { Module } from '@nestjs/common';

import { ConcertModule } from '../concert/concert.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VoucherModule } from '../voucher/voucher.module';
import { CreateBookingService } from './application/create-booking.service';
import { BookingReadRepository } from './infrastructure/booking-read.repository';
import { BookingWriteRepository } from './infrastructure/booking-write.repository';
import { BookingReadService } from './application/booking-read.service';
import { BookingController } from './presentation/booking.controller';
import { BookingLifecycleRepository } from './infrastructure/booking-lifecycle.repository';
import { BookingLifecycleService } from './application/booking-lifecycle.service';
import { ReservationExpiryWorker } from '../../workers/reservation-expiry/reservation-expiry.worker';

@Module({
  imports: [ConcertModule, InventoryModule, VoucherModule, IdempotencyModule],
  controllers: [BookingController],
  providers: [
    BookingReadRepository,
    BookingReadService,
    BookingWriteRepository,
    CreateBookingService,
    BookingLifecycleRepository,
    BookingLifecycleService,
    ReservationExpiryWorker,
  ],
})
export class BookingModule {}
