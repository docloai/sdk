/**
 * Reducto Parse Provider
 *
 * OCRProvider implementation using Reducto Parse API
 * Converts documents to DocumentIR with bounding boxes and confidence scores
 *
 * @see https://docs.reducto.ai/api-reference/parse
 */

import type { DocumentIR, OCRProvider, NormalizedBBox, ExtractedImage, ProviderIdentity } from "@doclo/core";
import { fetchWithTimeout } from "@doclo/core/security";
import type {
  ReductoParseOptions,
  ReductoParseResponse,
  ReductoChunk,
  ReductoBlock,
  ReductoConfidence,
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
// Parse Provider
// ============================================================================

/**
 * Create an OCR provider using Reducto Parse API
 *
 * Features:
 * - Bounding boxes on all blocks
 * - Confidence scores (low/medium/high)
 * - RAG-optimized chunking modes
 * - Multiple table output formats
 * - Image extraction for figures/tables
 *
 * @param opts - Provider options
 * @returns OCRProvider instance
 *
 * @example
 * ```typescript
 * const provider = reductoParseProvider({
 *   apiKey: process.env.REDUCTO_API_KEY!,
 *   chunkMode: 'variable',
 *   tableOutputFormat: 'md'
 * });
 *
 * const result = await provider.parseToIR({ base64: documentData });
 * console.log(result.pages[0].lines);
 * ```
 */
export function reductoParseProvider(opts: ReductoParseOptions): OCRProvider {
  const endpoint = opts.endpoint || DEFAULT_ENDPOINT;

  const identity: ProviderIdentity = {
    provider: 'reducto',
    model: 'v1',
    method: 'native'
  };

  return {
    identity,
    name: 'reducto:v1',

    async parseToIR(input: { url?: string; base64?: string }): Promise<DocumentIR> {
      // Get file buffer
      const { buffer, filename, mimeType } = await getFileBuffer(input);

      // Upload file first
      const uploadResult = await uploadFile(buffer, filename, opts.apiKey, endpoint);

      // Build parse request
      // Note: Use file_id directly - Reducto upload returns the correct reference format
      const documentRef = uploadResult.file_id.startsWith('reducto://')
        ? uploadResult.file_id
        : `reducto://${uploadResult.file_id}`;

      const parseRequest: Record<string, unknown> = {
        input: uploadResult.presigned_url || documentRef,
      };

      // Add retrieval options (chunking)
      if (opts.chunkMode && opts.chunkMode !== 'disabled') {
        const retrievalConfig: Record<string, unknown> = {
          chunking: {
            mode: opts.chunkMode,
            ...(opts.chunkSize && { target_size: opts.chunkSize }),
          },
        };

        // Filter specific block types from content/embed fields
        if (opts.filterBlocks && opts.filterBlocks.length > 0) {
          retrievalConfig.filter_blocks = opts.filterBlocks;
        }

        // Optimize output for embedding models
        if (opts.embeddingOptimized) {
          retrievalConfig.embedding_optimized = true;
        }

        parseRequest.retrieval = retrievalConfig;
      }

      // Add formatting options
      if (opts.tableOutputFormat || opts.addPageMarkers || opts.mergeTables) {
        const formattingConfig: Record<string, unknown> = {};

        if (opts.tableOutputFormat) {
          formattingConfig.table_output_format = opts.tableOutputFormat;
        }

        if (opts.addPageMarkers) {
          formattingConfig.add_page_markers = true;
        }

        if (opts.mergeTables) {
          formattingConfig.merge_tables = true;
        }

        parseRequest.formatting = formattingConfig;
      }

      // Add enhance options (agentic mode, figure summarization)
      if (opts.agentic || opts.summarizeFigures !== undefined) {
        const enhanceConfig: Record<string, unknown> = {};

        if (opts.agentic) {
          enhanceConfig.enabled = true;
        }

        // summarizeFigures defaults to true in Reducto, so only set if explicitly false
        if (opts.summarizeFigures === false) {
          enhanceConfig.summarize_figures = false;
        }

        if (Object.keys(enhanceConfig).length > 0) {
          parseRequest.enhance = enhanceConfig;
        }
      }

      // Add settings options
      const settings: Record<string, unknown> = {};

      if (opts.returnImages && opts.returnImages.length > 0) {
        settings.return_images = opts.returnImages;
      }

      if (opts.ocrSystem) {
        settings.ocr_system = opts.ocrSystem;
      }

      if (opts.returnOcrData) {
        settings.return_ocr_data = true;
      }

      if (opts.forceUrlResult) {
        settings.force_url_result = true;
      }

      // Page range in settings - use object format {start, end} or array
      if (opts.pageRange) {
        if (Array.isArray(opts.pageRange)) {
          // Array of page numbers: [0, 1, 2]
          settings.page_range = opts.pageRange;
        } else {
          // Object format: { start: 0, end: 5 }
          settings.page_range = {
            start: opts.pageRange.start ?? 0,
            end: opts.pageRange.end,
          };
        }
      } else if (opts.maxPages) {
        settings.page_range = { start: 0, end: opts.maxPages - 1 };
      }

      if (Object.keys(settings).length > 0) {
        parseRequest.settings = settings;
      }

      // Submit parse request - use custom timeout or default extended timeout for document processing
      const requestTimeout = opts.timeout ? opts.timeout * 1000 : REDUCTO_REQUEST_TIMEOUT;
      const resp = await fetchWithTimeout(`${endpoint}/parse`, {
        method: 'POST',
        headers: createHeaders(opts.apiKey),
        body: JSON.stringify(parseRequest),
      }, requestTimeout);

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '');
        throw new Error(`Reducto parse failed: ${resp.status} ${errorText}`);
      }

      const parseResponse = await resp.json() as ReductoParseResponse | { job_id: string; status: string };

      // Handle async response
      let result: ReductoParseResponse;
      if ('status' in parseResponse && parseResponse.status !== 'completed') {
        result = await pollJob<ReductoParseResponse>(
          parseResponse.job_id,
          opts.apiKey,
          endpoint
        );
      } else {
        result = parseResponse as ReductoParseResponse;
      }

      // Convert to DocumentIR
      return convertToDocumentIR(result, opts);
    },
  };
}

// ============================================================================
// Response Conversion
// ============================================================================

/**
 * Convert Reducto Parse response to DocumentIR format
 */
function convertToDocumentIR(
  response: ReductoParseResponse,
  opts: ReductoParseOptions
): DocumentIR {
  const usage = formatUsage(response.usage);

  // Group blocks by page
  const pageBlocks = new Map<number, ReductoBlock[]>();
  const extractedImages: ExtractedImage[] = [];

  for (const chunk of response.result.chunks) {
    for (const block of chunk.blocks) {
      const pageNum = block.bbox.page;
      if (!pageBlocks.has(pageNum)) {
        pageBlocks.set(pageNum, []);
      }
      pageBlocks.get(pageNum)!.push(block);

      // Collect extracted images
      if (block.image_url && (block.type === 'Figure' || block.type === 'Table')) {
        extractedImages.push({
          id: `${block.type.toLowerCase()}-${pageNum}-${pageBlocks.get(pageNum)!.length}`,
          pageNumber: pageNum,
          base64: '', // URL-based, not base64
          mimeType: 'image/png',
          bbox: convertBBox(block.bbox),
          caption: block.type,
          // Store URL in a way that can be fetched later
        });
      }
    }
  }

  // Build pages
  const pages: DocumentIR['pages'] = [];
  const sortedPageNums = Array.from(pageBlocks.keys()).sort((a, b) => a - b);

  for (const pageNum of sortedPageNums) {
    const blocks = pageBlocks.get(pageNum)!;

    // Sort blocks by vertical position (top to bottom)
    blocks.sort((a, b) => a.bbox.top - b.bbox.top);

    const lines = blocks.map(block => ({
      text: block.content,
      bbox: convertBBox(block.bbox),
      // Store block-level metadata
      confidence: block.confidence,
      blockType: block.type,
    }));

    // Combine lines into markdown if possible
    const markdown = blocks
      .map(block => formatBlockAsMarkdown(block))
      .join('\n\n');

    pages.push({
      width: 612,  // Default PDF width
      height: 792, // Default PDF height
      lines,
      markdown,
    });
  }

  // Ensure at least one page exists
  if (pages.length === 0) {
    pages.push({
      width: 612,
      height: 792,
      lines: [],
      markdown: '',
    });
  }

  // Build DocumentIR
  const ir: DocumentIR = {
    pages,
    extras: {
      raw: response,
      costUSD: usage.estimatedUSD,
      credits: usage.credits,
      numPages: usage.numPages,
      jobId: response.job_id,
      duration: response.duration,
      // Reducto-specific extras
      chunks: response.result.chunks,
      blockConfidence: extractConfidenceMap(response.result.chunks),
      images: extractedImages.length > 0 ? extractedImages : undefined,
    },
  };

  return ir;
}

/**
 * Convert Reducto bbox to normalized bbox
 */
function convertBBox(bbox: ReductoBlock['bbox']): NormalizedBBox {
  return {
    x: bbox.left,
    y: bbox.top,
    w: bbox.width,
    h: bbox.height,
  };
}

/**
 * Format a block as markdown based on its type.
 * Block types from Reducto API: Header, Footer, Title, Section Header, Page Number,
 * List Item, Figure, Table, Key Value, Text, Comment, Signature
 */
function formatBlockAsMarkdown(block: ReductoBlock): string {
  switch (block.type) {
    case 'Header':
    case 'Footer':
      // Usually skip page headers/footers in main content
      return '';
    case 'Title':
    case 'Section Header':
      return `# ${block.content}`;
    case 'List Item':
      return block.content.startsWith('-') ? block.content : `- ${block.content}`;
    case 'Table':
      // Tables may already be formatted based on tableOutputFormat
      return block.content;
    case 'Figure':
      return block.image_url ? `![Figure](${block.image_url})` : `[Figure: ${block.content}]`;
    case 'Key Value':
      return `**${block.content}**`;
    case 'Comment':
      return `<!-- ${block.content} -->`;
    case 'Signature':
      return `*[Signature: ${block.content}]*`;
    case 'Page Number':
      // Skip page numbers
      return '';
    case 'Text':
    default:
      return block.content;
  }
}

/**
 * Extract confidence map for all blocks
 */
function extractConfidenceMap(
  chunks: ReductoChunk[]
): Record<string, ReductoConfidence> {
  const map: Record<string, ReductoConfidence> = {};
  let blockIndex = 0;

  for (const chunk of chunks) {
    for (const block of chunk.blocks) {
      map[`block-${blockIndex}`] = block.confidence;
      blockIndex++;
    }
  }

  return map;
}

// ============================================================================
// Exports
// ============================================================================

export type { ReductoParseOptions };
