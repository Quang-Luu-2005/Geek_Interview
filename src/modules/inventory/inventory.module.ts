import { Module } from '@nestjs/common';

import { InventoryReadRepository } from './infrastructure/inventory-read.repository';
import { InventoryReadService } from './application/inventory-read.service';
import { InventoryReservationRepository } from './infrastructure/inventory-reservation.repository';

@Module({
  providers: [InventoryReadRepository, InventoryReadService, InventoryReservationRepository],
  exports: [InventoryReadService, InventoryReservationRepository],
})
export class InventoryModule {}
