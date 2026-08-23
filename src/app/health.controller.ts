import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

import { PrismaService } from '../shared/database/prisma.service';

interface LiveHealthResponse {
  status: 'ok';
  service: 'ticket-booking-api';
  timestamp: string;
}

interface ReadyHealthResponse {
  status: 'ok';
  database: 'up';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async check(): Promise<ReadyHealthResponse> {
    return this.ready();
  }

  @Get('live')
  live(): LiveHealthResponse {
    return {
      status: 'ok',
      service: 'ticket-booking-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(): Promise<ReadyHealthResponse> {
    try {
      await this.database.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
    } catch {
      throw new HttpException(
        { status: 'error', database: 'down' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
