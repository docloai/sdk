/**
 * Security Utilities Module
 *
 * Provides security functions for:
 * - SSRF prevention (URL validation)
 * - Path traversal prevention (path validation)
 * - Resource limit enforcement (file size, timeouts)
 * - Safe JSON parsing
 *
 * @module @docloai/core/security
 *
 * @example
 * ```typescript
 * import {
 *   validateUrl,
 *   validatePath,
 *   fetchWithTimeout,
 *   safeJsonParse
 * } from '@docloai/core/security';
 *
 * // SSRF protection
 * try {
 *   const url = validateUrl(userProvidedUrl);
 *   const response = await fetchWithTimeout(url.toString());
 * } catch (error) {
 *   console.error('Blocked potentially malicious URL:', error.message);
 * }
 *
 * // Path traversal prevention
 * const safePath = validatePath(userFilePath, '/allowed/base/path');
 * const content = readFileSync(safePath);
 *
 * // Safe JSON parsing with depth limits
 * const data = safeJsonParse(jsonString, 100);
 * ```
 */

// Export URL validation and SSRF protection
export {
  validateUrl,
  secureFetch,
  getHostnameFromUrl,
} from './url-validator';

// Export path validation and traversal prevention
export {
  validatePath,
  validatePathSimple,
  isPathSafe,
  getSafePath,
} from './path-validator';

// Export resource limits and DoS protection
export {
  DEFAULT_LIMITS,
  validateFileSize,
  createFetchController,
  cleanupFetchController,
  fetchWithTimeout,
  validateBufferSize,
  safeJsonParse,
} from './resource-limits';
