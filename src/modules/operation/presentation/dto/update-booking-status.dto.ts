import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBookingStatusDto {
  @IsIn(['CONFIRMED', 'EXPIRED', 'CANCELLED'])
  status!: 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
