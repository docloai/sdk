/**
 * Shared types for Datalab providers
 */

/**
 * Configuration for OCR polling behavior
 *
 * Use this to adjust timeout for long-running OCR jobs.
 * Total timeout = maxAttempts × pollingInterval
 *
 * @example
 * ```typescript
 * // Surya default: 30 × 2000ms = 60 seconds
 * // Marker default: 60 × 2000ms = 120 seconds
 *
 * // For large documents, increase timeout:
 * const provider = markerOCRProvider({
 *   apiKey: 'xxx',
 *   polling: {
 *     maxAttempts: 120,     // 120 attempts
 *     pollingInterval: 3000  // every 3 seconds = 6 minutes total
 *   }
 * });
 * ```
 */
export interface OCRPollingConfig {
  /** Maximum number of polling attempts before timeout (default: 30 for Surya, 60 for Marker) */
  maxAttempts?: number;
  /** Interval between polling attempts in milliseconds (default: 2000) */
  pollingInterval?: number;
}
