import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

@Controller()
export class OpenApiController {
  @Get('openapi.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  document(): string {
    try {
      return readFileSync(join(process.cwd(), 'openapi', 'openapi.yaml'), 'utf8');
    } catch {
      throw new NotFoundException('OpenAPI document is not available');
    }
  }
}
