import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTicketCategoryDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,30}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  totalQuantity!: number;
}
