import { HttpException, HttpStatus } from '@nestjs/common';

export type BusinessErrorCode =
  | 'CUSTOMER_NOT_FOUND'
  | 'INVALID_ITEM'
  | 'CONCERT_NOT_BOOKABLE'
  | 'INSUFFICIENT_TICKET_INVENTORY'
  | 'VOUCHER_NOT_APPLICABLE'
  | 'VOUCHER_NOT_STARTED'
  | 'VOUCHER_EXPIRED'
  | 'VOUCHER_EXHAUSTED'
  | 'VOUCHER_ALREADY_REDEEMED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_REQUEST_IN_PROGRESS'
  | 'IDEMPOTENCY_RESULT_UNAVAILABLE';

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
