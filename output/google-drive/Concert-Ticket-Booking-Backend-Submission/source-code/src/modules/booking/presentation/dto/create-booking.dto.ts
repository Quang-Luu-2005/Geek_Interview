import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateBookingItemDto {
  @IsUUID()
  ticketCategoryId!: string;

  @Type(() => Number)
  @IsInt()
  quantity!: number;
}

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  concertId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateBookingItemDto)
  items!: CreateBookingItemDto[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  voucherCode?: string;
}
