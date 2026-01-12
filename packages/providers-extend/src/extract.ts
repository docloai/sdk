/**
 * Extend.ai Extract Provider - VLMProvider implementation
 *
 * Uses Extend.ai's processor API for structured data extraction.
 * Supports JSON Schema with Extend-specific type extensions.
 *
 * Special features:
 * - extend:type: "date" - Returns ISO 8601 formatted dates
 * - extend:type: "currency" - Returns { amount, currency } objects
 * - extend:type: "signature" - Detects signature presence
 * - Citations with bounding polygons
 * - Field-level confidence scores
 */

import type { VLMProvider, ProviderIdentity, MultimodalInput } from '@doclo/core';
import { validateUrl } from '@doclo/core/security';
import { ExtendApiClient, detectMimeType } from './api-client.js';
import type {
  ExtendExtractOptions,
  ExtendProcessorRunResult,
  ExtendCitation,
} from './types.js';

const DEBUG = process.env.DEBUG_PROVIDERS === 'true';

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[extend-extract]', ...args);
  }
}

/**
 * Create a VLM provider using Extend.ai's extraction API
 *
 * @example
 * ```typescript
 * const provider = extendExtractProvider({
 *   apiKey: process.env.EXTEND_API_KEY!,
 *   processorId: 'your-processor-id',
 *   citationsEnabled: true,
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { pdfs: [{ url: 'invoice.pdf' }] },
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       invoiceDate: { type: 'string', 'extend:type': 'date' },
 *       total: { type: 'object', 'extend:type': 'currency' },
 *     }
 *   }
 * });
 * ```
 */
export function extendExtractProvider(options: ExtendExtractOptions): VLMProvider {
  const identity: ProviderIdentity = {
    provider: 'extend',
    model: 'extractor',
    method: 'native',
  };

  const client = new ExtendApiClient({
    apiKey: options.apiKey,
    endpoint: options.endpoint,
    apiVersion: options.apiVersion,
    timeout: options.timeout,
  });

  return {
    identity,
    name: 'extend:extractor',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
    },

    async completeJson(input) {
      // Extract document from multimodal input
      const docInput = extractDocumentFromInput(input);

      let fileId: string | undefined;
      let fileUrl: string | undefined;

      // Handle the document input
      if (docInput.url) {
        if (docInput.url.startsWith('http://') || docInput.url.startsWith('https://')) {
          validateUrl(docInput.url);  // SSRF protection
          fileUrl = docInput.url;
        } else {
          // Local file - upload it
          const fs = await import('fs');
          const path = await import('path');
          const buffer = fs.readFileSync(docInput.url);
          const filename = path.basename(docInput.url);
          // Use magic byte detection to get actual MIME type (handles misnamed extensions)
          const mimeType = detectMimeType(buffer, filename);

          debug(`Uploading local file: ${filename} (detected: ${mimeType})`);
          const uploadResponse = await client.uploadFile(buffer, filename, mimeType);
          fileId = uploadResponse.fileId;
          debug(`Uploaded file, got fileId: ${fileId}`);
        }
      } else if (docInput.base64) {
        // Base64 input - upload it
        let filename = 'document.pdf';
        let base64Data = docInput.base64;

        // Handle data URI format
        if (docInput.base64.startsWith('data:')) {
          const match = docInput.base64.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const detectedMimeType = match[1];
            base64Data = match[2];
            const ext = detectedMimeType.split('/')[1] || 'pdf';
            filename = `document.${ext}`;
          }
        }

        // For base64, decode and detect actual MIME type
        const buffer = Buffer.from(base64Data, 'base64');
        const mimeType = detectMimeType(buffer, filename);
        debug(`Uploading base64 content as: ${filename} (detected: ${mimeType})`);
        const uploadResponse = await client.uploadFileFromBase64(base64Data, filename, mimeType);
        fileId = uploadResponse.fileId;
        debug(`Uploaded file, got fileId: ${fileId}`);
      } else {
        throw new Error('No document found in input. Provide pdfs or images in the prompt.');
      }

      // Run the processor
      debug(`Running processor: ${options.processorId}`);
      const runResponse = await client.runProcessor(options.processorId, {
        fileId,
        fileUrl,
        sync: options.sync,
        config: options.citationsEnabled ? { citationsEnabled: true } : undefined,
      });

      debug(`Processor started: runId=${runResponse.runId}, status=${runResponse.status}`);

      // Poll for completion
      const result = await client.pollProcessorRun<unknown>(runResponse.runId);

      debug(`Processor completed: status=${result.status}`);

      if (result.status === 'FAILED') {
        throw new Error(`Extend extraction failed: ${result.error || 'Unknown error'}`);
      }

      if (result.status === 'REJECTED') {
        throw new Error('Extend extraction was rejected');
      }

      // Build response with citations if available
      const response: {
        json: unknown;
        rawText?: string;
        costUSD?: number;
        inputTokens?: number;
        outputTokens?: number;
        metadata?: {
          confidence?: Record<string, number>;
          citations?: ExtendCitation[];
        };
      } = {
        json: result.value || {},
      };

      // Include metadata if available
      if (result.metadata) {
        response.metadata = {
          confidence: result.metadata.confidence,
          citations: result.metadata.citations,
        };
      }

      return response;
    },
  };
}

/**
 * Extract document URL/base64 from VLM multimodal input
 */
function extractDocumentFromInput(
  input: { prompt: string | MultimodalInput; schema: object }
): { url?: string; base64?: string } {
  const prompt = input.prompt;

  // If prompt is a string (text-only), no document to extract
  if (typeof prompt === 'string') {
    throw new Error(
      'Extend extraction requires a document. Provide pdfs or images in the prompt.'
    );
  }

  // Check for PDFs first
  if (prompt.pdfs && prompt.pdfs.length > 0) {
    const pdf = prompt.pdfs[0];
    return { url: pdf.url, base64: pdf.base64 };
  }

  // Check for images
  if (prompt.images && prompt.images.length > 0) {
    const image = prompt.images[0];
    return { url: image.url, base64: image.base64 };
  }

  throw new Error(
    'Extend extraction requires a document. Provide pdfs or images in the prompt.'
  );
}
