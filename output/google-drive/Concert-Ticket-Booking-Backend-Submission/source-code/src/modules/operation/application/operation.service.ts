import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { BookingLifecycleService } from '../../booking/application/booking-lifecycle.service';
import { BusinessException } from '../../../shared/errors/business.exception';
import { CreateConcertDto } from '../presentation/dto/create-concert.dto';
import { CreateTicketCategoryDto } from '../presentation/dto/create-ticket-category.dto';
import { CreateVoucherDto } from '../presentation/dto/create-voucher.dto';
import { OperationBookingQueryDto } from '../presentation/dto/operation-booking-query.dto';
import { UpdateBookingStatusDto } from '../presentation/dto/update-booking-status.dto';
import {
  OperationBookingDetailRow,
  OperationBookingListFilter,
  OperationBookingListRow,
  OperationRepository,
} from '../infrastructure/operation.repository';

export interface OperationBookingSummary {
  id: string;
  bookingCode: string;
  userId: string;
  concert: { id: string; slug: string; name: string };
  status: string;
  subtotal: string;
  discountAmount: string;
  finalAmount: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationBookingDetail extends OperationBookingSummary {
  items: Array<{
    id: string;
    ticketCategoryId: string;
    categoryCode: string;
    categoryName: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string | null;
    changeSource: string;
    reason: string | null;
    createdAt: string;
  }>;
  voucher: {
    code: string;
    status: string;
    redeemedAt: string;
    releasedAt: string | null;
    releasedReason: string | null;
  } | null;
  idempotency: {
    status: string;
    responseStatus: number | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface PaginatedOperationBookings {
  data: OperationBookingSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class OperationService {
  constructor(
    private readonly repository: OperationRepository,
    private readonly lifecycleService: BookingLifecycleService,
  ) {}

  async listBookings(
    actorId: string,
    query: OperationBookingQueryDto,
  ): Promise<PaginatedOperationBookings> {
    await this.requireOperator(actorId);
    if (query.from && query.to && new Date(query.from).getTime() >= new Date(query.to).getTime()) {
      throw new BusinessException(
        'INVALID_OPERATION_FILTER',
        '`from` must be earlier than `to`',
        HttpStatus.BAD_REQUEST,
      );
    }

    const filter: OperationBookingListFilter = {
      page: query.page,
      limit: query.limit,
      status: query.status,
      concertId: query.concertId?.trim(),
      userId: query.userId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
    const rows = await this.repository.findBookings(filter);
    const total = rows[0]?.total_count ?? 0;
    return {
      data: rows.map((row) => this.toSummary(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async getBooking(actorId: string, identifier: string): Promise<OperationBookingDetail> {
    await this.requireOperator(actorId);
    const row = await this.repository.findBookingDetail(identifier);
    if (!row) throw new NotFoundException('Booking not found');
    return this.toDetail(row);
  }

  async updateBookingStatus(
    actorId: string,
    identifier: string,
    request: UpdateBookingStatusDto,
  ): Promise<OperationBookingDetail> {
    await this.requireOperator(actorId);
    const reason = request.reason.trim();
    if (!reason) {
      throw new BusinessException('INVALID_OPERATION_FILTER', 'A transition reason is required');
    }
    await this.lifecycleService.transitionByOperation(actorId, identifier, request.status, reason);
    const updated = await this.repository.findBookingDetail(identifier);
    if (!updated) throw new NotFoundException('Booking not found');
    return this.toDetail(updated);
  }

  async createConcert(actorId: string, request: CreateConcertDto) {
    await this.requireOperator(actorId);
    const startsAt = new Date(request.startsAt);
    if (startsAt.getTime() <= Date.now()) {
      throw new BusinessException(
        'CONCERT_NOT_PUBLISHABLE',
        'Concert start time must be in the future',
      );
    }
    try {
      const row = await this.repository.createConcert({
        slug: request.slug.toLowerCase(),
        name: request.name.trim(),
        startsAt,
      });
      return this.toConcert(row);
    } catch (error) {
      if (this.isDatabaseConstraint(error)) {
        throw new BusinessException(
          'CONCERT_SLUG_CONFLICT',
          'Concert slug is already in use',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async createTicketCategory(
    actorId: string,
    concertIdentifier: string,
    request: CreateTicketCategoryDto,
  ) {
    await this.requireOperator(actorId);
    try {
      return this.toTicketCategory(
        await this.repository.createTicketCategory(concertIdentifier.trim(), {
          code: request.code,
          name: request.name.trim(),
          price: request.price.toFixed(2),
          totalQuantity: request.totalQuantity,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'CONCERT_NOT_FOUND') {
        throw new NotFoundException('Concert not found');
      }
      if (error instanceof Error && error.message === 'CONCERT_NOT_EDITABLE') {
        throw new BusinessException(
          'CONCERT_NOT_EDITABLE',
          'Ticket categories can only be added while a concert is DRAFT',
          HttpStatus.CONFLICT,
        );
      }
      if (this.isDatabaseConstraint(error)) {
        throw new BusinessException(
          'TICKET_CATEGORY_CONFLICT',
          'Ticket category code is already used for this concert',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async publishConcert(actorId: string, identifier: string) {
    await this.requireOperator(actorId);
    const published = await this.repository.publishConcert(identifier.trim());
    if (published) return this.toConcert(published);

    const existing = await this.repository.findConcert(identifier.trim());
    if (!existing) throw new NotFoundException('Concert not found');
    throw new BusinessException(
      'CONCERT_NOT_PUBLISHABLE',
      'Concert must be DRAFT, scheduled in the future, and have ticket inventory',
      HttpStatus.CONFLICT,
      { status: existing.status },
    );
  }

  async createVoucher(actorId: string, request: CreateVoucherDto) {
    await this.requireOperator(actorId);
    const startsAt = new Date(request.startsAt);
    const expiresAt = new Date(request.expiresAt);
    if (expiresAt.getTime() <= startsAt.getTime() || expiresAt.getTime() <= Date.now()) {
      throw new BusinessException(
        'VOUCHER_NOT_APPLICABLE',
        'Voucher expiry must be after its start and in the future',
      );
    }
    if (request.discountType === 'PERCENT' && request.discountValue > 100) {
      throw new BusinessException(
        'VOUCHER_NOT_APPLICABLE',
        'Percentage discount cannot exceed 100',
      );
    }
    try {
      return this.toVoucher(
        await this.repository.createVoucher({
          code: request.code.trim().toUpperCase(),
          discountType: request.discountType,
          discountValue: request.discountValue.toFixed(2),
          usageLimit: request.usageLimit,
          startsAt,
          expiresAt,
          applicableConcertId: request.applicableConcertId ?? null,
          applicableTicketCategoryId: request.applicableTicketCategoryId ?? null,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'CONCERT_NOT_FOUND') {
        throw new NotFoundException('Concert not found');
      }
      if (error instanceof Error && error.message === 'TICKET_CATEGORY_NOT_FOUND') {
        throw new NotFoundException('Ticket category not found');
      }
      if (error instanceof Error && error.message === 'VOUCHER_SCOPE_MISMATCH') {
        throw new BusinessException(
          'VOUCHER_NOT_APPLICABLE',
          'Voucher concert and ticket category scopes do not match',
        );
      }
      if (this.isDatabaseConstraint(error)) {
        throw new BusinessException(
          'VOUCHER_CODE_CONFLICT',
          'Voucher code is already in use',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async requireOperator(actorId: string): Promise<void> {
    const role = await this.repository.findRole(actorId);
    if (!role) throw new UnauthorizedException('Operation identity is not recognized');
    if (role !== 'OPERATOR' && role !== 'ADMIN') {
      throw new ForbiddenException('An operator or admin role is required');
    }
  }

  private toSummary(
    row: OperationBookingListRow | OperationBookingDetailRow,
  ): OperationBookingSummary {
    return {
      id: row.id,
      bookingCode: row.booking_code,
      userId: row.user_id,
      concert: { id: row.concert_id, slug: row.concert_slug, name: row.concert_name },
      status: row.status,
      subtotal: row.subtotal,
      discountAmount: row.discount_amount,
      finalAmount: row.final_amount,
      expiresAt: new Date(row.expires_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toDetail(row: OperationBookingDetailRow): OperationBookingDetail {
    return {
      ...this.toSummary(row),
      items: row.items.map((item) => ({
        id: item.id,
        ticketCategoryId: item.ticket_category_id,
        categoryCode: item.category_code,
        categoryName: item.category_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
      })),
      statusHistory: row.status_history.map((entry) => ({
        id: entry.id,
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        changedBy: entry.changed_by,
        changeSource: entry.change_source,
        reason: entry.reason,
        createdAt: new Date(entry.created_at).toISOString(),
      })),
      voucher: row.voucher
        ? {
            code: row.voucher.code,
            status: row.voucher.status,
            redeemedAt: new Date(row.voucher.redeemed_at).toISOString(),
            releasedAt: row.voucher.released_at
              ? new Date(row.voucher.released_at).toISOString()
              : null,
            releasedReason: row.voucher.released_reason,
          }
        : null,
      idempotency: row.idempotency
        ? {
            status: row.idempotency.status,
            responseStatus: row.idempotency.response_status,
            createdAt: new Date(row.idempotency.created_at).toISOString(),
            updatedAt: new Date(row.idempotency.updated_at).toISOString(),
          }
        : null,
    };
  }

  private toConcert(row: {
    id: string;
    slug: string;
    name: string;
    status: string;
    starts_at: Date | string;
  }) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      startsAt: new Date(row.starts_at).toISOString(),
    };
  }

  private toTicketCategory(row: {
    id: string;
    concert_id: string;
    code: string;
    name: string;
    price: string;
    total_quantity: number;
    available_quantity: number;
  }) {
    return {
      id: row.id,
      concertId: row.concert_id,
      code: row.code,
      name: row.name,
      price: row.price,
      totalQuantity: row.total_quantity,
      availableQuantity: row.available_quantity,
    };
  }

  private toVoucher(row: {
    id: string;
    code: string;
    discount_type: string;
    discount_value: string;
    usage_limit: number;
    used_count: number;
    status: string;
    starts_at: Date | string;
    expires_at: Date | string;
    applicable_concert_id: string | null;
    applicable_ticket_category_id: string | null;
  }) {
    return {
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      usageLimit: row.usage_limit,
      usedCount: row.used_count,
      status: row.status,
      startsAt: new Date(row.starts_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      applicableConcertId: row.applicable_concert_id,
      applicableTicketCategoryId: row.applicable_ticket_category_id,
    };
  }

  private isDatabaseConstraint(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; meta?: { code?: string } };
    return (
      candidate.code === '23505' || candidate.code === 'P2002' || candidate.meta?.code === '23505'
    );
  }
}
