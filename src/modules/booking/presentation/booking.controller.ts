import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';

import { requireCustomerUserId } from '../../../shared/http/customer-user';
import { requireIdempotencyKey } from '../../../shared/http/idempotency-key';
import { BookingReadService } from '../application/booking-read.service';
import { CreateBookingService } from '../application/create-booking.service';
import { BookingLifecycleService } from '../application/booking-lifecycle.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaginationQueryDto } from '../../concert/presentation/dto/pagination-query.dto';

@Controller()
export class BookingController {
  constructor(
    private readonly bookingReadService: BookingReadService,
    private readonly createBookingService: CreateBookingService,
    private readonly bookingLifecycleService: BookingLifecycleService,
  ) {}

  @Post('bookings')
  create(
    @Body() request: CreateBookingDto,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
  ) {
    const userId = requireCustomerUserId(userIdHeader);
    const idempotencyKey = requireIdempotencyKey(idempotencyKeyHeader);
    return this.createBookingService
      .execute(userId, request, idempotencyKey)
      .then((result) => ({ data: result.booking }));
  }

  @Post('bookings/:id/confirm')
  confirm(@Param('id') identifier: string, @Headers('x-user-id') userIdHeader: string | undefined) {
    const userId = requireCustomerUserId(userIdHeader);
    return this.bookingLifecycleService
      .confirm(userId, identifier)
      .then((booking) => ({ data: booking }));
  }

  @Post('bookings/:id/cancel')
  cancel(@Param('id') identifier: string, @Headers('x-user-id') userIdHeader: string | undefined) {
    const userId = requireCustomerUserId(userIdHeader);
    return this.bookingLifecycleService
      .cancel(userId, identifier)
      .then((booking) => ({ data: booking }));
  }

  @Get('me/bookings')
  listMine(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Query() query: PaginationQueryDto,
  ) {
    const userId = requireCustomerUserId(userIdHeader);
    return this.bookingReadService.listForUser(userId, query.page, query.limit);
  }

  @Get('bookings/:id')
  detail(@Param('id') identifier: string, @Headers('x-user-id') userIdHeader: string | undefined) {
    const userId = requireCustomerUserId(userIdHeader);
    return this.bookingReadService
      .getOwned(userId, identifier)
      .then((booking) => ({ data: booking }));
  }
}
