import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { ConcertReadRepository } from './infrastructure/concert-read.repository';
import { ConcertReadService } from './application/concert-read.service';
import { ConcertController } from './presentation/concert.controller';

@Module({
  imports: [InventoryModule],
  controllers: [ConcertController],
  providers: [ConcertReadRepository, ConcertReadService],
  exports: [ConcertReadService],
})
export class ConcertModule {}
