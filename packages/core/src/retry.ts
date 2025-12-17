/**
 * @doclo/core - Retry Utilities
 *
 * Shared retry infrastructure for LLM and OCR providers.
 * Includes exponential backoff, circuit breaker pattern, and error classification.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in milliseconds between retries (default: 1000) */
  retryDelay?: number;
  /** Enable exponential backoff (default: true) */
  useExponentialBackoff?: boolean;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay?: number;
}

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 3) */
  threshold?: number;
  /** Time in milliseconds before trying again after circuit opens (default: 30000) */
  resetTimeout?: number;
}

/**
 * Internal state for a circuit breaker
 */
export interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureTime?: number;
  isOpen: boolean;
}

/**
 * Circuit breaker interface
 */
export interface CircuitBreaker {
  /** Check if circuit is currently open (should skip requests) */
  isOpen(): boolean;
  /** Record a successful request (resets failure count) */
  recordSuccess(): void;
  /** Record a failed request (may open circuit) */
  recordFailure(): void;
  /** Get current state for inspection */
  getState(): CircuitBreakerState;
}

/**
 * Options for the withRetry wrapper
 */
export interface WithRetryOptions<T> extends RetryConfig {
  /** Called before each retry attempt (for logging/observability) */
  onRetry?: (attempt: number, error: Error, delay: number) => void | Promise<void>;
  /** Override to parse Retry-After header from response errors */
  getRetryAfter?: (error: Error) => number | undefined;
  /** Circuit breaker to use (optional) */
  circuitBreaker?: CircuitBreaker;
}

// ============================================================================
// Constants
// ============================================================================

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 2,
  retryDelay: 1000,
  useExponentialBackoff: true,
  maxDelay: 30000,
};

/** Default circuit breaker configuration */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Required<CircuitBreakerConfig> = {
  threshold: 3,
  resetTimeout: 30000,
};

/**
 * HTTP status codes that are retryable
 * - 408: Request Timeout
 * - 429: Too Many Requests (rate limited)
 * - 500: Internal Server Error
 * - 502: Bad Gateway
 * - 503: Service Unavailable
 * - 504: Gateway Timeout
 */
const RETRYABLE_STATUS_CODES = ['408', '429', '500', '502', '503', '504'];

/**
 * Error message patterns that indicate retryable errors
 */
const RETRYABLE_ERROR_PATTERNS = [
  'timeout',
  'rate limit',
  'overloaded',
  'econnreset',
  'etimedout',
  'enotfound',
  'econnrefused',
  'socket hang up',
  'network error',
];

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Determines if an error is retryable based on its message content.
 *
 * Retryable errors include:
 * - HTTP 408, 429, 500, 502, 503, 504
 * - Timeout errors
 * - Rate limit errors
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 *
 * Non-retryable errors include:
 * - HTTP 400, 401, 403, 404 (client errors)
 * - Business logic failures
 *
 * @param error - The error to classify
 * @returns true if the error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Check for retryable HTTP status codes
  for (const code of RETRYABLE_STATUS_CODES) {
    if (message.includes(code)) {
      return true;
    }
  }

  // Check for retryable error patterns
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (message.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts HTTP status code from an error message if present.
 *
 * @param error - The error to extract status from
 * @returns The HTTP status code or undefined
 */
export function extractStatusCode(error: Error): number | undefined {
  // Common patterns: "HTTP 429", "status: 503", "failed: 500"
  const patterns = [
    /\b(\d{3})\b/,  // Just the status code
    /status[:\s]+(\d{3})/i,
    /http[:\s]+(\d{3})/i,
    /failed[:\s]+(\d{3})/i,
  ];

  for (const pattern of patterns) {
    const match = error.message.match(pattern);
    if (match && match[1]) {
      const code = parseInt(match[1], 10);
      if (code >= 100 && code < 600) {
        return code;
      }
    }
  }

  return undefined;
}

/**
 * Parses Retry-After header value from error message or response.
 * Supports both seconds (integer) and HTTP-date formats.
 *
 * @param error - Error that may contain Retry-After information
 * @returns Delay in milliseconds, or undefined if not found
 */
export function parseRetryAfter(error: Error): number | undefined {
  const message = error.message;

  // Look for "retry-after: X" or "Retry-After: X" patterns
  const match = message.match(/retry-after[:\s]+(\d+)/i);
  if (match && match[1]) {
    const seconds = parseInt(match[1], 10);
    if (!isNaN(seconds) && seconds > 0 && seconds < 3600) {
      return seconds * 1000;
    }
  }

  return undefined;
}

// ============================================================================
// Delay Calculation
// ============================================================================

/**
 * Calculates the delay before the next retry attempt.
 *
 * With exponential backoff enabled (default):
 * - Attempt 1: baseDelay * 2^0 = 1x baseDelay
 * - Attempt 2: baseDelay * 2^1 = 2x baseDelay
 * - Attempt 3: baseDelay * 2^2 = 4x baseDelay
 * Plus random jitter (0-1000ms) to prevent thundering herd.
 *
 * @param attempt - Current attempt number (1-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = {}
): number {
  const {
    retryDelay = DEFAULT_RETRY_CONFIG.retryDelay,
    useExponentialBackoff = DEFAULT_RETRY_CONFIG.useExponentialBackoff,
    maxDelay = DEFAULT_RETRY_CONFIG.maxDelay,
  } = config;

  if (!useExponentialBackoff) {
    return retryDelay;
  }

  // Exponential backoff: baseDelay * (2 ^ (attempt - 1)) + jitter
  const exponentialDelay = retryDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000; // 0-1000ms jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

// ============================================================================
// Circuit Breaker
// ============================================================================

// Global registry of circuit breakers by key
const circuitBreakerRegistry = new Map<string, CircuitBreaker>();

/**
 * Creates or retrieves a circuit breaker for a given key.
 *
 * Circuit breakers prevent cascading failures by:
 * 1. Tracking consecutive failures per provider/endpoint
 * 2. "Opening" the circuit after threshold failures (skipping requests)
 * 3. Allowing a retry after resetTimeout (half-open state)
 * 4. Closing the circuit on success
 *
 * @param key - Unique identifier (e.g., "datalab:surya" or "openai:gpt-4")
 * @param config - Circuit breaker configuration
 * @returns CircuitBreaker instance
 */
export function createCircuitBreaker(
  key: string,
  config: CircuitBreakerConfig = {}
): CircuitBreaker {
  // Return existing circuit breaker if one exists for this key
  const existing = circuitBreakerRegistry.get(key);
  if (existing) {
    return existing;
  }

  const {
    threshold = DEFAULT_CIRCUIT_BREAKER_CONFIG.threshold,
    resetTimeout = DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeout,
  } = config;

  let state: CircuitBreakerState = {
    consecutiveFailures: 0,
    isOpen: false,
  };

  const circuitBreaker: CircuitBreaker = {
    isOpen(): boolean {
      if (!state.isOpen) return false;

      // Check if enough time has passed to try again (half-open state)
      if (state.lastFailureTime && Date.now() - state.lastFailureTime > resetTimeout) {
        // Reset to allow a trial request
        state = {
          consecutiveFailures: 0,
          isOpen: false,
        };
        return false;
      }

      return true;
    },

    recordSuccess(): void {
      state = {
        consecutiveFailures: 0,
        isOpen: false,
      };
    },

    recordFailure(): void {
      state.consecutiveFailures++;
      state.lastFailureTime = Date.now();

      if (state.consecutiveFailures >= threshold) {
        state.isOpen = true;
        console.warn(`Circuit breaker opened for ${key} after ${state.consecutiveFailures} consecutive failures`);
      }
    },

    getState(): CircuitBreakerState {
      return { ...state };
    },
  };

  circuitBreakerRegistry.set(key, circuitBreaker);
  return circuitBreaker;
}

/**
 * Clears all circuit breakers. Useful for testing.
 */
export function clearCircuitBreakers(): void {
  circuitBreakerRegistry.clear();
}

/**
 * Gets the circuit breaker for a key without creating one.
 *
 * @param key - Unique identifier
 * @returns CircuitBreaker or undefined if not found
 */
export function getCircuitBreaker(key: string): CircuitBreaker | undefined {
  return circuitBreakerRegistry.get(key);
}

// ============================================================================
// Retry Wrapper
// ============================================================================

/**
 * Wraps an async function with retry logic.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchWithTimeout(url, options),
 *   {
 *     maxRetries: 3,
 *     retryDelay: 1000,
 *     useExponentialBackoff: true,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 *
 * @param fn - Async function to retry
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions<T> = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
    retryDelay = DEFAULT_RETRY_CONFIG.retryDelay,
    useExponentialBackoff = DEFAULT_RETRY_CONFIG.useExponentialBackoff,
    maxDelay = DEFAULT_RETRY_CONFIG.maxDelay,
    onRetry,
    getRetryAfter,
    circuitBreaker,
  } = options;

  // Check circuit breaker before first attempt
  if (circuitBreaker?.isOpen()) {
    throw new Error('Circuit breaker is open');
  }

  let lastError: Error | null = null;

  // maxRetries = 0 means no retries (just one attempt)
  // maxRetries = 2 means up to 3 total attempts (1 initial + 2 retries)
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const result = await fn();

      // Success - record it and return
      circuitBreaker?.recordSuccess();
      return result;
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      const isLastAttempt = attempt === totalAttempts;
      const canRetry = !isLastAttempt && isRetryableError(lastError);

      if (!canRetry) {
        break;
      }

      // Calculate delay (may be overridden by Retry-After header)
      let delay = calculateRetryDelay(attempt, { retryDelay, useExponentialBackoff, maxDelay });

      // Check for Retry-After header
      const retryAfter = getRetryAfter?.(lastError) ?? parseRetryAfter(lastError);
      if (retryAfter !== undefined && retryAfter > 0) {
        delay = Math.min(retryAfter, maxDelay);
      }

      // Call onRetry hook
      if (onRetry) {
        await onRetry(attempt, lastError, delay);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // All attempts failed
  circuitBreaker?.recordFailure();
  throw lastError!;
}

/**
 * Helper to sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
