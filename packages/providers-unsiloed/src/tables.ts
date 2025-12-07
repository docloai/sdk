/**
 * Unsiloed Tables Provider - VLMProvider implementation
 *
 * Uses Unsiloed's /tables endpoint for table extraction
 *
 * NOTE: Only supports PDF files. For images, use the /parse or /cite endpoints.
 */

import type { VLMProvider, ProviderIdentity } from '@doclo/core';
import { unsiloedFetch, getFileBuffer, detectMimeType, validatePDFFormat } from './utils/api-client.js';
import { pollJobUntilComplete, getJobResult } from './utils/job-polling.js';
import { extractPDFFromMultimodal, calculateCostFromQuota } from './utils/transforms.js';

export interface UnsiloedTablesOptions {
  apiKey: string;
  endpoint?: string;
}

/**
 * Create a VLM provider using Unsiloed's table extraction API
 *
 * @example
 * ```typescript
 * const provider = unsiloedTablesProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { pdfs: [{ url: 'report.pdf' }] },
 *   schema: { type: 'object', properties: { tables: { type: 'array' } } }
 * });
 * ```
 */
export function unsiloedTablesProvider(
  options: UnsiloedTablesOptions
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
      supportsImages: true, // API accepts images but jobs fail during processing
      supportsPDFs: true,
    },

    async completeJson(input) {
      // Extract PDF from multimodal input
      const pdfInput = extractPDFFromMultimodal(input);

      // Get file buffer
      const { buffer, filename } = await getFileBuffer(pdfInput);

      // Detect MIME type from actual file content (magic bytes)
      const mimeType = detectMimeType(buffer);

      // Validate that it's a PDF - /tables only supports PDFs
      validatePDFFormat(mimeType, '/tables', filename);

      // Debug logging
      if (process.env.DEBUG_PROVIDERS) {
        console.log(`[Unsiloed Tables] Detected MIME type: ${mimeType} for file: ${filename}`);
      }

      // Create form data
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('pdf_file', blob, filename);

      // Submit table extraction request
      const response = await unsiloedFetch('/tables', {
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
        throw new Error('Unsiloed tables request did not return a job_id');
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

      // Get job result
      const result = await getJobResult(submitResult.job_id, {
        apiKey: options.apiKey,
        endpoint: options.endpoint,
      });

      // Extract quota information for cost tracking
      const quotaAfter = result.quota_remaining;
      const costUSD = calculateCostFromQuota(quotaBefore, quotaAfter);

      // Return extracted tables
      return {
        json: result.tables || result.data || result,
        costUSD,
        inputTokens: undefined,
        outputTokens: undefined,
      };
    },
  };
}
