import { randomUUID } from 'node:crypto';

import type { HttpRequestLike, HttpResponseLike } from '../http/http-types';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (candidate && candidate.length <= MAX_REQUEST_ID_LENGTH && SAFE_REQUEST_ID.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export function requestIdMiddleware(
  request: HttpRequestLike,
  response: HttpResponseLike,
  next: () => void,
): void {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  request.requestId = requestId;
  response.setHeader('X-Request-ID', requestId);
  next();
}
