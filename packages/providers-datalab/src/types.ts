/**
 * Shared types for Datalab providers
 */

import type { RetryConfig, CircuitBreakerConfig } from "@doclo/core";

/**
 * Configuration for OCR polling and retry behavior
 *
 * Use this to adjust timeout for long-running OCR jobs and add resilience
 * with automatic retries on transient failures.
 *
 * @example
 * ```typescript
 * // Basic polling configuration:
 * // Surya default: 30 × 2000ms = 60 seconds
 * // Marker default: 60 × 2000ms = 120 seconds
 *
 * // For large documents with retry:
 * const provider = markerOCRProvider({
 *   apiKey: 'xxx',
 *   polling: {
 *     maxAttempts: 120,             // 120 polling attempts
 *     pollingInterval: 3000,        // every 3 seconds = 6 minutes total
 *     // Retry configuration:
 *     maxRetries: 2,                // Retry failed requests up to 2 times
 *     retryDelay: 1000,             // Initial retry delay 1 second
 *     useExponentialBackoff: true,  // 1s → 2s → 4s
 *     threshold: 3                  // Open circuit after 3 consecutive failures
 *   }
 * });
 * ```
 */
export interface OCRPollingConfig extends RetryConfig, CircuitBreakerConfig {
  /** Maximum number of polling attempts before timeout (default: 30 for Surya, 60 for Marker) */
  maxAttempts?: number;
  /** Interval between polling attempts in milliseconds (default: 2000) */
  pollingInterval?: number;
}
