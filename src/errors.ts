/**
 * alphainfo — Exception hierarchy (parity with Python SDK).
 *
 * All errors inherit from `AlphaInfoError` for a single catch-all point.
 * Use `instanceof` to discriminate — these classes use normal prototypal
 * inheritance, so the checks work across module boundaries.
 */

export class AlphaInfoError extends Error {
  readonly statusCode?: number;
  readonly responseData?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { statusCode?: number; responseData?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "AlphaInfoError";
    this.statusCode = options?.statusCode;
    this.responseData = options?.responseData;
    // Restore prototype chain (TypeScript/Babel subclassing quirk).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Invalid or missing API key (HTTP 401). Not retryable. Obtain a valid
 * key at https://alphainfo.io/register.
 */
export class AuthError extends AlphaInfoError {
  constructor(
    message?: string,
    options?: { statusCode?: number; responseData?: Record<string, unknown> },
  ) {
    super(
      message ??
        "Invalid or missing API key. Get a free key at " +
          "https://alphainfo.io/register and pass it as " +
          "new AlphaInfo({ apiKey: 'ai_...' }).",
      options,
    );
    this.name = "AuthError";
  }
}

/**
 * Rate or quota limit exceeded (HTTP 429). The SDK does not auto-retry
 * in the Node/browser client by default — callers should respect
 * `retryAfter` (seconds) and back off.
 */
export class RateLimitError extends AlphaInfoError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    options?: {
      retryAfter?: number;
      statusCode?: number;
      responseData?: Record<string, unknown>;
    },
  ) {
    super(message, options);
    this.name = "RateLimitError";
    this.retryAfter = options?.retryAfter;
  }
}

/**
 * Request validation failed (HTTP 400/413/422). Not retryable — fix the
 * input. Typical causes: signal too short, bad sampling_rate, NaN/Inf,
 * payload too large for your plan.
 */
export class ValidationError extends AlphaInfoError {
  constructor(
    message: string,
    options?: { statusCode?: number; responseData?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = "ValidationError";
  }
}

/**
 * Resource not found (HTTP 404). Raised by `auditReplay(id)` when the
 * analysis id does not exist or belongs to another API key.
 */
export class NotFoundError extends AlphaInfoError {
  constructor(
    message: string,
    options?: { statusCode?: number; responseData?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = "NotFoundError";
  }
}

/**
 * Server-side API error (HTTP 5xx).
 */
export class APIError extends AlphaInfoError {
  constructor(
    message: string,
    options?: { statusCode?: number; responseData?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = "APIError";
  }
}

/**
 * Network-level failure — DNS, TCP, TLS, or fetch aborted.
 */
export class NetworkError extends AlphaInfoError {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}
