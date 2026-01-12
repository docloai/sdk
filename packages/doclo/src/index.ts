/**
 * Doclo SDK
 *
 * Unified entry point for document extraction, parsing, and processing with AI.
 *
 * @example
 * ```typescript
 * import { createFlow, parse, extract, createVLMProvider } from 'doclo';
 *
 * const provider = createVLMProvider({
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * const flow = createFlow()
 *   .parse({ provider: ocrProvider })
 *   .extract({ provider, schema: mySchema });
 *
 * const result = await flow.run({ url: 'https://example.com/doc.pdf' });
 * ```
 */

// =============================================================================
// Core Types
// =============================================================================
export type {
  // Document types
  DocumentIR,
  IRPage,
  IRLine,
  BBox,
  FlowInput,
  FlowResult,
  SplitDocument,

  // Provider types
  OCRProvider,
  LLMProvider,
  VLMProvider,

  // Node config types
  ParseNodeConfig,
  SplitNodeConfig,
  CategorizeNodeConfig,
  ExtractNodeConfig,
  ExtractInputMode,
  ChunkNodeConfig,
  ChunkOutput,
  ChunkMetadata,
  CombineNodeConfig,
  OutputNodeConfig,

  // Consensus types
  ConsensusConfig,
  ConsensusRunResult,
  ConsensusMetadata,
  OutputWithConsensus,

  // Citation types
  CitationSourceType,
  OutputWithCitations,

  // Context types
  NodeCtx,
  FlowContext,
} from '@doclo/core';

// =============================================================================
// Core Utilities
// =============================================================================
export {
  // Pipeline execution
  runPipeline,
  node,

  // Validation
  validateJson,

  // Document utilities
  isPDFDocument,
  detectDocumentType,
  getPDFPageCount,
  splitPDFIntoChunks,

  // Errors
  FlowExecutionError,
  FlowValidationError,
} from '@doclo/core';

// =============================================================================
// Processing Nodes
// =============================================================================
export {
  // Main nodes
  parse,
  split,
  categorize,
  extract,
  chunk,
  combine,
  trigger,
} from '@doclo/nodes';

// =============================================================================
// Flow Builder
// =============================================================================
export {
  createFlow,
  isSingleFlowResult,
  isBatchFlowResult,
  type BuiltFlow,
  type FlowOptions,
  type FlowRunOptions,
  type BatchFlowResult,
  type FlowProgressCallbacks,
  type FlowValidationResult,
} from '@doclo/flows';

// =============================================================================
// LLM/VLM Providers
// =============================================================================
export {
  // Factory functions
  createVLMProvider,

  // Provider classes (for advanced usage)
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  XAIProvider,

  // Provider registry
  providerRegistry,
  registerProvider,
  createProviderFromRegistry,

  // Schema utilities
  SchemaTranslator,
  buildSchemaPromptSection,
  formatSchemaForPrompt,

  // Fallback manager
  FallbackManager,

  // Adapter
  adaptToCoreLLMProvider,
} from '@doclo/providers-llm';

export type {
  ProviderConfig,
  FallbackConfig,
  AccessMethod,
  ReasoningConfig,
  ProviderFactory,
} from '@doclo/providers-llm';
