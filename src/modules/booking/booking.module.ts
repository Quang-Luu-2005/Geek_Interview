import { Module } from '@nestjs/common';

import { ConcertModule } from '../concert/concert.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VoucherModule } from '../voucher/voucher.module';
import { CreateBookingService } from './application/create-booking.service';
import { BookingReadRepository } from './infrastructure/booking-read.repository';
import { BookingWriteRepository } from './infrastructure/booking-write.repository';
import { BookingReadService } from './application/booking-read.service';
import { BookingController } from './presentation/booking.controller';

@Module({
  imports: [ConcertModule, InventoryModule, VoucherModule],
  controllers: [BookingController],
  providers: [
    BookingReadRepository,
    BookingReadService,
    BookingWriteRepository,
    CreateBookingService,
  ],
})
export class BookingModule {}
