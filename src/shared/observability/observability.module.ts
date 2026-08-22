import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Global, Module } from '@nestjs/common';

import { ApiExceptionFilter } from '../http/api-exception.filter';
import { MetricsController } from './metrics.controller';
import { ObservabilityService } from './observability.service';
import { RequestObservabilityInterceptor } from './request-observability.interceptor';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    ObservabilityService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestObservabilityInterceptor },
  ],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
