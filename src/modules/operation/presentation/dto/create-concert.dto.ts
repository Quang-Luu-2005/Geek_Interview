import { IsISO8601, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateConcertDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MinLength(3)
  @MaxLength(100)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsISO8601()
  startsAt!: string;
}
