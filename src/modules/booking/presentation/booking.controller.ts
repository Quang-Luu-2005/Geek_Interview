import { Controller, Get, Headers, Param, Query } from '@nestjs/common';

import { requireCustomerUserId } from '../../../shared/http/customer-user';
import { BookingReadService } from '../application/booking-read.service';
import { PaginationQueryDto } from '../../concert/presentation/dto/pagination-query.dto';

@Controller()
export class BookingController {
  constructor(private readonly bookingReadService: BookingReadService) {}

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
