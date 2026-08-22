import { Module } from '@nestjs/common';

import { VoucherReservationRepository } from './infrastructure/voucher-reservation.repository';

@Module({
  providers: [VoucherReservationRepository],
  exports: [VoucherReservationRepository],
})
export class VoucherModule {}
