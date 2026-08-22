import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsString,
} from 'class-validator';

export class CreateVoucherDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;

  @IsIn(['PERCENT', 'FIXED'])
  discountType!: 'PERCENT' | 'FIXED';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  discountValue!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  usageLimit!: number;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  expiresAt!: string;

  @IsOptional()
  @IsUUID()
  applicableConcertId?: string;

  @IsOptional()
  @IsUUID()
  applicableTicketCategoryId?: string;
}
