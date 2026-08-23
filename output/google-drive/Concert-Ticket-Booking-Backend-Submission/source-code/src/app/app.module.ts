import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from '../shared/config/env.validation';
import { DatabaseModule } from '../shared/database/database.module';
import { BookingModule } from '../modules/booking/booking.module';
import { ConcertModule } from '../modules/concert/concert.module';
import { IdempotencyModule } from '../modules/idempotency/idempotency.module';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { OperationModule } from '../modules/operation/operation.module';
import { VoucherModule } from '../modules/voucher/voucher.module';
import { ObservabilityModule } from '../shared/observability/observability.module';
import { HealthController } from './health.controller';
import { OpenApiController } from './openapi.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    ConcertModule,
    BookingModule,
    InventoryModule,
    VoucherModule,
    IdempotencyModule,
    OperationModule,
    ObservabilityModule,
  ],
  controllers: [HealthController, OpenApiController],
})
export class AppModule {}
