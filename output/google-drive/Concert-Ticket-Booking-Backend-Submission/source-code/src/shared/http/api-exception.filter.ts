import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { ObservabilityService } from '../observability/observability.service';
import type { HttpRequestLike, HttpResponseLike } from './http-types';
import { resolveRequestId } from '../observability/request-id.middleware';

type RequestWithId = HttpRequestLike;

interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  traceId: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Optional() private readonly observability?: ObservabilityService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<HttpResponseLike>();
    const status = this.status(exception);
    const traceId = request.requestId ?? resolveRequestId(undefined);
    const payload = this.toPayload(exception, status, traceId);

    response.status(status);
    response.setHeader('X-Request-ID', traceId);
    response.json(payload);
    this.observability?.log('http.request.error', {
      requestId: traceId,
      method: request.method,
      route: (request.originalUrl ?? request.url).split('?')[0],
      statusCode: status,
      code: payload.code,
    });
  }

  private status(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toPayload(exception: unknown, status: number, traceId: string): ErrorResponse {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (this.isApiError(response)) {
        return { ...response, traceId };
      }

      if (status === 400 && this.isValidationResponse(response)) {
        return {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { messages: response.message },
          traceId,
        };
      }

      const message = this.httpMessage(response, status);
      return {
        code: this.defaultCode(status),
        message,
        traceId,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      traceId,
    };
  }

  private isApiError(value: unknown): value is Omit<ErrorResponse, 'traceId'> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'code' in value &&
      typeof (value as { code?: unknown }).code === 'string' &&
      'message' in value &&
      typeof (value as { message?: unknown }).message === 'string'
    );
  }

  private isValidationResponse(
    value: unknown,
  ): value is { message: string[] | string; error?: string; statusCode?: number } {
    return (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as { message?: unknown }).message)
    );
  }

  private httpMessage(response: string | object, status: number): string {
    if (typeof response === 'string') return response;
    if ('message' in response && typeof response.message === 'string') return response.message;
    if ('message' in response && Array.isArray(response.message)) {
      return 'Request validation failed';
    }
    return HttpStatus[status] ?? 'Request failed';
  }

  private defaultCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
    }
  }
}
