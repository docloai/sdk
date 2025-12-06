/**
 * Unsiloed Parse Provider - OCRProvider implementation
 *
 * Uses Unsiloed's /parse endpoint for semantic document parsing
 * with YOLO segmentation + VLM + OCR
 *
 * Supported formats: PDF, PNG, JPEG, TIFF, DOCX, XLSX, PPTX
 * NOT supported: WebP, GIF, BMP
 */

import type { OCRProvider, ProviderIdentity } from '@docloai/core';
import {
  unsiloedFetch,
  getFileBuffer,
  createPDFFormData,
  detectMimeType,
  validateParseFormat,
} from './utils/api-client.js';
import { pollJobUntilComplete } from './utils/job-polling.js';
import { chunksToDocumentIR, extractDocumentFromMultimodal } from './utils/transforms.js';

export interface UnsiloedParseOptions {
  apiKey: string;
  endpoint?: string;
  ocr_engine?: 'UnsiloedHawk' | 'UnsiloedStorm';
  use_high_resolution?: boolean;
  segmentation_method?: 'smart_layout_detection' | 'page_by_page';
  ocr_mode?: 'auto_ocr' | 'full_ocr';
}

/**
 * Create an OCR provider using Unsiloed's semantic parsing API
 *
 * Supported formats: PDF, PNG, JPEG, TIFF, DOCX, XLSX, PPTX
 * NOT supported: WebP, GIF, BMP (will throw helpful error)
 *
 * @example
 * ```typescript
 * const provider = unsiloedParseProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!,
 *   ocr_engine: 'UnsiloedHawk' // Higher accuracy
 * });
 *
 * const ir = await provider.parseToIR({ url: 'document.pdf' });
 * ```
 */
export function unsiloedParseProvider(
  options: UnsiloedParseOptions
): OCRProvider {
  const identity: ProviderIdentity = {
    provider: 'unsiloed',
    model: 'v1',
    method: 'native'
  };

  return {
    identity,
    name: 'unsiloed:v1',

    async parseToIR(input) {
      // Get file buffer from URL or base64
      const { buffer, filename } = await getFileBuffer(input);

      // Detect MIME type from actual file content (magic bytes)
      // This is more reliable than trusting file extensions or data URI prefixes
      const mimeType = detectMimeType(buffer);

      // Validate format is supported by /parse endpoint
      // Will throw helpful error for unsupported formats like WebP
      validateParseFormat(mimeType, filename);

      // Debug logging
      if (process.env.DEBUG_PROVIDERS) {
        console.log(`[Unsiloed Parse] Detected MIME type: ${mimeType} for file: ${filename}`);
      }

      // Create form data with file and config
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('file', blob, filename);

      // Add optional configuration parameters
      if (options.use_high_resolution !== undefined) {
        formData.append('use_high_resolution', String(options.use_high_resolution));
      }
      if (options.segmentation_method) {
        formData.append('segmentation_method', options.segmentation_method);
      }
      if (options.ocr_mode) {
        formData.append('ocr_mode', options.ocr_mode);
      }
      if (options.ocr_engine) {
        formData.append('ocr_engine', options.ocr_engine);
      }

      // Submit parse request
      const response = await unsiloedFetch('/parse', {
        method: 'POST',
        body: formData,
        apiKey: options.apiKey,
        endpoint: options.endpoint,
      });

      const submitResult = await response.json() as {
        job_id: string;
        status: string;
        message?: string;
        quota_remaining?: number;
      };

      if (!submitResult.job_id) {
        throw new Error('Unsiloed parse request did not return a job_id');
      }

      // Poll for completion
      const completedJob = await pollJobUntilComplete(
        submitResult.job_id,
        `/parse/${submitResult.job_id}`,
        {
          apiKey: options.apiKey,
          endpoint: options.endpoint,
        }
      );

      // Extract chunks from completed job
      const chunks = completedJob.chunks || [];

      // Debug: log response structure
      if (process.env.DEBUG_PROVIDERS) {
        console.log('[Unsiloed Parse] Job response:', JSON.stringify(completedJob, null, 2));
      }

      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error(`Unsiloed parse result did not contain valid chunks. Response keys: ${Object.keys(completedJob).join(', ')}`);
      }

      // Transform chunks to DocumentIR
      return chunksToDocumentIR(chunks);
    },
  };
}
