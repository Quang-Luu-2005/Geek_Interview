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
  | 'BOOKING_NOT_CONFIRMABLE'
  | 'BOOKING_NOT_EXPIRED'
  | 'BOOKING_NOT_CANCELLABLE'
  | 'BOOKING_NOT_TRANSITIONABLE'
  | 'INVALID_OPERATION_FILTER'
  | 'CONCERT_SLUG_CONFLICT'
  | 'CONCERT_NOT_FOUND'
  | 'CONCERT_NOT_PUBLISHABLE'
  | 'CONCERT_NOT_EDITABLE'
  | 'TICKET_CATEGORY_CONFLICT'
  | 'VOUCHER_CODE_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_REQUEST_IN_PROGRESS'
  | 'IDEMPOTENCY_RESULT_UNAVAILABLE'
  | 'RATE_LIMITED';

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
