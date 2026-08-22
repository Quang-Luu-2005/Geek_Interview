import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../concert/presentation/dto/pagination-query.dto';

export class OperationBookingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['RESERVED', 'CONFIRMED', 'EXPIRED', 'CANCELLED'])
  status?: 'RESERVED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  concertId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
