import { Module } from '@nestjs/common';

import { IdempotencyRepository } from './infrastructure/idempotency.repository';

@Module({
  providers: [IdempotencyRepository],
  exports: [IdempotencyRepository],
})
export class IdempotencyModule {}
