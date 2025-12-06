/**
 * Shared API client utilities for Unsiloed API
 */

import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize } from "@docloai/core/security";
import { base64ToArrayBuffer } from "@docloai/core/runtime/base64";

const DEFAULT_ENDPOINT = 'https://prod.visionapi.unsiloed.ai';

export interface UnsiloedFetchOptions {
  method: 'GET' | 'POST';
  body?: FormData;
  apiKey: string;
  endpoint?: string;
}

/**
 * Make a request to the Unsiloed API with authentication
 */
export async function unsiloedFetch(
  path: string,
  options: UnsiloedFetchOptions
): Promise<Response> {
  const baseUrl = options.endpoint || DEFAULT_ENDPOINT;
  const url = `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: options.method,
    headers: {
      'api-key': options.apiKey,
    },
    body: options.body,
  }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Unsiloed API request failed: ${response.status} ${response.statusText} ${errorText}`
    );
  }

  return response;
}

/**
 * Fetch a file from URL or decode base64 to ArrayBuffer
 */
export async function getFileBuffer(input: {
  url?: string;
  base64?: string;
}): Promise<{ buffer: ArrayBuffer; filename: string }> {
  if (input.url) {
    validateUrl(input.url);  // SSRF protection
    const response = await fetchWithTimeout(input.url, {}, DEFAULT_LIMITS.REQUEST_TIMEOUT);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const filename = input.url.split('/').pop() || 'document.pdf';
    return { buffer, filename };
  } else if (input.base64) {
    const base64Data = input.base64.replace(/^data:[^;]+;base64,/, '');
    // Validate base64 size before decoding
    const estimatedSize = (base64Data.length * 3) / 4;
    validateFileSize(estimatedSize, DEFAULT_LIMITS.MAX_FILE_SIZE);
    const buffer = base64ToArrayBuffer(base64Data);
    return { buffer, filename: 'document.pdf' };
  } else {
    throw new Error('Either url or base64 must be provided');
  }
}

/**
 * Create a FormData with a PDF file
 */
export function createPDFFormData(
  buffer: ArrayBuffer,
  filename: string
): FormData {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  formData.append('pdf_file', blob, filename);
  return formData;
}

/**
 * Detect MIME type from file content using magic bytes
 * This is more reliable than using file extensions
 */
export function detectMimeType(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer.slice(0, 16));

  // PDF: starts with %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  // PNG: starts with 0x89 PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: starts with 0xFF 0xD8 0xFF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // GIF: starts with GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }

  // TIFF: II (little-endian) or MM (big-endian)
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
      (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
    return 'image/tiff';
  }

  // BMP: starts with BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
    return 'image/bmp';
  }

  // Office documents (DOCX, XLSX, PPTX are all ZIP-based, start with PK)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // This could be DOCX, XLSX, PPTX, or other ZIP-based formats
    // We'd need to inspect the ZIP contents to determine exact type
    return 'application/zip'; // Generic - provider will handle
  }

  // Default to octet-stream if unknown
  return 'application/octet-stream';
}

/**
 * Supported MIME types for Unsiloed /parse endpoint
 * From docs: PDFs, images (PNG, JPEG, TIFF), and office files (PPT, DOCX, XLSX)
 */
export const PARSE_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  // Office formats (detected as zip, but supported by Unsiloed)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/zip', // Generic office detection
] as const;

/**
 * Validate that a detected MIME type is supported by the parse endpoint
 * Throws a helpful error if not supported
 */
export function validateParseFormat(mimeType: string, filename?: string): void {
  const isSupported = PARSE_SUPPORTED_MIME_TYPES.includes(mimeType as any) ||
    mimeType.startsWith('application/vnd.openxmlformats');

  if (!isSupported) {
    const filenameHint = filename ? ` (file: ${filename})` : '';

    if (mimeType === 'image/webp') {
      throw new Error(
        `Unsupported file format: WebP${filenameHint}. ` +
        `Unsiloed /parse endpoint supports: PDF, PNG, JPEG, TIFF, DOCX, XLSX, PPTX. ` +
        `WebP is not supported - please convert to JPEG or PNG first.`
      );
    }

    if (mimeType === 'image/gif') {
      throw new Error(
        `Unsupported file format: GIF${filenameHint}. ` +
        `Unsiloed /parse endpoint supports: PDF, PNG, JPEG, TIFF, DOCX, XLSX, PPTX. ` +
        `GIF is not supported - please convert to PNG first.`
      );
    }

    if (mimeType === 'image/bmp') {
      throw new Error(
        `Unsupported file format: BMP${filenameHint}. ` +
        `Unsiloed /parse endpoint supports: PDF, PNG, JPEG, TIFF, DOCX, XLSX, PPTX. ` +
        `BMP is not supported - please convert to PNG first.`
      );
    }

    throw new Error(
      `Unsupported file format: ${mimeType}${filenameHint}. ` +
      `Unsiloed /parse endpoint supports: PDF, PNG, JPEG, TIFF, DOCX, XLSX, PPTX.`
    );
  }
}

/**
 * Supported MIME types for Unsiloed /cite (extract) endpoint
 * Extract has wider format support than parse
 */
export const EXTRACT_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
  'image/gif',
] as const;

/**
 * Validate that a detected MIME type is supported by the extract/cite endpoint
 */
export function validateExtractFormat(mimeType: string, filename?: string): void {
  const isSupported = EXTRACT_SUPPORTED_MIME_TYPES.includes(mimeType as any);

  if (!isSupported) {
    const filenameHint = filename ? ` (file: ${filename})` : '';

    if (mimeType === 'image/bmp') {
      throw new Error(
        `Unsupported file format: BMP${filenameHint}. ` +
        `Unsiloed /cite endpoint supports: PDF, PNG, JPEG, TIFF, WebP, GIF. ` +
        `BMP is not supported - please convert to PNG first.`
      );
    }

    throw new Error(
      `Unsupported file format: ${mimeType}${filenameHint}. ` +
      `Unsiloed /cite endpoint supports: PDF, PNG, JPEG, TIFF, WebP, GIF.`
    );
  }
}

/**
 * Validate that a detected MIME type is a PDF (for endpoints that only support PDFs)
 * Used by: /tables, /classify, /splitter
 */
export function validatePDFFormat(mimeType: string, endpoint: string, filename?: string): void {
  if (mimeType !== 'application/pdf') {
    const filenameHint = filename ? ` (file: ${filename})` : '';
    const actualFormat = mimeType.replace('image/', '').replace('application/', '').toUpperCase();

    throw new Error(
      `Unsupported file format: ${actualFormat}${filenameHint}. ` +
      `Unsiloed ${endpoint} endpoint only supports PDF files. ` +
      `For image processing, use the /parse or /cite endpoints instead.`
    );
  }
}
