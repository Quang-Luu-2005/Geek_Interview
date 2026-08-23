import { Injectable, NotFoundException } from '@nestjs/common';

import {
  InventoryReadRepository,
  TicketCategoryAvailabilityRow,
} from '../infrastructure/inventory-read.repository';

export interface TicketCategoryAvailabilityResponse {
  id: string;
  code: string;
  name: string;
  price: string;
  totalQuantity: number;
  availableQuantity: number;
}

@Injectable()
export class InventoryReadService {
  constructor(private readonly repository: InventoryReadRepository) {}

  async listForConcert(identifier: string): Promise<TicketCategoryAvailabilityResponse[]> {
    const rows = await this.repository.findForPublishedConcert(identifier);

    if (rows.length === 0) {
      throw new NotFoundException('Published concert or ticket categories not found');
    }

    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(row: TicketCategoryAvailabilityRow): TicketCategoryAvailabilityResponse {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      price: row.price,
      totalQuantity: row.total_quantity,
      availableQuantity: row.available_quantity,
    };
  }
}
