import { Module } from '@nestjs/common';

import { InventoryReadRepository } from './infrastructure/inventory-read.repository';
import { InventoryReadService } from './application/inventory-read.service';

@Module({
  providers: [InventoryReadRepository, InventoryReadService],
  exports: [InventoryReadService],
})
export class InventoryModule {}
