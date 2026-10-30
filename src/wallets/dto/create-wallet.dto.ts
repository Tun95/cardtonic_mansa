import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, Matches } from 'class-validator';

const clean = (value: unknown): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateWalletDto {
  @ApiPropertyOptional({ example: 'ada@example.com' })
  @IsOptional()
  @Transform(({ value }) => {
    const v = clean(value);
    return typeof v === 'string' ? v.toLowerCase() : v;
  })
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'E.164 format' })
  @IsOptional()
  @Transform(({ value }) => {
    const v = clean(value);
    return typeof v === 'string' ? v.replace(/[\s\-()]/g, '') : v;
  })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be in E.164 format, e.g. +2348012345678' })
  phone?: string;
}
