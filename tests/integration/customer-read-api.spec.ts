import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../src/app/app.module';

describe('customer read APIs', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('browses published concerts and exposes informational ticket availability', async () => {
    const concertsResponse = await fetch(`${baseUrl}/api/concerts?page=1&limit=20`);
    const concerts = (await concertsResponse.json()) as {
      data: Array<{ slug: string; status: string }>;
      pagination: { total: number };
    };

    expect(concertsResponse.status).toBe(200);
    expect(concerts.data[0]).toMatchObject({
      slug: 'summer-festival-2026',
      status: 'PUBLISHED',
    });
    expect(concerts.pagination.total).toBeGreaterThanOrEqual(1);

    const categoriesResponse = await fetch(
      `${baseUrl}/api/concerts/summer-festival-2026/ticket-categories`,
    );
    const categories = (await categoriesResponse.json()) as {
      categories: Array<{ code: string; price: string; availableQuantity: number }>;
    };

    expect(categoriesResponse.status).toBe(200);
    expect(categories.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'VIP', price: '150.00', availableQuantity: 10 }),
        expect.objectContaining({ code: 'STANDARD', price: '50.00', availableQuantity: 1000 }),
      ]),
    );
  });

  it('returns 404 for an unknown concert and requires identity for booking reads', async () => {
    const notFoundResponse = await fetch(`${baseUrl}/api/concerts/does-not-exist`);
    expect(notFoundResponse.status).toBe(404);

    const unauthorizedResponse = await fetch(`${baseUrl}/api/me/bookings`);
    expect(unauthorizedResponse.status).toBe(401);
  });
});
