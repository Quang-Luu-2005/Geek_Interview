import { NotFoundException } from '@nestjs/common';

import { BookingReadService } from '../../src/modules/booking/application/booking-read.service';
import type { BookingReadRepository } from '../../src/modules/booking/infrastructure/booking-read.repository';

describe('BookingReadService', () => {
  const repository = {
    findByUserPage: jest.fn(),
    findOwnedByIdentifier: jest.fn(),
  } as unknown as jest.Mocked<BookingReadRepository>;
  const service = new BookingReadService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('returns user-scoped booking history with immutable amount/item snapshots', async () => {
    repository.findByUserPage.mockResolvedValue([
      {
        id: 'booking-1',
        bookingCode: 'BK-0001',
        concertId: 'concert-1',
        concertSlug: 'summer-festival-2026',
        concertName: 'Summer Festival 2026',
        status: 'RESERVED',
        subtotal: '100.00',
        discountAmount: '10.00',
        finalAmount: '90.00',
        expiresAt: '2026-12-31T12:10:00.000Z',
        createdAt: '2026-12-31T12:00:00.000Z',
        updatedAt: '2026-12-31T12:00:00.000Z',
        items: [
          {
            id: 'item-1',
            ticketCategoryId: 'category-1',
            categoryCode: 'STANDARD',
            categoryName: 'Standard',
            quantity: 2,
            unitPrice: '50.00',
            lineTotal: '100.00',
          },
        ],
        totalCount: 1,
      },
    ]);

    const result = await service.listForUser('user-1', 1, 20);

    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(result.data[0]).toMatchObject({
      bookingCode: 'BK-0001',
      subtotal: '100.00',
      discountAmount: '10.00',
      finalAmount: '90.00',
      status: 'RESERVED',
    });
    expect(result.data[0].items[0].unitPrice).toBe('50.00');
    expect((repository.findByUserPage as jest.Mock).mock.calls).toContainEqual(['user-1', 1, 20]);
  });

  it('does not reveal a booking that is not owned by the current user', async () => {
    repository.findOwnedByIdentifier.mockResolvedValue(null);

    await expect(service.getOwned('user-1', 'booking-2')).rejects.toBeInstanceOf(NotFoundException);
    expect((repository.findOwnedByIdentifier as jest.Mock).mock.calls).toContainEqual([
      'user-1',
      'booking-2',
    ]);
  });
});
