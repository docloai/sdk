/**
 * Extend.ai Parse Provider - OCRProvider implementation
 *
 * Uses Extend.ai's /parse endpoint for document parsing.
 * Returns markdown/text content from documents.
 *
 * Supported formats: PDF, PNG, JPEG, TIFF, GIF, WEBP, DOCX, XLSX, PPTX
 */

import type { DocumentIR, OCRProvider, ProviderIdentity, IRPage, IRLine } from '@doclo/core';
import { validateUrl } from '@doclo/core/security';
import { ExtendApiClient, detectMimeType, getMimeTypeFromFilename } from './api-client.js';
import type { ExtendParseOptions, ExtendParseResult } from './types.js';

const DEBUG = process.env.DEBUG_PROVIDERS === 'true';

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[extend-parse]', ...args);
  }
}

/**
 * Create an OCR provider using Extend.ai's parsing API
 *
 * @example
 * ```typescript
 * const provider = extendParseProvider({
 *   apiKey: process.env.EXTEND_API_KEY!,
 * });
 *
 * const ir = await provider.parseToIR({ url: 'document.pdf' });
 * ```
 */
export function extendParseProvider(options: ExtendParseOptions): OCRProvider {
  const identity: ProviderIdentity = {
    provider: 'extend',
    model: 'parser',
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
    name: 'extend:parser',

    async parseToIR(input): Promise<DocumentIR> {
      let fileId: string | undefined;
      let fileUrl: string | undefined;

      // Handle URL input
      if (input.url) {
        // Check if it's a remote URL or local file path
        if (input.url.startsWith('http://') || input.url.startsWith('https://')) {
          validateUrl(input.url);  // SSRF protection
          fileUrl = input.url;
        } else {
          // Local file - need to upload
          const fs = await import('fs');
          const path = await import('path');
          const buffer = fs.readFileSync(input.url);
          const filename = path.basename(input.url);
          // Use magic byte detection to get actual MIME type (handles misnamed extensions)
          const mimeType = detectMimeType(buffer, filename);

          debug(`Uploading local file: ${filename} (detected: ${mimeType})`);
          const uploadResponse = await client.uploadFile(buffer, filename, mimeType);
          fileId = uploadResponse.fileId;
          debug(`Uploaded file, got fileId: ${fileId}`);
        }
      } else if (input.base64) {
        // Base64 input - need to upload
        // Extract filename from base64 data URI if present, or use default
        let filename = 'document.pdf';
        let base64Data = input.base64;

        // Handle data URI format: data:application/pdf;base64,XXXX
        if (input.base64.startsWith('data:')) {
          const match = input.base64.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            base64Data = match[2];
            // Set filename based on mime type
            const ext = mimeType.split('/')[1] || 'pdf';
            filename = `document.${ext}`;
          }
        }

        const mimeType = getMimeTypeFromFilename(filename);
        debug(`Uploading base64 content as: ${filename} (${mimeType})`);
        const uploadResponse = await client.uploadFileFromBase64(base64Data, filename, mimeType);
        fileId = uploadResponse.fileId;
        debug(`Uploaded file, got fileId: ${fileId}`);
      } else {
        throw new Error('Either url or base64 must be provided');
      }

      // Parse the file - Extend /parse is synchronous and returns result immediately
      debug('Parsing file...');
      const result = await client.parse({
        fileId,
        fileUrl,
      });

      debug(`Parse completed: id=${result.id}, status=${result.status}, pages=${result.metrics.pageCount}`);

      if (result.status === 'FAILED') {
        throw new Error('Extend parse failed');
      }

      // Transform result to DocumentIR
      return transformToDocumentIR(result);
    },
  };
}

/**
 * Transform Extend parse result to DocumentIR format
 */
function transformToDocumentIR(result: ExtendParseResult): DocumentIR {
  const chunks = result.chunks || [];

  if (chunks.length === 0) {
    // Return empty document if no content
    return {
      pages: [],
      extras: {
        provider: 'extend',
        raw: result,
      },
    };
  }

  // Transform chunks to pages (each chunk is typically a page)
  const pages: IRPage[] = chunks.map((chunk, index) => {
    const pageNumber = chunk.metadata.pageRange?.start || index + 1;
    const lines = parseMarkdownToLines(chunk.content);

    // Try to get page dimensions from blocks
    let width = 0;
    let height = 0;
    if (chunk.blocks && chunk.blocks.length > 0) {
      const firstBlock = chunk.blocks[0];
      if (firstBlock.metadata?.page) {
        width = firstBlock.metadata.page.width;
        height = firstBlock.metadata.page.height;
      }
    }

    return {
      pageNumber,
      width,
      height,
      lines,
      markdown: chunk.content,
    };
  });

  return {
    pages,
    extras: {
      pageCount: result.metrics.pageCount,
      processingTimeMs: result.metrics.processingTimeMs,
      credits: result.usage?.credits,
      provider: 'extend',
      raw: result,
    },
  };
}

/**
 * Parse markdown content into lines for DocumentIR
 */
function parseMarkdownToLines(markdown: string): IRLine[] {
  // Split by newlines and filter empty lines
  const textLines = markdown.split('\n');
  let charOffset = 0;

  return textLines.map((text, index) => {
    const line: IRLine = {
      text,
      startChar: charOffset,
      endChar: charOffset + text.length,
      lineId: `l${index + 1}`,
    };
    charOffset += text.length + 1; // +1 for newline
    return line;
  });
}
