import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { ConcertReadRepository } from './infrastructure/concert-read.repository';
import { ConcertReadService } from './application/concert-read.service';
import { ConcertController } from './presentation/concert.controller';
import { ConcertBookingRepository } from './infrastructure/concert-booking.repository';

@Module({
  imports: [InventoryModule],
  controllers: [ConcertController],
  providers: [ConcertReadRepository, ConcertReadService, ConcertBookingRepository],
  exports: [ConcertReadService, ConcertBookingRepository],
})
export class ConcertModule {}
