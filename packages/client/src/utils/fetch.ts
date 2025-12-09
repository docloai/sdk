/**
 * HTTP utilities for the Doclo client
 */

import type { RequestOptions, RateLimitInfo, ApiErrorResponse } from '../types.js';
import {
  DocloError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from '../errors.js';

/**
 * Default base URL for the Doclo API
 */
export const DEFAULT_BASE_URL = 'https://app.doclo.ai';

/**
 * Default request timeout (5 minutes)
 */
export const DEFAULT_TIMEOUT = 300000;

/**
 * Maximum response size (10 MB)
 */
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/**
 * Fields that should be redacted in debug logs
 */
const SENSITIVE_FIELDS = ['base64', 'apiKey', 'secret', 'password', 'token'];

/**
 * Sanitize an object for safe logging by redacting sensitive fields
 */
function sanitizeForLogging(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Redact sensitive fields
      if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        if (typeof value === 'string') {
          sanitized[key] = `[REDACTED ${value.length} chars]`;
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Safely parse an integer from a header value with bounds checking
 */
function safeParseInt(value: string, min: number, max: number): number | undefined {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    return undefined;
  }
  return parsed;
}

/**
 * Parse rate limit headers from response
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limitStr = headers.get('X-RateLimit-Limit');
  const remainingStr = headers.get('X-RateLimit-Remaining');
  const resetStr = headers.get('X-RateLimit-Reset');
  const retryAfterStr = headers.get('Retry-After');

  if (!limitStr || !remainingStr || !resetStr) {
    return undefined;
  }

  // Parse with validation - limit to reasonable bounds
  const limit = safeParseInt(limitStr, 0, 1_000_000);
  const remaining = safeParseInt(remainingStr, 0, 1_000_000);
  const reset = safeParseInt(resetStr, 0, 2_000_000_000); // Unix timestamp until ~2033

  // If any required value is invalid, return undefined
  if (limit === undefined || remaining === undefined || reset === undefined) {
    return undefined;
  }

  // Parse optional retry-after with bounds
  const retryAfter = retryAfterStr
    ? safeParseInt(retryAfterStr, 0, 86400) // Max 24 hours
    : undefined;

  return {
    limit,
    remaining,
    reset,
    retryAfter,
  };
}

/**
 * Build query string from parameters
 */
export function buildQueryString(
  params?: Record<string, string | number | boolean | undefined>
): string {
  if (!params) return '';

  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null
  );

  if (entries.length === 0) return '';

  const queryString = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return `?${queryString}`;
}

/**
 * Map API error response to typed error
 */
function mapApiError(
  statusCode: number,
  errorResponse: ApiErrorResponse,
  rateLimitInfo?: RateLimitInfo
): DocloError {
  const { code, message, details } = errorResponse.error;

  switch (statusCode) {
    case 401:
      return new AuthenticationError(code, message, details);

    case 403:
      return new AuthorizationError(code, message, details);

    case 404:
      return new NotFoundError(code, message, details);

    case 400:
    case 422:
      return new ValidationError(code, message, details);

    case 429:
      return new RateLimitError(message, rateLimitInfo, details);

    default:
      return new DocloError(code, message, details, statusCode);
  }
}

/**
 * Make an HTTP request to the Doclo API
 */
export async function docloFetch<T>(
  baseUrl: string,
  apiKey: string,
  options: RequestOptions
): Promise<T> {
  const { method, path, body, query, timeout = DEFAULT_TIMEOUT } = options;

  // Build full URL
  const queryString = buildQueryString(query as Record<string, string | number | undefined>);
  const url = `${baseUrl}/api/v1${path}${queryString}`;

  // Setup abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build headers
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Debug logging
    const debugEnabled = typeof globalThis !== 'undefined' &&
      (globalThis as { process?: { env?: { DEBUG_CLIENT?: string } } }).process?.env?.DEBUG_CLIENT;
    if (debugEnabled) {
      console.log(`[DEBUG] ${method} ${url}`);
      if (body) {
        // Sanitize body for logging - redact sensitive data
        const sanitizedBody = sanitizeForLogging(body);
        const bodyStr = JSON.stringify(sanitizedBody);
        console.log(`[DEBUG] Body: ${bodyStr.substring(0, 500)}${bodyStr.length > 500 ? '...' : ''}`);
      }
    }

    // Make request
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    // Debug response
    if (debugEnabled) {
      console.log(`[DEBUG] Response: ${response.status} ${response.statusText}`);
    }

    // Parse rate limit headers
    const rateLimitInfo = parseRateLimitHeaders(response.headers);

    // Check response size from Content-Length header
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > MAX_RESPONSE_SIZE) {
        throw new DocloError(
          'RESPONSE_TOO_LARGE',
          `Response size (${size} bytes) exceeds maximum allowed (${MAX_RESPONSE_SIZE} bytes)`,
          undefined,
          413
        );
      }
    }

    // Handle non-OK responses
    if (!response.ok) {
      let errorResponse: ApiErrorResponse;

      try {
        const responseText = await response.text();
        if (debugEnabled) {
          console.log(`[DEBUG] Error body: ${responseText.substring(0, 1000)}`);
        }
        errorResponse = JSON.parse(responseText) as ApiErrorResponse;
      } catch {
        // If response isn't valid JSON, create generic error
        errorResponse = {
          error: {
            code: 'UNKNOWN_ERROR',
            message: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      throw mapApiError(response.status, errorResponse, rateLimitInfo);
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return undefined as T;
    }

    // Parse JSON response
    const data = await response.json() as T;
    return data;

  } catch (error) {
    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${timeout}ms`);
    }

    // Re-throw Doclo errors
    if (error instanceof DocloError) {
      throw error;
    }

    // Wrap other errors as network errors
    throw new NetworkError(
      error instanceof Error ? error.message : 'Unknown network error',
      error instanceof Error ? error : undefined
    );

  } finally {
    clearTimeout(timeoutId);
  }
}
