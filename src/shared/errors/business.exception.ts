import { HttpException, HttpStatus } from '@nestjs/common';

export type BusinessErrorCode =
  | 'CUSTOMER_NOT_FOUND'
  | 'INVALID_ITEM'
  | 'CONCERT_NOT_BOOKABLE'
  | 'INSUFFICIENT_TICKET_INVENTORY'
  | 'VOUCHER_NOT_APPLICABLE'
  | 'VOUCHER_ALREADY_REDEEMED';

export class BusinessException extends HttpException {
  constructor(
    code: BusinessErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, ...(details ? { details } : {}) }, status);
  }
}
