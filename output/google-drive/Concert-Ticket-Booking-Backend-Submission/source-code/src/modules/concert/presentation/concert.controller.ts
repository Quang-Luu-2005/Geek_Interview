import { Controller, Get, Param, Query } from '@nestjs/common';

import { ConcertReadService } from '../application/concert-read.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@Controller('concerts')
export class ConcertController {
  constructor(private readonly concertReadService: ConcertReadService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.concertReadService.listPublished(query.page, query.limit);
  }

  @Get(':id/ticket-categories')
  listTicketCategories(@Param('id') identifier: string) {
    return this.concertReadService.getPublishedWithCategories(identifier);
  }

  @Get(':id')
  detail(@Param('id') identifier: string) {
    return this.concertReadService.getPublished(identifier).then((concert) => ({ data: concert }));
  }
}
