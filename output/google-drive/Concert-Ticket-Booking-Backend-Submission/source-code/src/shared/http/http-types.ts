export interface HttpRequestLike {
  method: string;
  url: string;
  originalUrl?: string;
  baseUrl?: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export interface HttpResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponseLike;
  json(body: unknown): HttpResponseLike;
}
