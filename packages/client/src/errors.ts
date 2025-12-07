/**
 * Doclo Client Error Classes
 */

import type { RateLimitInfo } from './types.js';

/**
 * Base error class for all Doclo client errors
 */
export class DocloError extends Error {
  /** Error code from the API */
  readonly code: string;
  /** Additional error details */
  readonly details?: Record<string, unknown>;
  /** HTTP status code */
  readonly statusCode?: number;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
    statusCode?: number
  ) {
    super(message);
    this.name = 'DocloError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;

    // Maintains proper stack trace in V8 (Node.js)
    const ErrorConstructor = Error as typeof Error & {
      captureStackTrace?: (target: object, constructor: Function) => void;
    };
    if (ErrorConstructor.captureStackTrace) {
      ErrorConstructor.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Authentication-related errors (401)
 */
export class AuthenticationError extends DocloError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization-related errors (403)
 */
export class AuthorizationError extends DocloError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Resource not found errors (404)
 */
export class NotFoundError extends DocloError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation errors (400)
 */
export class ValidationError extends DocloError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Rate limit exceeded errors (429)
 */
export class RateLimitError extends DocloError {
  /** Rate limit information */
  readonly rateLimitInfo?: RateLimitInfo;

  constructor(
    message: string,
    rateLimitInfo?: RateLimitInfo,
    details?: Record<string, unknown>
  ) {
    super('RATE_LIMIT_EXCEEDED', message, details, 429);
    this.name = 'RateLimitError';
    this.rateLimitInfo = rateLimitInfo;
  }
}

/**
 * Execution-related errors
 */
export class ExecutionError extends DocloError {
  /** The execution ID if available */
  readonly executionId?: string;

  constructor(
    code: string,
    message: string,
    executionId?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'ExecutionError';
    this.executionId = executionId;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends DocloError {
  constructor(message: string = 'Request timed out') {
    super('TIMEOUT', message, undefined, 408);
    this.name = 'TimeoutError';
  }
}

/**
 * Network/connection errors
 */
export class NetworkError extends DocloError {
  constructor(message: string, originalError?: Error) {
    super('NETWORK_ERROR', message, originalError ? { originalError: originalError.message } : undefined);
    this.name = 'NetworkError';
  }
}

/**
 * API key validation error (thrown before making request)
 */
export class InvalidApiKeyError extends DocloError {
  constructor(message: string) {
    super('INVALID_API_KEY_FORMAT', message);
    this.name = 'InvalidApiKeyError';
  }
}

/**
 * Error codes from the Doclo API
 */
export const ErrorCodes = {
  // Authentication
  INVALID_API_KEY: 'INVALID_API_KEY',
  API_KEY_REVOKED: 'API_KEY_REVOKED',
  API_KEY_EXPIRED: 'API_KEY_EXPIRED',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',

  // Resources
  FLOW_NOT_FOUND: 'FLOW_NOT_FOUND',
  EXECUTION_NOT_FOUND: 'EXECUTION_NOT_FOUND',

  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_VARIABLE: 'MISSING_REQUIRED_VARIABLE',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Execution
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED: 'EXECUTION_CANCELLED',

  // Providers
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
