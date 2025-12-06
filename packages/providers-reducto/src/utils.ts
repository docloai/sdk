/**
 * Reducto Shared Utilities
 *
 * Common utilities for upload, polling, and authentication
 */

import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize } from "@docloai/core/security";
import { base64ToArrayBuffer } from "@docloai/core/runtime/base64";
import type {
  ReductoUploadResponse,
  ReductoJobResponse,
  ReductoUsage,
} from "./types.js";
import { USD_PER_CREDIT } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ENDPOINT = 'https://platform.reducto.ai';
const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds
const DEFAULT_MAX_POLL_ATTEMPTS = 120; // 4 minutes total

/**
 * Reducto-specific timeout for API operations
 * Document processing can take longer than typical API calls
 */
export const REDUCTO_REQUEST_TIMEOUT = 120000; // 2 minutes

// ============================================================================
// File Handling
// ============================================================================

/**
 * Get file buffer and filename from URL or base64 input
 */
export async function getFileBuffer(input: { url?: string; base64?: string }): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  mimeType: string;
}> {
  if (input.url) {
    validateUrl(input.url);
    const fileResp = await fetchWithTimeout(input.url, {}, DEFAULT_LIMITS.REQUEST_TIMEOUT);
    if (!fileResp.ok) throw new Error(`Failed to fetch file from URL: ${fileResp.status}`);
    const buffer = await fileResp.arrayBuffer();
    const filename = input.url.split('/').pop() || 'document.pdf';
    return { buffer, filename, mimeType: getMimeType(filename) };
  }

  if (input.base64) {
    const base64Data = input.base64.replace(/^data:[^;]+;base64,/, '');
    const estimatedSize = (base64Data.length * 3) / 4;
    validateFileSize(estimatedSize, DEFAULT_LIMITS.MAX_FILE_SIZE);
    const buffer = base64ToArrayBuffer(base64Data);

    // Detect MIME type from data URL
    const mimeMatch = input.base64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch?.[1] || 'application/pdf';
    const filename = mimeType.includes('pdf') ? 'document.pdf' : 'document.jpg';

    return { buffer, filename, mimeType };
  }

  throw new Error('Either url or base64 must be provided');
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'heic': 'image/heic',
    'webp': 'image/webp',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
    'csv': 'text/csv',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'ppt': 'application/vnd.ms-powerpoint',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// ============================================================================
// Upload
// ============================================================================

/**
 * Upload a file to Reducto and get a file_id
 *
 * @param file - File buffer to upload
 * @param filename - Original filename
 * @param apiKey - Reducto API key
 * @param endpoint - Optional custom endpoint
 * @returns Upload response with file_id
 */
export async function uploadFile(
  file: ArrayBuffer,
  filename: string,
  apiKey: string,
  endpoint: string = DEFAULT_ENDPOINT
): Promise<ReductoUploadResponse> {
  const formData = new FormData();
  const mimeType = getMimeType(filename);
  const blob = new Blob([file], { type: mimeType });
  formData.append('file', blob, filename);

  const resp = await fetchWithTimeout(`${endpoint}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(`Reducto upload failed: ${resp.status} ${errorText}`);
  }

  return await resp.json() as ReductoUploadResponse;
}

// ============================================================================
// Async Job Polling
// ============================================================================

/**
 * Poll for async job completion
 *
 * @param jobId - Job ID to poll
 * @param apiKey - Reducto API key
 * @param endpoint - Optional custom endpoint
 * @param options - Polling options
 * @returns Completed job result
 */
export async function pollJob<T>(
  jobId: string,
  apiKey: string,
  endpoint: string = DEFAULT_ENDPOINT,
  options: {
    pollInterval?: number;
    maxAttempts?: number;
  } = {}
): Promise<T> {
  const pollInterval = options.pollInterval || DEFAULT_POLL_INTERVAL;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_POLL_ATTEMPTS;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const resp = await fetchWithTimeout(`${endpoint}/job/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

    if (!resp.ok) {
      throw new Error(`Reducto job polling failed: ${resp.status}`);
    }

    const data = await resp.json() as ReductoJobResponse<T>;

    if (data.status === 'completed') {
      return data.result as T;
    }

    if (data.status === 'failed') {
      throw new Error(`Reducto job failed: ${data.error || 'Unknown error'}`);
    }

    // Continue polling for 'pending' or 'processing' status
  }

  throw new Error('Reducto job timeout - exceeded maximum polling attempts');
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Calculate credits and estimated USD for an operation
 *
 * @param numPages - Number of pages processed
 * @param operation - Operation type
 * @param agentic - Whether agentic mode was used
 * @returns Usage with credits and USD estimate
 */
export function calculateUsage(
  numPages: number,
  operation: 'parse' | 'extract' | 'split',
  agentic: boolean
): ReductoUsage {
  const rates = {
    parse: { standard: 1, agentic: 2 },
    extract: { standard: 2, agentic: 4 },
    split: { standard: 2, agentic: 2 },
  };

  const creditsPerPage = agentic ? rates[operation].agentic : rates[operation].standard;
  const credits = numPages * creditsPerPage;
  const estimatedUSD = credits * USD_PER_CREDIT;

  return {
    credits,
    estimatedUSD,
    numPages,
  };
}

/**
 * Calculate usage from Reducto API response
 *
 * @param usage - Usage object from Reducto response
 * @returns Formatted usage with USD estimate
 */
export function formatUsage(usage: { num_pages: number; credits: number }): ReductoUsage {
  return {
    credits: usage.credits,
    estimatedUSD: usage.credits * USD_PER_CREDIT,
    numPages: usage.num_pages,
  };
}

// ============================================================================
// Page Range Formatting
// ============================================================================

/**
 * Format page range for Reducto API
 *
 * @param pageRange - Page range specification
 * @returns Formatted page range string for API
 */
export function formatPageRange(
  pageRange?: { start?: number; end?: number } | number[]
): string | undefined {
  if (!pageRange) return undefined;

  if (Array.isArray(pageRange)) {
    // Array of specific pages: [0, 2, 4] -> "0,2,4"
    return pageRange.join(',');
  }

  // Object with start/end: { start: 0, end: 5 } -> "0-5"
  const parts: string[] = [];
  if (pageRange.start !== undefined && pageRange.end !== undefined) {
    return `${pageRange.start}-${pageRange.end}`;
  }
  if (pageRange.start !== undefined) {
    return `${pageRange.start}-`;
  }
  if (pageRange.end !== undefined) {
    return `-${pageRange.end}`;
  }

  return undefined;
}

// ============================================================================
// Request Building
// ============================================================================

/**
 * Create headers for Reducto API requests
 */
export function createHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Make a POST request to Reducto API with JSON body
 */
export async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  apiKey: string
): Promise<T> {
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify(body),
  }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(`Reducto API request failed: ${resp.status} ${errorText}`);
  }

  return await resp.json() as T;
}
