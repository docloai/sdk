/**
 * Resource Limits and DoS Protection
 *
 * ⚠️ SECURITY WARNING: Resource limits are critical for protecting against:
 * - Resource exhaustion attacks (large file downloads)
 * - Denial of Service (slow loris, timeout attacks)
 * - Memory exhaustion (deeply nested JSON, large arrays)
 *
 * Prevents resource exhaustion attacks through file size limits and timeouts
 */

/**
 * Default resource limits
 *
 * ⚠️ SECURITY CRITICAL: These are conservative defaults designed to prevent DoS attacks.
 *
 * - MAX_FILE_SIZE (100MB): Prevents downloading very large files that could exhaust memory or disk
 * - REQUEST_TIMEOUT (30s): Prevents slow-loris attacks and hung connections
 * - MAX_JSON_DEPTH (100): Prevents billion laughs attack (deeply nested JSON)
 *
 * Do not increase these limits without understanding the security implications:
 * - Higher file size limit → Greater risk of resource exhaustion
 * - Lower timeout → May reject legitimate slow requests
 * - Lower JSON depth → May reject valid documents
 *
 * @security These limits can be overridden by SDK users, but doing so reduces security.
 */
export const DEFAULT_LIMITS = {
  // Maximum file size: 100MB
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  // Request timeout: 30 seconds
  REQUEST_TIMEOUT: 30000,
  // Maximum JSON parse depth
  MAX_JSON_DEPTH: 100,
};

/**
 * Validate file size before processing
 *
 * ⚠️ SECURITY WARNING: File size validation prevents resource exhaustion.
 * - Without limits: attackers can force downloads of multi-gigabyte files
 * - Memory impact: files are loaded into memory for base64 encoding
 * - Disk impact: temporary storage of downloaded files
 *
 * @param size - The file size in bytes
 * @param maxSize - Maximum allowed size in bytes (default 100MB, can be customized)
 * @throws Error if file exceeds size limit
 * @security Do not disable this check without understanding resource implications
 *
 * @example
 * ```typescript
 * // Standard check with default limit (100MB)
 * validateFileSize(fileSize);
 *
 * // Custom limit for use case that requires larger files
 * validateFileSize(fileSize, 500 * 1024 * 1024); // 500MB
 * ```
 */
export function validateFileSize(
  size: number,
  maxSize: number = DEFAULT_LIMITS.MAX_FILE_SIZE
): void {
  if (size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    const sizeMB = Math.round(size / 1024 / 1024);
    throw new Error(
      `File size ${sizeMB}MB exceeds maximum allowed size of ${maxMB}MB`
    );
  }
}

/**
 * Create a fetch controller with timeout
 * @param timeoutMs - Timeout in milliseconds (default 30s)
 * @returns AbortController with timeout configured
 */
export function createFetchController(
  timeoutMs: number = DEFAULT_LIMITS.REQUEST_TIMEOUT
): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Store timeout ID so caller can clean it up
  (controller as any).__timeoutId = timeoutId;

  return controller;
}

/**
 * Clean up fetch controller timeout
 * @param controller - The AbortController to clean up
 */
export function cleanupFetchController(controller: AbortController): void {
  const timeoutId = (controller as any).__timeoutId;
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
}

/**
 * Execute a fetch with automatic timeout and cleanup
 *
 * ⚠️ SECURITY WARNING: Timeout protection prevents slow-loris and other timing attacks.
 * - Without timeout: requests can hang indefinitely, consuming server resources
 * - Slow-loris attack: attacker sends requests slowly to exhaust connection pool
 * - Zombie connections: closed clients but open server connections
 *
 * Default timeout (30s) balances security with legitimate use:
 * - Too short: may reject slow networks or legitimate large downloads
 * - Too long: keeps server resources tied up, enables DoS attacks
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (method, headers, body, etc.)
 * @param timeoutMs - Timeout in milliseconds (default 30s, can be customized)
 * @returns The fetch response
 * @throws Error if request times out
 * @security Do not use very long timeouts without understanding DoS implications
 *
 * @example
 * ```typescript
 * // Default timeout (30 seconds)
 * const response = await fetchWithTimeout('https://example.com/file.pdf');
 *
 * // Custom timeout for slower connections
 * const response = await fetchWithTimeout(url, options, 60000); // 60 seconds
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_LIMITS.REQUEST_TIMEOUT
): Promise<Response> {
  const controller = createFetchController(timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store', // Prevent Next.js cache revalidation which can cause AbortError (see: github.com/vercel/next.js/issues/54045)
    });
    return response;
  } finally {
    cleanupFetchController(controller);
  }
}

/**
 * Check buffer size before allocation
 * @param size - The buffer size in bytes
 * @param maxSize - Maximum allowed size (default 100MB)
 * @throws Error if buffer would exceed memory limit
 */
export function validateBufferSize(
  size: number,
  maxSize: number = DEFAULT_LIMITS.MAX_FILE_SIZE
): void {
  validateFileSize(size, maxSize);
}

/**
 * Memory-safe JSON parse with depth limit
 *
 * ⚠️ SECURITY WARNING: Depth limits prevent billion laughs / XML bomb attacks in JSON format.
 * - Billion laughs attack: deeply nested JSON causes exponential memory expansion
 * - Stack overflow: deeply nested structures can exhaust call stack
 * - Resource exhaustion: parsing deeply nested JSON consumes CPU and memory
 *
 * Attack example (evil.json):
 * ```json
 * {"a":{"b":{"c":{"d":{"e":...}}}}} // 1000+ levels deep
 * ```
 *
 * Default limit (100 levels) prevents attacks while allowing legitimate documents.
 *
 * @param text - JSON string to parse
 * @param maxDepth - Maximum nesting depth in levels (default 100, can be customized)
 * @returns Parsed object
 * @throws Error if JSON exceeds depth limit, size limit, or is invalid
 * @security Do not disable depth checking without understanding XML bomb implications
 *
 * @example
 * ```typescript
 * // Standard parsing with default depth limit (100 levels)
 * const data = safeJsonParse(jsonString);
 *
 * // Custom depth limit for data that needs deeper nesting
 * const data = safeJsonParse(jsonString, 200); // 200 levels
 * ```
 */
export function safeJsonParse(
  text: string,
  maxDepth: number = DEFAULT_LIMITS.MAX_JSON_DEPTH
): unknown {
  try {
    // Quick size check first
    if (text.length > DEFAULT_LIMITS.MAX_FILE_SIZE) {
      throw new Error('JSON string exceeds maximum size');
    }

    const obj = JSON.parse(text);

    // Check nesting depth
    function checkDepth(obj: unknown, depth: number = 0): void {
      if (depth > maxDepth) {
        throw new Error(`JSON nesting depth exceeds maximum of ${maxDepth}`);
      }

      if (typeof obj === 'object' && obj !== null) {
        for (const value of Object.values(obj)) {
          checkDepth(value, depth + 1);
        }
      }
    }

    checkDepth(obj);
    return obj;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Invalid JSON: ${String(error)}`);
  }
}
