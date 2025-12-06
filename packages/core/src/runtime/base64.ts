/**
 * Universal Base64 Adapter
 *
 * Provides base64 encoding/decoding for both Node.js and Edge Runtime.
 * Replaces Node.js Buffer usage with Web APIs for Edge compatibility.
 *
 * @module @docloai/core/runtime/base64
 */

/**
 * Convert ArrayBuffer to base64 string
 *
 * Uses different strategies depending on runtime:
 * - Edge Runtime / Browser: btoa() with binary string conversion
 * - Node.js: Buffer.toString('base64')
 *
 * @param buffer - ArrayBuffer to encode
 * @returns Base64 encoded string
 *
 * @example
 * ```typescript
 * const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
 * const base64 = arrayBufferToBase64(buffer); // "SGVsbG8="
 * ```
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Node.js: Use Buffer for best performance
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }

  // Edge Runtime / Browser: Use btoa() with binary string
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 *
 * Uses different strategies depending on runtime:
 * - Edge Runtime / Browser: atob() with Uint8Array conversion
 * - Node.js: Buffer.from(base64, 'base64')
 *
 * @param base64 - Base64 encoded string (with or without data URI prefix)
 * @returns Decoded ArrayBuffer
 *
 * @example
 * ```typescript
 * const buffer = base64ToArrayBuffer("SGVsbG8=");
 * const text = new TextDecoder().decode(buffer); // "Hello"
 *
 * // Also handles data URIs
 * const buffer2 = base64ToArrayBuffer("data:image/png;base64,iVBORw0KG...");
 * ```
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Remove data URI prefix if present
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');

  // Node.js: Use Buffer for best performance
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(cleanBase64, 'base64');
    // Convert Node.js Buffer to ArrayBuffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  // Edge Runtime / Browser: Use atob()
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Uint8Array to base64 string
 *
 * Convenience wrapper around arrayBufferToBase64 for Uint8Array inputs.
 *
 * @param bytes - Uint8Array to encode
 * @returns Base64 encoded string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/**
 * Convert base64 string to Uint8Array
 *
 * Convenience wrapper around base64ToArrayBuffer with Uint8Array result.
 *
 * @param base64 - Base64 encoded string
 * @returns Decoded Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}

/**
 * Create a data URI from ArrayBuffer
 *
 * @param buffer - Data to encode
 * @param mimeType - MIME type (default: application/octet-stream)
 * @returns Data URI string
 *
 * @example
 * ```typescript
 * const buffer = new TextEncoder().encode("Hello, World!");
 * const dataUri = createDataUri(buffer.buffer, 'text/plain');
 * // "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ=="
 * ```
 */
export function createDataUri(buffer: ArrayBuffer, mimeType = 'application/octet-stream'): string {
  const base64 = arrayBufferToBase64(buffer);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Check if a string is a valid data URI
 *
 * @param input - String to check
 * @returns True if valid data URI format
 */
export function isDataUri(input: string): boolean {
  return /^data:[^;,]+;base64,/.test(input);
}

/**
 * Extract MIME type from data URI
 *
 * @param dataUri - Data URI string
 * @returns MIME type or null if invalid
 *
 * @example
 * ```typescript
 * const mime = extractMimeType("data:image/png;base64,iVBOR...");
 * console.log(mime); // "image/png"
 * ```
 */
export function extractMimeType(dataUri: string): string | null {
  const match = dataUri.match(/^data:([^;,]+);base64,/);
  return match ? match[1] : null;
}
