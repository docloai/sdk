/**
 * Reducto Extract Provider
 *
 * VLMProvider implementation using Reducto Extract API
 * Schema-based structured extraction with citations
 *
 * @see https://docs.reducto.ai/api-reference/extract
 */

import type { VLMProvider, MultimodalInput, ProviderCitation, ProviderIdentity, ReasoningConfig } from "@doclo/core";
import { fetchWithTimeout } from "@doclo/core/security";
import type {
  ReductoExtractOptions,
  ReductoExtractResponse,
} from "./types.js";
import {
  getFileBuffer,
  uploadFile,
  pollJob,
  formatUsage,
  createHeaders,
  REDUCTO_REQUEST_TIMEOUT,
} from "./utils.js";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_ENDPOINT = 'https://platform.reducto.ai';

// ============================================================================
// Extended Input Type
// ============================================================================

/**
 * Extended input for Reducto Extract
 */
export type ReductoExtractInput = {
  prompt: string | MultimodalInput;
  schema: object;
  max_tokens?: number;
  reasoning?: ReasoningConfig;
  // Reducto-specific options (override provider-level)
  systemPrompt?: string;
  additionalPrompt?: string;
  citations?: boolean;
  maxPages?: number;
  pageRange?: { start?: number; end?: number } | number[];
};

/**
 * Result from Reducto Extract
 */
export type ReductoExtractResult = {
  json: unknown;
  rawText?: string;
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /** Field-level citations from Reducto */
  citations?: ProviderCitation[];
  /** Reducto-specific extras */
  extras?: {
    credits: number;
    numFields: number;
    jobId: string;
    duration: number;
  };
};

// ============================================================================
// Extract Provider
// ============================================================================

/**
 * Create a VLM provider using Reducto Extract API
 *
 * Features:
 * - Schema-based structured extraction
 * - Field-level citations
 * - System prompt support
 * - Agentic mode for higher accuracy
 *
 * @param opts - Provider options
 * @returns VLMProvider instance
 *
 * @example
 * ```typescript
 * const provider = reductoExtractProvider({
 *   apiKey: process.env.REDUCTO_API_KEY!,
 *   citations: true
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { images: [{ base64: documentData }] },
 *   schema: { invoice_number: 'string', total: 'number' }
 * });
 * ```
 */
export function reductoExtractProvider(opts: ReductoExtractOptions): VLMProvider {
  const endpoint = opts.endpoint || DEFAULT_ENDPOINT;

  const identity: ProviderIdentity = {
    provider: 'reducto',
    model: 'v1',
    method: 'native'
  };

  return {
    identity,
    name: 'reducto:v1',

    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
    },

    async completeJson(input: ReductoExtractInput): Promise<ReductoExtractResult> {
      // Extract document from multimodal input
      let fileUrl: string | undefined;
      let fileId: string | undefined;

      if (typeof input.prompt === 'string') {
        throw new Error('Reducto Extract requires image/PDF input, not text prompt');
      }

      const multimodal = input.prompt as MultimodalInput;

      // Get file from images or PDFs
      let dataUrl: string | undefined;

      if (multimodal.images && multimodal.images.length > 0) {
        dataUrl = multimodal.images[0].base64 || multimodal.images[0].url;
      } else if (multimodal.pdfs && multimodal.pdfs.length > 0) {
        dataUrl = multimodal.pdfs[0].base64 || multimodal.pdfs[0].url;
      }

      if (!dataUrl) {
        throw new Error('Reducto Extract requires image or PDF input');
      }

      // Handle URL vs base64
      if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        fileUrl = dataUrl;
      } else {
        // Upload base64 data
        const { buffer, filename } = await getFileBuffer({ base64: dataUrl });
        const uploadResult = await uploadFile(buffer, filename, opts.apiKey, endpoint);
        // Use file_id directly - check if it already has the reducto:// prefix
        const documentRef = uploadResult.file_id.startsWith('reducto://')
          ? uploadResult.file_id
          : `reducto://${uploadResult.file_id}`;
        fileUrl = uploadResult.presigned_url || documentRef;
        fileId = uploadResult.file_id;
      }

      // Build extract request
      // Note: Reducto API uses 'input' for document and 'schema' for extraction schema
      const extractRequest: Record<string, unknown> = {
        input: fileUrl,
        schema: input.schema,
      };

      // System prompt
      const systemPrompt = input.systemPrompt || input.additionalPrompt || opts.systemPrompt;
      if (systemPrompt) {
        extractRequest.system_prompt = systemPrompt;
      }

      // Citations
      const enableCitations = input.citations ?? opts.citations;
      if (enableCitations) {
        extractRequest.citations = true;
      }

      // Agentic mode
      if (opts.agentic) {
        extractRequest.agentic = true;
      }

      // Latency optimization
      if (opts.optimizeForLatency) {
        extractRequest.optimize_for_latency = true;
      }

      // Include extracted images as URLs or base64
      if (opts.includeImages) {
        extractRequest.include_images = true;
      }

      // Array extraction mode for processing repeated structures
      if (opts.arrayExtract) {
        extractRequest.array_extract = true;
      }

      // Page range - needs to be in parsing.settings
      const pageRangeOpt = input.pageRange || opts.pageRange;
      const maxPages = input.maxPages ?? opts.maxPages;
      if (pageRangeOpt || maxPages) {
        let pageRangeValue: unknown;
        if (pageRangeOpt) {
          if (Array.isArray(pageRangeOpt)) {
            pageRangeValue = pageRangeOpt;
          } else {
            pageRangeValue = {
              start: pageRangeOpt.start ?? 0,
              end: pageRangeOpt.end,
            };
          }
        } else if (maxPages) {
          pageRangeValue = { start: 0, end: maxPages - 1 };
        }

        extractRequest.parsing = {
          settings: { page_range: pageRangeValue },
        };
      }

      // Submit extract request - use extended timeout for document processing
      const resp = await fetchWithTimeout(`${endpoint}/extract`, {
        method: 'POST',
        headers: createHeaders(opts.apiKey),
        body: JSON.stringify(extractRequest),
      }, REDUCTO_REQUEST_TIMEOUT);

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '');
        throw new Error(`Reducto extract failed: ${resp.status} ${errorText}`);
      }

      const extractResponse = await resp.json() as ReductoExtractResponse | { job_id: string; status: string };

      // Handle async response
      let result: ReductoExtractResponse;
      if ('status' in extractResponse && extractResponse.status !== 'completed') {
        result = await pollJob<ReductoExtractResponse>(
          extractResponse.job_id,
          opts.apiKey,
          endpoint
        );
      } else {
        result = extractResponse as ReductoExtractResponse;
      }

      // Format usage
      const usage = formatUsage({
        num_pages: result.usage.num_pages,
        credits: result.usage.credits,
      });

      // Convert citations to SDK format
      const citations: ProviderCitation[] = [];
      if (result.citations && Array.isArray(result.citations)) {
        for (const citation of result.citations) {
          citations.push({
            fieldPath: citation.field_path,
            blockIds: citation.block_ids,
            confidence: citation.confidence,
          });
        }
      }

      return {
        json: result.result,
        costUSD: usage.estimatedUSD,
        citations: citations.length > 0 ? citations : undefined,
        extras: {
          credits: usage.credits,
          numFields: result.usage.num_fields,
          jobId: result.job_id,
          duration: result.duration,
        },
      };
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export type { ReductoExtractOptions };
