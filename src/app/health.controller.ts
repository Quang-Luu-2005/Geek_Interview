import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

import { PrismaService } from '../shared/database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up'; timestamp: string }> {
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
