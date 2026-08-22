import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ConcertBookingRepository } from '../../concert/infrastructure/concert-booking.repository';
import { InventoryReservationRepository } from '../../inventory/infrastructure/inventory-reservation.repository';
import { VoucherReservationRepository } from '../../voucher/infrastructure/voucher-reservation.repository';
import { BusinessException } from '../../../shared/errors/business.exception';
import {
  centsToDecimal,
  decimalToCents,
  percentageDiscountCents,
} from '../../../shared/money/money';
import { withTransaction } from '../../../shared/database/transaction';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BookingResponse } from './booking-read.service';
import { BookingWriteRepository } from '../infrastructure/booking-write.repository';
import { CreateBookingDto } from '../presentation/dto/create-booking.dto';

const RESERVATION_TTL_MS = 10 * 60 * 1000;

interface NormalizedItem {
  ticketCategoryId: string;
  quantity: number;
}

@Injectable()
export class CreateBookingService {
  constructor(
    private readonly database: PrismaService,
    private readonly concertRepository: ConcertBookingRepository,
    private readonly inventoryRepository: InventoryReservationRepository,
    private readonly voucherRepository: VoucherReservationRepository,
    private readonly bookingRepository: BookingWriteRepository,
  ) {}

  async execute(userId: string, request: CreateBookingDto): Promise<BookingResponse> {
    const items = this.normalizeItems(request.items);
    const concertIdentifier = request.concertId.trim();
    const voucherCode = request.voucherCode?.trim().toUpperCase();

    return withTransaction(
      this.database,
      async (transaction) => {
        if (!(await this.bookingRepository.customerExists(transaction, userId))) {
          throw new BusinessException(
            'CUSTOMER_NOT_FOUND',
            'Customer identity is not recognized',
            HttpStatus.UNAUTHORIZED,
          );
        }

        const concert = await this.concertRepository.findByIdentifier(
          transaction,
          concertIdentifier,
        );
        const now = new Date();
        if (
          !concert ||
          concert.status !== 'PUBLISHED' ||
          new Date(concert.starts_at).getTime() <= now.getTime()
        ) {
          throw new BusinessException(
            'CONCERT_NOT_BOOKABLE',
            'Concert is not published or has already started',
            HttpStatus.CONFLICT,
          );
        }

        const categoryIds = items.map((item) => item.ticketCategoryId);
        const categories = await this.inventoryRepository.findCategoriesForConcert(
          transaction,
          concert.id,
          categoryIds,
        );
        if (categories.length !== categoryIds.length) {
          const found = new Set(categories.map((category) => category.id));
          const missing = categoryIds.filter((categoryId) => !found.has(categoryId));
          throw new BusinessException(
            'INVALID_ITEM',
            'Ticket category is invalid for this concert',
            HttpStatus.BAD_REQUEST,
            {
              ticketCategoryIds: missing,
            },
          );
        }

        const categoryById = new Map(categories.map((category) => [category.id, category]));
        let subtotalCents = 0n;
        const bookingItems = [];

        for (const item of items) {
          const category = categoryById.get(item.ticketCategoryId);
          if (!category) {
            throw new BusinessException(
              'INVALID_ITEM',
              'Ticket category is invalid for this concert',
            );
          }

          const reservation = await this.inventoryRepository.reserve(
            transaction,
            item.ticketCategoryId,
            item.quantity,
          );
          if (!reservation) {
            throw new BusinessException(
              'INSUFFICIENT_TICKET_INVENTORY',
              'Requested ticket quantity is no longer available',
              HttpStatus.CONFLICT,
              { ticketCategoryId: item.ticketCategoryId },
            );
          }

          const unitPriceCents = decimalToCents(category.price);
          const lineTotalCents = unitPriceCents * BigInt(item.quantity);
          subtotalCents += lineTotalCents;
          bookingItems.push({
            itemId: randomUUID(),
            category,
            quantity: item.quantity,
            unitPrice: centsToDecimal(unitPriceCents),
            lineTotal: centsToDecimal(lineTotalCents),
          });
        }

        let discountCents = 0n;
        let reservedVoucher: Awaited<ReturnType<VoucherReservationRepository['reserve']>> | null =
          null;
        if (voucherCode) {
          try {
            reservedVoucher = await this.voucherRepository.reserve(
              transaction,
              voucherCode,
              userId,
            );
          } catch (error) {
            if (error instanceof Error && error.message === 'VOUCHER_ALREADY_REDEEMED') {
              throw new BusinessException(
                'VOUCHER_ALREADY_REDEEMED',
                'Voucher has already been redeemed by this customer',
                HttpStatus.CONFLICT,
              );
            }
            if (!(error instanceof Error) || error.message !== 'VOUCHER_NOT_APPLICABLE') {
              throw error;
            }
            throw new BusinessException(
              'VOUCHER_NOT_APPLICABLE',
              'Voucher is invalid, expired, disabled, or exhausted',
              HttpStatus.CONFLICT,
            );
          }

          discountCents =
            reservedVoucher.discount_type === 'PERCENT'
              ? percentageDiscountCents(subtotalCents, reservedVoucher.discount_value)
              : decimalToCents(reservedVoucher.discount_value);
          if (discountCents > subtotalCents) discountCents = subtotalCents;
        }

        const finalCents = subtotalCents - discountCents;
        const bookingId = randomUUID();
        const bookingCode = `BK-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
        const booking = await this.bookingRepository.insertBooking(transaction, {
          id: bookingId,
          bookingCode,
          userId,
          concertId: concert.id,
          subtotal: centsToDecimal(subtotalCents),
          discountAmount: centsToDecimal(discountCents),
          finalAmount: centsToDecimal(finalCents),
          expiresAt,
        });

        await this.bookingRepository.insertItems(
          transaction,
          bookingItems.map((item) => ({
            id: item.itemId,
            bookingId,
            categoryId: item.category.id,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
        );
        await this.bookingRepository.insertStatusHistory(transaction, bookingId, userId);
        if (reservedVoucher) {
          await this.voucherRepository.insertRedemption(
            transaction,
            reservedVoucher.id,
            userId,
            bookingId,
          );
        }

        return {
          id: booking.id,
          bookingCode: booking.booking_code,
          concert: { id: concert.id, slug: concert.slug, name: concert.name },
          status: booking.status,
          subtotal: booking.subtotal,
          discountAmount: booking.discount_amount,
          finalAmount: booking.final_amount,
          expiresAt: new Date(booking.expires_at).toISOString(),
          createdAt: new Date(booking.created_at).toISOString(),
          updatedAt: new Date(booking.updated_at).toISOString(),
          items: bookingItems.map((item) => ({
            id: item.itemId,
            ticketCategoryId: item.category.id,
            categoryCode: item.category.code,
            categoryName: item.category.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
        };
      },
      { maxAttempts: 3 },
    );
  }

  private normalizeItems(
    requestItems: readonly { ticketCategoryId: string; quantity: number }[],
  ): NormalizedItem[] {
    const items = requestItems.map((item) => ({
      ticketCategoryId: item.ticketCategoryId.trim(),
      quantity: item.quantity,
    }));
    const invalidQuantity = items.find(
      (item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10,
    );
    if (invalidQuantity) {
      throw new BusinessException(
        'INVALID_ITEM',
        'Ticket quantity must be between 1 and 10',
        HttpStatus.BAD_REQUEST,
        { ticketCategoryId: invalidQuantity.ticketCategoryId },
      );
    }

    const duplicate = items.find(
      (item, index) =>
        items.findIndex((candidate) => candidate.ticketCategoryId === item.ticketCategoryId) !==
        index,
    );
    if (duplicate) {
      throw new BusinessException(
        'INVALID_ITEM',
        'Each ticket category may appear only once per booking',
        HttpStatus.BAD_REQUEST,
        { ticketCategoryId: duplicate.ticketCategoryId },
      );
    }

    return items.sort((left, right) =>
      left.ticketCategoryId.localeCompare(right.ticketCategoryId, 'en'),
    );
  }
}
