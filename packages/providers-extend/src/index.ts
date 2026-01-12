/**
 * @doclo/providers-extend
 *
 * Extend.ai provider implementations for doclo-sdk
 *
 * Provides 4 provider implementations:
 * - extendParseProvider: OCRProvider for document parsing to markdown/text
 * - extendExtractProvider: VLMProvider for schema-based extraction with extend:type support
 * - extendClassifyProvider: VLMProvider for document classification
 * - extendSplitProvider: VLMProvider for document splitting
 *
 * Special features:
 * - extend:type: "date" - ISO 8601 date normalization
 * - extend:type: "currency" - Currency normalization to { amount, currency }
 * - extend:type: "signature" - Signature detection
 * - Citations with bounding polygons
 * - Field-level confidence scores
 *
 * @example
 * ```typescript
 * import { extendParseProvider, extendExtractProvider } from '@doclo/providers-extend';
 *
 * const parseProvider = extendParseProvider({
 *   apiKey: process.env.EXTEND_API_KEY!
 * });
 *
 * const extractProvider = extendExtractProvider({
 *   apiKey: process.env.EXTEND_API_KEY!,
 *   processorId: 'your-processor-id',
 *   citationsEnabled: true,
 * });
 * ```
 */

// Provider imports and exports
import { extendParseProvider } from './parse.js';
import { extendExtractProvider } from './extract.js';
import { extendClassifyProvider } from './classify.js';
import { extendSplitProvider } from './split.js';

export { extendParseProvider };
export type { ExtendParseOptions } from './types.js';

export { extendExtractProvider };
export type { ExtendExtractOptions } from './types.js';

export { extendClassifyProvider };
export type { ExtendClassifyOptions } from './types.js';

export { extendSplitProvider };
export type { ExtendSplitOptions, ExtendSplitClassification } from './types.js';

// Metadata exports
export {
  PROVIDER_METADATA,
  SUPPORTED_MIME_TYPES,
  ALL_SUPPORTED_MIME_TYPES,
  USD_PER_CREDIT,
  isMimeTypeSupported,
  getProviderMetadata,
  getProvidersForNode,
  canProviderHandleFile,
} from './metadata.js';
export type { ExtendProviderMetadata, ProviderInputType } from './metadata.js';

// Type exports
export type {
  ExtendBaseOptions,
  ExtendSchemaField,
  ExtendCurrencyValue,
  ExtendSignatureValue,
  ExtendClassification,
  ExtendProcessor,
  ExtendProcessorType,
  ExtendProcessorTypeAPI,
  CreateProcessorOptions,
  ExtractorConfig,
  ExtractorField,
  ClassifierConfig,
  ClassificationDefinition,
  SplitterConfig,
  ExtendRunStatus,
  ExtendApiResponse,
  ExtendFileUploadResponse,
  ExtendProcessorRunResponse,
  ExtendProcessorRunResult,
  ExtendOutputMetadata,
  ExtendCitation,
  ExtendParseOutput,
  ExtendClassifyOutput,
  ExtendSplitOutput,
  ExtendSplitSegment,
  ExtendWorkflowOptions,
  ExtendWorkflowStatus,
  ExtendWorkflowRunResult,
  ExtendWebhookEventType,
  ExtendWebhookPayloadFormat,
  ExtendWebhookEvent,
} from './types.js';

// API client exports (for advanced users)
export { ExtendApiClient, getMimeTypeFromFilename, detectMimeType } from './api-client.js';
export type { ExtendClientOptions } from './api-client.js';

// Constants
export { EXTEND_API_VERSION, EXTEND_API_ENDPOINT } from './types.js';

/**
 * Convenience factory function to create any Extend provider
 *
 * @example
 * ```typescript
 * const parseProvider = createExtendProvider({
 *   type: 'parse',
 *   apiKey: process.env.EXTEND_API_KEY!
 * });
 *
 * const extractProvider = createExtendProvider({
 *   type: 'extract',
 *   apiKey: process.env.EXTEND_API_KEY!,
 *   processorId: 'your-processor-id'
 * });
 * ```
 */
export function createExtendProvider(opts: {
  type: 'parse';
  apiKey: string;
  config?: Partial<import('./types.js').ExtendParseOptions>;
}): import('@doclo/core').OCRProvider;

export function createExtendProvider(opts: {
  type: 'extract';
  apiKey: string;
  processorId: string;
  config?: Partial<Omit<import('./types.js').ExtendExtractOptions, 'apiKey' | 'processorId'>>;
}): import('@doclo/core').VLMProvider;

export function createExtendProvider(opts: {
  type: 'classify';
  apiKey: string;
  processorId: string;
  config?: Partial<Omit<import('./types.js').ExtendClassifyOptions, 'apiKey' | 'processorId'>>;
}): import('@doclo/core').VLMProvider;

export function createExtendProvider(opts: {
  type: 'split';
  apiKey: string;
  processorId: string;
  config?: Partial<Omit<import('./types.js').ExtendSplitOptions, 'apiKey' | 'processorId'>>;
}): import('@doclo/core').VLMProvider;

export function createExtendProvider(opts: {
  type: 'parse' | 'extract' | 'classify' | 'split';
  apiKey: string;
  processorId?: string;
  config?: Record<string, unknown>;
}): import('@doclo/core').OCRProvider | import('@doclo/core').VLMProvider {
  const baseConfig = { apiKey: opts.apiKey, ...opts.config };

  switch (opts.type) {
    case 'parse': {
      return extendParseProvider(baseConfig);
    }
    case 'extract': {
      if (!opts.processorId) {
        throw new Error('processorId is required for extract provider');
      }
      return extendExtractProvider({ ...baseConfig, processorId: opts.processorId });
    }
    case 'classify': {
      if (!opts.processorId) {
        throw new Error('processorId is required for classify provider');
      }
      return extendClassifyProvider({ ...baseConfig, processorId: opts.processorId });
    }
    case 'split': {
      if (!opts.processorId) {
        throw new Error('processorId is required for split provider');
      }
      return extendSplitProvider({ ...baseConfig, processorId: opts.processorId });
    }
    default:
      throw new Error(`Unknown provider type: ${(opts as { type: string }).type}`);
  }
}
