import { apiErrorCodes, type ApiErrorCode } from "@kap-exam/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  [apiErrorCodes.badRequest]: 400,
  [apiErrorCodes.unauthorized]: 401,
  [apiErrorCodes.forbidden]: 403,
  [apiErrorCodes.notFound]: 404,
  [apiErrorCodes.conflict]: 409,
  [apiErrorCodes.windowClosed]: 410,
  [apiErrorCodes.attemptLocked]: 423,
  [apiErrorCodes.alreadySubmitted]: 409,
  [apiErrorCodes.rateLimited]: 429,
  [apiErrorCodes.internal]: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;
  readonly fields?: Record<string, string[]>;

  constructor(code: ApiErrorCode, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = fields;
  }
}

export function badRequest(message: string, fields?: Record<string, string[]>) {
  return new ApiError(apiErrorCodes.badRequest, message, fields);
}
export function unauthorized(message = "Sign in required") {
  return new ApiError(apiErrorCodes.unauthorized, message);
}
export function forbidden(message = "Not allowed") {
  return new ApiError(apiErrorCodes.forbidden, message);
}
export function notFound(message = "Not found") {
  return new ApiError(apiErrorCodes.notFound, message);
}

/** Errors raised for endpoints that exist but are not implemented yet. */
export function notImplemented(area: string) {
  return new ApiError(apiErrorCodes.internal, `${area} is not implemented yet`);
}
