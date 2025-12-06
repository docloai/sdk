/**
 * Universal Crypto Adapter
 *
 * Provides crypto-secure random byte generation for both Node.js and Edge Runtime.
 * Uses Web Crypto API (available in both environments) for maximum compatibility.
 *
 * @module @docloai/core/runtime/crypto
 */

/**
 * Generate crypto-secure random bytes
 *
 * Uses Web Crypto API which is available in:
 * - Node.js 18+ (globalThis.crypto)
 * - Browsers (window.crypto)
 * - Cloudflare Workers (crypto)
 * - Vercel Edge Functions (crypto)
 *
 * @param length - Number of random bytes to generate
 * @returns Uint8Array containing random bytes
 */
export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  // Use Web Crypto API (available in all supported runtimes)
  // Node.js 18+, Edge Runtime, and browsers all support globalThis.crypto
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  throw new Error(
    'Web Crypto API not available. This SDK requires:\n' +
    '- Node.js 18.0.0 or later (has globalThis.crypto)\n' +
    '- Edge Runtime (Vercel, Cloudflare)\n' +
    '- Modern browsers'
  );
}

/**
 * Convert Uint8Array to lowercase hex string
 *
 * @param bytes - Byte array to convert
 * @returns Hex string representation
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate random hex string of specified byte length
 *
 * @param byteLength - Number of random bytes (hex string will be 2x this length)
 * @returns Lowercase hex string
 *
 * @example
 * ```typescript
 * const traceId = randomHex(16); // 32 hex characters
 * const spanId = randomHex(8);   // 16 hex characters
 * ```
 */
export function randomHex(byteLength: number): string {
  const bytes = getRandomBytes(byteLength);
  return bytesToHex(bytes);
}

/**
 * Generate a UUID v4 string
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 *
 * @returns UUID v4 string
 *
 * @example
 * ```typescript
 * const id = randomUUID(); // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function randomUUID(): string {
  // Try native crypto.randomUUID() first (Node 19+, all Edge runtimes)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: Manual UUID v4 generation
  const bytes = getRandomBytes(16);

  // Set version (4) and variant bits for UUID v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  // Format as UUID string
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
