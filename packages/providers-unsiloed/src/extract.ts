/**
 * Unsiloed Extract Provider - VLMProvider implementation
 *
 * Uses Unsiloed's /cite endpoint for structured data extraction
 * with citation support
 *
 * Format support (tested via SDK):
 * - PDF: ✅ Officially documented and tested
 * - Images (PNG, JPEG, TIFF, WebP, GIF): ✅ Tested working, but may not be officially documented
 * - BMP: ❌ Not supported
 *
 * NOTE: The Unsiloed docs may only list PDF for /cite, but our tests confirm
 * images work. The API field is named 'pdf_file' but accepts images.
 * If this changes, the SDK will throw a clear error.
 */

import type { VLMProvider, ProviderIdentity } from '@docloai/core';
import {
  unsiloedFetch,
  getFileBuffer,
  detectMimeType,
  validateExtractFormat,
} from './utils/api-client.js';
import { pollJobUntilComplete, getJobResult } from './utils/job-polling.js';
import { extractDocumentFromMultimodal, calculateCostFromQuota } from './utils/transforms.js';

export interface UnsiloedExtractOptions {
  apiKey: string;
  endpoint?: string;
}

/**
 * Create a VLM provider using Unsiloed's extraction API
 *
 * @example
 * ```typescript
 * const provider = unsiloedExtractProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { pdfs: [{ url: 'invoice.pdf' }] },
 *   schema: { type: 'object', properties: { total: { type: 'number' } } }
 * });
 * ```
 */
export function unsiloedExtractProvider(
  options: UnsiloedExtractOptions
): VLMProvider {
  const identity: ProviderIdentity = {
    provider: 'unsiloed',
    model: 'v1',
    method: 'native'
  };

  return {
    identity,
    name: 'unsiloed:v1',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
    },

    async completeJson(input) {
      // Extract document (PDF or image) from multimodal input
      const docInput = extractDocumentFromMultimodal(input);

      // Get file buffer
      const { buffer, filename } = await getFileBuffer(docInput);

      // Detect MIME type from actual file content (magic bytes)
      const mimeType = detectMimeType(buffer);

      // Validate format is supported by /cite endpoint
      validateExtractFormat(mimeType, filename);

      // Debug logging
      if (process.env.DEBUG_PROVIDERS) {
        console.log(`[Unsiloed Extract] Detected MIME type: ${mimeType} for file: ${filename}`);
      }

      // Create form data
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      // Note: Field is called "pdf_file" but API accepts images too
      formData.append('pdf_file', blob, filename);

      // Add schema as JSON string
      formData.append('schema_data', JSON.stringify(input.schema));

      // Submit extraction request
      const response = await unsiloedFetch('/cite', {
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

      const quotaBefore = submitResult.quota_remaining;

      if (!submitResult.job_id) {
        throw new Error('Unsiloed extract request did not return a job_id');
      }

      // Debug logging
      if (process.env.DEBUG_PROVIDERS) {
        console.log('[Unsiloed Extract] Job ID:', submitResult.job_id);
        console.log('[Unsiloed Extract] Polling endpoint:', `/jobs/${submitResult.job_id}`);
      }

      // Poll for completion
      await pollJobUntilComplete(
        submitResult.job_id,
        `/jobs/${submitResult.job_id}`,
        {
          apiKey: options.apiKey,
          endpoint: options.endpoint,
        }
      );

      // Get job result with extracted data
      const result = await getJobResult(submitResult.job_id, {
        apiKey: options.apiKey,
        endpoint: options.endpoint,
      });

      // Debug: log response structure
      if (process.env.DEBUG_PROVIDERS) {
        console.log('[Unsiloed Extract] Result response:', JSON.stringify(result, null, 2));
      }

      // Extract quota information for cost tracking
      const quotaAfter = result.quota_remaining;
      const costUSD = calculateCostFromQuota(quotaBefore, quotaAfter);

      // Return extracted JSON
      return {
        json: result.extracted_data || result.data || result,
        costUSD,
        // Unsiloed doesn't provide token counts
        inputTokens: undefined,
        outputTokens: undefined,
      };
    },
  };
}
