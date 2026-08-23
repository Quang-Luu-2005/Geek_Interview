import { NotFoundException } from '@nestjs/common';

import { InventoryReadService } from '../../src/modules/inventory/application/inventory-read.service';
import type { InventoryReadRepository } from '../../src/modules/inventory/infrastructure/inventory-read.repository';

describe('InventoryReadService', () => {
  const repository = {
    findForPublishedConcert: jest.fn(),
  } as unknown as jest.Mocked<InventoryReadRepository>;
  const service = new InventoryReadService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('maps current price and informational availability, including sold out categories', async () => {
    repository.findForPublishedConcert.mockResolvedValue([
      {
        id: 'category-1',
        code: 'STANDARD',
        name: 'Standard',
        price: '50.00',
        total_quantity: 1000,
        available_quantity: 0,
      },
    ]);

    await expect(service.listForConcert('summer-festival-2026')).resolves.toEqual([
      {
        id: 'category-1',
        code: 'STANDARD',
        name: 'Standard',
        price: '50.00',
        totalQuantity: 1000,
        availableQuantity: 0,
      },
    ]);
  });

  it('rejects an invalid or unpublished concert identifier', async () => {
    repository.findForPublishedConcert.mockResolvedValue([]);

    await expect(service.listForConcert('not-published')).rejects.toBeInstanceOf(NotFoundException);
  });
});
