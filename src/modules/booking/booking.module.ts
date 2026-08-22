import { Module } from '@nestjs/common';

import { BookingReadRepository } from './infrastructure/booking-read.repository';
import { BookingReadService } from './application/booking-read.service';
import { BookingController } from './presentation/booking.controller';

@Module({
  controllers: [BookingController],
  providers: [BookingReadRepository, BookingReadService],
})
export class BookingModule {}
