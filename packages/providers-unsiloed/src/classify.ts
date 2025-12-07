/**
 * Unsiloed Classify Provider - VLMProvider implementation
 *
 * Uses Unsiloed's /classify endpoint for document classification
 *
 * NOTE: Only supports PDF files. For images, use the /parse or /cite endpoints.
 */

import type { VLMProvider, ProviderIdentity } from '@doclo/core';
import { unsiloedFetch, getFileBuffer, detectMimeType, validatePDFFormat } from './utils/api-client.js';
import { pollJobUntilComplete } from './utils/job-polling.js';
import { extractPDFFromMultimodal, calculateCostFromQuota } from './utils/transforms.js';

export interface UnsiloedClassifyOptions {
  apiKey: string;
  endpoint?: string;
  conditions?: string[]; // Default categories to use if not specified in schema
}

/**
 * Create a VLM provider using Unsiloed's classification API
 *
 * @example
 * ```typescript
 * const provider = unsiloedClassifyProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!,
 *   conditions: ['invoice', 'receipt', 'contract']
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { pdfs: [{ url: 'document.pdf' }] },
 *   schema: { type: 'object', properties: { category: { enum: ['invoice', 'receipt', 'contract'] } } }
 * });
 * ```
 */
export function unsiloedClassifyProvider(
  options: UnsiloedClassifyOptions
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
      supportsImages: true, // Type requirement - VLMProvider must support images
      supportsPDFs: true,
    },

    async completeJson(input) {
      // Extract PDF from multimodal input
      const pdfInput = extractPDFFromMultimodal(input);

      // Get file buffer
      const { buffer, filename } = await getFileBuffer(pdfInput);

      // Detect MIME type from actual file content (magic bytes)
      const mimeType = detectMimeType(buffer);

      // Validate that it's a PDF - /classify only supports PDFs
      validatePDFFormat(mimeType, '/classify', filename);

      // Debug logging
      if (process.env.DEBUG_PROVIDERS) {
        console.log(`[Unsiloed Classify] Detected MIME type: ${mimeType} for file: ${filename}`);
      }

      // Extract conditions/categories from schema or use default
      const conditions = extractConditionsFromSchema(input.schema, options.conditions);

      if (!conditions || conditions.length === 0) {
        throw new Error(
          'Unsiloed classify requires conditions/categories. Provide them in options.conditions or in the schema enum.'
        );
      }

      // Create form data
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('pdf_file', blob, filename);

      // Add conditions as JSON array string
      formData.append('conditions', JSON.stringify(conditions));

      // Submit classification request
      const response = await unsiloedFetch('/classify', {
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
        throw new Error('Unsiloed classify request did not return a job_id');
      }

      // Poll for completion
      const completedJob = await pollJobUntilComplete(
        submitResult.job_id,
        `/classify/${submitResult.job_id}`,
        {
          apiKey: options.apiKey,
          endpoint: options.endpoint,
        }
      );

      // Extract quota information for cost tracking
      const quotaAfter = completedJob.quota_remaining;
      const costUSD = calculateCostFromQuota(quotaBefore, quotaAfter);

      // Return classification result
      return {
        json: completedJob.classification || completedJob.result || completedJob,
        costUSD,
        inputTokens: undefined,
        outputTokens: undefined,
      };
    },
  };
}

/**
 * Extract conditions/categories from schema
 * Looks for enum values in the schema that represent categories
 */
function extractConditionsFromSchema(
  schema: any,
  defaultConditions?: string[]
): string[] | undefined {
  if (!schema) return defaultConditions;

  // Check if schema has properties with enum
  if (schema.properties) {
    for (const prop of Object.values(schema.properties) as any[]) {
      if (prop.enum && Array.isArray(prop.enum)) {
        return prop.enum;
      }
    }
  }

  // Check if schema itself has enum
  if (schema.enum && Array.isArray(schema.enum)) {
    return schema.enum;
  }

  // Fall back to default conditions
  return defaultConditions;
}
