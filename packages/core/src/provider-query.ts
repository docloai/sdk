/**
 * Unified Provider Query Interface
 *
 * Provides a unified way to query and filter provider metadata across
 * all provider packages (@doclo/providers-llm, @doclo/providers-datalab).
 *
 * @example
 * ```typescript
 * import { queryProviders, registerProviderMetadata } from '@doclo/core';
 *
 * // Register metadata from provider packages (done automatically if packages are imported)
 * import { PROVIDER_METADATA as LLM_METADATA } from '@doclo/providers-llm';
 * import { PROVIDER_METADATA as DATALAB_METADATA } from '@doclo/providers-datalab';
 *
 * registerProviderMetadata('llm', LLM_METADATA);
 * registerProviderMetadata('datalab', DATALAB_METADATA);
 *
 * // Query providers
 * const pdfProviders = queryProviders({ supports: { pdfs: true } });
 * const cheapProviders = queryProviders({ maxCostPerPage: 0.01 });
 * const largeFileProviders = queryProviders({ minFileSize: 100 }); // 100 MB+
 * ```
 */

// ============================================================================
// Input Requirements Types
// ============================================================================

/**
 * Input type requirements for providers/models.
 * More normalized than a boolean - allows for future extensibility.
 *
 * - 'raw-document': Needs FlowInput with base64/url (OCR/VLM providers like marker-vlm)
 * - 'parsed-text': Needs DocumentIR text output from parse step (text-only processors)
 * - 'any': Can work with either (most vision LLMs like GPT-4o, Claude with vision)
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

/**
 * Input requirements specification for a provider or model.
 * Determines what form of document input is expected.
 */
export type InputRequirements = {
  /**
   * What type of input this provider accepts.
   * - 'raw-document': Needs PDF/image bytes directly (marker-vlm, reducto-extract)
   * - 'parsed-text': Needs DocumentIR text (text-only processors)
   * - 'any': Can work with either (vision LLMs like GPT-4o, Claude)
   */
  inputType: ProviderInputType;

  /**
   * Accepted input methods when inputType is 'raw-document'.
   * Inherited from inputFormats.inputMethods if not specified.
   */
  acceptedMethods?: readonly ('url' | 'base64' | 'fileId')[];
};

// ============================================================================
// Normalized Capabilities and Features
// ============================================================================

/**
 * Output format support flags
 */
export type OutputFormatSupport = {
  text: boolean;
  markdown: boolean;
  html: boolean;
  json: boolean;
};

/**
 * Feature status values for normalized features.
 * - `true`: Natively supported by the API
 * - `false`: Not supported
 * - `'deprecated'`: API deprecated this feature, may not work
 * - `'derived'`: SDK provides via transformation (e.g., maxPages from pageRange)
 */
export type FeatureStatus = true | false | 'deprecated' | 'derived';

/**
 * Helper to check if a feature is enabled (true, deprecated, or derived)
 */
export function isFeatureEnabled(status: FeatureStatus): boolean {
  return status === true || status === 'deprecated' || status === 'derived';
}

/**
 * Page indexing convention used by provider
 */
export type PageIndexing = '0-indexed' | '1-indexed';

/**
 * Normalized features across all providers.
 * Maps provider-specific option names to unified names.
 *
 * This enables UIs to query "what features does this provider support?"
 * and get a consistent answer across all providers.
 */
export type NormalizedFeatures = {
  // === Page Selection ===
  /** Limit to first N pages */
  maxPages: FeatureStatus;
  /** Specific page range selection */
  pageRange: FeatureStatus;

  // === Language ===
  /** OCR language hints (maps from 'langs') */
  languageHints: FeatureStatus;

  // === Processing Mode ===
  /** Quality/speed modes (fast/balanced/high_accuracy) */
  processingModes: FeatureStatus;
  /** Reducto agentic mode (higher accuracy, more cost) */
  agenticMode: FeatureStatus;

  // === Content Enhancement ===
  /** Custom prompts (maps from blockCorrectionPrompt, additionalPrompt, systemPrompt) */
  customPrompts: FeatureStatus;

  // === Output Features ===
  /** Extract embedded images (maps from extractImages, returnImages) */
  imageExtraction: FeatureStatus;
  /** Page delimiters (maps from paginate, addPageMarkers) */
  pageMarkers: FeatureStatus;
  /** Field-level citations with source references (page/char/block indices) */
  citations: FeatureStatus;
  /** Document chunking modes (RAG-optimized) */
  chunking: FeatureStatus;
  /** Auto-segmentation for multi-document PDFs */
  segmentation: FeatureStatus;

  // === OCR-Specific ===
  /** Re-run OCR on already-OCR'd documents */
  stripExistingOCR: FeatureStatus;
  /** Format lines in output */
  formatLines: FeatureStatus;
  /** Force OCR even if text layer exists */
  forceOCR: FeatureStatus;

  // === Table Handling ===
  /** Table format options (html/json/md/csv) */
  tableOutputFormats: FeatureStatus;
  /** Merge consecutive tables */
  tableMerging: FeatureStatus;

  // === Quality/Accuracy ===
  /** Block-level confidence scores */
  confidence: FeatureStatus;
  /** Bounding box coordinates for TEXT elements (pixel/normalized coords) */
  boundingBoxes: FeatureStatus;
  /** Bounding box coordinates for IMAGES/FIGURES only (not text) */
  imageBoundingBoxes: FeatureStatus;
  /** JSON schema validation for structured output */
  schemaValidation: FeatureStatus;
  /** Handwritten text recognition support */
  handwrittenText: FeatureStatus;
  /** Separate header/footer extraction from main content */
  headerFooterExtraction: FeatureStatus;

  // === NEW: Extended Features ===
  /** Optimize output for embeddings/RAG */
  embedOptimized: FeatureStatus;
  /** Handle encrypted/password-protected PDFs */
  passwordProtected: FeatureStatus;
  /** Filter block types (headers, footers, page numbers, etc.) */
  contentFiltering: FeatureStatus;
  /** OCR system/mode selection (standard/legacy, auto/full) */
  ocrMode: FeatureStatus;
  /** Async completion webhook callbacks */
  webhookCallback: FeatureStatus;
  /** Vision quality control (low/medium/high) - Gemini */
  mediaResolution: FeatureStatus;
  /** Track changes extraction from Word docs */
  changeTracking: FeatureStatus;
  /** Extract hyperlinks from documents */
  hyperlinkExtraction: FeatureStatus;
  /** Enhanced chart and graph interpretation (Datalab extras=chart_understanding) */
  chartUnderstanding: FeatureStatus;
  /** Control image caption generation (Datalab disable_image_captions) */
  imageCaptions: FeatureStatus;
  /** Extract signatures from documents (Reducto include: ["signatures"]) */
  signatureExtraction: FeatureStatus;
  /** Extract comments/annotations from documents (Reducto include: ["comments"]) */
  commentExtraction: FeatureStatus;
  /** Extract highlighted text from documents (Reducto include: ["highlight"]) */
  highlightExtraction: FeatureStatus;
  /** Summarize figures/charts with VLM (Reducto summarize_figures) */
  figureSummaries: FeatureStatus;

  // === Output Formats ===
  /** Supported output formats */
  outputFormats: OutputFormatSupport;
};

// ============================================================================
// Normalized Provider Metadata
// ============================================================================

import type { ProviderIdentity, ProviderVendor, AccessMethod } from './provider-identity.js';

// Normalized provider metadata that works across all provider types
export type NormalizedProviderMetadata = {
  // Identity - legacy fields
  id: string;
  name: string;
  source: 'llm' | 'datalab' | 'unsiloed' | 'reducto' | string;
  type: 'LLM' | 'OCR' | 'VLM' | 'Split';

  // NEW: 3-layer identity (provider/model/method)
  identity?: {
    /** Provider vendor (company) */
    provider: ProviderVendor | string;
    /** Model identifier */
    model: string;
    /** Access method (native, openrouter, self-hosted) */
    method?: AccessMethod;
  };

  // Capabilities (high-level, queryable)
  capabilities: {
    // === Existing ===
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsDocuments: boolean;  // Word, Excel, PowerPoint
    supportsReasoning: boolean;
    supportsStructuredOutput: boolean;

    // === NEW: Processing Features ===
    supportsPrompts: boolean;           // Custom prompts/instructions
    supportsCitations: boolean;         // Field-level citations
    supportsChunking: boolean;          // Document chunking (RAG-optimized)
    supportsImageExtraction: boolean;   // Extract embedded images
    supportsPageMarkers: boolean;       // Add page delimiters to output
    supportsLanguageHints: boolean;     // Language hints for OCR
    supportsProcessingModes: boolean;   // Quality/speed modes
    supportsSegmentation: boolean;      // Auto-segment multi-doc PDFs

    // === NEW: Output Formats ===
    outputFormats: OutputFormatSupport;
  };

  // Features - fine-grained capability flags for UI
  features: NormalizedFeatures;

  // Input requirements (what type of input the provider needs)
  inputRequirements: InputRequirements;

  // Node compatibility
  compatibleNodes: {
    parse: boolean;
    extract: boolean;
    categorize: boolean;
    qualify: boolean;
    split: boolean;
  };

  // Input formats
  inputFormats: {
    imageMimeTypes: readonly string[];
    documentMimeTypes: readonly string[];
    inputMethods: readonly ('url' | 'base64' | 'fileId')[];
    maxImageSize?: number;  // MB
    maxPdfSize?: number;    // MB
    maxFileSize?: number;   // MB (general)
    maxPages?: number;
  };

  // Pricing (normalized)
  pricing: {
    model: 'per-token' | 'per-page';
    // Per-token pricing (LLM)
    inputPer1kTokens?: number;
    outputPer1kTokens?: number;
    // Per-page pricing (OCR/VLM)
    perPage?: number;
    currency: 'USD';
    notes?: string;
  };

  // Rate limits
  rateLimits?: {
    requestsPerMinute?: number;
    docsPerMinute?: number;
  };

  // Raw metadata for advanced use
  raw: unknown;
};

/**
 * Feature names that can be queried (excludes outputFormats which is nested)
 */
export type FeatureName = Exclude<keyof NormalizedFeatures, 'outputFormats'>;

// Query filters
export type ProviderQueryFilter = {
  // Filter by source (legacy)
  source?: 'llm' | 'datalab' | 'unsiloed' | 'reducto' | string | string[];

  // Filter by type
  type?: 'LLM' | 'OCR' | 'VLM' | 'Split' | ('LLM' | 'OCR' | 'VLM' | 'Split')[];

  // NEW: Filter by 3-layer identity
  /** Filter by provider vendor (company) */
  provider?: ProviderVendor | ProviderVendor[] | string | string[];
  /** Filter by model ID (requires provider to be specified for best results) */
  model?: string | string[];
  /** Filter by access method */
  method?: AccessMethod | AccessMethod[];

  // Filter by capabilities
  supports?: {
    images?: boolean;
    pdfs?: boolean;
    documents?: boolean;
    reasoning?: boolean;
    structuredOutput?: boolean;
    // NEW: Extended capability filters
    prompts?: boolean;
    citations?: boolean;
    chunking?: boolean;
    imageExtraction?: boolean;
    pageMarkers?: boolean;
    languageHints?: boolean;
    processingModes?: boolean;
    segmentation?: boolean;
  };

  // NEW: Filter by specific features (all must be supported)
  hasFeatures?: FeatureName[];

  // NEW: Filter by output format support
  outputFormat?: 'text' | 'markdown' | 'html' | 'json';

  // Filter by input requirements
  inputRequirements?: {
    /**
     * Filter by input type requirement.
     * - 'raw-document': Only providers that need raw document input
     * - 'parsed-text': Only providers that need parsed text
     * - 'any': Only providers that accept any input type
     * - ['raw-document', 'any']: Providers that accept raw documents (raw-document OR any)
     */
    inputType?: ProviderInputType | ProviderInputType[];
  };

  // Filter by node compatibility
  compatibleWith?: ('parse' | 'extract' | 'categorize' | 'qualify' | 'split')[];

  // Filter by MIME type support
  mimeType?: string | string[];

  // Filter by file size limits (MB)
  minFileSize?: number;  // Provider must support at least this size
  maxFileSize?: number;  // Provider must have limit at most this size

  // Filter by pricing
  maxCostPerPage?: number;      // For OCR/VLM
  maxCostPer1kTokens?: number;  // For LLM (input)

  // Custom filter function
  filter?: (provider: NormalizedProviderMetadata) => boolean;
};

// Registry for provider metadata
const providerRegistry = new Map<string, Map<string, NormalizedProviderMetadata>>();

/**
 * Register provider metadata from a provider package
 *
 * @param source - Source identifier (e.g., 'llm', 'datalab')
 * @param metadata - Raw metadata object from the provider package
 * @param normalizer - Function to normalize the metadata
 *
 * @example
 * ```typescript
 * import { PROVIDER_METADATA } from '@doclo/providers-llm';
 * registerProviderMetadata('llm', PROVIDER_METADATA, normalizeLLMMetadata);
 * ```
 */
export function registerProviderMetadata(
  source: string,
  metadata: Record<string, unknown>,
  normalizer?: (id: string, data: unknown, source: string) => NormalizedProviderMetadata
): void {
  const normalized = new Map<string, NormalizedProviderMetadata>();

  for (const [id, data] of Object.entries(metadata)) {
    if (normalizer) {
      normalized.set(id, normalizer(id, data, source));
    } else {
      // Use default normalizer based on source
      normalized.set(id, defaultNormalizer(id, data, source));
    }
  }

  providerRegistry.set(source, normalized);
}

/**
 * Get all registered providers (normalized)
 */
export function getAllProviders(): NormalizedProviderMetadata[] {
  const all: NormalizedProviderMetadata[] = [];
  for (const providers of providerRegistry.values()) {
    all.push(...providers.values());
  }
  return all;
}

/**
 * Query providers with filters
 *
 * @param filter - Query filters
 * @returns Array of matching providers
 *
 * @example
 * ```typescript
 * // Get all providers that support PDFs
 * const pdfProviders = queryProviders({ supports: { pdfs: true } });
 *
 * // Get cheap OCR providers
 * const cheapOcr = queryProviders({
 *   type: 'OCR',
 *   maxCostPerPage: 0.02
 * });
 *
 * // Get providers that can handle large files
 * const largeFileProviders = queryProviders({ minFileSize: 100 });
 *
 * // Get providers compatible with extract() node
 * const extractProviders = queryProviders({
 *   compatibleWith: ['extract']
 * });
 * ```
 */
export function queryProviders(filter: ProviderQueryFilter = {}): NormalizedProviderMetadata[] {
  let providers = getAllProviders();

  // Filter by source
  if (filter.source) {
    const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
    providers = providers.filter(p => sources.includes(p.source));
  }

  // Filter by type
  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    providers = providers.filter(p => types.includes(p.type));
  }

  // NEW: Filter by 3-layer identity
  if (filter.provider) {
    const providerVendors = Array.isArray(filter.provider) ? filter.provider : [filter.provider];
    providers = providers.filter(p => p.identity?.provider && providerVendors.includes(p.identity.provider));
  }

  if (filter.model) {
    const models = Array.isArray(filter.model) ? filter.model : [filter.model];
    providers = providers.filter(p => p.identity?.model && models.includes(p.identity.model));
  }

  if (filter.method) {
    const methods = Array.isArray(filter.method) ? filter.method : [filter.method];
    providers = providers.filter(p => p.identity?.method && methods.includes(p.identity.method));
  }

  // Filter by capabilities
  if (filter.supports) {
    // Existing capability filters
    if (filter.supports.images !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsImages === filter.supports!.images);
    }
    if (filter.supports.pdfs !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsPDFs === filter.supports!.pdfs);
    }
    if (filter.supports.documents !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsDocuments === filter.supports!.documents);
    }
    if (filter.supports.reasoning !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsReasoning === filter.supports!.reasoning);
    }
    if (filter.supports.structuredOutput !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsStructuredOutput === filter.supports!.structuredOutput);
    }
    // NEW: Extended capability filters
    if (filter.supports.prompts !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsPrompts === filter.supports!.prompts);
    }
    if (filter.supports.citations !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsCitations === filter.supports!.citations);
    }
    if (filter.supports.chunking !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsChunking === filter.supports!.chunking);
    }
    if (filter.supports.imageExtraction !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsImageExtraction === filter.supports!.imageExtraction);
    }
    if (filter.supports.pageMarkers !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsPageMarkers === filter.supports!.pageMarkers);
    }
    if (filter.supports.languageHints !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsLanguageHints === filter.supports!.languageHints);
    }
    if (filter.supports.processingModes !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsProcessingModes === filter.supports!.processingModes);
    }
    if (filter.supports.segmentation !== undefined) {
      providers = providers.filter(p => p.capabilities.supportsSegmentation === filter.supports!.segmentation);
    }
  }

  // NEW: Filter by specific features (all must be supported)
  // Uses isFeatureEnabled() to treat 'deprecated' and 'derived' as truthy
  if (filter.hasFeatures && filter.hasFeatures.length > 0) {
    providers = providers.filter(p =>
      filter.hasFeatures!.every(feature => isFeatureEnabled(p.features[feature]))
    );
  }

  // NEW: Filter by output format support
  if (filter.outputFormat) {
    providers = providers.filter(p =>
      p.capabilities.outputFormats[filter.outputFormat!] === true
    );
  }

  // Filter by input requirements
  if (filter.inputRequirements?.inputType !== undefined) {
    const inputTypes = Array.isArray(filter.inputRequirements.inputType)
      ? filter.inputRequirements.inputType
      : [filter.inputRequirements.inputType];
    providers = providers.filter(p => inputTypes.includes(p.inputRequirements.inputType));
  }

  // Filter by node compatibility
  if (filter.compatibleWith && filter.compatibleWith.length > 0) {
    providers = providers.filter(p =>
      filter.compatibleWith!.every(node => p.compatibleNodes[node])
    );
  }

  // Filter by MIME type support
  if (filter.mimeType) {
    const mimeTypes = Array.isArray(filter.mimeType) ? filter.mimeType : [filter.mimeType];
    providers = providers.filter(p => {
      const allMimes = [...p.inputFormats.imageMimeTypes, ...p.inputFormats.documentMimeTypes];
      return mimeTypes.every(mime => allMimes.includes(mime));
    });
  }

  // Filter by minimum file size support
  if (filter.minFileSize !== undefined) {
    providers = providers.filter(p => {
      const maxSize = p.inputFormats.maxFileSize ??
        Math.max(p.inputFormats.maxImageSize ?? 0, p.inputFormats.maxPdfSize ?? 0);
      return maxSize >= filter.minFileSize!;
    });
  }

  // Filter by maximum file size limit
  if (filter.maxFileSize !== undefined) {
    providers = providers.filter(p => {
      const maxSize = p.inputFormats.maxFileSize ??
        Math.max(p.inputFormats.maxImageSize ?? Infinity, p.inputFormats.maxPdfSize ?? Infinity);
      return maxSize <= filter.maxFileSize!;
    });
  }

  // Filter by cost
  if (filter.maxCostPerPage !== undefined) {
    providers = providers.filter(p =>
      p.pricing.perPage !== undefined && p.pricing.perPage <= filter.maxCostPerPage!
    );
  }

  if (filter.maxCostPer1kTokens !== undefined) {
    providers = providers.filter(p =>
      p.pricing.inputPer1kTokens !== undefined && p.pricing.inputPer1kTokens <= filter.maxCostPer1kTokens!
    );
  }

  // Custom filter
  if (filter.filter) {
    providers = providers.filter(filter.filter);
  }

  return providers;
}

/**
 * Get a single provider by ID
 */
export function getProviderById(id: string): NormalizedProviderMetadata | undefined {
  for (const providers of providerRegistry.values()) {
    if (providers.has(id)) {
      return providers.get(id);
    }
  }
  return undefined;
}

/**
 * Get providers by source
 */
export function getProvidersBySource(source: string): NormalizedProviderMetadata[] {
  const providers = providerRegistry.get(source);
  return providers ? [...providers.values()] : [];
}

/**
 * Clear all registered providers (useful for testing)
 */
export function clearProviderRegistry(): void {
  providerRegistry.clear();
}

// Default normalizer that handles LLM, Datalab, Reducto, and Unsiloed metadata formats
function defaultNormalizer(id: string, data: unknown, source: string): NormalizedProviderMetadata {
  const d = data as Record<string, any>;

  if (source === 'llm') {
    return normalizeLLMProvider(id, d);
  } else if (source === 'datalab') {
    return normalizeDatalabProvider(id, d);
  } else if (source === 'reducto') {
    return normalizeReductoProvider(id, d);
  } else if (source === 'unsiloed') {
    return normalizeUnsiloedProvider(id, d);
  } else if (source === 'mistral') {
    return normalizeMistralProvider(id, d);
  }

  // Generic fallback
  const defaultOutputFormats: OutputFormatSupport = { text: true, markdown: false, html: false, json: false };
  const defaultFeatures: NormalizedFeatures = {
    maxPages: false,
    pageRange: false,
    languageHints: false,
    processingModes: false,
    agenticMode: false,
    customPrompts: false,
    imageExtraction: false,
    pageMarkers: false,
    citations: false,
    chunking: false,
    segmentation: false,
    stripExistingOCR: false,
    formatLines: false,
    forceOCR: false,
    tableOutputFormats: false,
    tableMerging: false,
    confidence: false,
    boundingBoxes: false,
    imageBoundingBoxes: false,
    schemaValidation: false,
    handwrittenText: false,
    headerFooterExtraction: false,
    // Extended features
    embedOptimized: false,
    passwordProtected: false,
    contentFiltering: false,
    ocrMode: false,
    webhookCallback: false,
    mediaResolution: false,
    changeTracking: false,
    hyperlinkExtraction: false,
    chartUnderstanding: false,
    imageCaptions: false,
    signatureExtraction: false,
    commentExtraction: false,
    highlightExtraction: false,
    figureSummaries: false,
    outputFormats: defaultOutputFormats,
  };

  return {
    id,
    name: d.name ?? id,
    source,
    type: d.type ?? 'LLM',
    capabilities: {
      supportsImages: d.capabilities?.supportsImages ?? false,
      supportsPDFs: d.capabilities?.supportsPDFs ?? false,
      supportsDocuments: d.capabilities?.supportsDocuments ?? false,
      supportsReasoning: d.capabilities?.supportsReasoning ?? false,
      supportsStructuredOutput: d.capabilities?.supportsStructuredOutput ?? false,
      supportsPrompts: false,
      supportsCitations: false,
      supportsChunking: false,
      supportsImageExtraction: false,
      supportsPageMarkers: false,
      supportsLanguageHints: false,
      supportsProcessingModes: false,
      supportsSegmentation: false,
      outputFormats: defaultOutputFormats,
    },
    features: defaultFeatures,
    inputRequirements: {
      inputType: d.inputRequirements?.inputType ?? 'any',
      acceptedMethods: d.inputRequirements?.acceptedMethods ?? d.inputFormats?.inputMethods ?? ['base64'],
    },
    compatibleNodes: {
      parse: d.compatibleNodes?.parse ?? false,
      extract: d.compatibleNodes?.extract ?? false,
      categorize: d.compatibleNodes?.categorize ?? false,
      qualify: d.compatibleNodes?.qualify ?? false,
      split: d.compatibleNodes?.split ?? false,
    },
    inputFormats: {
      imageMimeTypes: [],
      documentMimeTypes: [],
      inputMethods: ['base64'],
    },
    pricing: {
      model: 'per-token',
      currency: 'USD',
    },
    raw: data,
  };
}

function normalizeLLMProvider(id: string, d: Record<string, any>): NormalizedProviderMetadata {
  // LLM providers can output any format via prompting
  const outputFormats: OutputFormatSupport = {
    text: true,
    markdown: true,
    html: true,
    json: d.capabilities?.supportsStructuredOutput ?? true,
  };

  // Extract vendor from id or default to id
  const vendor = d.vendor ?? id;

  // LLM features - all LLMs support prompts and flexible output
  // LLMs don't have native pageRange support - they receive full document
  // maxPages can be 'derived' if SDK pre-processes pages before sending
  const features: NormalizedFeatures = {
    maxPages: 'derived' as FeatureStatus,  // SDK can limit via pre-processing
    pageRange: false,  // No native API support - LLMs receive full text
    languageHints: false,  // Not applicable to LLMs
    processingModes: false,  // Not applicable to LLMs
    agenticMode: false,  // Not applicable to LLMs
    customPrompts: true,  // All LLMs support prompts
    imageExtraction: false,  // LLMs don't extract images
    pageMarkers: false,  // LLMs don't add page markers
    citations: vendor === 'anthropic' ? true : false,  // Anthropic has Citations API
    chunking: false,  // LLMs don't do chunking
    segmentation: false,  // LLMs don't do segmentation
    stripExistingOCR: false,
    formatLines: false,
    forceOCR: false,
    tableOutputFormats: false,
    tableMerging: false,
    confidence: false,  // LLMs don't provide confidence scores
    boundingBoxes: false,  // LLMs don't provide bounding boxes
    imageBoundingBoxes: false,  // LLMs don't provide image bounding boxes (Gemini 2.0+ can via specific prompting, but not a simple toggle)
    schemaValidation: d.capabilities?.supportsStructuredOutput ?? false,  // Some LLMs support schema validation
    handwrittenText: false,  // Not specific to LLMs
    headerFooterExtraction: false,  // LLMs don't extract header/footer separately
    // Extended features
    embedOptimized: false,
    passwordProtected: false,
    contentFiltering: false,
    ocrMode: false,
    webhookCallback: false,
    mediaResolution: vendor === 'google' ? true : false,  // Google Gemini has mediaResolution
    changeTracking: false,
    hyperlinkExtraction: false,
    chartUnderstanding: false,
    imageCaptions: false,
    signatureExtraction: false,
    commentExtraction: false,
    highlightExtraction: false,
    figureSummaries: false,
    outputFormats,
  };

  return {
    id,
    name: d.name ?? id,
    source: 'llm',
    type: 'LLM',
    // NEW: 3-layer identity
    identity: {
      provider: vendor,
      model: d.defaultModel ?? id,
      method: 'native' as const,
    },
    capabilities: {
      supportsImages: d.capabilities?.supportsImages ?? false,
      supportsPDFs: d.capabilities?.supportsPDFs ?? false,
      supportsDocuments: false,  // LLM providers don't support Office docs directly
      supportsReasoning: d.capabilities?.supportsReasoning ?? false,
      supportsStructuredOutput: d.capabilities?.supportsStructuredOutput ?? false,
      // NEW capabilities
      supportsPrompts: true,
      supportsCitations: vendor === 'anthropic',  // Anthropic has Citations API
      supportsChunking: false,
      supportsImageExtraction: false,
      supportsPageMarkers: false,
      supportsLanguageHints: false,
      supportsProcessingModes: false,
      supportsSegmentation: false,
      outputFormats,
    },
    features,
    // LLM providers with vision can work with either raw documents or parsed text
    inputRequirements: {
      inputType: d.inputRequirements?.inputType ?? 'any',
      acceptedMethods: d.inputRequirements?.acceptedMethods ?? d.inputFormats?.images?.methods ?? ['base64', 'url'],
    },
    compatibleNodes: {
      parse: d.compatibleNodes?.parse ?? false,
      extract: d.compatibleNodes?.extract ?? false,
      categorize: d.compatibleNodes?.categorize ?? false,
      qualify: d.compatibleNodes?.qualify ?? false,
      split: d.compatibleNodes?.split ?? false,
    },
    inputFormats: {
      imageMimeTypes: d.inputFormats?.images?.mimeTypes ?? [],
      documentMimeTypes: ['application/pdf'],  // PDFs only for LLM
      inputMethods: d.inputFormats?.images?.methods ?? ['base64'],
      maxImageSize: d.inputFormats?.images?.maxSize,
      maxPdfSize: d.inputFormats?.pdfs?.maxSize,
      maxPages: d.inputFormats?.pdfs?.maxPages,
    },
    pricing: {
      model: 'per-token',
      inputPer1kTokens: d.pricing?.inputPer1k,
      outputPer1kTokens: d.pricing?.outputPer1k,
      currency: 'USD',
      notes: d.pricing?.notes,
    },
    rateLimits: {
      requestsPerMinute: d.limits?.requestsPerMinute,
    },
    raw: d,
  };
}

function normalizeDatalabProvider(id: string, d: Record<string, any>): NormalizedProviderMetadata {
  const opts = d.supportedOptions ?? {};
  const isVLM = d.type === 'VLM';
  const isMarkerOCR = id === 'marker-ocr' || id.includes('marker-ocr');
  const isMarkerVLM = id === 'marker-vlm' || id.includes('marker-vlm');

  // Extract model from the provider/model format or use id
  const model = d.model ?? id;

  // Output formats based on provider type and outputFormat.features
  const outputFormats: OutputFormatSupport = {
    text: true,
    markdown: d.outputFormat?.features?.markdown ?? false,
    html: false,
    json: d.outputFormat?.features?.structuredJSON ?? isVLM,
  };

  // Map Datalab supportedOptions to normalized features
  // Mark deprecated features based on Datalab API docs
  const features: NormalizedFeatures = {
    maxPages: opts.maxPages ?? false,
    pageRange: opts.pageRange ?? false,
    languageHints: opts.langs ? 'deprecated' as FeatureStatus : false,  // API ignores, handled automatically
    processingModes: opts.mode ?? false,
    agenticMode: false,  // Datalab doesn't have agentic mode
    customPrompts: opts.blockCorrectionPrompt ? 'deprecated' as FeatureStatus : false,  // Not currently supported
    imageExtraction: opts.extractImages ?? false,
    pageMarkers: opts.paginate ?? false,  // maps from 'paginate'
    citations: isMarkerVLM ? true : false,  // Marker VLM has citations
    chunking: false,  // Datalab doesn't have chunking
    segmentation: opts.segmentation ?? false,
    stripExistingOCR: opts.stripExistingOCR ? 'deprecated' as FeatureStatus : false,  // Managed automatically
    formatLines: opts.formatLines ? 'deprecated' as FeatureStatus : false,  // Handled automatically
    forceOCR: 'deprecated' as FeatureStatus,  // DEPRECATED: force_ocr param has no effect per API docs
    tableOutputFormats: false,
    tableMerging: false,
    confidence: false,  // Datalab doesn't provide confidence scores
    boundingBoxes: d.outputFormat?.features?.boundingBoxes ?? true,  // Datalab Surya provides text bboxes
    imageBoundingBoxes: isMarkerOCR || isMarkerVLM ? true : false,  // Marker extracts images with bboxes
    schemaValidation: isVLM,  // VLM providers support schema validation
    handwrittenText: true,  // Datalab handles handwritten text
    headerFooterExtraction: false,  // Datalab has issues with header/footer extraction
    // Extended features
    embedOptimized: false,
    passwordProtected: false,
    contentFiltering: false,
    ocrMode: false,
    webhookCallback: true,  // Datalab supports webhook callbacks
    mediaResolution: false,
    changeTracking: true,  // Datalab marker_extras supports track_changes
    hyperlinkExtraction: isMarkerOCR || isMarkerVLM,  // Datalab extras=extract_links
    chartUnderstanding: isMarkerOCR || isMarkerVLM,  // Datalab extras=chart_understanding
    imageCaptions: isMarkerOCR || isMarkerVLM,  // Datalab disable_image_captions param
    signatureExtraction: false,
    commentExtraction: false,
    highlightExtraction: false,
    figureSummaries: false,
    outputFormats,
  };

  return {
    id,
    name: d.name ?? id,
    source: 'datalab',
    type: d.type ?? 'OCR',
    // NEW: 3-layer identity
    identity: {
      provider: 'datalab',
      model,
      method: 'native' as const,  // Default to native, can be overridden when self-hosted
    },
    capabilities: {
      supportsImages: d.capabilities?.supportsImages ?? true,
      supportsPDFs: d.capabilities?.supportsPDFs ?? true,
      supportsDocuments: d.capabilities?.supportsDocuments ?? true,
      supportsReasoning: false,  // Datalab doesn't do reasoning
      supportsStructuredOutput: isVLM,
      // NEW capabilities from supportedOptions
      supportsPrompts: opts.blockCorrectionPrompt ?? false,
      supportsCitations: opts.citations ?? false,
      supportsChunking: false,
      supportsImageExtraction: opts.extractImages ?? false,
      supportsPageMarkers: opts.paginate ?? false,
      supportsLanguageHints: opts.langs ?? false,
      supportsProcessingModes: opts.mode ?? false,
      supportsSegmentation: opts.segmentation ?? false,
      outputFormats,
    },
    features,
    // Datalab providers always need raw document input
    inputRequirements: {
      inputType: d.inputRequirements?.inputType ?? 'raw-document',
      acceptedMethods: d.inputRequirements?.acceptedMethods ?? d.inputFormats?.inputMethods ?? ['base64', 'url'],
    },
    compatibleNodes: {
      parse: d.compatibleNodes?.parse ?? false,
      extract: d.compatibleNodes?.extract ?? false,
      categorize: d.compatibleNodes?.categorize ?? false,
      qualify: d.compatibleNodes?.qualify ?? false,
      split: d.compatibleNodes?.split ?? false,
    },
    inputFormats: {
      imageMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => m.startsWith('image/')),
      documentMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => !m.startsWith('image/')),
      inputMethods: d.inputFormats?.inputMethods ?? ['base64'],
      maxFileSize: d.inputFormats?.maxFileSize,
      maxPages: d.inputFormats?.maxPages,
    },
    pricing: {
      model: 'per-page',
      perPage: d.pricing?.perPage,
      currency: 'USD',
      notes: d.pricing?.notes,
    },
    rateLimits: {
      docsPerMinute: d.apiConfig?.rateLimit?.docsPerMinute,
    },
    raw: d,
  };
}

function normalizeReductoProvider(id: string, d: Record<string, any>): NormalizedProviderMetadata {
  const opts = d.supportedOptions ?? {};
  const isVLM = d.type === 'VLM';
  const isExtract = d.compatibleNodes?.extract === true;
  const isParse = d.compatibleNodes?.parse === true;

  // Extract model from metadata or default to 'v1'
  const model = d.model ?? 'v1';

  // Output formats based on provider type
  const outputFormats: OutputFormatSupport = {
    text: d.outputFormat?.features?.textLines ?? true,
    markdown: d.outputFormat?.features?.markdown ?? d.compatibleNodes?.parse ?? false,
    html: opts.tableOutputFormat ?? false,  // Reducto can output HTML tables
    json: d.outputFormat?.features?.structuredJSON ?? isExtract,
  };

  // Map Reducto supportedOptions to normalized features
  // Reducto doesn't have native maxPages, only pageRange - mark maxPages as derived
  const features: NormalizedFeatures = {
    maxPages: (opts.pageRange ?? false) ? 'derived' as FeatureStatus : false,  // SDK derives from pageRange (1-indexed)
    pageRange: opts.pageRange ?? false,
    languageHints: false,  // Reducto doesn't support language hints
    processingModes: false,  // Reducto uses agentic instead
    agenticMode: opts.mode ?? false,  // maps from 'mode' (agentic)
    customPrompts: opts.additionalPrompt ?? false,  // maps from 'additionalPrompt'
    imageExtraction: opts.extractImages ?? false,  // maps from 'returnImages'
    pageMarkers: true,  // Reducto has addPageMarkers
    citations: opts.citations ?? false,
    chunking: opts.chunking ?? false,
    segmentation: opts.segmentation ?? false,  // Via Split endpoint
    stripExistingOCR: false,
    formatLines: false,
    forceOCR: false,
    tableOutputFormats: opts.tableOutputFormat ?? false,
    tableMerging: d.compatibleNodes?.parse ?? false,  // Parse has mergeTables
    confidence: opts.confidence ?? d.outputFormat?.features?.confidence ?? false,  // Reducto Parse has confidence
    boundingBoxes: d.outputFormat?.features?.boundingBoxes ?? isParse,  // Reducto Parse has text bounding boxes
    imageBoundingBoxes: isParse ? true : false,  // Reducto Parse has figure bounding boxes
    schemaValidation: d.outputFormat?.features?.schemaValidation ?? isExtract,  // Extract has schema validation
    handwrittenText: false,  // Reducto doesn't specifically advertise handwriting
    headerFooterExtraction: true,  // Reducto has Header/Footer block types
    // Extended features
    embedOptimized: isParse,  // Reducto Parse supports retrieval.embedding_optimized: true
    passwordProtected: true,  // Reducto handles encrypted PDFs
    contentFiltering: true,  // Reducto can filter block types
    ocrMode: opts.ocrSystem ?? false,  // Reducto has ocr_system selection
    webhookCallback: true,  // Reducto supports webhook callbacks
    mediaResolution: false,
    changeTracking: true,  // Reducto tracks changes in Word docs
    hyperlinkExtraction: true,  // Reducto extracts hyperlinks via formatting.include
    chartUnderstanding: isParse,  // Reducto enhance.agentic[].advanced_chart_agent for figures
    imageCaptions: false,  // Not available in Reducto
    signatureExtraction: false,  // NOT supported - formatting.include only accepts: change_tracking, highlight, comments, hyperlinks
    commentExtraction: isParse || isExtract,  // Reducto formatting.include: ["comments"]
    highlightExtraction: isParse || isExtract,  // Reducto formatting.include: ["highlight"]
    figureSummaries: isParse,  // Reducto enhance.summarize_figures
    outputFormats,
  };

  return {
    id,
    name: d.name ?? id,
    source: 'reducto',
    type: d.type ?? 'OCR',
    // NEW: 3-layer identity
    identity: {
      provider: 'reducto',
      model,
      method: 'native' as const,
    },
    capabilities: {
      supportsImages: d.capabilities?.supportsImages ?? true,
      supportsPDFs: d.capabilities?.supportsPDFs ?? true,
      supportsDocuments: d.capabilities?.supportsDocuments ?? true,
      supportsReasoning: false,  // Reducto doesn't do reasoning
      supportsStructuredOutput: isVLM || isExtract,
      // NEW capabilities from supportedOptions
      supportsPrompts: opts.additionalPrompt ?? false,
      supportsCitations: opts.citations ?? false,
      supportsChunking: opts.chunking ?? false,
      supportsImageExtraction: opts.extractImages ?? false,
      supportsPageMarkers: true,
      supportsLanguageHints: false,
      supportsProcessingModes: opts.mode ?? false,  // agentic mode
      supportsSegmentation: opts.segmentation ?? false,
      outputFormats,
    },
    features,
    // Reducto providers always need raw document input
    inputRequirements: {
      inputType: d.inputRequirements?.inputType ?? 'raw-document',
      acceptedMethods: d.inputRequirements?.acceptedMethods ?? d.inputFormats?.inputMethods ?? ['base64', 'url'],
    },
    compatibleNodes: {
      parse: d.compatibleNodes?.parse ?? false,
      extract: d.compatibleNodes?.extract ?? false,
      categorize: d.compatibleNodes?.categorize ?? false,
      qualify: d.compatibleNodes?.qualify ?? false,
      split: d.compatibleNodes?.split ?? false,
    },
    inputFormats: {
      imageMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => m.startsWith('image/')),
      documentMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => !m.startsWith('image/')),
      inputMethods: d.inputFormats?.inputMethods ?? ['base64'],
      maxFileSize: d.inputFormats?.maxFileSize,
      maxPages: d.inputFormats?.maxPages,
    },
    pricing: {
      model: 'per-page',
      perPage: d.pricing?.standard ? d.pricing.standard * (d.pricing.usdPerCredit ?? 0.004) : d.pricing?.perPage,
      currency: 'USD',
      notes: d.pricing?.notes,
    },
    rateLimits: {
      docsPerMinute: d.apiConfig?.rateLimit?.docsPerMinute,
    },
    raw: d,
  };
}

function normalizeUnsiloedProvider(id: string, d: Record<string, any>): NormalizedProviderMetadata {
  const isVLM = d.type === 'VLM';
  const isExtract = d.compatibleNodes?.extract === true;
  const isParse = d.compatibleNodes?.parse === true;
  const isSplit = d.compatibleNodes?.split === true;
  const isCategorize = d.compatibleNodes?.categorize === true;

  // Extract model from metadata or default to 'v1'
  const model = d.model ?? 'v1';

  // Output formats based on provider type and outputFormat.features
  const outputFormats: OutputFormatSupport = {
    text: d.outputFormat?.features?.textLines ?? isParse,
    markdown: d.outputFormat?.features?.markdown ?? isParse,
    html: false,  // Unsiloed doesn't output HTML
    json: d.outputFormat?.features?.structuredJSON ?? (isVLM || isExtract),
  };

  // Unsiloed features - inferred from outputFormat.features and capabilities
  // Note: Unsiloed doesn't have a formal supportedOptions like Datalab/Reducto
  const features: NormalizedFeatures = {
    maxPages: false,  // Unsiloed doesn't have max pages option
    pageRange: false,  // Unsiloed doesn't have page range option
    languageHints: false,  // Unsiloed doesn't support language hints
    processingModes: false,  // Unsiloed doesn't have fast/balanced/high_accuracy modes like Datalab
    agenticMode: false,  // Unsiloed doesn't have agentic mode
    customPrompts: false,  // Unsiloed doesn't support custom prompts
    imageExtraction: false,  // Unsiloed doesn't extract images
    pageMarkers: false,  // Unsiloed doesn't add page markers
    citations: d.outputFormat?.features?.citations ?? isExtract,  // Extract has citations
    chunking: d.outputFormat?.features?.semanticChunking ?? isParse,  // Parse has semantic chunking
    segmentation: isSplit,  // Split provider does segmentation
    stripExistingOCR: false,
    formatLines: false,
    forceOCR: false,
    tableOutputFormats: false,
    tableMerging: false,
    confidence: d.outputFormat?.features?.confidence ?? false,  // Unsiloed may provide confidence
    boundingBoxes: d.outputFormat?.features?.boundingBoxes ?? isParse,  // Unsiloed Parse has bounding boxes
    imageBoundingBoxes: false,  // Unsiloed doesn't return image-specific bboxes
    schemaValidation: isExtract,  // Extract supports schema validation
    handwrittenText: d.capabilities?.specialFeatures?.includes('handwritten text') ?? false,  // Parse supports handwriting
    headerFooterExtraction: false,  // Unsiloed doesn't extract header/footer separately
    // Extended features
    embedOptimized: false,
    passwordProtected: false,
    contentFiltering: isParse,  // Parse supports keep_segment_types: ["table", "picture", "formula", "text"]
    ocrMode: isParse,  // Parse endpoint supports ocr_mode: 'auto_ocr' | 'full_ocr'
    webhookCallback: false,  // Unsiloed is synchronous
    mediaResolution: false,
    changeTracking: false,
    hyperlinkExtraction: false,
    chartUnderstanding: false,  // Not available in Unsiloed
    imageCaptions: false,  // Not available in Unsiloed
    signatureExtraction: false,  // Not available in Unsiloed
    commentExtraction: false,  // Not available in Unsiloed
    highlightExtraction: false,  // Not available in Unsiloed
    figureSummaries: false,  // Not available in Unsiloed
    outputFormats,
  };

  return {
    id,
    name: d.name ?? id,
    source: 'unsiloed',
    type: d.type ?? 'OCR',
    // NEW: 3-layer identity
    identity: {
      provider: 'unsiloed',
      model,
      method: 'native' as const,
    },
    capabilities: {
      supportsImages: d.capabilities?.supportsImages ?? true,
      supportsPDFs: d.capabilities?.supportsPDFs ?? true,
      supportsDocuments: d.capabilities?.supportsDocuments ?? false,
      supportsReasoning: false,  // Unsiloed doesn't do reasoning
      supportsStructuredOutput: isVLM || isExtract,
      // NEW capabilities
      supportsPrompts: false,  // Unsiloed doesn't support custom prompts
      supportsCitations: d.outputFormat?.features?.citations ?? isExtract,
      supportsChunking: d.outputFormat?.features?.semanticChunking ?? isParse,
      supportsImageExtraction: false,
      supportsPageMarkers: false,
      supportsLanguageHints: false,
      supportsProcessingModes: false,  // Unsiloed doesn't have fast/balanced/high_accuracy modes
      supportsSegmentation: isSplit || isCategorize,
      outputFormats,
    },
    features,
    // Unsiloed providers always need raw document input
    inputRequirements: {
      inputType: d.inputRequirements?.inputType ?? 'raw-document',
      acceptedMethods: d.inputRequirements?.acceptedMethods ?? d.inputFormats?.inputMethods ?? ['base64', 'url'],
    },
    compatibleNodes: {
      parse: d.compatibleNodes?.parse ?? false,
      extract: d.compatibleNodes?.extract ?? false,
      categorize: d.compatibleNodes?.categorize ?? false,
      qualify: d.compatibleNodes?.qualify ?? false,
      split: d.compatibleNodes?.split ?? false,
    },
    inputFormats: {
      imageMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => m.startsWith('image/')),
      documentMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => !m.startsWith('image/')),
      inputMethods: d.inputFormats?.inputMethods ?? ['base64'],
      maxFileSize: d.inputFormats?.maxFileSize,
      maxPages: d.inputFormats?.maxPages,
    },
    pricing: {
      model: 'per-page',
      perPage: d.pricing?.standardUSD ?? d.pricing?.perPage,
      currency: 'USD',
      notes: d.pricing?.notes,
    },
    rateLimits: {
      docsPerMinute: d.apiConfig?.rateLimit?.docsPerMinute,
    },
    raw: d,
  };
}

// Convenience functions

/**
 * Get providers that support a specific MIME type
 */
export function getProvidersForMimeType(mimeType: string): NormalizedProviderMetadata[] {
  return queryProviders({ mimeType });
}

/**
 * Get the cheapest provider for a specific capability
 */
export function getCheapestProviderFor(
  capability: 'ocr' | 'extraction' | 'parse'
): NormalizedProviderMetadata | undefined {
  let providers: NormalizedProviderMetadata[];

  switch (capability) {
    case 'ocr':
    case 'parse':
      providers = queryProviders({ compatibleWith: ['parse'] });
      break;
    case 'extraction':
      providers = queryProviders({ compatibleWith: ['extract'] });
      break;
  }

  // Sort by cost (per-page first, then per-token)
  return providers.sort((a, b) => {
    const costA = a.pricing.perPage ?? (a.pricing.inputPer1kTokens ?? Infinity);
    const costB = b.pricing.perPage ?? (b.pricing.inputPer1kTokens ?? Infinity);
    return costA - costB;
  })[0];
}

/**
 * Get providers with the largest file size support
 */
export function getProvidersForLargeFiles(minSizeMB: number = 100): NormalizedProviderMetadata[] {
  return queryProviders({ minFileSize: minSizeMB });
}

// ============================================================================
// Model-Level Metadata Types
// ============================================================================

/**
 * Type alias for capabilities object (for model override typing)
 */
export type NormalizedCapabilities = NormalizedProviderMetadata['capabilities'];

/**
 * Type alias for node compatibility object
 */
export type NodeCompatibility = NormalizedProviderMetadata['compatibleNodes'];

/**
 * Type alias for pricing configuration
 */
export type NormalizedPricing = NormalizedProviderMetadata['pricing'];

/**
 * Node type names for querying
 */
export type NodeTypeName = 'parse' | 'extract' | 'categorize' | 'qualify' | 'split';

/**
 * Model-level limits that may differ from provider defaults
 */
export type ModelLimits = {
  maxContextTokens?: number;
  maxOutputTokens?: number;
  maxFileSize?: number;  // MB
  maxPages?: number;
};

/**
 * Model-level metadata that can override provider defaults.
 * Unspecified fields inherit from the provider.
 */
export type ModelMetadata = {
  /** Model ID as used in API calls */
  id: string;

  /** Human-readable name (optional, defaults to id) */
  name?: string;

  /** OpenRouter model ID (e.g., 'openai/gpt-4.1') */
  openRouterId?: string;

  // =========================================
  // Capability Overrides (inherit if unset)
  // =========================================

  /** Override provider capabilities */
  capabilities?: Partial<NormalizedCapabilities>;

  /** Override provider input requirements */
  inputRequirements?: Partial<InputRequirements>;

  /** Override provider node compatibility */
  compatibleNodes?: Partial<NodeCompatibility>;

  // =========================================
  // Model-Specific Values
  // =========================================

  /** Model-specific pricing */
  pricing?: {
    inputPer1kTokens?: number;
    outputPer1kTokens?: number;
    perPage?: number;
  };

  /** Model-specific limits */
  limits?: ModelLimits;
};

/**
 * Provider metadata extended with model array
 */
export type ProviderMetadataWithModels = NormalizedProviderMetadata & {
  /** Per-model metadata with override capabilities */
  models?: ModelMetadata[];
};

/**
 * Fully resolved model metadata (all inheritance applied)
 */
export type ResolvedModelMetadata = {
  modelId: string;
  modelName: string;
  openRouterId?: string;
  providerId: string;
  providerName: string;
  providerSource: string;
  capabilities: NormalizedCapabilities;
  features: NormalizedFeatures;
  inputRequirements: InputRequirements;
  compatibleNodes: NodeCompatibility;
  pricing: NormalizedPricing;
  limits?: ModelLimits;
};

/**
 * Filter options for model queries
 */
export type ModelQueryFilter = {
  /** Filter by provider ID */
  providerId?: string | string[];

  /** Filter by provider source */
  source?: string | string[];

  /** Filter by capabilities */
  supports?: {
    images?: boolean;
    pdfs?: boolean;
    documents?: boolean;
    reasoning?: boolean;
    structuredOutput?: boolean;
    // Extended capability filters (same as ProviderQueryFilter)
    prompts?: boolean;
    citations?: boolean;
    chunking?: boolean;
    imageExtraction?: boolean;
    pageMarkers?: boolean;
    languageHints?: boolean;
    processingModes?: boolean;
    segmentation?: boolean;
  };

  /** Filter by specific features (all must be supported) */
  hasFeatures?: FeatureName[];

  /** Filter by output format support */
  outputFormat?: 'text' | 'markdown' | 'html' | 'json';

  /** Filter by input requirements */
  inputRequirements?: {
    inputType?: ProviderInputType | ProviderInputType[];
  };

  /** Filter by node compatibility */
  compatibleWith?: NodeTypeName[];

  /** Filter by context window (minimum) */
  minContextTokens?: number;

  /** Custom filter function */
  filter?: (model: ResolvedModelMetadata) => boolean;
};

// Registry for provider metadata with models
const modelRegistry = new Map<string, ProviderMetadataWithModels>();

/**
 * Register provider metadata with model information
 *
 * @param providerId - Provider identifier
 * @param metadata - Provider metadata with models array
 */
export function registerProviderWithModels(
  providerId: string,
  metadata: ProviderMetadataWithModels
): void {
  modelRegistry.set(providerId, metadata);
}

/**
 * Resolve model metadata by applying inheritance from provider.
 * Returns fully resolved metadata for a specific model.
 *
 * @param providerId - Provider ID (e.g., 'openai', 'anthropic')
 * @param modelId - Model ID (e.g., 'gpt-4.1', 'claude-sonnet-4.5'). If not provided, returns provider defaults.
 * @returns Resolved model metadata or undefined if not found
 *
 * @example
 * ```typescript
 * const gpt4 = resolveModelMetadata('openai', 'gpt-4.1');
 * console.log(gpt4?.capabilities.supportsReasoning); // false
 *
 * const o3 = resolveModelMetadata('openai', 'o3');
 * console.log(o3?.capabilities.supportsReasoning); // true
 * ```
 */
export function resolveModelMetadata(
  providerId: string,
  modelId?: string
): ResolvedModelMetadata | undefined {
  // Try model registry first (has detailed model info)
  const providerWithModels = modelRegistry.get(providerId);
  if (providerWithModels) {
    return resolveFromProviderWithModels(providerWithModels, modelId);
  }

  // Fall back to basic provider registry
  const provider = getProviderById(providerId);
  if (!provider) return undefined;

  // Return provider-level metadata (no model-specific overrides)
  return {
    modelId: modelId ?? providerId,
    modelName: modelId ?? provider.name,
    providerId: provider.id,
    providerName: provider.name,
    providerSource: provider.source,
    capabilities: { ...provider.capabilities },
    features: { ...provider.features },
    inputRequirements: { ...provider.inputRequirements },
    compatibleNodes: { ...provider.compatibleNodes },
    pricing: { ...provider.pricing },
  };
}

/**
 * Resolve model from provider with models array (internal helper)
 */
function resolveFromProviderWithModels(
  provider: ProviderMetadataWithModels,
  modelId?: string
): ResolvedModelMetadata {
  // Find model in models array
  const model = modelId
    ? provider.models?.find(m => m.id === modelId)
    : undefined;

  // Build resolved metadata with inheritance
  return {
    modelId: model?.id ?? modelId ?? provider.id,
    modelName: model?.name ?? model?.id ?? modelId ?? provider.name,
    openRouterId: model?.openRouterId,
    providerId: provider.id,
    providerName: provider.name,
    providerSource: provider.source,

    // Merge capabilities (model overrides provider)
    capabilities: {
      supportsImages: model?.capabilities?.supportsImages ?? provider.capabilities.supportsImages,
      supportsPDFs: model?.capabilities?.supportsPDFs ?? provider.capabilities.supportsPDFs,
      supportsDocuments: model?.capabilities?.supportsDocuments ?? provider.capabilities.supportsDocuments,
      supportsReasoning: model?.capabilities?.supportsReasoning ?? provider.capabilities.supportsReasoning,
      supportsStructuredOutput: model?.capabilities?.supportsStructuredOutput ?? provider.capabilities.supportsStructuredOutput,
      // NEW capabilities
      supportsPrompts: model?.capabilities?.supportsPrompts ?? provider.capabilities.supportsPrompts,
      supportsCitations: model?.capabilities?.supportsCitations ?? provider.capabilities.supportsCitations,
      supportsChunking: model?.capabilities?.supportsChunking ?? provider.capabilities.supportsChunking,
      supportsImageExtraction: model?.capabilities?.supportsImageExtraction ?? provider.capabilities.supportsImageExtraction,
      supportsPageMarkers: model?.capabilities?.supportsPageMarkers ?? provider.capabilities.supportsPageMarkers,
      supportsLanguageHints: model?.capabilities?.supportsLanguageHints ?? provider.capabilities.supportsLanguageHints,
      supportsProcessingModes: model?.capabilities?.supportsProcessingModes ?? provider.capabilities.supportsProcessingModes,
      supportsSegmentation: model?.capabilities?.supportsSegmentation ?? provider.capabilities.supportsSegmentation,
      outputFormats: model?.capabilities?.outputFormats ?? provider.capabilities.outputFormats,
    },

    // Merge input requirements
    inputRequirements: {
      inputType: model?.inputRequirements?.inputType ?? provider.inputRequirements.inputType,
      acceptedMethods: model?.inputRequirements?.acceptedMethods ?? provider.inputRequirements.acceptedMethods,
    },

    // Merge node compatibility
    compatibleNodes: {
      parse: model?.compatibleNodes?.parse ?? provider.compatibleNodes.parse,
      extract: model?.compatibleNodes?.extract ?? provider.compatibleNodes.extract,
      categorize: model?.compatibleNodes?.categorize ?? provider.compatibleNodes.categorize,
      qualify: model?.compatibleNodes?.qualify ?? provider.compatibleNodes.qualify,
      split: model?.compatibleNodes?.split ?? provider.compatibleNodes.split,
    },

    // Features (inherited from provider - models don't override features)
    features: { ...provider.features },

    // Merge pricing
    pricing: {
      model: provider.pricing.model,
      inputPer1kTokens: model?.pricing?.inputPer1kTokens ?? provider.pricing.inputPer1kTokens,
      outputPer1kTokens: model?.pricing?.outputPer1kTokens ?? provider.pricing.outputPer1kTokens,
      perPage: model?.pricing?.perPage ?? provider.pricing.perPage,
      currency: provider.pricing.currency,
      notes: provider.pricing.notes,
    },

    // Model limits
    limits: model?.limits,
  };
}

/**
 * Query models with filters.
 * Returns all models that match the filter criteria.
 *
 * @param filter - Query filters
 * @returns Array of matching resolved model metadata
 *
 * @example
 * ```typescript
 * // Get all reasoning models
 * const reasoningModels = queryModels({ supports: { reasoning: true } });
 *
 * // Get models with large context windows
 * const largeContextModels = queryModels({ minContextTokens: 100000 });
 *
 * // Get OpenAI models compatible with extract()
 * const openaiExtract = queryModels({
 *   providerId: 'openai',
 *   compatibleWith: ['extract']
 * });
 * ```
 */
export function queryModels(filter: ModelQueryFilter = {}): ResolvedModelMetadata[] {
  const results: ResolvedModelMetadata[] = [];

  // Collect all models from model registry
  for (const [providerId, provider] of modelRegistry) {
    // Check provider-level filters first
    if (filter.providerId) {
      const providerIds = Array.isArray(filter.providerId) ? filter.providerId : [filter.providerId];
      if (!providerIds.includes(providerId)) continue;
    }

    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      if (!sources.includes(provider.source)) continue;
    }

    // Resolve each model
    const models = provider.models ?? [{ id: provider.id }];
    for (const model of models) {
      const resolved = resolveFromProviderWithModels(provider, model.id);
      if (matchesModelFilter(resolved, filter)) {
        results.push(resolved);
      }
    }
  }

  // Also include providers from basic registry that don't have detailed models
  for (const provider of getAllProviders()) {
    // Skip if already in model registry
    if (modelRegistry.has(provider.id)) continue;

    // Check provider-level filters
    if (filter.providerId) {
      const providerIds = Array.isArray(filter.providerId) ? filter.providerId : [filter.providerId];
      if (!providerIds.includes(provider.id)) continue;
    }

    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      if (!sources.includes(provider.source)) continue;
    }

    const resolved = resolveModelMetadata(provider.id);
    if (resolved && matchesModelFilter(resolved, filter)) {
      results.push(resolved);
    }
  }

  return results;
}

/**
 * Check if resolved model matches filter criteria (internal helper)
 */
function matchesModelFilter(model: ResolvedModelMetadata, filter: ModelQueryFilter): boolean {
  // Check capabilities
  if (filter.supports) {
    if (filter.supports.images !== undefined && model.capabilities.supportsImages !== filter.supports.images) {
      return false;
    }
    if (filter.supports.pdfs !== undefined && model.capabilities.supportsPDFs !== filter.supports.pdfs) {
      return false;
    }
    if (filter.supports.documents !== undefined && model.capabilities.supportsDocuments !== filter.supports.documents) {
      return false;
    }
    if (filter.supports.reasoning !== undefined && model.capabilities.supportsReasoning !== filter.supports.reasoning) {
      return false;
    }
    if (filter.supports.structuredOutput !== undefined && model.capabilities.supportsStructuredOutput !== filter.supports.structuredOutput) {
      return false;
    }
    // Extended capability filters
    if (filter.supports.prompts !== undefined && model.capabilities.supportsPrompts !== filter.supports.prompts) {
      return false;
    }
    if (filter.supports.citations !== undefined && model.capabilities.supportsCitations !== filter.supports.citations) {
      return false;
    }
    if (filter.supports.chunking !== undefined && model.capabilities.supportsChunking !== filter.supports.chunking) {
      return false;
    }
    if (filter.supports.imageExtraction !== undefined && model.capabilities.supportsImageExtraction !== filter.supports.imageExtraction) {
      return false;
    }
    if (filter.supports.pageMarkers !== undefined && model.capabilities.supportsPageMarkers !== filter.supports.pageMarkers) {
      return false;
    }
    if (filter.supports.languageHints !== undefined && model.capabilities.supportsLanguageHints !== filter.supports.languageHints) {
      return false;
    }
    if (filter.supports.processingModes !== undefined && model.capabilities.supportsProcessingModes !== filter.supports.processingModes) {
      return false;
    }
    if (filter.supports.segmentation !== undefined && model.capabilities.supportsSegmentation !== filter.supports.segmentation) {
      return false;
    }
  }

  // Check specific features (all must be supported)
  // Uses isFeatureEnabled() to treat 'deprecated' and 'derived' as truthy
  if (filter.hasFeatures && filter.hasFeatures.length > 0) {
    for (const feature of filter.hasFeatures) {
      if (!isFeatureEnabled(model.features[feature])) {
        return false;
      }
    }
  }

  // Check output format support
  if (filter.outputFormat) {
    if (model.capabilities.outputFormats[filter.outputFormat] !== true) {
      return false;
    }
  }

  // Check input requirements
  if (filter.inputRequirements?.inputType !== undefined) {
    const inputTypes = Array.isArray(filter.inputRequirements.inputType)
      ? filter.inputRequirements.inputType
      : [filter.inputRequirements.inputType];
    if (!inputTypes.includes(model.inputRequirements.inputType)) {
      return false;
    }
  }

  // Check node compatibility
  if (filter.compatibleWith && filter.compatibleWith.length > 0) {
    for (const node of filter.compatibleWith) {
      if (!model.compatibleNodes[node]) {
        return false;
      }
    }
  }

  // Check context tokens
  if (filter.minContextTokens !== undefined) {
    const contextTokens = model.limits?.maxContextTokens ?? 0;
    if (contextTokens < filter.minContextTokens) {
      return false;
    }
  }

  // Custom filter
  if (filter.filter && !filter.filter(model)) {
    return false;
  }

  return true;
}

/**
 * Get all models compatible with a specific node type.
 *
 * @param nodeType - Node type to check compatibility
 * @returns Array of resolved model metadata
 *
 * @example
 * ```typescript
 * // Get all models that can be used with extract()
 * const extractModels = getModelsForNode('extract');
 *
 * // Get all models that can be used with parse()
 * const parseModels = getModelsForNode('parse');
 * ```
 */
export function getModelsForNode(nodeType: NodeTypeName): ResolvedModelMetadata[] {
  return queryModels({ compatibleWith: [nodeType] });
}

/**
 * Get all registered models (resolved)
 */
export function getAllModels(): ResolvedModelMetadata[] {
  return queryModels({});
}

/**
 * Clear model registry (useful for testing)
 */
export function clearModelRegistry(): void {
  modelRegistry.clear();
}

// ============================================================================
// Identity-Based Query Functions
// ============================================================================

/**
 * Query providers by 3-layer identity (provider/model/method)
 *
 * @example
 * ```typescript
 * // Get all Datalab providers
 * const datalabProviders = queryByIdentity({ provider: 'datalab' });
 *
 * // Get specific model
 * const surya = queryByIdentity({ provider: 'datalab', model: 'surya' });
 *
 * // Get all self-hosted capable providers
 * const selfHosted = queryByIdentity({ method: 'self-hosted' });
 * ```
 */
export function queryByIdentity(filter: {
  provider?: ProviderVendor | string;
  model?: string;
  method?: AccessMethod;
}): NormalizedProviderMetadata[] {
  return queryProviders({
    provider: filter.provider,
    model: filter.model,
    method: filter.method,
  });
}

/**
 * Get all models available for a specific provider vendor
 *
 * @example
 * ```typescript
 * const datalabModels = getModelsForProvider('datalab');
 * // => ['surya', 'marker-ocr', 'marker-vlm']
 * ```
 */
export function getModelsForProvider(provider: ProviderVendor | string): string[] {
  const providers = queryProviders({ provider });
  const models = new Set<string>();
  for (const p of providers) {
    if (p.identity?.model) {
      models.add(p.identity.model);
    }
  }
  return [...models];
}

/**
 * Get available access methods for a provider/model combination
 *
 * @example
 * ```typescript
 * const methods = getMethodsForModel('datalab', 'surya');
 * // => ['native', 'self-hosted']
 * ```
 */
export function getMethodsForModel(
  provider: ProviderVendor | string,
  model: string
): AccessMethod[] {
  const providers = queryProviders({ provider, model });
  const methods = new Set<AccessMethod>();
  for (const p of providers) {
    if (p.identity?.method) {
      methods.add(p.identity.method);
    }
  }
  return [...methods];
}

/**
 * Get all unique provider vendors in the registry
 *
 * @example
 * ```typescript
 * const vendors = getAllProviderVendors();
 * // => ['datalab', 'reducto', 'unsiloed', 'openai', 'anthropic', ...]
 * ```
 */
export function getAllProviderVendors(): string[] {
  const providers = getAllProviders();
  const vendors = new Set<string>();
  for (const p of providers) {
    if (p.identity?.provider) {
      vendors.add(p.identity.provider);
    }
  }
  return [...vendors];
}

// ============================================================================
// Derived Feature Transformation Utilities
// ============================================================================

/**
 * Page indexing convention by provider source.
 * Used when converting maxPages to pageRange.
 */
const PAGE_INDEXING: Record<string, PageIndexing> = {
  datalab: '0-indexed',
  reducto: '1-indexed',
  mistral: '0-indexed',
  unsiloed: '1-indexed',  // Default assumption
  llm: '1-indexed',       // N/A but default
};

/**
 * Get the page indexing convention for a provider.
 *
 * @param provider - Provider metadata or source string
 * @returns Page indexing convention ('0-indexed' or '1-indexed')
 */
export function getPageIndexing(provider: NormalizedProviderMetadata | string): PageIndexing {
  const source = typeof provider === 'string' ? provider : provider.source;
  return PAGE_INDEXING[source] ?? '1-indexed';
}

/**
 * Options that can be transformed for derived features.
 */
export type DerivedFeatureOptions = {
  maxPages?: number;
  pageRange?: string;
};

/**
 * Result of derived feature transformation.
 */
export type TransformedOptions = {
  /** The transformed page_range parameter (provider-specific format) */
  page_range?: string;
  /** Array format for providers that support it (e.g., Mistral) */
  pages?: number[];
  /** Original options minus the derived ones */
  remainingOptions: Record<string, unknown>;
};

/**
 * Transform maxPages to provider-specific pageRange format.
 *
 * This utility handles the conversion when a provider has `maxPages: 'derived'`,
 * meaning the SDK provides maxPages functionality via the underlying pageRange API.
 *
 * @param options - User-provided options including maxPages
 * @param provider - Provider metadata to determine format
 * @returns Transformed options with provider-specific pageRange
 *
 * @example
 * ```typescript
 * // User wants first 5 pages from Reducto (1-indexed)
 * const result = transformDerivedFeatures({ maxPages: 5 }, reductoProvider);
 * // => { page_range: '1-5', remainingOptions: {} }
 *
 * // User wants first 5 pages from Datalab (0-indexed)
 * const result = transformDerivedFeatures({ maxPages: 5 }, datalabProvider);
 * // => { page_range: '0-4', remainingOptions: {} }
 *
 * // User wants first 5 pages from Mistral (0-indexed, array format)
 * const result = transformDerivedFeatures({ maxPages: 5 }, mistralProvider);
 * // => { page_range: '0-4', pages: [0,1,2,3,4], remainingOptions: {} }
 * ```
 */
export function transformDerivedFeatures(
  options: DerivedFeatureOptions & Record<string, unknown>,
  provider: NormalizedProviderMetadata
): TransformedOptions {
  const { maxPages, pageRange, ...remainingOptions } = options;
  const result: TransformedOptions = { remainingOptions };

  // If user provided explicit pageRange, pass it through
  if (pageRange !== undefined) {
    result.page_range = pageRange;
    return result;
  }

  // If maxPages provided and provider has derived maxPages support
  if (maxPages !== undefined && provider.features.maxPages === 'derived') {
    const indexing = getPageIndexing(provider);

    if (indexing === '0-indexed') {
      // 0-indexed: first N pages = 0 to N-1
      result.page_range = `0-${maxPages - 1}`;

      // Mistral also supports array format
      if (provider.source === 'mistral') {
        result.pages = Array.from({ length: maxPages }, (_, i) => i);
      }
    } else {
      // 1-indexed: first N pages = 1 to N
      result.page_range = `1-${maxPages}`;
    }
  } else if (maxPages !== undefined && isFeatureEnabled(provider.features.maxPages)) {
    // Provider natively supports maxPages, pass it through in remainingOptions
    result.remainingOptions.maxPages = maxPages;
  }

  return result;
}

/**
 * Check if a provider requires derived feature transformation for maxPages.
 *
 * @param provider - Provider metadata
 * @returns true if maxPages needs to be transformed to pageRange
 */
export function requiresMaxPagesTransformation(provider: NormalizedProviderMetadata): boolean {
  return provider.features.maxPages === 'derived';
}

// ============================================================================
// Mistral Provider Normalizer
// ============================================================================

function normalizeMistralProvider(id: string, d: Record<string, any>): NormalizedProviderMetadata {
  const opts = d.supportedOptions ?? {};
  const isVLM = d.type === 'VLM';
  const isOCR = d.type === 'OCR';

  // Extract model from metadata
  const model = d.model ?? id;

  // Output formats based on provider type
  const outputFormats: OutputFormatSupport = {
    text: true,
    markdown: d.outputFormat?.features?.markdown ?? isOCR,
    html: d.outputFormat?.features?.htmlTables ?? isOCR,  // OCR 3 can output HTML tables
    json: d.outputFormat?.features?.structuredJSON ?? isVLM,
  };

  // Map Mistral supportedOptions to normalized features
  // Mistral VLM: bbox_annotation supports 1000 pages, document_annotation limited to 8 pages
  const features: NormalizedFeatures = {
    maxPages: d.inputFormats?.maxPages !== undefined,
    pageRange: true,  // Mistral supports pages param: "0-5" or [0,2,5] (0-indexed)
    languageHints: false,  // Mistral doesn't support language hints
    processingModes: false,  // Mistral doesn't have processing modes
    agenticMode: false,  // Mistral doesn't have agentic mode
    customPrompts: false,  // Mistral OCR 3 doesn't support custom prompts
    imageExtraction: opts.includeImageBase64 ?? false,  // Can include embedded images
    pageMarkers: false,  // Mistral doesn't add page markers
    citations: false,  // Mistral doesn't provide citations
    chunking: false,  // Mistral doesn't do chunking
    segmentation: false,  // Mistral doesn't do segmentation
    stripExistingOCR: false,
    formatLines: false,
    forceOCR: true,  // OCR 3 always does OCR
    tableOutputFormats: opts.tableFormat ?? isOCR,  // html or markdown table format
    tableMerging: false,
    confidence: false,  // Mistral doesn't provide confidence scores
    boundingBoxes: false,  // Mistral does NOT provide text-level bounding boxes
    imageBoundingBoxes: true,  // Mistral provides image/figure bounding boxes only
    schemaValidation: d.outputFormat?.features?.schemaValidation ?? isVLM,  // VLM supports schema
    handwrittenText: d.outputFormat?.features?.handwrittenText ?? true,  // Excellent handwriting support
    headerFooterExtraction: opts.extractHeader ?? opts.extractFooter ?? false,  // extract_header/extract_footer
    // Extended features
    embedOptimized: false,
    passwordProtected: false,
    contentFiltering: false,
    ocrMode: false,
    webhookCallback: false,  // Mistral is synchronous
    mediaResolution: false,
    changeTracking: false,
    hyperlinkExtraction: true,  // Response pages[].hyperlinks[] auto-extracted
    chartUnderstanding: false,  // Not available as separate feature in Mistral
    imageCaptions: false,  // Not available in Mistral
    signatureExtraction: false,  // Not available in Mistral
    commentExtraction: false,  // Not available in Mistral
    highlightExtraction: false,  // Not available in Mistral
    figureSummaries: false,  // Not available in Mistral
    outputFormats,
  };

  return {
    id: d.id ?? id,
    name: d.name ?? id,
    source: 'mistral',
    type: d.type ?? 'OCR',
    // 3-layer identity
    identity: {
      provider: 'mistral',
      model,
      method: 'native' as const,
    },
    capabilities: {
      supportsImages: d.capabilities?.supportsImages ?? true,
      supportsPDFs: d.capabilities?.supportsPDFs ?? true,
      supportsDocuments: d.capabilities?.supportsDocuments ?? true,  // Supports DOCX, PPTX, TXT, EPUB, RTF, ODT, etc. (NOT XLSX)
      supportsReasoning: false,  // OCR 3 doesn't do reasoning
      supportsStructuredOutput: d.capabilities?.supportsStructuredOutput ?? isVLM,
      // Extended capabilities
      supportsPrompts: false,
      supportsCitations: false,
      supportsChunking: false,
      supportsImageExtraction: opts.includeImageBase64 ?? false,
      supportsPageMarkers: false,
      supportsLanguageHints: false,
      supportsProcessingModes: false,
      supportsSegmentation: false,
      outputFormats,
    },
    features,
    // Mistral providers always need raw document input
    inputRequirements: {
      inputType: d.inputRequirements?.inputType ?? 'raw-document',
      acceptedMethods: d.inputRequirements?.acceptedMethods ?? ['base64', 'url'],
    },
    compatibleNodes: {
      parse: d.compatibleNodes?.parse ?? isOCR,
      extract: d.compatibleNodes?.extract ?? isVLM,
      categorize: d.compatibleNodes?.categorize ?? false,
      qualify: d.compatibleNodes?.qualify ?? false,
      split: d.compatibleNodes?.split ?? false,
    },
    inputFormats: {
      imageMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => m.startsWith('image/')),
      documentMimeTypes: (d.inputFormats?.mimeTypes ?? []).filter((m: string) => !m.startsWith('image/')),
      inputMethods: d.inputFormats?.inputMethods ?? ['base64', 'url'],
      maxFileSize: d.inputFormats?.maxFileSize ?? 50,  // 50MB limit
      maxPages: d.inputFormats?.maxPages ?? 1000,
    },
    pricing: {
      model: 'per-page',
      perPage: d.pricing?.perPage ?? 0.002,  // $2/1000 pages
      currency: 'USD',
      notes: d.pricing?.notes ?? '$2 per 1000 pages',
    },
    rateLimits: {
      docsPerMinute: d.apiConfig?.rateLimit?.docsPerMinute,
    },
    raw: d,
  };
}
