import { Module } from '@nestjs/common';

import { BookingModule } from '../booking/booking.module';
import { OperationService } from './application/operation.service';
import { OperationRepository } from './infrastructure/operation.repository';
import { OperationController } from './presentation/operation.controller';

@Module({
  imports: [BookingModule],
  controllers: [OperationController],
  providers: [OperationRepository, OperationService],
})
export class OperationModule {}
