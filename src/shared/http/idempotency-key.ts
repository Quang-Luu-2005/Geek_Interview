import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '../errors/business.exception';

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export function requireIdempotencyKey(headerValue?: string): string {
  const key = headerValue?.trim();

  if (!key) {
    throw new BusinessException(
      'IDEMPOTENCY_KEY_REQUIRED',
      'The Idempotency-Key header is required for booking creation',
      HttpStatus.BAD_REQUEST,
    );
  }

  const containsControlCharacter = [...key].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH || containsControlCharacter) {
    throw new BusinessException(
      'IDEMPOTENCY_KEY_INVALID',
      `The Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} printable characters`,
      HttpStatus.BAD_REQUEST,
    );
  }

  return key;
}
