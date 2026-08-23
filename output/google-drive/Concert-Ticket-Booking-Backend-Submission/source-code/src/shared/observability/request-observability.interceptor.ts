import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, Observable, tap, throwError } from 'rxjs';

import type { HttpRequestLike, HttpResponseLike } from '../http/http-types';
import { ObservabilityService } from './observability.service';
import { resolveRequestId } from './request-id.middleware';

type RequestWithId = HttpRequestLike;

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<HttpResponseLike>();
    const requestId = request.requestId ?? resolveRequestId(request.headers['x-request-id']);
    request.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);
    const startedAt = performance.now();
    const method = request.method;
    const route = request.route?.path
      ? `${request.baseUrl ?? ''}${request.route.path}`
      : (request.originalUrl ?? request.url);

    return next.handle().pipe(
      tap(() => {
        this.record(request.requestId, method, route, response.statusCode, startedAt);
      }),
      catchError((error: unknown) => {
        const statusCode = this.statusCode(error);
        this.record(request.requestId, method, route, statusCode, startedAt);
        return throwError(() => error);
      }),
    );
  }

  private record(
    requestId: string | undefined,
    method: string,
    route: string,
    statusCode: number,
    startedAt: number,
  ): void {
    this.observability.recordRequest(
      method,
      route,
      statusCode,
      performance.now() - startedAt,
      requestId,
    );
  }

  private statusCode(error: unknown): number {
    if (typeof error === 'object' && error !== null && 'getStatus' in error) {
      const getStatus = (error as { getStatus?: unknown }).getStatus;
      if (typeof getStatus === 'function') return getStatus.call(error) as number;
    }
    return 500;
  }
}
