/**
 * File utilities for universal runtime (Edge Runtime + Node.js compatible)
 *
 * These utilities work in both Edge Runtime and Node.js environments.
 * File system operations have been removed for Edge Runtime compatibility.
 */

import { validateUrl } from '../security/url-validator';
import { fetchWithTimeout, validateFileSize, DEFAULT_LIMITS } from '../security/resource-limits';
import { arrayBufferToBase64, createDataUri } from '../runtime/base64.js';
import { detectMimeTypeFromBase64 } from '../mime-detection.js';

/**
 * Supported document MIME types that can be detected.
 * This includes all formats supported by at least one provider:
 * - Datalab: PDF, images, Office, OpenDocument, HTML, EPUB
 * - Reducto: PDF, images (incl. HEIC, BMP, PSD), Office, RTF, TXT, CSV
 * - Unsiloed: PDF, images, Office (DOCX, XLSX, PPTX)
 */
export type DocumentMimeType =
  // PDF
  | 'application/pdf'
  // Images - common
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  // Images - additional
  | 'image/tiff'
  | 'image/bmp'
  | 'image/heic'
  | 'image/heif'
  | 'image/vnd.adobe.photoshop'  // PSD
  // Microsoft Office
  | 'application/msword'  // DOC
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'  // DOCX
  | 'application/vnd.ms-excel'  // XLS
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'  // XLSX
  | 'application/vnd.ms-powerpoint'  // PPT
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'  // PPTX
  // OpenDocument formats (Datalab)
  | 'application/vnd.oasis.opendocument.text'  // ODT
  | 'application/vnd.oasis.opendocument.spreadsheet'  // ODS
  | 'application/vnd.oasis.opendocument.presentation'  // ODP
  // Text formats
  | 'text/plain'  // TXT
  | 'text/csv'  // CSV
  | 'text/html'  // HTML
  | 'application/rtf'  // RTF
  // Other
  | 'application/epub+zip'  // EPUB
  | 'unknown';

/**
 * Detect input type: HTTP URL or data URI
 *
 * Note: File paths are not supported in Edge Runtime.
 * Use ArrayBuffer or data URIs instead.
 */
function detectInputType(input: string): 'data-uri' | 'url' {
  if (input.startsWith('data:')) return 'data-uri';
  if (input.startsWith('http://') || input.startsWith('https://')) return 'url';
  throw new Error(
    'Edge Runtime does not support file paths. ' +
    'Use HTTP URLs, data URIs, or pass ArrayBuffer/base64 data directly.\n' +
    'Example: await resolveDocument("https://example.com/doc.pdf") or ' +
    'resolveDocument("data:application/pdf;base64,...")'
  );
}

/**
 * Extract MIME type from various sources
 */
function detectMimeType(input: string, contentType?: string): string {
  // Try data URI first
  if (input.startsWith('data:')) {
    const match = input.match(/^data:([^;,]+)/);
    if (match) return match[1];
  }

  // Try Content-Type header (from HTTP response)
  if (contentType) {
    const match = contentType.match(/^([^;]+)/);
    if (match) return match[1].trim();
  }

  // Try file extension (works for paths and URLs)
  const lower = input.toLowerCase();
  // PDF
  if (lower.endsWith('.pdf') || lower.includes('.pdf?')) return 'application/pdf';
  // Images - common
  if (lower.endsWith('.png') || lower.includes('.png?')) return 'image/png';
  if (lower.endsWith('.webp') || lower.includes('.webp?')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.includes('.jpg?')) return 'image/jpeg';
  if (lower.endsWith('.jpeg') || lower.includes('.jpeg?')) return 'image/jpeg';
  if (lower.endsWith('.gif') || lower.includes('.gif?')) return 'image/gif';
  // Images - additional
  if (lower.endsWith('.tiff') || lower.includes('.tiff?')) return 'image/tiff';
  if (lower.endsWith('.tif') || lower.includes('.tif?')) return 'image/tiff';
  if (lower.endsWith('.bmp') || lower.includes('.bmp?')) return 'image/bmp';
  if (lower.endsWith('.heic') || lower.includes('.heic?')) return 'image/heic';
  if (lower.endsWith('.heif') || lower.includes('.heif?')) return 'image/heif';
  if (lower.endsWith('.psd') || lower.includes('.psd?')) return 'image/vnd.adobe.photoshop';
  // Microsoft Office
  if (lower.endsWith('.doc') || lower.includes('.doc?')) return 'application/msword';
  if (lower.endsWith('.docx') || lower.includes('.docx?')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xls') || lower.includes('.xls?')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx') || lower.includes('.xlsx?')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.ppt') || lower.includes('.ppt?')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.pptx') || lower.includes('.pptx?')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  // OpenDocument formats
  if (lower.endsWith('.odt') || lower.includes('.odt?')) return 'application/vnd.oasis.opendocument.text';
  if (lower.endsWith('.ods') || lower.includes('.ods?')) return 'application/vnd.oasis.opendocument.spreadsheet';
  if (lower.endsWith('.odp') || lower.includes('.odp?')) return 'application/vnd.oasis.opendocument.presentation';
  // Text formats
  if (lower.endsWith('.txt') || lower.includes('.txt?')) return 'text/plain';
  if (lower.endsWith('.csv') || lower.includes('.csv?')) return 'text/csv';
  if (lower.endsWith('.html') || lower.includes('.html?')) return 'text/html';
  if (lower.endsWith('.htm') || lower.includes('.htm?')) return 'text/html';
  if (lower.endsWith('.rtf') || lower.includes('.rtf?')) return 'application/rtf';
  // Other
  if (lower.endsWith('.epub') || lower.includes('.epub?')) return 'application/epub+zip';

  // Default to octet-stream
  return 'application/octet-stream';
}

/**
 * Security limits configuration for file operations
 * @internal
 */
export interface FileLimitsConfig {
  /** Maximum file size in bytes (default: 100MB) - ⚠️ WARNING: Increasing this exposes to resource exhaustion attacks */
  maxFileSize?: number;
  /** Request timeout in milliseconds (default: 30s) - ⚠️ WARNING: Decreasing this may cause legitimate requests to fail */
  requestTimeout?: number;
}

/**
 * Detect document MIME type from various input formats
 *
 * Detection order (first match wins):
 * 1. Data URL prefix (data:application/pdf;base64,...)
 * 2. URL/path file extension (.pdf, .jpg, etc.)
 * 3. Magic bytes in base64 data (fallback for raw base64)
 *
 * @param input - Document input (data URL, URL, file path, or raw base64)
 * @returns Detected MIME type or 'unknown' if detection fails
 *
 * @example
 * ```typescript
 * detectDocumentType('data:application/pdf;base64,...')  // 'application/pdf'
 * detectDocumentType('https://example.com/doc.pdf')      // 'application/pdf'
 * detectDocumentType('JVBERi0xLjQK...')                  // 'application/pdf' (magic bytes)
 * detectDocumentType('/9j/4AAQSkZJRg...')                // 'image/jpeg' (magic bytes)
 * ```
 */
/**
 * All known MIME types that can be detected (for data URI prefix matching)
 */
const KNOWN_MIME_TYPES: DocumentMimeType[] = [
  // PDF
  'application/pdf',
  // Images - common
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Images - additional
  'image/tiff',
  'image/bmp',
  'image/heic',
  'image/heif',
  'image/vnd.adobe.photoshop',
  // Microsoft Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // OpenDocument formats
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  // Text formats
  'text/plain',
  'text/csv',
  'text/html',
  'application/rtf',
  // Other
  'application/epub+zip',
];

/**
 * File extension to MIME type mapping
 */
const EXTENSION_TO_MIME: Record<string, DocumentMimeType> = {
  // PDF
  '.pdf': 'application/pdf',
  // Images - common
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // Images - additional
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.psd': 'image/vnd.adobe.photoshop',
  // Microsoft Office
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // OpenDocument formats
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  // Text formats
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.rtf': 'application/rtf',
  // Other
  '.epub': 'application/epub+zip',
};

/**
 * Get file extension from path or URL (handles query strings)
 */
function getExtensionFromPath(path: string): string | null {
  // Remove query string if present
  const pathWithoutQuery = path.split('?')[0];
  const lastDot = pathWithoutQuery.lastIndexOf('.');
  if (lastDot === -1) return null;
  return pathWithoutQuery.slice(lastDot).toLowerCase();
}

export function detectDocumentType(input: string | undefined): DocumentMimeType {
  if (!input) return 'unknown';

  // 1. Check data URL MIME type prefix
  if (input.startsWith('data:')) {
    const match = input.match(/^data:([^;,]+)/);
    if (match) {
      const mimeType = match[1] as DocumentMimeType;
      if (KNOWN_MIME_TYPES.includes(mimeType)) {
        return mimeType;
      }
    }
    // Unknown data URL type, try magic bytes below
  }

  // 2. Check URL/path file extension (only if not a data URL)
  if (!input.startsWith('data:')) {
    let ext: string | null = null;

    try {
      const url = new URL(input);
      ext = getExtensionFromPath(url.pathname);
    } catch {
      // Not a valid URL, try as file path
      ext = getExtensionFromPath(input);
    }

    if (ext && ext in EXTENSION_TO_MIME) {
      return EXTENSION_TO_MIME[ext];
    }
  }

  // 3. Magic byte detection (fallback for raw base64 or unknown data URLs)
  try {
    const mimeType = detectMimeTypeFromBase64(input);
    // Check if it's a known type
    if (KNOWN_MIME_TYPES.includes(mimeType as DocumentMimeType)) {
      return mimeType as DocumentMimeType;
    }
  } catch {
    // Magic byte detection failed
  }

  return 'unknown';
}

/**
 * Check if input represents a PDF document
 *
 * Handles various input formats:
 * - Data URLs with MIME type
 * - File paths with .pdf extension
 * - HTTP/HTTPS URLs (with or without query parameters)
 * - Raw base64 strings (detected via magic bytes)
 *
 * @param input - Document input (data URL, file path, URL, or raw base64)
 * @returns true if input appears to be a PDF
 *
 * @example
 * ```typescript
 * isPDFDocument('data:application/pdf;base64,...')  // true
 * isPDFDocument('./document.pdf')                   // true
 * isPDFDocument('https://example.com/doc.pdf?token=123')  // true
 * isPDFDocument('JVBERi0xLjQK...')                  // true (raw base64 PDF)
 * isPDFDocument('data:image/jpeg;base64,...')       // false
 * ```
 */
export function isPDFDocument(input: string | undefined): boolean {
  return detectDocumentType(input) === 'application/pdf';
}

/**
 * Resolve document from any source (URL or data URI) to base64 data URL
 *
 * Supports two input types:
 * - HTTP/HTTPS URLs: 'https://example.com/document.pdf'
 * - Data URIs: 'data:application/pdf;base64,JVBERi0x...'
 *
 * Note: File paths are NOT supported in Edge Runtime.
 * Use HTTP URLs, data URIs, or pass ArrayBuffer/base64 directly.
 *
 * @param input - Document source (URL or data URI)
 * @param limits - Optional security limits for file size and request timeout (uses secure defaults if not specified)
 * @returns Promise resolving to base64 data URL
 *
 * @example
 * ```typescript
 * // Remote URL
 * const dataUrl = await resolveDocument('https://example.com/doc.pdf');
 *
 * // Remote URL with custom timeout
 * const dataUrl = await resolveDocument('https://example.com/doc.pdf', { requestTimeout: 60000 });
 *
 * // Data URI (pass-through)
 * const dataUrl = await resolveDocument('data:application/pdf;base64,JVBERi0x...');
 *
 * // For ArrayBuffer, use bufferToDataUri() instead
 * const dataUrl = bufferToDataUri(arrayBuffer, 'application/pdf');
 * ```
 */
export async function resolveDocument(input: string, limits?: FileLimitsConfig): Promise<string> {
  const inputType = detectInputType(input);

  switch (inputType) {
    case 'data-uri':
      // Already in data URI format - validate and return
      if (!input.match(/^data:[^;,]+;base64,/)) {
        throw new Error('Invalid data URI format. Expected: data:<mimetype>;base64,<data>');
      }
      return input;

    case 'url':
      // Fetch from HTTP/HTTPS with security validations
      try {
        // Validate URL for SSRF attacks
        validateUrl(input);

        // Use custom timeout or default
        const timeout = limits?.requestTimeout ?? DEFAULT_LIMITS.REQUEST_TIMEOUT;

        // Fetch with timeout protection
        const response = await fetchWithTimeout(input, {}, timeout);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check content-length header if available
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const maxSize = limits?.maxFileSize ?? DEFAULT_LIMITS.MAX_FILE_SIZE;
          validateFileSize(parseInt(contentLength, 10), maxSize);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Validate actual downloaded size
        const maxSize = limits?.maxFileSize ?? DEFAULT_LIMITS.MAX_FILE_SIZE;
        validateFileSize(arrayBuffer.byteLength, maxSize);

        const base64 = arrayBufferToBase64(arrayBuffer);
        const mimeType = detectMimeType(input, response.headers.get('content-type') || undefined);
        return `data:${mimeType};base64,${base64}`;
      } catch (error) {
        throw new Error(`Failed to fetch URL ${input}: ${(error as Error).message}`);
      }
  }
}

/**
 * Convert ArrayBuffer or Uint8Array to base64 data URI
 *
 * Edge Runtime compatible - no file system access required.
 *
 * @param buffer - File buffer (ArrayBuffer or Uint8Array)
 * @param mimeType - MIME type (e.g., 'application/pdf', 'image/jpeg')
 * @returns Base64 data URI string
 *
 * @example
 * ```typescript
 * // From ArrayBuffer
 * const buffer = await response.arrayBuffer();
 * const dataUri = bufferToDataUri(buffer, 'application/pdf');
 *
 * // From Uint8Array
 * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
 * const dataUri = bufferToDataUri(bytes, 'text/plain');
 * ```
 */
export function bufferToDataUri(buffer: ArrayBuffer | Uint8Array, mimeType: string): string {
  if (buffer instanceof Uint8Array) {
    // Convert Uint8Array to ArrayBuffer
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    return createDataUri(arrayBuffer, mimeType);
  }
  return createDataUri(buffer, mimeType);
}

/**
 * @deprecated Use bufferToDataUri() instead. This function will be removed in v0.2.0.
 */
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array, mimeType: string): string {
  return bufferToDataUri(buffer, mimeType);
}

/**
 * Accepted MIME types for flow input validation.
 * Excludes 'unknown' - only known provider-supported formats.
 */
export type AcceptedMimeType = Exclude<DocumentMimeType, 'unknown'>;

/**
 * Error thrown when flow input doesn't match accepted formats
 */
export class FlowInputValidationError extends Error {
  /**
   * @param message - Human-readable error message
   * @param detectedType - The actual MIME type detected from the input
   * @param acceptedTypes - List of MIME types that would have been accepted
   */
  constructor(
    message: string,
    public readonly detectedType: string,
    public readonly acceptedTypes: string[]
  ) {
    super(message);
    this.name = 'FlowInputValidationError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, FlowInputValidationError.prototype);
  }
}

/**
 * Validate flow input against accepted MIME type formats
 *
 * @param input - Flow input string (base64, data URL, or URL)
 * @param acceptedFormats - List of accepted MIME types
 * @returns The detected MIME type if valid
 * @throws FlowInputValidationError if format doesn't match accepted types
 *
 * @example
 * ```typescript
 * // Validate PDF only
 * const mimeType = validateFlowInputFormat(pdfBase64, ['application/pdf']);
 *
 * // Validate images only
 * const mimeType = validateFlowInputFormat(jpgBase64, ['image/jpeg', 'image/png']);
 *
 * // Will throw FlowInputValidationError if input is a PDF but only images accepted
 * ```
 */
export function validateFlowInputFormat(
  input: string | undefined,
  acceptedFormats: AcceptedMimeType[]
): AcceptedMimeType {
  if (!input) {
    throw new FlowInputValidationError(
      'Flow input is empty or undefined',
      'undefined',
      acceptedFormats
    );
  }

  const detected = detectDocumentType(input);

  if (detected === 'unknown') {
    const acceptedList = acceptedFormats.length > 0
      ? `Expected one of: ${acceptedFormats.join(', ')}`
      : 'Unable to determine document format';
    throw new FlowInputValidationError(
      `Unable to detect document format. ${acceptedList}. Ensure the input is a valid document (PDF, JPEG, PNG, GIF, or WebP).`,
      'unknown',
      acceptedFormats
    );
  }

  if (acceptedFormats.length > 0 && !acceptedFormats.includes(detected as AcceptedMimeType)) {
    throw new FlowInputValidationError(
      `Document format '${detected}' is not accepted. Expected one of: ${acceptedFormats.join(', ')}`,
      detected,
      acceptedFormats
    );
  }

  return detected as AcceptedMimeType;
}
