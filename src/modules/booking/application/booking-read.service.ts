import { Injectable, NotFoundException } from '@nestjs/common';

import { BookingReadRepository, BookingReadRow } from '../infrastructure/booking-read.repository';

export interface BookingItemResponse {
  id: string;
  ticketCategoryId: string;
  categoryCode: string;
  categoryName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface BookingResponse {
  id: string;
  bookingCode: string;
  concert: {
    id: string;
    slug: string;
    name: string;
  };
  status: string;
  subtotal: string;
  discountAmount: string;
  finalAmount: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  items: BookingItemResponse[];
}

export interface PaginatedBookingResponse {
  data: BookingResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class BookingReadService {
  constructor(private readonly repository: BookingReadRepository) {}

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedBookingResponse> {
    const rows = await this.repository.findByUserPage(userId, page, limit);
    const total = rows[0]?.totalCount ?? 0;

    return {
      data: rows.map((row) => this.toResponse(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getOwned(userId: string, identifier: string): Promise<BookingResponse> {
    const row = await this.repository.findOwnedByIdentifier(userId, identifier);

    if (!row) {
      // Ownership is part of the query predicate: a cross-user identifier is
      // intentionally indistinguishable from a missing booking.
      throw new NotFoundException('Booking not found');
    }

    return this.toResponse(row);
  }

  private toResponse(row: BookingReadRow): BookingResponse {
    return {
      id: row.id,
      bookingCode: row.bookingCode,
      concert: {
        id: row.concertId,
        slug: row.concertSlug,
        name: row.concertName,
      },
      status: row.status,
      subtotal: row.subtotal,
      discountAmount: row.discountAmount,
      finalAmount: row.finalAmount,
      expiresAt: new Date(row.expiresAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      items: row.items,
    };
  }
}
