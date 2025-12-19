/**
 * @doclo/core
 *
 * Core types, validation utilities, and file operations for Doclo SDK
 *
 * This module re-exports from:
 * - internal/validation-utils.ts - Universal validation code (Edge Runtime + Node.js compatible)
 * - internal/file-utils.ts - Universal file operations (Edge Runtime + Node.js compatible)
 */

// Re-export all validation utilities (browser-safe)
export type {
  BBox,
  IRLine,
  IRPage,
  DocumentIR,
  DocumentIRExtras,
  OCRProvider,
  MultimodalInput,
  ReasoningConfig,
  LLMProvider,
  VLMProvider,
  LLMJsonProvider,
  ConsensusConfig,
  ConsensusRunResult,
  FieldVotingDetails,
  ConsensusMetadata,
  OutputWithConsensus,
  MaybeWithConsensusMetadata,
  FlowInput,
  FlowInputValidation,
  FlowResult,
  SplitDocument,
  CitationSourceType,
  NormalizedBBox,
  LineCitation,
  FieldCitation,
  CitationConfig,
  OutputWithCitations,
  ParseNodeConfig,
  SplitNodeConfig,
  CategorizeNodeConfig,
  ExtractNodeConfig,
  ExtractInputMode,
  ChunkMetadata,
  ChunkOutput,
  ChunkNodeConfig,
  CombineNodeConfig,
  OutputNodeConfig,
  EnhancedExtractionSchema,
  StepMetric,
  AggregatedMetrics,
  FlowContext,
  NodeCtx,
  NodeTypeInfo,
  NodeDef,
  NodeTypeName,
  CompatibilityRule,
  ValidationResult,
  JSONSchemaNode,
  // Processing Options - Normalized types for provider-agnostic configuration
  ProcessingMode,
  PageRangeOptions,
  LanguageOptions,
  SegmentationResult,
  ExtractedImage,
  OCRProviderOptions,
  VLMProviderOptions,
  ProviderCitation,
  // Error handling types
  FlowStepLocation
} from './internal/validation-utils.js';

export {
  aggregateMetrics,
  node,
  runPipeline,
  FlowExecutionError,
  FlowValidationError,
  NODE_COMPATIBILITY_MATRIX,
  getNodeTypeName,
  getNodeTypeInfo,
  getCompatibleTargets,
  getSuggestedConnections,
  validateNodeConnection,
  getValidForEachStarters,
  canStartForEachItemFlow,
  validateJson,
  RESERVED_VARIABLES,
  protectReservedVariables,
  // Error handling utilities
  extractErrorMessage
} from './internal/validation-utils.js';

// Re-export file utilities (Edge Runtime compatible)
export {
  isPDFDocument,
  detectDocumentType,
  resolveDocument,
  bufferToDataUri,
  bufferToBase64,  // @deprecated - use bufferToDataUri
  validateFlowInputFormat,
  FlowInputValidationError
} from './internal/file-utils.js';

export type {
  DocumentMimeType,
  AcceptedMimeType
} from './internal/file-utils.js';

// Re-export PDF utilities (Edge Runtime compatible)
export {
  getPDFPageCount,
  splitPDFIntoChunks,
  getDocumentPageCount,
  getTotalPageCount,
  getPageCountMetadata
} from './pdf-utils.js';

// Re-export provider configuration types
export * from './provider-config.js';

// Re-export provider identity types
export type {
  ProviderVendor,
  AccessMethod,
  ProviderIdentity
} from './provider-identity.js';

export {
  toProviderString,
  parseProviderString,
  isLocalEndpoint,
  createIdentity
} from './provider-identity.js';

// Re-export auto-injection types
export type {
  ExtractAutoVariables,
  CategorizeAutoVariables,
  ParseAutoVariables,
  AllAutoVariables,
  AutoVariablesForNode,
  PromptVariables
} from './types/auto-variables.js';

// Re-export MIME detection utilities
export {
  detectMimeTypeFromBase64,
  detectMimeTypeFromBase64Async,
  detectMimeTypeFromBytes,
  validateMimeType,
  validateMimeTypeAsync,
  extractBase64
} from './mime-detection.js';

// Re-export provider query utilities
export type {
  NormalizedProviderMetadata,
  NormalizedFeatures,
  NormalizedCapabilities,
  OutputFormatSupport,
  FeatureName,
  ProviderQueryFilter,
  ProviderInputType,
  InputRequirements,
  // Feature status types
  FeatureStatus,
  PageIndexing,
  DerivedFeatureOptions,
  TransformedOptions,
  // Model-level types
  ModelMetadata,
  ResolvedModelMetadata,
  ModelQueryFilter,
  ProviderMetadataWithModels
} from './provider-query.js';

export {
  registerProviderMetadata,
  getAllProviders,
  queryProviders,
  getProviderById,
  getProvidersBySource,
  clearProviderRegistry,
  getProvidersForMimeType,
  getCheapestProviderFor,
  getProvidersForLargeFiles,
  // Feature status utilities
  isFeatureEnabled,
  getPageIndexing,
  transformDerivedFeatures,
  requiresMaxPagesTransformation,
  // Model-level query functions
  registerProviderWithModels,
  resolveModelMetadata,
  queryModels,
  getModelsForNode,
  getAllModels,
  clearModelRegistry
} from './provider-query.js';

// Re-export retry utilities
export type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitBreaker,
  WithRetryOptions
} from './retry.js';

export {
  // Error classification
  isRetryableError,
  extractStatusCode,
  parseRetryAfter,
  // Delay calculation
  calculateRetryDelay,
  // Circuit breaker
  createCircuitBreaker,
  clearCircuitBreakers,
  getCircuitBreaker,
  // Retry wrapper
  withRetry,
  // Constants
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG
} from './retry.js';
