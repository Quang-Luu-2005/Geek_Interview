import { UnauthorizedException } from '@nestjs/common';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Temporary development identity until the authentication task adds a real
 * access-token guard. Keeping the check in one place prevents booking reads
 * from accidentally becoming public endpoints.
 */
export function requireCustomerUserId(headerValue?: string): string {
  return requireAuthenticatedUserId(headerValue);
}

export function requireAuthenticatedUserId(headerValue?: string): string {
  const userId = headerValue?.trim();

  if (!userId || !UUID_PATTERN.test(userId)) {
    throw new UnauthorizedException('A valid x-user-id header is required');
  }

  return userId;
}
