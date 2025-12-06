/**
 * Error Sanitization Module
 *
 * Provides utilities for sanitizing error messages to prevent information leakage
 * in production environments.
 *
 * @module @docloai/core/security/error-sanitizer
 */

import { isProduction, getEnv } from '../runtime/env.js';

export interface ErrorSanitizerOptions {
  /** Whether to sanitize error messages for production (default: false) */
  productionMode?: boolean;
  /** Include error codes in sanitized messages (default: true) */
  includeErrorCode?: boolean;
  /** Custom error mapping for specific error messages */
  customMappings?: Map<string, string>;
}

/**
 * Default sanitized error messages for common security errors
 */
const SANITIZED_ERRORS = {
  // SSRF errors
  BLOCKED_INTERNAL_IP: 'Security validation failed: Blocked request',
  BLOCKED_METADATA_SERVICE: 'Security validation failed: Blocked request',
  BLOCKED_LOOPBACK: 'Security validation failed: Blocked request',
  INVALID_URL_PROTOCOL: 'Security validation failed: Invalid protocol',

  // Path traversal errors
  PATH_TRAVERSAL: 'Security validation failed: Invalid path',
  PATH_OUTSIDE_BASE: 'Security validation failed: Access denied',

  // Resource limit errors
  FILE_SIZE_EXCEEDED: 'Resource limit exceeded',
  JSON_DEPTH_EXCEEDED: 'Resource limit exceeded',
  TIMEOUT_EXCEEDED: 'Request timeout',

  // Generic fallback
  GENERIC_SECURITY_ERROR: 'Security validation failed'
};

/**
 * Error code mapping for consistent error identification
 */
export enum SecurityErrorCode {
  SSRF_BLOCKED = 'SSRF_001',
  PATH_TRAVERSAL = 'PATH_001',
  RESOURCE_LIMIT = 'LIMIT_001',
  VALIDATION_FAILED = 'VAL_001'
}

/**
 * Sanitize an error message for production environments
 *
 * @param error - The original error message or Error object
 * @param options - Sanitization options
 * @returns Sanitized error message safe for production
 *
 * @example
 * ```typescript
 * // Development mode (default)
 * const error = sanitizeError('Blocked internal IP address: 192.168.1.1');
 * // Returns: "Blocked internal IP address: 192.168.1.1"
 *
 * // Production mode
 * const error = sanitizeError(
 *   'Blocked internal IP address: 192.168.1.1',
 *   { productionMode: true }
 * );
 * // Returns: "Security validation failed: Blocked request"
 * ```
 */
export function sanitizeError(
  error: string | Error,
  options: ErrorSanitizerOptions = {}
): string {
  const {
    productionMode = isProduction(),
    includeErrorCode = true,
    customMappings = new Map()
  } = options;

  // In development mode, return original error
  if (!productionMode) {
    return typeof error === 'string' ? error : error.message;
  }

  const message = typeof error === 'string' ? error : error.message;

  // Check custom mappings first
  for (const [pattern, sanitized] of customMappings) {
    if (message.includes(pattern)) {
      return sanitized;
    }
  }

  // Check for known security error patterns
  if (message.includes('Blocked internal IP') ||
      message.includes('Private IP address')) {
    const sanitized = SANITIZED_ERRORS.BLOCKED_INTERNAL_IP;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.SSRF_BLOCKED})`
      : sanitized;
  }

  if (message.includes('metadata service') ||
      message.includes('metadata.google')) {
    const sanitized = SANITIZED_ERRORS.BLOCKED_METADATA_SERVICE;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.SSRF_BLOCKED})`
      : sanitized;
  }

  if (message.includes('loopback') ||
      message.includes('localhost')) {
    const sanitized = SANITIZED_ERRORS.BLOCKED_LOOPBACK;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.SSRF_BLOCKED})`
      : sanitized;
  }

  if (message.includes('Path traversal') ||
      message.includes('../')) {
    const sanitized = SANITIZED_ERRORS.PATH_TRAVERSAL;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.PATH_TRAVERSAL})`
      : sanitized;
  }

  if (message.includes('outside the base directory')) {
    const sanitized = SANITIZED_ERRORS.PATH_OUTSIDE_BASE;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.PATH_TRAVERSAL})`
      : sanitized;
  }

  if (message.includes('exceeds maximum allowed size') ||
      message.includes('File size')) {
    const sanitized = SANITIZED_ERRORS.FILE_SIZE_EXCEEDED;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.RESOURCE_LIMIT})`
      : sanitized;
  }

  if (message.includes('JSON nesting depth exceeds')) {
    const sanitized = SANITIZED_ERRORS.JSON_DEPTH_EXCEEDED;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.RESOURCE_LIMIT})`
      : sanitized;
  }

  if (message.includes('timeout') ||
      message.includes('Timeout')) {
    const sanitized = SANITIZED_ERRORS.TIMEOUT_EXCEEDED;
    return includeErrorCode
      ? `${sanitized} (${SecurityErrorCode.RESOURCE_LIMIT})`
      : sanitized;
  }

  // Default sanitization for unknown errors
  const sanitized = SANITIZED_ERRORS.GENERIC_SECURITY_ERROR;
  return includeErrorCode
    ? `${sanitized} (${SecurityErrorCode.VALIDATION_FAILED})`
    : sanitized;
}

/**
 * Create a sanitized Error object with safe message
 *
 * @param error - The original error
 * @param options - Sanitization options
 * @returns New Error object with sanitized message
 */
export function createSanitizedError(
  error: Error,
  options: ErrorSanitizerOptions = {}
): Error {
  const sanitizedMessage = sanitizeError(error, options);
  const sanitizedError = new Error(sanitizedMessage);

  // Preserve error name and code if present
  sanitizedError.name = error.name;
  if ('code' in error) {
    (sanitizedError as any).code = (error as any).code;
  }

  // In development, preserve original stack trace
  if (!options.productionMode && !isProduction()) {
    sanitizedError.stack = error.stack;
  }

  return sanitizedError;
}

/**
 * Security event logger for monitoring purposes
 *
 * @param event - The security event type
 * @param details - Event details (will be sanitized in production)
 * @param options - Logging options
 */
export function logSecurityEvent(
  event: 'SSRF_ATTEMPT' | 'PATH_TRAVERSAL_ATTEMPT' | 'RESOURCE_LIMIT_HIT',
  details: Record<string, any>,
  options: ErrorSanitizerOptions = {}
): void {
  const { productionMode = isProduction() } = options;

  // In production, sanitize details
  const logDetails = productionMode
    ? { event, timestamp: new Date().toISOString() }
    : { event, timestamp: new Date().toISOString(), ...details };

  // Log to console in development, or to monitoring service in production
  const securityLogEndpoint = getEnv('SECURITY_LOG_ENDPOINT');
  if (productionMode && securityLogEndpoint) {
    // TODO: Send to monitoring service
    // fetch(securityLogEndpoint, {
    //   method: 'POST',
    //   body: JSON.stringify(logDetails)
    // }).catch(() => {});
  } else {
    console.warn('[SECURITY]', logDetails);
  }
}