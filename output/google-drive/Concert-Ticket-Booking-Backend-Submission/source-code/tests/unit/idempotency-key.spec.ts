import { HttpException } from '@nestjs/common';

import { requireIdempotencyKey } from '../../src/shared/http/idempotency-key';

describe('Idempotency-Key validation', () => {
  it('requires a non-empty printable key and trims it', () => {
    expect(requireIdempotencyKey('  checkout-123  ')).toBe('checkout-123');
    expect(() => requireIdempotencyKey()).toThrow(HttpException);
    expect(() => requireIdempotencyKey('   ')).toThrow(HttpException);
  });

  it('rejects control characters and oversized keys', () => {
    expect(() => requireIdempotencyKey('bad\nkey')).toThrow(HttpException);
    expect(() => requireIdempotencyKey('x'.repeat(256))).toThrow(HttpException);
  });
});
