/**
 * Unsiloed Split Provider - VLMProvider implementation
 *
 * Uses Unsiloed's /splitter/split-pdf-v1 endpoint for document splitting
 * by classifying pages into different categories
 *
 * NOTE: Only supports PDF files. For images, use the /parse or /cite endpoints.
 */

import type { VLMProvider, ProviderIdentity } from '@docloai/core';
import { unsiloedFetch, getFileBuffer, detectMimeType, validatePDFFormat } from './utils/api-client.js';
import { extractPDFFromMultimodal, calculateCostFromQuota } from './utils/transforms.js';

export interface UnsiloedSplitOptions {
  apiKey: string;
  endpoint?: string;
  categories?: Record<string, string>; // Category name -> description mapping
}

/**
 * Create a VLM provider using Unsiloed's document splitting API
 *
 * @example
 * ```typescript
 * const provider = unsiloedSplitProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!,
 *   categories: {
 *     'invoice': 'Invoice or billing document',
 *     'contract': 'Legal contract or agreement'
 *   }
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { pdfs: [{ url: 'mixed-docs.pdf' }] },
 *   schema: { type: 'object', properties: { splits: { type: 'array' } } }
 * });
 * ```
 */
export function unsiloedSplitProvider(
  options: UnsiloedSplitOptions
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
      supportsImages: true, // API accepts images but only PDFs are recommended
      supportsPDFs: true,
    },

    async completeJson(input) {
      // Extract PDF from multimodal input
      const pdfInput = extractPDFFromMultimodal(input);

      // Get file buffer
      const { buffer, filename } = await getFileBuffer(pdfInput);

      // Detect MIME type from actual file content (magic bytes)
      const mimeType = detectMimeType(buffer);

      // Validate that it's a PDF - /splitter only supports PDFs
      validatePDFFormat(mimeType, '/splitter', filename);

      // Debug logging
      if (process.env.DEBUG_PROVIDERS) {
        console.log(`[Unsiloed Split] Detected MIME type: ${mimeType} for file: ${filename}`);
      }

      // Extract categories from schema or use default
      const categories = extractCategoriesFromSchema(input.schema, options.categories);

      if (!categories || Object.keys(categories).length === 0) {
        throw new Error(
          'Unsiloed split requires categories. Provide them in options.categories or define in the schema.'
        );
      }

      // Create form data
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('file', blob, filename);

      // Add categories as JSON string
      formData.append('categories', JSON.stringify(categories));

      // Build query parameter with comma-separated class names
      const classes = Object.keys(categories).join(',');
      const queryPath = `/splitter/split-pdf-v1?classes=${encodeURIComponent(classes)}`;

      // Submit split request
      const response = await unsiloedFetch(queryPath, {
        method: 'POST',
        body: formData,
        apiKey: options.apiKey,
        endpoint: options.endpoint,
      });

      const result = await response.json() as any;

      // Note: The split endpoint appears to be synchronous based on API docs
      // It returns results immediately rather than a job_id
      // If this changes, we'd need to add polling logic

      // Extract quota information for cost tracking
      const quotaBefore = result.quota_before;
      const quotaAfter = result.quota_remaining || result.quota_after;
      const costUSD = calculateCostFromQuota(quotaBefore, quotaAfter);

      // Return split results
      return {
        json: result.splits || result.pages || result,
        costUSD,
        inputTokens: undefined,
        outputTokens: undefined,
      };
    },
  };
}

/**
 * Extract categories from schema
 * Looks for category definitions in the schema
 */
function extractCategoriesFromSchema(
  schema: any,
  defaultCategories?: Record<string, string>
): Record<string, string> | undefined {
  if (!schema) return defaultCategories;

  // Check if schema has a categories property with descriptions
  if (schema.properties?.categories) {
    const categoriesSchema = schema.properties.categories;
    if (categoriesSchema.properties) {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(categoriesSchema.properties)) {
        const prop = value as any;
        result[key] = prop.description || key;
      }
      if (Object.keys(result).length > 0) {
        return result;
      }
    }
  }

  // Check if schema has enum values that can be used as categories
  if (schema.properties) {
    for (const [propName, prop] of Object.entries(schema.properties) as [string, any][]) {
      if (prop.enum && Array.isArray(prop.enum)) {
        const result: Record<string, string> = {};
        for (const category of prop.enum) {
          result[category] = category; // Use category name as description
        }
        return result;
      }
    }
  }

  // Fall back to default categories
  return defaultCategories;
}
