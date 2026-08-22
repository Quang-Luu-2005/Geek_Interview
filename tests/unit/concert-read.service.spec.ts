import { NotFoundException } from '@nestjs/common';

import type { InventoryReadService } from '../../src/modules/inventory/application/inventory-read.service';
import type { ConcertReadRepository } from '../../src/modules/concert/infrastructure/concert-read.repository';
import { ConcertReadService } from '../../src/modules/concert/application/concert-read.service';

describe('ConcertReadService', () => {
  const repository = {
    findPublishedPage: jest.fn(),
    findPublishedByIdentifier: jest.fn(),
  } as unknown as jest.Mocked<ConcertReadRepository>;
  const inventoryReadService = {
    listForConcert: jest.fn(),
  } as unknown as jest.Mocked<InventoryReadService>;
  const service = new ConcertReadService(repository, inventoryReadService);

  beforeEach(() => jest.clearAllMocks());

  it('returns stable pagination metadata for published concerts', async () => {
    repository.findPublishedPage.mockResolvedValue([
      {
        id: 'concert-1',
        slug: 'summer-festival-2026',
        name: 'Summer Festival 2026',
        status: 'PUBLISHED',
        starts_at: '2026-12-31T12:00:00.000Z',
        total_count: 3,
      },
    ]);

    await expect(service.listPublished(2, 2)).resolves.toEqual({
      data: [
        {
          id: 'concert-1',
          slug: 'summer-festival-2026',
          name: 'Summer Festival 2026',
          status: 'PUBLISHED',
          startsAt: '2026-12-31T12:00:00.000Z',
          bookable: true,
        },
      ],
      pagination: { page: 2, limit: 2, total: 3, totalPages: 2 },
    });
  });

  it('hides unpublished or unknown concerts as not found', async () => {
    repository.findPublishedByIdentifier.mockResolvedValue(null);

    await expect(service.getPublished('draft-concert')).rejects.toBeInstanceOf(NotFoundException);
  });
});
