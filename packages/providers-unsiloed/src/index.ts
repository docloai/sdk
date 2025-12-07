/**
 * @doclo/providers-unsiloed
 *
 * Unsiloed AI provider implementations for doclo-sdk
 *
 * Provides 5 provider implementations:
 * - unsiloedParseProvider: OCRProvider for semantic document parsing
 * - unsiloedExtractProvider: VLMProvider for schema-based extraction
 * - unsiloedTablesProvider: VLMProvider for table extraction
 * - unsiloedClassifyProvider: VLMProvider for document classification
 * - unsiloedSplitProvider: VLMProvider for document splitting
 *
 * @example
 * ```typescript
 * import { unsiloedParseProvider, unsiloedExtractProvider } from '@doclo/providers-unsiloed';
 *
 * const parseProvider = unsiloedParseProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!
 * });
 *
 * const extractProvider = unsiloedExtractProvider({
 *   apiKey: process.env.UNSILOED_API_KEY!
 * });
 * ```
 */

// Provider imports and exports
import { unsiloedParseProvider } from './parse.js';
import { unsiloedExtractProvider } from './extract.js';
import { unsiloedTablesProvider } from './tables.js';
import { unsiloedClassifyProvider } from './classify.js';
import { unsiloedSplitProvider } from './split.js';

export { unsiloedParseProvider };
export type { UnsiloedParseOptions } from './parse.js';

export { unsiloedExtractProvider };
export type { UnsiloedExtractOptions } from './extract.js';

export { unsiloedTablesProvider };
export type { UnsiloedTablesOptions } from './tables.js';

export { unsiloedClassifyProvider };
export type { UnsiloedClassifyOptions } from './classify.js';

export { unsiloedSplitProvider };
export type { UnsiloedSplitOptions } from './split.js';

// Metadata exports
export {
  PROVIDER_METADATA,
  SUPPORTED_MIME_TYPES,
  ALL_SUPPORTED_MIME_TYPES,
  isMimeTypeSupported,
  getProviderMetadata,
  getProvidersForNode,
  canProviderHandleFile,
} from './metadata.js';
export type { UnsiloedProviderMetadata } from './metadata.js';

// Pricing and usage exports
export { USD_PER_PAGE, calculateUsage } from './types.js';
export type { UnsiloedUsage } from './types.js';

// Utility exports (for advanced users)
export { unsiloedFetch, getFileBuffer } from './utils/api-client.js';
export { pollJobUntilComplete, getJobResult } from './utils/job-polling.js';
export type { JobStatus, PollOptions } from './utils/job-polling.js';

/**
 * Convenience factory function to create any Unsiloed provider
 *
 * @example
 * ```typescript
 * const parseProvider = createUnsiloedProvider({
 *   type: 'parse',
 *   apiKey: process.env.UNSILOED_API_KEY!
 * });
 * ```
 */
export function createUnsiloedProvider(opts: {
  type: 'parse';
  apiKey: string;
  config?: Partial<import('./parse.js').UnsiloedParseOptions>;
}): import('@doclo/core').OCRProvider;

export function createUnsiloedProvider(opts: {
  type: 'extract' | 'tables' | 'classify' | 'split';
  apiKey: string;
  config?: Record<string, any>;
}): import('@doclo/core').VLMProvider;

export function createUnsiloedProvider(opts: {
  type: 'parse' | 'extract' | 'tables' | 'classify' | 'split';
  apiKey: string;
  config?: Record<string, any>;
}): import('@doclo/core').OCRProvider | import('@doclo/core').VLMProvider {
  const baseConfig = { apiKey: opts.apiKey, ...opts.config };

  switch (opts.type) {
    case 'parse': {
      return unsiloedParseProvider(baseConfig);
    }
    case 'extract': {
      return unsiloedExtractProvider(baseConfig);
    }
    case 'tables': {
      return unsiloedTablesProvider(baseConfig);
    }
    case 'classify': {
      return unsiloedClassifyProvider(baseConfig);
    }
    case 'split': {
      return unsiloedSplitProvider(baseConfig);
    }
    default:
      throw new Error(`Unknown provider type: ${(opts as any).type}`);
  }
}
