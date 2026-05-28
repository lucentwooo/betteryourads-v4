export type Stage = "extract" | "brand" | "ad-prompt" | "render" | "validation" | "auth" | "persistence" | "concepts";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly stage: Stage,
  ) {
    super(message);
    this.name = code;
  }
}

export class ExtractionError extends AppError {
  constructor(message: string) {
    super(message, "EXTRACTION_ERROR", 502, "extract");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 422, "validation");
  }
}

export class OpenRouterError extends AppError {
  constructor(message: string, stage: Stage = "brand") {
    super(message, "OPENROUTER_ERROR", 502, stage);
  }
}

export class KieError extends AppError {
  constructor(message: string) {
    super(message, "KIE_ERROR", 502, "render");
  }
}

export class PersistenceError extends AppError {
  constructor(message: string) {
    super(message, "PERSISTENCE_ERROR", 500, "persistence");
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super(message, "AUTH_REQUIRED", 401, "auth");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, "NOT_APPROVED", 403, "auth");
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, "RATE_LIMITED", 429, "render");
  }
}

export interface HttpError {
  status: number;
  body: { error: { code: string; message: string; stage?: Stage } };
}

export function toHttpError(err: unknown): HttpError {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, stage: err.stage } } };
  }
  // Never leak arbitrary internals to the client.
  return { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error." } } };
}
