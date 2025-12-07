/**
 * MIME Type Detection Utility
 *
 * Detects MIME types from actual file data (magic bytes) to prevent mismatches
 * between declared MIME types and actual file content.
 *
 * Uses the `file-type` package for comprehensive format detection, with
 * manual fallback for basic types in synchronous contexts.
 */

import { fileTypeFromBuffer } from 'file-type';

/**
 * Detects MIME type from base64-encoded data using the file-type package.
 * This is the preferred async method that supports 100+ file formats.
 *
 * @param base64Data - Base64 string (with or without data URI prefix)
 * @returns Detected MIME type (e.g., "image/jpeg", "application/pdf")
 * @throws Error if format is unsupported or data is invalid
 *
 * @example
 * ```typescript
 * const base64 = "data:image/jpeg;base64,/9j/4AAQSkZJRg...";
 * const mimeType = await detectMimeTypeFromBase64Async(base64);
 * console.log(mimeType); // "image/jpeg"
 * ```
 */
export async function detectMimeTypeFromBase64Async(base64Data: string): Promise<string> {
  // Strip data URI prefix if present
  const base64Only = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Decode to Uint8Array
  const binaryString = atob(base64Only);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Use file-type for detection
  const result = await fileTypeFromBuffer(bytes);
  if (result) {
    return result.mime;
  }

  throw new Error(
    `Unsupported file format. Magic bytes: ${Array.from(bytes.slice(0, 4))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')}`
  );
}

/**
 * Detects MIME type from base64-encoded data by examining magic bytes.
 * This is a synchronous fallback for basic formats.
 *
 * Supports:
 * - Images: JPEG, PNG, WebP, GIF, TIFF, BMP
 * - Documents: PDF, RTF
 * - Archives: ZIP (for DOCX, XLSX, PPTX, EPUB detection via extension)
 *
 * @param base64Data - Base64 string (with or without data URI prefix)
 * @returns Detected MIME type (e.g., "image/jpeg", "application/pdf")
 * @throws Error if format is unsupported or data is invalid
 *
 * @example
 * ```typescript
 * const base64 = "data:image/jpeg;base64,/9j/4AAQSkZJRg...";
 * const mimeType = detectMimeTypeFromBase64(base64);
 * console.log(mimeType); // "image/jpeg"
 * ```
 */
export function detectMimeTypeFromBase64(base64Data: string): string {
  // Strip data URI prefix if present
  const base64Only = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Decode first 16 bytes (enough for all magic byte checks)
  const binaryString = atob(base64Only.substring(0, 24));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return detectMimeTypeFromBytes(bytes);
}

/**
 * Detects MIME type from raw byte array.
 *
 * @param bytes - Uint8Array containing file data
 * @returns Detected MIME type
 * @throws Error if format is unsupported
 */
export function detectMimeTypeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 4) {
    throw new Error('Insufficient data to detect MIME type (need at least 4 bytes)');
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // WebP: RIFF .... WEBP (check positions 0-3 for RIFF, 8-11 for WEBP)
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }

  // PDF: %PDF (25 50 44 46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  // TIFF: Little-endian (49 49 2A 00) or Big-endian (4D 4D 00 2A)
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
      (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
    return 'image/tiff';
  }

  // BMP: 42 4D (BM)
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
    return 'image/bmp';
  }

  // RTF: 7B 5C 72 74 66 ({\rtf)
  if (bytes[0] === 0x7B && bytes[1] === 0x5C && bytes[2] === 0x72 && bytes[3] === 0x74 && bytes[4] === 0x66) {
    return 'application/rtf';
  }

  // ZIP-based formats: 50 4B 03 04 (PK..)
  // This includes DOCX, XLSX, PPTX, ODT, ODS, ODP, EPUB
  // We return a generic marker - actual type should be determined by file extension
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'application/zip';
  }

  // MS Office Compound Document (DOC, XLS, PPT): D0 CF 11 E0 A1 B1 1A E1
  if (bytes.length >= 8 &&
      bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
      bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1) {
    // Could be DOC, XLS, or PPT - return generic Office type
    return 'application/x-cfb';  // Compound File Binary
  }

  // Unknown format
  throw new Error(
    `Unsupported file format. Magic bytes: ${Array.from(bytes.slice(0, 4))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')}`
  );
}

/**
 * Validates that declared MIME type matches actual file data.
 *
 * @param base64Data - Base64 string (with or without data URI prefix)
 * @param declaredMimeType - MIME type that was declared/expected
 * @returns Object with validation result and actual MIME type
 *
 * @example
 * ```typescript
 * const result = validateMimeType(base64Data, "image/jpeg");
 * if (!result.isValid) {
 *   console.warn(`MIME mismatch: declared ${result.declaredMimeType}, actual ${result.actualMimeType}`);
 * }
 * ```
 */
export function validateMimeType(
  base64Data: string,
  declaredMimeType: string
): { isValid: boolean; actualMimeType: string; declaredMimeType: string } {
  const actualMimeType = detectMimeTypeFromBase64(base64Data);
  return {
    isValid: actualMimeType === declaredMimeType,
    actualMimeType,
    declaredMimeType
  };
}

/**
 * Async version of validateMimeType using file-type for comprehensive detection.
 */
export async function validateMimeTypeAsync(
  base64Data: string,
  declaredMimeType: string
): Promise<{ isValid: boolean; actualMimeType: string; declaredMimeType: string }> {
  const actualMimeType = await detectMimeTypeFromBase64Async(base64Data);
  return {
    isValid: actualMimeType === declaredMimeType,
    actualMimeType,
    declaredMimeType
  };
}

/**
 * Extracts base64 data from a data URI or returns the data as-is if already base64.
 *
 * @param data - Data URI or base64 string
 * @returns Pure base64 string without prefix
 *
 * @example
 * ```typescript
 * extractBase64("data:image/jpeg;base64,/9j/4AAQ...") // "/9j/4AAQ..."
 * extractBase64("/9j/4AAQ...") // "/9j/4AAQ..."
 * ```
 */
export function extractBase64(data: string): string {
  if (data.startsWith('data:')) {
    const commaIndex = data.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid data URI: missing comma separator');
    }
    return data.substring(commaIndex + 1);
  }
  return data;
}
