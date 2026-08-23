import { Injectable, NotFoundException } from '@nestjs/common';

import { InventoryReadService } from '../../inventory/application/inventory-read.service';
import {
  ConcertListRow,
  ConcertReadRepository,
  ConcertReadRow,
} from '../infrastructure/concert-read.repository';

export interface ConcertResponse {
  id: string;
  slug: string;
  name: string;
  status: 'PUBLISHED';
  startsAt: string;
  bookable: true;
}

export interface PaginatedConcertResponse {
  data: ConcertResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ConcertReadService {
  constructor(
    private readonly repository: ConcertReadRepository,
    private readonly inventoryReadService: InventoryReadService,
  ) {}

  async listPublished(page: number, limit: number): Promise<PaginatedConcertResponse> {
    const rows = await this.repository.findPublishedPage(page, limit);
    const total = rows[0]?.total_count ?? 0;

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

  async getPublished(identifier: string): Promise<ConcertResponse> {
    const row = await this.repository.findPublishedByIdentifier(identifier);

    if (!row) {
      throw new NotFoundException('Published concert not found');
    }

    return this.toResponse(row);
  }

  async getPublishedWithCategories(identifier: string) {
    const concert = await this.getPublished(identifier);
    const categories = await this.inventoryReadService.listForConcert(identifier);

    return { concert, categories };
  }

  private toResponse(row: ConcertReadRow | ConcertListRow): ConcertResponse {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      startsAt: new Date(row.starts_at).toISOString(),
      bookable: true,
    };
  }
}
