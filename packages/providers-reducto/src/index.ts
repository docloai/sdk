/**
 * @doclo/providers-reducto
 *
 * Providers for Reducto services (https://reducto.ai/)
 *
 * - Reducto Parse: Document parsing with bounding boxes and RAG chunking
 * - Reducto Extract: Schema-based structured extraction with citations
 * - Reducto Split: Multi-document file segmentation
 *
 * @example
 * ```typescript
 * import {
 *   reductoParseProvider,
 *   reductoExtractProvider,
 *   splitDocument
 * } from '@doclo/providers-reducto';
 *
 * // Parse documents to DocumentIR
 * const parseProvider = reductoParseProvider({
 *   apiKey: process.env.REDUCTO_API_KEY!,
 *   chunkMode: 'variable'
 * });
 *
 * // Extract structured data
 * const extractProvider = reductoExtractProvider({
 *   apiKey: process.env.REDUCTO_API_KEY!,
 *   citations: true
 * });
 *
 * // Split stacked documents
 * const segments = await splitDocument(
 *   { base64: pdfData },
 *   {
 *     apiKey: process.env.REDUCTO_API_KEY!,
 *     splitDescription: [
 *       { name: 'Invoice', description: 'Invoice with line items and totals' }
 *     ]
 *   }
 * );
 * ```
 */

// ============================================================================
// Providers
// ============================================================================

// Parse Provider (OCR)
export { reductoParseProvider } from './reducto-parse.js';
export type { ReductoParseOptions } from './reducto-parse.js';

// Extract Provider (VLM)
export { reductoExtractProvider } from './reducto-extract.js';
export type {
  ReductoExtractOptions,
  ReductoExtractInput,
  ReductoExtractResult
} from './reducto-extract.js';

// Split Function
export { splitDocument, COMMON_DOCUMENT_TYPES } from './reducto-split.js';
export type { ReductoSplitOptions, ReductoDocumentType } from './reducto-split.js';

// ============================================================================
// Types
// ============================================================================

export type {
  // Chunking
  ReductoChunkMode,
  ReductoTableFormat,
  // API Response Types
  ReductoBBox,
  ReductoBlockType,
  ReductoConfidence,
  ReductoBlock,
  ReductoChunk,
  ReductoParseResponse,
  ReductoExtractResponse,
  ReductoSplitResponse,
  ReductoUploadResponse,
  ReductoJobStatus,
  ReductoJobResponse,
  // Usage
  ReductoUsage,
} from './types.js';

export { REDUCTO_CREDIT_RATES, USD_PER_CREDIT } from './types.js';

// ============================================================================
// Metadata
// ============================================================================

export {
  PROVIDER_METADATA,
  SUPPORTED_MIME_TYPES,
  ALL_SUPPORTED_MIME_TYPES,
  FILE_EXTENSIONS,
  // Helper functions
  isMimeTypeSupported,
  getMimeTypeFromFilename,
  estimateCost,
  getProvidersForNode,
} from './metadata.js';

export type {
  ReductoProviderMetadata,
  ReductoSupportedOptions,
  ReductoProviderType,
  SupportedMimeType,
} from './metadata.js';

// ============================================================================
// Utilities (for advanced usage)
// ============================================================================

export {
  uploadFile,
  pollJob,
  calculateUsage,
  formatUsage,
  formatPageRange,
} from './utils.js';

// ============================================================================
// Provider Capabilities Summary
// ============================================================================

/**
 * Provider capabilities for documentation
 */
export const PROVIDER_CAPABILITIES = {
  reductoParse: {
    type: 'OCRProvider' as const,
    cost_per_page_credits: 1,
    cost_per_page_usd: 0.004,
    formats: { images: true, pdfs: true, documents: true, spreadsheets: true },
    outputs: { documentIR: true, chunks: true, markdown: true, boundingBoxes: true },
    unique: ['chunking', 'confidence', 'tableFormats'],
  },
  reductoExtract: {
    type: 'VLMProvider' as const,
    cost_per_page_credits: 2,
    cost_per_page_usd: 0.008,
    formats: { images: true, pdfs: true, documents: true, spreadsheets: true },
    outputs: { json: true, citations: true },
    unique: ['fieldCitations', 'systemPrompt'],
  },
  reductoSplit: {
    type: 'Function' as const,
    cost_per_page_credits: 2,
    cost_per_page_usd: 0.008,
    formats: { pdfs: true, documents: true, presentations: true },
    outputs: { segmentation: true },
    unique: ['documentTypeSplitting'],
  },
} as const;
