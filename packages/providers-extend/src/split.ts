/**
 * Extend.ai Split Provider - VLMProvider implementation
 *
 * Uses Extend.ai's splitter processor for document splitting.
 * Detects sub-documents within a multi-page document and returns
 * segments with page ranges and classifications.
 *
 * Maps to the split() node in doclo flows.
 */

import type { VLMProvider, ProviderIdentity, MultimodalInput } from '@doclo/core';
import { validateUrl } from '@doclo/core/security';
import { ExtendApiClient, detectMimeType } from './api-client.js';
import type {
  ExtendSplitOptions,
  ExtendSplitOutput,
  ExtendProcessorRunResult,
  ExtendSplitSegment,
} from './types.js';

const DEBUG = process.env.DEBUG_PROVIDERS === 'true';

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[extend-split]', ...args);
  }
}

/**
 * Create a VLM provider using Extend.ai's document splitting API
 *
 * @example
 * ```typescript
 * const provider = extendSplitProvider({
 *   apiKey: process.env.EXTEND_API_KEY!,
 *   processorId: 'your-splitter-id',
 *   classifications: [
 *     { id: 'invoice', type: 'invoice', label: 'Invoice Document' },
 *     { id: 'contract', type: 'contract', label: 'Contract Document' },
 *   ],
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: { pdfs: [{ url: 'mixed-docs.pdf' }] },
 *   schema: { type: 'object', properties: { documents: { type: 'array' } } }
 * });
 * ```
 */
export function extendSplitProvider(options: ExtendSplitOptions): VLMProvider {
  const identity: ProviderIdentity = {
    provider: 'extend',
    model: 'splitter',
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
    name: 'extend:splitter',
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

      // Build processor config
      const config: Record<string, unknown> = {};

      if (options.classifications && options.classifications.length > 0) {
        config.classifications = options.classifications;
      }

      if (options.splitMethod) {
        config.splitMethod = options.splitMethod;
      }

      if (options.prompt) {
        config.prompt = options.prompt;
      }

      // Run the processor
      debug(`Running splitter processor: ${options.processorId}`);
      const runResponse = await client.runProcessor(options.processorId, {
        fileId,
        fileUrl,
        sync: options.sync,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      debug(`Splitter started: runId=${runResponse.runId}, status=${runResponse.status}`);

      // Poll for completion
      const result = await client.pollProcessorRun<ExtendSplitOutput>(runResponse.runId);

      debug(`Splitter completed: status=${result.status}`);

      if (result.status === 'FAILED') {
        throw new Error(`Extend split failed: ${result.error || 'Unknown error'}`);
      }

      if (result.status === 'REJECTED') {
        throw new Error('Extend split was rejected');
      }

      // Transform to standard split output format
      const output = result.value;
      const documents = transformSegmentsToDocuments(output?.segments || [], output?.totalPages);

      return {
        json: {
          documents,
          totalPages: output?.totalPages,
        },
      };
    },
  };
}

/**
 * Transform Extend segments to standard split document format
 */
function transformSegmentsToDocuments(
  segments: ExtendSplitSegment[],
  totalPages?: number
): Array<{
  type: string;
  pages: number[];
  confidence: number;
  classificationId?: string;
}> {
  return segments.map((segment) => {
    // Convert page range to array of pages (1-indexed)
    const [startPage, endPage] = segment.pageRange;
    const pages: number[] = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return {
      type: segment.classificationType,
      pages,
      confidence: segment.confidence,
      classificationId: segment.classificationId,
    };
  });
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
      'Extend splitting requires a document. Provide pdfs or images in the prompt.'
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
    'Extend splitting requires a document. Provide pdfs or images in the prompt.'
  );
}
