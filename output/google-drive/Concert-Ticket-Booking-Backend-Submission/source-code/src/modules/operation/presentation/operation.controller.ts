import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';

import { requireAuthenticatedUserId } from '../../../shared/http/customer-user';
import { OperationService } from '../application/operation.service';
import { CreateConcertDto } from './dto/create-concert.dto';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { OperationBookingQueryDto } from './dto/operation-booking-query.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

@Controller('admin')
export class OperationController {
  constructor(private readonly operationService: OperationService) {}

  @Get('bookings')
  listBookings(
    @Query() query: OperationBookingQueryDto,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService.listBookings(requireAuthenticatedUserId(actorHeader), query);
  }

  @Get('bookings/:id')
  getBooking(
    @Param('id') identifier: string,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService
      .getBooking(requireAuthenticatedUserId(actorHeader), identifier)
      .then((data) => ({ data }));
  }

  @Patch('bookings/:id/status')
  updateBookingStatus(
    @Param('id') identifier: string,
    @Body() request: UpdateBookingStatusDto,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService
      .updateBookingStatus(requireAuthenticatedUserId(actorHeader), identifier, request)
      .then((data) => ({ data }));
  }

  @Post('concerts')
  createConcert(
    @Body() request: CreateConcertDto,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService
      .createConcert(requireAuthenticatedUserId(actorHeader), request)
      .then((data) => ({ data }));
  }

  @Post('concerts/:id/ticket-categories')
  createTicketCategory(
    @Param('id') identifier: string,
    @Body() request: CreateTicketCategoryDto,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService
      .createTicketCategory(requireAuthenticatedUserId(actorHeader), identifier, request)
      .then((data) => ({ data }));
  }

  @Post('concerts/:id/publish')
  publishConcert(
    @Param('id') identifier: string,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService
      .publishConcert(requireAuthenticatedUserId(actorHeader), identifier)
      .then((data) => ({ data }));
  }

  @Post('vouchers')
  createVoucher(
    @Body() request: CreateVoucherDto,
    @Headers('x-user-id') actorHeader: string | undefined,
  ) {
    return this.operationService
      .createVoucher(requireAuthenticatedUserId(actorHeader), request)
      .then((data) => ({ data }));
  }
}
