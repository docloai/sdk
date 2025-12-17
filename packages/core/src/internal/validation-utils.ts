/**
 * Browser-safe validation utilities
 *
 * This module contains all validation code with ZERO Node.js dependencies.
 * It can be safely bundled for browser environments.
 */

// Edge Runtime compatible - no AJV dependency

// Re-export all types and constants from the validation section of index.ts
// This file has NO fs imports and is completely browser-safe

/** Page-centric IR */
export type BBox = { x: number; y: number; w: number; h: number };
export type IRLine = {
  text: string;
  bbox?: BBox;
  startChar?: number;  // Character offset in full document text
  endChar?: number;    // Character offset in full document text
  lineId?: string;     // Unique line identifier (e.g., "p1_l5" for page 1, line 5)
};
export type IRPage = {
  pageNumber?: number;  // Explicit 1-indexed page number (for chunked documents)
  width: number;
  height: number;
  lines: IRLine[];
  markdown?: string;  // Rich markdown preserving layout (tables, headers, lists)
  html?: string;  // Rich HTML preserving layout (tables, headers, lists)
  extras?: Record<string, unknown>
};

/** Standard extras fields for DocumentIR */
export type DocumentIRExtras = {
  /** Total number of pages in the original document (for PDFs, DOCX, etc.) */
  pageCount?: number;
  /** Cost in USD for processing this document */
  costUSD?: number;
  /** Provider-specific raw response */
  raw?: unknown;
  /** For chunked documents: which chunk this is (0-indexed) */
  chunkIndex?: number;
  /** For chunked documents: total number of chunks */
  totalChunks?: number;
  /** For chunked documents: page range [startPage, endPage] (1-indexed, inclusive) */
  pageRange?: [number, number];
  /** For Unsiloed: total semantic chunks (not traditional pages) */
  totalSemanticChunks?: number;
  /** Allow arbitrary additional fields */
  [key: string]: unknown;
};

export type DocumentIR = {
  pages: IRPage[];
  extras?: DocumentIRExtras;
};

/** Provider identity for 3-layer hierarchy (provider/model/method) */
import type { ProviderIdentity } from '../provider-identity.js';

/** Provider capability contracts */
export type OCRProvider = {
  /** Full 3-layer identity (provider/model/method) */
  identity?: ProviderIdentity;
  /** Canonical name in "provider:model" format */
  name: string;
  parseToIR: (input: { url?: string; base64?: string }) => Promise<DocumentIR>;
};

/** Multimodal input for VLM providers */
export type MultimodalInput = {
  text?: string;
  images?: Array<{ url?: string; base64?: string; mimeType: string }>;
  pdfs?: Array<{ url?: string; base64?: string; fileId?: string }>;
};

/** Reasoning configuration (normalized across providers) */
export type ReasoningConfig = {
  /** Reasoning effort level: low (20% budget), medium (50%), high (80%) */
  effort?: 'low' | 'medium' | 'high';
  /** Exclude reasoning tokens from response (only use for accuracy, not visible) */
  exclude?: boolean;
  /** Enable reasoning with default (medium) effort */
  enabled?: boolean;
};

/** Base LLM provider (text-only) */
export type LLMProvider = {
  /** Full 3-layer identity (provider/model/method) */
  identity?: ProviderIdentity;
  /** Canonical name in "provider:model" format */
  name: string;
  completeJson: (input: { prompt: string; schema: object; max_tokens?: number; reasoning?: ReasoningConfig }) =>
    Promise<{ json: unknown; rawText?: string; costUSD?: number; inputTokens?: number; outputTokens?: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }>;
};

/** Vision-capable LLM provider */
export type VLMProvider = {
  /** Full 3-layer identity (provider/model/method) */
  identity?: ProviderIdentity;
  /** Canonical name in "provider:model" format */
  name: string;
  completeJson: (input: { prompt: string | MultimodalInput; schema: object; max_tokens?: number; reasoning?: ReasoningConfig }) =>
    Promise<{ json: unknown; rawText?: string; costUSD?: number; inputTokens?: number; outputTokens?: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }>;
  capabilities: {
    supportsImages: true;
    supportsPDFs: boolean;
    maxPDFPages?: number;
  };
};

/** Legacy alias for backward compatibility */
export type LLMJsonProvider = VLMProvider;

// ============================================================================
// Processing Options - Normalized types for provider-agnostic configuration
// ============================================================================

/**
 * Processing quality/speed tradeoff modes
 * Providers map their specific modes to these normalized values
 */
export type ProcessingMode = 'fast' | 'balanced' | 'high_accuracy';

/**
 * Page range specification for partial document processing
 * Allows processing a subset of pages for cost savings
 */
export type PageRangeOptions = {
  /** Process only the first N pages */
  maxPages?: number;
  /** Specific page range (0-indexed), e.g., "0,2-4,10" */
  pageRange?: string;
};

/**
 * Language hints for OCR processing
 */
export type LanguageOptions = {
  /** ISO language codes for OCR, e.g., ['en', 'de', 'fr'] */
  langs?: string[];
};

/**
 * Document segmentation result for splitting "stapled" PDFs
 * Returns page boundaries for each detected document type
 */
export type SegmentationResult = {
  segments: Array<{
    /** Document type name (e.g., 'invoice', 'contract') */
    name: string;
    /** Page indices (0-indexed) belonging to this segment */
    pages: number[];
    /** Confidence level of segmentation */
    confidence: 'high' | 'medium' | 'low';
  }>;
  metadata: {
    /** Total pages in the original document */
    totalPages: number;
    /** How segmentation was performed */
    segmentationMethod: 'auto' | 'schema' | 'manual';
  };
};

/**
 * Extracted image from a document
 * Represents figures, charts, or embedded images
 */
export type ExtractedImage = {
  /** Block ID or reference (provider-specific) */
  id: string;
  /** Page number where image appears (0-indexed) */
  pageNumber: number;
  /** Base64-encoded image data */
  base64: string;
  /** MIME type of the image */
  mimeType: string;
  /** Location on page (normalized 0-1 coordinates) */
  bbox?: NormalizedBBox;
  /** Caption text if detected */
  caption?: string;
};

/**
 * Extended OCR provider options (beyond basic parseToIR)
 * These options are normalized across different OCR providers
 */
export type OCRProviderOptions = PageRangeOptions & LanguageOptions & {
  /** Processing quality/speed tradeoff */
  mode?: ProcessingMode;
  /** Force OCR even on text-based PDFs */
  forceOCR?: boolean;
  /** Extract embedded images from document */
  extractImages?: boolean;
  /** Add page delimiters to output */
  paginate?: boolean;
  /** Remove and redo existing OCR */
  stripExistingOCR?: boolean;
};

/**
 * Extended VLM provider options for document extraction
 * These options are normalized across different VLM providers
 */
export type VLMProviderOptions = PageRangeOptions & LanguageOptions & {
  /** Processing quality/speed tradeoff */
  mode?: ProcessingMode;
  /** Force OCR even on text-based PDFs */
  forceOCR?: boolean;
  /** Additional prompt/instructions for extraction */
  prompt?: string;
  /** Schema for auto-segmentation of multi-document PDFs */
  segmentationSchema?: object;
};

/**
 * Provider citation from source document
 * Maps extracted fields to their source locations
 */
export type ProviderCitation = {
  /** JSON path to extracted field (e.g., "invoice.total") */
  fieldPath: string;
  /** Source block IDs from the provider */
  blockIds: string[];
  /** Confidence score (0-1) */
  confidence?: number;
};

/** Consensus configuration for any node */
export type ConsensusConfig = {
  runs: number;                                    // Number of times to run
  strategy?: 'majority' | 'unanimous';             // Default: majority
  onTie?: 'random' | 'fail' | 'retry';            // Default: random
  parallel?: boolean;                              // Run consensus in parallel (default: true)
  includeMetadata?: boolean;                       // Include detailed consensus metadata (default: false)
  level?: 'object' | 'field';                      // Voting level: object (default) or per-field
  retryOnFailure?: boolean;                        // Retry failed/empty runs (default: false)
  maxRetries?: number;                             // Max retries per run (default: 1)
};

/** Individual consensus run result */
export type ConsensusRunResult<T = any> = {
  runIndex: number;
  value: T | null;
  success: boolean;
  error?: string;
  startTime: number;
  endTime: number;
  duration: number;
  attempts?: number;                               // Number of attempts (1 = no retry, >1 = retried)
};

/** Field-level voting details */
export type FieldVotingDetails = {
  fieldPath: string;
  values: Array<{
    /** The actual value for this voting option - can be any JSON-serializable type */
    value: unknown;
    count: number;
    percentage: number;
    runIndices: number[];
  }>;
  /** The winning value from consensus - can be any JSON-serializable type */
  winner: unknown;
  isTie: boolean;
  agreementScore: number;  // 0.0 to 1.0
};

/** Consensus execution metadata */
export type ConsensusMetadata<T = unknown> = {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  strategy: 'majority' | 'unanimous';
  selectedResult: T;
  selectedRunIndex: number;
  confidence: 'high' | 'medium' | 'low';
  overallAgreement: number;  // 0.0 to 1.0
  fieldAgreement: Record<string, number>;  // Field path -> agreement score
  votingDetails: FieldVotingDetails[];
  runs: ConsensusRunResult<T>[];
  executionTime: number;
  wasRetry: boolean;
  tieBreakerUsed?: 'random' | 'retry' | 'fail' | null;
  // New fields for enhanced consensus features
  votingLevel?: 'object' | 'field';
  isSyntheticResult?: boolean;               // true if field-level voting composed a new object
  totalRetries?: number;                     // Total retry attempts across all runs
  emptyResultsFiltered?: number;             // Number of empty results filtered out
};

/** Output with consensus metadata wrapper */
export type OutputWithConsensus<T = unknown> = {
  data: T;
  consensus: ConsensusMetadata<T>;
};

/** Conditional type helper for consensus metadata */
export type MaybeWithConsensusMetadata<T, Config> = Config extends { includeMetadata: true }
  ? OutputWithConsensus<T>
  : T;

/** Flow input/output types */
export type FlowInput = {
  url?: string;
  base64?: string;
  pages?: number[];        // For post-split runs
  bounds?: BBox;           // For post-split runs
};

/**
 * All MIME types supported by at least one provider.
 * This is the union of all provider capabilities.
 */
export type SupportedMimeType =
  // PDF
  | 'application/pdf'
  // Images - common
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  // Images - additional
  | 'image/tiff'
  | 'image/bmp'
  | 'image/heic'
  | 'image/heif'
  | 'image/vnd.adobe.photoshop'  // PSD
  // Microsoft Office
  | 'application/msword'  // DOC
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'  // DOCX
  | 'application/vnd.ms-excel'  // XLS
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'  // XLSX
  | 'application/vnd.ms-powerpoint'  // PPT
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'  // PPTX
  // OpenDocument formats (Datalab)
  | 'application/vnd.oasis.opendocument.text'  // ODT
  | 'application/vnd.oasis.opendocument.spreadsheet'  // ODS
  | 'application/vnd.oasis.opendocument.presentation'  // ODP
  // Text formats
  | 'text/plain'  // TXT
  | 'text/csv'  // CSV
  | 'text/html'  // HTML
  | 'application/rtf'  // RTF
  // Other
  | 'application/epub+zip';  // EPUB

/**
 * Flow-level input validation configuration
 *
 * Allows specifying accepted MIME types for early validation
 * before flow execution begins.
 */
export type FlowInputValidation = {
  /**
   * List of accepted MIME types.
   * If specified, input must match one of these types or validation fails.
   * If empty/undefined, all supported types are accepted.
   */
  acceptedFormats?: SupportedMimeType[];
  /**
   * Whether to throw on validation failure.
   * @default true
   */
  throwOnInvalid?: boolean;
};

export type FlowResult<T = any> = {
  output: T;
  metrics: StepMetric[];
  aggregated: AggregatedMetrics;
  artifacts: Record<string, any>;
  error?: Error;
};

export type SplitDocument = {
  type: string;            // 'invoice', 'bunker', 'other'
  schema: object;          // Matched schema
  pages: number[];         // Page numbers
  bounds?: BBox;           // Bounding box
  input: FlowInput;        // Original input for re-processing
};

/** Citation and source tracking types */

/** Citation source type indicating data provenance */
export type CitationSourceType = 'ocr' | 'vlm' | 'llm' | 'inferred';

/** Normalized bounding box (0-1 coordinates relative to page dimensions) */
export type NormalizedBBox = {
  x: number;      // Left edge (0-1)
  y: number;      // Top edge (0-1)
  w: number;      // Width (0-1)
  h: number;      // Height (0-1)
};

/** Line-level citation reference with spatial information */
export type LineCitation = {
  pageNumber: number;           // 1-indexed page number
  lineIndex: number;            // 0-indexed line position on page
  bbox?: NormalizedBBox;        // Normalized bounding box (0-1 coordinates)
  text: string;                 // Text snippet for verification
  confidence?: number;          // 0-1 confidence score
  sourceType: CitationSourceType;
  startChar?: number;           // Character offset in full document
  endChar?: number;             // Character offset in full document
};

/** Field-level citation mapping extracted values to sources */
export type FieldCitation = {
  fieldPath: string;            // JSON path to field (e.g., "invoice.lineItems[0].amount")
  /** Extracted value - can be any JSON-serializable type */
  value: unknown;
  citations: LineCitation[];    // Source lines supporting this value
  reasoning?: string;           // LLM explanation for inferred values
  confidence?: number;          // Overall confidence (0-1)
};

/** Citation configuration for nodes */
export type CitationConfig = {
  enabled: boolean;             // Enable citation tracking (default: false)
  includeTextSnippets?: boolean; // Include text snippets in citations (default: true)
  includeBoundingBoxes?: boolean; // Include bboxes when available (default: true)
  includeConfidence?: boolean;   // Include confidence scores (default: true)
  minConfidence?: number;        // Minimum confidence threshold (0-1, default: 0.0)
  detectInferred?: boolean;      // Use LLM to detect inferred values (default: false)
};

/** Extended output with citations */
export type OutputWithCitations<T> = {
  data: T;                       // Extracted data
  citations: FieldCitation[];    // Field-level citations
  metadata: {
    totalPages?: number;         // Total pages processed
    sourceType: CitationSourceType; // Primary source type
    hasInferredValues?: boolean; // Whether any values were inferred
    processingTime?: number;     // Processing time in ms
  };
};

/** Node configuration types */
export type ParseNodeConfig = {
  provider: OCRProvider | VLMProvider;
  consensus?: ConsensusConfig;
  chunked?: {
    maxPagesPerChunk: number;
    overlap?: number;  // Default: 0
    parallel?: boolean;  // Default: true - process chunks in parallel for speed
  };
  format?: 'text' | 'markdown' | 'html';  // Output format: text (default, line-level citations), markdown/html (page-level citations, preserves structure)
  describeFigures?: boolean;  // When true, VLM providers describe charts/figures/diagrams in text. Default: false
  includeImages?: boolean;  // When true, providers extract images (figures/tables/charts) from documents. Supported by Surya/Marker. Default: false
  additionalPrompt?: string;  // Custom OCR guidance or instructions
  citations?: CitationConfig;  // Citation tracking config

  // NEW: Prompt asset support
  promptRef?: string;  // Reference to prompt asset (e.g., "default-parse@1.0.0")
  /**
   * Optional custom variables for prompt rendering (e.g., language, strictMode, tenantId).
   *
   * Auto-injected variables (no need to pass manually):
   * - format: From config.format
   * - schema: Constructed schema (if applicable)
   * - describeFigures: From config.describeFigures
   * - citationsEnabled: From config.citations?.enabled
   *
   * Use promptVariables only for runtime context (localization, multi-tenancy, behavioral flags).
   */
  promptVariables?: Record<string, any>;

  /**
   * Additional instructions to append to the default prompt.
   * This provides a simple way to customize the prompt without creating a custom prompt asset.
   * The instructions will be added after the main prompt content.
   *
   * @example
   * ```typescript
   * parse({
   *   provider: vlmProvider,
   *   format: 'markdown',
   *   additionalInstructions: "Pay special attention to preserving table structures and footnotes."
   * })
   * ```
   */
  additionalInstructions?: string;

  /**
   * When using promptRef, automatically inject format instruction if {{format}} placeholder is not present.
   * This ensures the UI format selection always takes effect.
   * Default: true
   *
   * @example
   * ```typescript
   * parse({
   *   provider: vlmProvider,
   *   format: 'markdown',
   *   promptRef: 'my-custom-prompt',
   *   autoInjectFormat: false  // Disable auto-injection
   * })
   * ```
   */
  autoInjectFormat?: boolean;

  /**
   * Enable extended reasoning/thinking for VLM providers that support it.
   * Only applies when using a VLM provider (not OCR).
   *
   * @example
   * ```typescript
   * parse({
   *   provider: vlmProvider,
   *   format: 'markdown',
   *   reasoning: { enabled: true, effort: 'medium' }
   * })
   * ```
   */
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    exclude?: boolean;
    enabled?: boolean;
  };

  /**
   * Maximum tokens for the LLM response.
   * If not specified, the provider's default will be used (typically 4096).
   */
  maxTokens?: number;
};

export type SplitNodeConfig = {
  provider: VLMProvider;
  schemas: Record<string, object>;  // { invoice: Schema, bunker: Schema }
  includeOther?: boolean;           // Default: true
  consensus?: ConsensusConfig;
  schemaRef?: string;               // Reference to schema asset (e.g., "document-split@2.0.0")

  /**
   * Enable extended reasoning/thinking for providers that support it.
   *
   * @example
   * ```typescript
   * split({
   *   provider: vlmProvider,
   *   schemas: { invoice: invoiceSchema, receipt: receiptSchema },
   *   reasoning: { enabled: true, effort: 'high' }
   * })
   * ```
   */
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    exclude?: boolean;
    enabled?: boolean;
  };

  /**
   * Maximum tokens for the LLM response.
   * If not specified, the provider's default will be used (typically 4096).
   */
  maxTokens?: number;
};

export type CategorizeNodeConfig = {
  provider: LLMProvider | VLMProvider;
  categories: (string | { name: string; description?: string })[];
  consensus?: ConsensusConfig;
  additionalPrompt?: string;        // Custom categorization instructions

  // NEW: Prompt asset support
  promptRef?: string;  // Reference to prompt asset (e.g., "default-categorize@1.0.0")
  /**
   * Optional custom variables for prompt rendering (e.g., language, strictMode, tenantId).
   *
   * Auto-injected variables (no need to pass manually):
   * - categories: From config.categories
   * - documentText: Computed from DocumentIR input
   *
   * Use promptVariables only for runtime context (localization, multi-tenancy, behavioral flags).
   */
  promptVariables?: Record<string, any>;

  /**
   * Additional instructions to append to the default prompt.
   * This provides a simple way to customize the prompt without creating a custom prompt asset.
   * The instructions will be added after the main prompt content.
   *
   * @example
   * ```typescript
   * categorize({
   *   provider: llmProvider,
   *   categories: ['invoice', 'receipt', 'contract'],
   *   additionalInstructions: "Consider the document's header and footer when categorizing."
   * })
   * ```
   */
  additionalInstructions?: string;

  /**
   * Enable extended reasoning/thinking for providers that support it.
   *
   * @example
   * ```typescript
   * categorize({
   *   provider: vlmProvider,
   *   categories: ['invoice', 'receipt', 'contract'],
   *   reasoning: { enabled: true, effort: 'low' }
   * })
   * ```
   */
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    exclude?: boolean;
    enabled?: boolean;
  };

  /**
   * Maximum tokens for the LLM response.
   * If not specified, the provider's default will be used (typically 4096).
   */
  maxTokens?: number;
};

/**
 * Controls what inputs the extract node ingests.
 * - 'auto': Automatically detect input type and route appropriately (default)
 * - 'ir': Only DocumentIR from previous step (text-only extraction)
 * - 'ir+source': Both DocumentIR AND source document (multimodal with parsed text)
 * - 'source': Only raw source document (direct VLM extraction, no parsed text)
 *
 * Auto mode logic:
 * - If DocumentIR available AND source available AND VLM provider -> 'ir+source'
 * - If only DocumentIR available -> 'ir'
 * - If only FlowInput available AND VLM provider -> 'source'
 */
export type ExtractInputMode = 'auto' | 'ir' | 'ir+source' | 'source';

export type ExtractNodeConfig<T = any> = {
  provider: LLMProvider | VLMProvider;
  schema: object | EnhancedExtractionSchema<T> | { ref: string };  // Accept plain, enhanced, or reference
  consensus?: ConsensusConfig;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    exclude?: boolean;
    enabled?: boolean;
  };
  additionalPrompt?: string;        // Custom extraction instructions (appended after schema)
  citations?: CitationConfig;       // Citation tracking config

  // NEW: Prompt asset support
  promptRef?: string;  // Reference to prompt asset (e.g., "default-extraction@1.0.0")
  /**
   * Optional custom variables for prompt rendering (e.g., language, strictMode, tenantId).
   *
   * Auto-injected variables (no need to pass manually):
   * - schema: From config.schema
   * - documentText: Computed from DocumentIR or FlowInput
   * - schemaTitle: From schema.title or default "the provided schema"
   * - schemaDescription: From schema.description or empty string
   * - structuredFormat: Generated formatting instructions (for markdown/html)
   *
   * Use promptVariables only for runtime context (localization, multi-tenancy, behavioral flags).
   */
  promptVariables?: Record<string, any>;

  /**
   * Additional instructions to append to the default prompt.
   * This provides a simple way to customize the prompt without creating a custom prompt asset.
   * The instructions will be added after the main prompt content.
   *
   * @example
   * ```typescript
   * extract({
   *   provider: llmProvider,
   *   schema: mySchema,
   *   additionalInstructions: "Be strict with date formats. Use YYYY-MM-DD format only."
   * })
   * ```
   */
  additionalInstructions?: string;

  /**
   * Controls what inputs the extract node ingests.
   * - 'auto': Automatically detect input type and route appropriately (default)
   * - 'ir': Only DocumentIR from previous step (text-only extraction)
   * - 'ir+source': Both DocumentIR AND source document (multimodal with parsed text)
   * - 'source': Only raw source document (direct VLM extraction, no parsed text)
   * @default 'auto'
   */
  inputMode?: ExtractInputMode;

  /**
   * In split/forEach contexts, use the original unsplit document instead of the segment.
   * Only applies when inputMode includes source ('ir+source' or 'source').
   * @default false (uses split segment source)
   */
  useOriginalSource?: boolean;

  /**
   * When auto mode has both IR and source available with VLM provider:
   * - true: use 'ir+source' for maximum context (hybrid multimodal)
   * - false: use 'ir' for text-only extraction (lower cost)
   * Only applies when inputMode='auto'.
   * @default true
   */
  preferVisual?: boolean;

  /**
   * Maximum tokens for the LLM response.
   * If not specified, the provider's default will be used (typically 4096).
   */
  maxTokens?: number;
};

/** Chunk output structure */
export type ChunkMetadata = {
  // Core content
  content: string;
  id: string;  // Unique chunk identifier

  // Position metadata
  index: number;  // Chunk position in sequence
  startChar: number;
  endChar: number;

  // Document context
  pageNumbers: number[];  // Pages this chunk spans
  section?: string;       // Section/chapter title
  headers?: string[];     // Hierarchy of headers above this chunk

  // Chunking metadata
  strategy: string;       // Which strategy created this chunk
  tokenCount?: number;    // For LLM context planning
  wordCount: number;
  charCount: number;
};

export type ChunkOutput = {
  chunks: ChunkMetadata[];
  totalChunks: number;
  averageChunkSize: number;
  sourceMetadata?: {
    providerType?: string;  // 'ocr' | 'vlm' - original provider type
  };
  sourceDocument?: DocumentIR;  // Original DocumentIR for citation mapping
};

export type ChunkNodeConfig = {
  strategy: 'recursive' | 'section' | 'page' | 'fixed';
  maxSize?: number;        // Max characters per chunk (recursive, section)
  minSize?: number;        // Min characters per chunk (default: 100)
  overlap?: number;        // Character overlap between chunks (default: 0)
  separators?: string[];   // Hierarchical separators (recursive)
  pagesPerChunk?: number;  // Pages per chunk (page strategy)
  combineShortPages?: boolean;  // Combine short pages (page strategy)
  minPageContent?: number; // Min content length to keep page (page strategy)
  size?: number;           // Fixed size for fixed strategy
  unit?: 'tokens' | 'characters';  // Unit for fixed strategy
};

export type CombineNodeConfig = {
  strategy: 'merge' | 'concatenate' | 'first' | 'last';
};

export type OutputNodeConfig = {
  source?: string | string[];
  transform?: 'first' | 'last' | 'merge' | 'pick' | 'custom';
  fields?: string[];
  name?: string;
  /**
   * Custom transform function for 'custom' transform mode.
   * @param inputs - The input value(s) from the source step(s)
   * @param artifacts - All artifacts from the flow execution
   * @returns The transformed output value
   */
  customTransform?: (inputs: unknown | unknown[], artifacts: Record<string, unknown>) => unknown;
};

/** Enhanced extraction schema with examples and guidance */
export type EnhancedExtractionSchema<T = unknown> = {
  // Core schema (JSON Schema or Zod schema)
  schema: object;

  // Optional extraction enhancements
  examples?: Array<{
    description: string;  // Description of this example
    input: string;        // Sample input text
    output: T;            // Expected output matching schema
  }>;

  extractionRules?: string;  // Extraction guidelines (e.g., "Focus on tables in appendix")
  contextPrompt?: string;    // Document context (e.g., "This is a legal document")
  hints?: string[];          // Additional hints for the extractor
};

/** Node & runner */
export type StepMetric = {
  step: string;
  configStepId?: string;  // Flow-level step ID for config lookups (schemaRef, promptRef)
  startMs: number;  // Absolute timestamp when step started (Date.now())
  provider?: string;
  model?: string;
  ms: number;  // Total duration; for wrappers with rollup=true, includes child work
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  attemptNumber?: number;  // Retry attempt number (1 = first attempt, 2+ = retries)
  metadata?: {
    kind?: 'leaf' | 'wrapper' | 'prep';  // 'leaf' = actual LLM call, 'wrapper' = composite overhead, 'prep' = preparation step
    rollup?: boolean;  // True if ms includes child work (for wrappers with children)
    overheadMs?: number;  // Pure overhead time excluding child work (for wrappers with children)
    /** Additional metadata fields */
    [key: string]: string | number | boolean | undefined;
  };
};

/** Aggregated metrics for multi-step flows */
export interface AggregatedMetrics {
  totalDurationMs: number;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  stepCount: number;
  byProvider: Record<string, {
    costUSD: number;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
  }>;
}

/**
 * Aggregate metrics from multiple steps
 * @param metrics - Array of step metrics
 * @returns Aggregated totals and per-provider breakdowns
 */
export function aggregateMetrics(metrics: StepMetric[]): AggregatedMetrics {
  const byProvider: Record<string, {
    costUSD: number;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
  }> = {};

  const result = metrics.reduce((acc, m) => {
    acc.totalDurationMs += m.ms;
    acc.totalCostUSD += m.costUSD || 0;
    acc.totalInputTokens += m.inputTokens || 0;
    acc.totalOutputTokens += m.outputTokens || 0;
    acc.totalCacheCreationTokens += m.cacheCreationInputTokens || 0;
    acc.totalCacheReadTokens += m.cacheReadInputTokens || 0;

    // Group by provider
    if (m.provider) {
      if (!byProvider[m.provider]) {
        byProvider[m.provider] = { costUSD: 0, inputTokens: 0, outputTokens: 0, callCount: 0 };
      }
      byProvider[m.provider].costUSD += m.costUSD || 0;
      byProvider[m.provider].inputTokens += m.inputTokens || 0;
      byProvider[m.provider].outputTokens += m.outputTokens || 0;
      byProvider[m.provider].callCount += 1;
    }

    return acc;
  }, {
    totalDurationMs: 0,
    totalCostUSD: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    stepCount: metrics.length,
    byProvider
  });

  return result;
}

/**
 * Execution context passed to conditional functions and trigger nodes
 * Provides access to artifacts and metrics from all previous steps
 */
export interface FlowContext {
  /** Outputs from all completed steps, indexed by step ID */
  artifacts: Record<string, any>;
  /** Performance metrics from all completed steps */
  metrics: StepMetric[];
  /** Call stack for tracking nested flow execution (for circular dependency detection) */
  callStack?: string[];
  /** Maximum nesting depth for flow triggers (default: 10) */
  maxDepth?: number;
}

/**
 * W3C Trace Context for distributed tracing.
 * Compatible with observability module's TraceContext.
 */
export interface TraceContextLite {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: number;  // W3C trace flags (0x01 = sampled), required for compatibility
  traceState?: string;
}

/**
 * Observability context passed to node executions.
 * Uses 'any' for config and traceContext to avoid circular imports and
 * maintain compatibility with the full observability types.
 */
export type NodeObservabilityContext = {
  /** Observability configuration - full type in observability module */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
  flowId?: string;
  executionId?: string;
  stepId?: string;
  stepIndex?: number;
  /** W3C Trace Context - compatible with TraceContext from observability module */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceContext?: any;
  metadata?: Record<string, unknown>;
};

export type NodeCtx = {
  stepId?: string;  // Flow-level step ID for metrics tracking
  artifacts: Record<string, unknown>;
  emit: (key: string, value: unknown) => void;
  metrics: { push: (m: StepMetric) => void };
  /** Observability context for hooks (optional) */
  observability?: NodeObservabilityContext;
};

/** Node type metadata for runtime validation */
export type NodeTypeInfo = {
  /** Input types this node accepts (e.g., ['FlowInput', 'DocumentIR']) */
  inputTypes: string[];
  /**
   * Output type this node produces - can be string or function for config-dependent types.
   * When a function, it receives the node's specific config and returns the output type string.
   * Uses 'any' parameter to allow nodes to use their specific config types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputType: string | ((config: any) => string);
  /** Provider types this node requires (if any) */
  requiresProvider?: ('OCR' | 'VLM' | 'LLM')[];
  /** Whether this node can accept array input */
  acceptsArray?: boolean;
  /**
   * Whether this node always outputs an array (or function for config-dependent).
   * Uses 'any' parameter to allow nodes to use their specific config types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputsArray?: boolean | ((config: any) => boolean);
  /** Human-readable description of what this node does */
  description?: string;
};

export type NodeDef<I, O> = {
  key: string;
  run: (input: I, ctx: NodeCtx) => Promise<O>;
  /** Optional type metadata for validation */
  __meta?: NodeTypeInfo;
};

export const node = <I, O>(key: string, run: NodeDef<I, O>["run"]): NodeDef<I, O> => ({ key, run });

export async function runPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: NodeDef<any, any>[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  observabilityContext?: NodeObservabilityContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flowArtifacts?: Record<string, any>
) {
  // Merge flow artifacts with local (flow artifacts as read-only base for source access)
  const artifacts: Record<string, unknown> = flowArtifacts ? { ...flowArtifacts } : {};
  const metrics: StepMetric[] = [];
  const ctx: NodeCtx = {
    stepId: observabilityContext?.stepId,
    artifacts,
    emit: (k, v) => { artifacts[k] = v; },
    metrics: { push: (m) => metrics.push(m) },
    observability: observabilityContext
  };
  let acc = input;
  for (const s of steps) {
    acc = await s.run(acc, ctx);
    ctx.emit(s.key, acc);
  }
  return { output: acc, artifacts, metrics };
}

/**
 * Flow execution error with step context
 *
 * Thrown when a flow step fails during execution. Includes:
 * - Which step failed (ID, index, type)
 * - Which steps completed successfully
 * - Partial artifacts from completed steps (for debugging)
 * - The original error that caused the failure
 *
 * This makes debugging flow failures much easier by showing exactly where the error occurred
 * and what data was produced before the failure.
 *
 * @example
 * ```typescript
 * try {
 *   await flow.run(input);
 * } catch (error) {
 *   if (error instanceof FlowExecutionError) {
 *     console.error(`Failed at step ${error.failedStepIndex}: ${error.failedStepType}`);
 *     console.error(`Step ID: ${error.failedStep}`);
 *     console.error(`Completed: ${error.completedSteps.join(', ')}`);
 *     console.error(`Original error: ${error.originalError.message}`);
 *
 *     // Access partial results from completed steps
 *     if (error.partialArtifacts?.qualify) {
 *       console.log('Quality assessment completed:', error.partialArtifacts.qualify);
 *     }
 *   }
 * }
 * ```
 */

/**
 * Extracts a human-readable error message from potentially JSON error responses.
 *
 * Handles common API error formats:
 * - { "detail": "..." } (Surya-style)
 * - { "error": { "message": "..." } } (OpenAI, Anthropic)
 * - { "error": "..." } (Simple format)
 * - { "message": "..." } (Direct format)
 * - Plain text (returned as-is)
 *
 * @param errorText - The error text which may contain JSON
 * @returns A human-readable error message
 */
export function extractErrorMessage(errorText: string): string {
  // If it's short or doesn't look like JSON, return as-is
  if (errorText.length < 10 || !errorText.trim().startsWith('{')) {
    return errorText;
  }

  try {
    const parsed = JSON.parse(errorText);

    // Surya-style: { "detail": "..." }
    if (parsed.detail) {
      return parsed.detail;
    }

    // OpenAI/Anthropic style: { error: { message: "..." } }
    if (parsed.error?.message) {
      return parsed.error.message;
    }

    // Simple style: { error: "..." }
    if (typeof parsed.error === 'string') {
      return parsed.error;
    }

    // Direct style: { message: "..." }
    if (parsed.message) {
      return parsed.message;
    }

    // Google style: { error: { status: "...", message: "..." } }
    if (parsed.error?.status && parsed.error?.message) {
      return `${parsed.error.status}: ${parsed.error.message}`;
    }

    // Fallback: return original but truncated if very long
    return errorText.length > 200
      ? errorText.substring(0, 200) + '...'
      : errorText;
  } catch {
    // Not valid JSON, return as-is (truncated if needed)
    return errorText.length > 500
      ? errorText.substring(0, 500) + '...'
      : errorText;
  }
}

/**
 * Represents a step location in a flow hierarchy.
 * Used to track the execution path through nested flows.
 */
export interface FlowStepLocation {
  /** Step ID */
  stepId: string;
  /** Step index within this flow (0-based) */
  stepIndex: number;
  /** Step type (e.g., 'parse', 'conditional', 'forEach') */
  stepType: string;
  /** Branch name if within a conditional (e.g., "Invoice", "Receipt") */
  branch?: string;
  /** Item index if within a forEach iteration */
  itemIndex?: number;
}

export class FlowExecutionError extends Error {
  constructor(
    message: string,
    /** The ID of the step that failed (e.g., 'parse_node123') */
    public readonly failedStep: string,
    /** The index of the failed step in the flow (0-based) */
    public readonly failedStepIndex: number,
    /** The type of the failed step (e.g., 'parse', 'extract', 'step', 'conditional', 'forEach') */
    public readonly failedStepType: string,
    /** Array of step IDs that completed successfully before the failure */
    public readonly completedSteps: string[],
    /** The original error that caused the failure */
    public readonly originalError: Error,
    /** Partial artifacts from steps that completed before the failure */
    public readonly partialArtifacts?: Record<string, any>,
    /** Execution path through nested flows (for hierarchical context) */
    public readonly flowPath?: FlowStepLocation[],
    /** All completed steps aggregated across flow boundaries */
    public readonly allCompletedSteps?: string[]
  ) {
    super(message);
    this.name = 'FlowExecutionError';

    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlowExecutionError);
    }
  }

  /**
   * Returns a formatted string showing the execution path.
   * Example: "parse → conditional:Invoice → extract"
   */
  getFormattedPath(): string {
    if (!this.flowPath || this.flowPath.length === 0) {
      return this.failedStep;
    }

    return this.flowPath.map(loc => {
      let label = loc.stepId;
      if (loc.branch) {
        label += `:${loc.branch}`;
      }
      if (loc.itemIndex !== undefined) {
        label += `[${loc.itemIndex}]`;
      }
      return label;
    }).join(' → ');
  }

  /**
   * Returns the root cause error (innermost originalError).
   * Useful when errors are nested multiple levels deep.
   */
  getRootCause(): Error {
    let cause: Error = this.originalError;
    while (cause instanceof FlowExecutionError && cause.originalError) {
      cause = cause.originalError;
    }
    return cause;
  }
}

/**
 * Flow validation error for invalid node connections
 *
 * Thrown when building a flow with incompatible node connections.
 * Provides helpful error messages and suggestions for fixing the issue.
 *
 * @example
 * ```typescript
 * try {
 *   const flow = createFlow()
 *     .step('parse', parse({ provider: ocrProvider }))
 *     .step('combine', combine())  // Invalid: combine needs array input
 *     .build();
 * } catch (error) {
 *   if (error instanceof FlowValidationError) {
 *     console.error(error.message);
 *     console.error('Reason:', error.reason);
 *     console.log('Suggestions:', error.suggestions?.join('\n'));
 *   }
 * }
 * ```
 */
export class FlowValidationError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
    public readonly suggestions?: string[],
    public readonly sourceNode?: string,
    public readonly targetNode?: string,
    public readonly sourceOutputType?: string,
    public readonly targetInputTypes?: string[]
  ) {
    super(message);
    this.name = 'FlowValidationError';

    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlowValidationError);
    }
  }
}

/** Node type names for validation */
export type NodeTypeName = 'parse' | 'split' | 'categorize' | 'extract' | 'chunk' | 'combine' | 'trigger' | 'output';

/** Compatibility rule for node connections */
export type CompatibilityRule = {
  valid: boolean;
  requiresForEach?: boolean;
  /** Indicates this connection cannot be fully validated at build-time and requires runtime type checking */
  requiresRuntimeValidation?: boolean;
  reason?: string;
  note?: string;
};

/**
 * Node Compatibility Matrix
 *
 * Defines which nodes can connect to which other nodes.
 * This is the single source of truth for node connection validation.
 *
 * Rules based on input/output type compatibility:
 * - parse: FlowInput → DocumentIR (or DocumentIR[] if chunked)
 * - split: FlowInput → SplitDocument[] (requires forEach)
 * - categorize: DocumentIR|FlowInput → {input, category}
 * - extract: DocumentIR|FlowInput|ChunkOutput → T (typed JSON)
 * - chunk: DocumentIR|DocumentIR[] → ChunkOutput
 * - combine: T[] → T|T[] (merges forEach results)
 * - trigger: any → TOutput (depends on child flow)
 *
 * Special behaviors:
 * - forEach auto-unwraps SplitDocument.input → FlowInput
 * - Conditional auto-unwraps {input, category} → input
 * - parse with chunked:true outputs DocumentIR[] instead of DocumentIR
 */
export const NODE_COMPATIBILITY_MATRIX: Record<NodeTypeName, Record<NodeTypeName, CompatibilityRule>> = {
  parse: {
    parse: {
      valid: false,
      reason: 'Cannot chain parse nodes. Parse is typically the starting node.'
    },
    split: {
      valid: false,
      reason: 'Split requires FlowInput, but parse outputs DocumentIR. Use split directly on input instead.',
      note: 'If you need to re-split after parsing, use trigger to invoke a child flow with FlowInput.'
    },
    categorize: {
      valid: true,
      note: 'categorize accepts DocumentIR and wraps it with {input, category}'
    },
    extract: {
      valid: true,
      note: 'extract accepts DocumentIR and produces typed JSON'
    },
    chunk: {
      valid: true,
      note: 'chunk accepts DocumentIR and produces ChunkOutput for RAG'
    },
    combine: {
      valid: false,
      reason: 'Parse outputs DocumentIR (single document), not an array. Combine requires array input from forEach.',
      note: 'Use parse with chunked:true to output DocumentIR[], then use combine.'
    },
    trigger: {
      valid: true,
      note: 'trigger accepts any input type'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  split: {
    parse: {
      valid: true,
      requiresForEach: true,
      reason: 'Split outputs SplitDocument[] which requires forEach. forEach auto-unwraps SplitDocument.input → FlowInput for parse.',
      note: 'Enable forEach on split node before connecting to parse.'
    },
    split: {
      valid: false,
      reason: 'Cannot nest split operations. Split nodes cannot appear in forEach itemFlow.'
    },
    categorize: {
      valid: true,
      requiresForEach: true,
      reason: 'Split outputs SplitDocument[] which requires forEach. forEach auto-unwraps SplitDocument.input for categorize.'
    },
    extract: {
      valid: true,
      requiresForEach: true,
      reason: 'Split outputs SplitDocument[] which requires forEach. forEach auto-unwraps SplitDocument.input for extract.'
    },
    chunk: {
      valid: false,
      reason: 'SplitDocument output is incompatible with Chunk input. Chunk expects DocumentIR or DocumentIR[].',
      note: 'Use parse in forEach after split to convert SplitDocument → DocumentIR, then chunk.'
    },
    combine: {
      valid: false,
      reason: 'Combine should appear AFTER forEach completes, not as a forEach itemFlow step.',
      note: 'Place combine after the forEach block to merge results.'
    },
    trigger: {
      valid: true,
      requiresForEach: true,
      reason: 'Split outputs SplitDocument[] which requires forEach for processing.',
      note: 'forEach auto-unwraps SplitDocument.input for child flow.'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  categorize: {
    parse: {
      valid: true,
      note: 'categorize outputs {input, category}. Conditional can unwrap this or use directly.'
    },
    split: {
      valid: false,
      reason: 'Split requires FlowInput, but categorize outputs {input, category}.',
      note: 'Use conditional to unwrap and pass input field to split.'
    },
    categorize: {
      valid: true,
      note: 'Can chain categorize nodes for multi-level classification.'
    },
    extract: {
      valid: true,
      note: 'extract can process the categorized document.'
    },
    chunk: {
      valid: false,
      reason: 'Categorize wraps input as {input, category}. Chunk needs unwrapped DocumentIR.',
      note: 'Use conditional to unwrap input field before chunk.'
    },
    combine: {
      valid: false,
      reason: 'Categorize outputs single result {input, category}, not an array. Combine requires array input.'
    },
    trigger: {
      valid: true,
      note: 'trigger accepts any input type, including {input, category}'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  extract: {
    parse: {
      valid: false,
      reason: 'Extract outputs typed JSON (terminal node). Cannot pipe JSON to parse.',
      note: 'Extract should be one of the last steps in a flow. Use combine if extracting in parallel.'
    },
    split: {
      valid: false,
      reason: 'Extract outputs typed JSON (terminal node). Cannot pipe JSON to split.'
    },
    categorize: {
      valid: false,
      reason: 'Extract outputs typed JSON (terminal node). Cannot pipe JSON to categorize.'
    },
    extract: {
      valid: false,
      reason: 'Extract outputs typed JSON (terminal node). Cannot chain extractions on JSON output.',
      note: 'If you need multi-step extraction, extract from DocumentIR/ChunkOutput in parallel, then combine.'
    },
    chunk: {
      valid: false,
      reason: 'Extract outputs typed JSON, not DocumentIR. Chunk expects DocumentIR input.'
    },
    combine: {
      valid: true,
      note: 'Use combine to merge parallel extraction results from forEach.'
    },
    trigger: {
      valid: true,
      note: 'trigger accepts any input type, including extracted JSON'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  chunk: {
    parse: {
      valid: false,
      reason: 'Chunk outputs ChunkOutput (specialized type), not FlowInput. Parse expects FlowInput as input.'
    },
    split: {
      valid: false,
      reason: 'Chunk outputs ChunkOutput, incompatible with Split input (FlowInput).'
    },
    categorize: {
      valid: false,
      reason: 'Chunk outputs ChunkOutput, incompatible with Categorize input (DocumentIR|FlowInput).',
      note: 'Categorize before chunking, not after.'
    },
    extract: {
      valid: true,
      note: 'extract has special handling for ChunkOutput - extracts data from chunks.'
    },
    chunk: {
      valid: false,
      reason: 'Cannot chain chunk operations. Chunk only once per document.',
      note: 'Different chunking strategies should be applied to the original DocumentIR, not to chunks.'
    },
    combine: {
      valid: false,
      reason: 'Chunk outputs ChunkOutput (specialized type), not an array type. Combine expects T[].',
      note: 'Use chunk on individual documents in forEach, then extract, then combine extractions.'
    },
    trigger: {
      valid: true,
      note: 'trigger accepts any input type, including ChunkOutput'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  combine: {
    parse: {
      valid: true,
      note: 'After combining, result can be re-parsed if needed.'
    },
    split: {
      valid: false,
      reason: 'Combine output depends on strategy. Split requires FlowInput.',
      note: 'Most combine strategies output merged objects/arrays, not FlowInput.'
    },
    categorize: {
      valid: true,
      note: 'Can categorize combined results.'
    },
    extract: {
      valid: true,
      note: 'Can extract from combined results.'
    },
    chunk: {
      valid: true,
      note: 'Can chunk combined DocumentIR. Only valid if combine output is DocumentIR or DocumentIR[].'
    },
    combine: {
      valid: false,
      reason: 'Cannot chain combine nodes. Combine once per forEach operation.'
    },
    trigger: {
      valid: true,
      note: 'trigger accepts any input type'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  trigger: {
    parse: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Valid only if child flow returns FlowInput. Type safety cannot be guaranteed at build-time.'
    },
    split: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Valid only if child flow returns FlowInput. Type safety cannot be guaranteed at build-time.'
    },
    categorize: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Valid only if child flow returns DocumentIR or FlowInput. Type safety cannot be guaranteed at build-time.'
    },
    extract: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Valid only if child flow returns DocumentIR, FlowInput, or ChunkOutput. Type safety cannot be guaranteed at build-time.'
    },
    chunk: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Valid only if child flow returns DocumentIR or DocumentIR[]. Type safety cannot be guaranteed at build-time.'
    },
    combine: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Valid only if child flow returns an array (T[]). Type safety cannot be guaranteed at build-time.'
    },
    trigger: {
      valid: true,
      requiresRuntimeValidation: true,
      note: 'Can nest trigger nodes (with circular dependency detection and max depth limits). Output type depends on nested child flow.'
    },
    output: {
      valid: true,
      note: 'output node can follow any node to select or transform results'
    }
  },
  output: {
    parse: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    split: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    categorize: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    extract: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    chunk: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    combine: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    trigger: {
      valid: false,
      reason: 'Output is a terminal node that selects/transforms results. Cannot chain to other nodes.'
    },
    output: {
      valid: true,
      note: 'Multiple output nodes are allowed to create multiple named outputs from a flow.'
    }
  }
};

/**
 * Get node type name from a NodeDef
 * @param node - Node definition
 * @returns Node type name (e.g., 'parse', 'extract')
 */
export function getNodeTypeName(node: NodeDef<any, any>): NodeTypeName | null {
  if (!node || !node.key) return null;
  const key = node.key;

  // Check if it's a known node type
  const knownTypes: NodeTypeName[] = ['parse', 'split', 'categorize', 'extract', 'chunk', 'combine', 'trigger', 'output'];
  return knownTypes.includes(key as NodeTypeName) ? (key as NodeTypeName) : null;
}

/**
 * Get type information from a node
 * @param node - Node definition
 * @returns NodeTypeInfo if available
 */
export function getNodeTypeInfo(node: NodeDef<any, any>): NodeTypeInfo | null {
  return node.__meta || null;
}

/**
 * Get compatible target nodes for a given source node
 * @param sourceType - Source node type name
 * @param includeForEach - Include connections that require forEach
 * @returns Array of compatible target node types
 */
export function getCompatibleTargets(sourceType: NodeTypeName, includeForEach: boolean = false): NodeTypeName[] {
  const rules = NODE_COMPATIBILITY_MATRIX[sourceType];
  if (!rules) return [];

  return Object.entries(rules)
    .filter(([_, rule]) => {
      if (!rule.valid) return false;
      if (rule.requiresForEach && !includeForEach) return false;
      return true;
    })
    .map(([targetType, _]) => targetType as NodeTypeName);
}

/**
 * Get suggested connections when a connection is invalid
 * @param sourceType - Source node type name
 * @returns Array of suggestion strings
 */
export function getSuggestedConnections(sourceType: NodeTypeName): string[] {
  const compatibleTargets = getCompatibleTargets(sourceType, false);
  const forEachTargets = getCompatibleTargets(sourceType, true).filter(
    t => !compatibleTargets.includes(t)
  );

  if (compatibleTargets.length === 0 && forEachTargets.length === 0) {
    return [`${sourceType} has no standard outgoing connections (terminal node).`];
  }

  const suggestions: string[] = [];

  if (compatibleTargets.length > 0) {
    suggestions.push(`${sourceType} can connect to:`);
    compatibleTargets.forEach(target => {
      const rule = NODE_COMPATIBILITY_MATRIX[sourceType][target];
      suggestions.push(`  • ${target}${rule.note ? ` - ${rule.note}` : ''}`);
    });
  }

  if (forEachTargets.length > 0) {
    suggestions.push(`${sourceType} can connect to (with forEach enabled):`);
    forEachTargets.forEach(target => {
      const rule = NODE_COMPATIBILITY_MATRIX[sourceType][target];
      suggestions.push(`  • ${target}${rule.note ? ` - ${rule.note}` : ''}`);
    });
  }

  return suggestions;
}

/**
 * Validation result for node connections
 */
export type ValidationResult = {
  valid: boolean;
  reason?: string;
  suggestions?: string[];
  requiresForEach?: boolean;
  /** Warning message for connections that are valid but require runtime type checking */
  warning?: string;
};

/**
 * Validate if two node types can be connected
 * @param sourceType - Source node type name
 * @param targetType - Target node type name
 * @param forEachEnabled - Whether forEach is enabled on the source node
 * @returns Validation result with reason and suggestions
 */
export function validateNodeConnection(
  sourceType: NodeTypeName,
  targetType: NodeTypeName,
  forEachEnabled: boolean = false
): ValidationResult {
  const rule = NODE_COMPATIBILITY_MATRIX[sourceType]?.[targetType];

  if (!rule) {
    return {
      valid: false,
      reason: `Unknown node type combination: ${sourceType} → ${targetType}`,
      suggestions: ['Ensure both nodes are valid node types.']
    };
  }

  if (!rule.valid) {
    return {
      valid: false,
      reason: rule.reason,
      suggestions: getSuggestedConnections(sourceType)
    };
  }

  // Check forEach requirement
  if (rule.requiresForEach && !forEachEnabled) {
    return {
      valid: false,
      reason: `Cannot connect ${sourceType} to ${targetType} without forEach enabled.`,
      suggestions: [
        `Enable forEach on the ${sourceType} node:`,
        `  1. Click the ${sourceType} node`,
        `  2. Enable "forEach Processing" in the configuration`,
        `  3. Try connecting again`,
        '',
        ...getSuggestedConnections(sourceType)
      ],
      requiresForEach: true
    };
  }

  // Check if runtime validation is required
  if (rule.requiresRuntimeValidation) {
    return {
      valid: true,
      warning: `⚠️  ${sourceType} → ${targetType}: ${rule.note || 'Type compatibility depends on runtime values and cannot be validated at build-time.'}`
    };
  }

  return {
    valid: true
  };
}

/**
 * Get valid starting nodes for forEach itemFlow based on parent node type
 *
 * When a node outputs an array and uses forEach, the itemFlow receives individual
 * array items. This function returns which node types can accept those items.
 *
 * @param parentType - The node type that outputs the array (e.g., 'split', 'parse')
 * @returns Array of node types that can start the forEach itemFlow
 *
 * @example
 * ```typescript
 * // split outputs SplitDocument[], itemFlow gets SplitDocument
 * getValidForEachStarters('split')  // ['parse', 'extract', 'categorize', 'trigger']
 *
 * // parse(chunked:true) outputs DocumentIR[], itemFlow gets DocumentIR
 * getValidForEachStarters('parse')  // ['categorize', 'extract', 'chunk']
 * ```
 */
export function getValidForEachStarters(parentType: NodeTypeName): NodeTypeName[] {
  const rules = NODE_COMPATIBILITY_MATRIX[parentType];
  if (!rules) return [];

  // Get all targets that require forEach (these are valid itemFlow starters)
  return Object.entries(rules)
    .filter(([_, rule]) => rule.valid && rule.requiresForEach)
    .map(([targetType, _]) => targetType as NodeTypeName);
}

/**
 * Validate if a node type can start a forEach itemFlow for a given parent
 *
 * @param parentType - The node type that outputs the array (e.g., 'split')
 * @param starterType - The node type to validate as itemFlow starter
 * @returns ValidationResult with detailed error messages and suggestions
 *
 * @example
 * ```typescript
 * // Valid: split → forEach → parse
 * canStartForEachItemFlow('split', 'parse')  // { valid: true }
 *
 * // Invalid: split → forEach → chunk
 * canStartForEachItemFlow('split', 'chunk')
 * // {
 * //   valid: false,
 * //   reason: 'chunk cannot start forEach itemFlow after split...',
 * //   suggestions: ['Valid starters: parse, extract, categorize, trigger']
 * // }
 * ```
 */
export function canStartForEachItemFlow(
  parentType: NodeTypeName,
  starterType: NodeTypeName
): ValidationResult {
  const rule = NODE_COMPATIBILITY_MATRIX[parentType]?.[starterType];

  if (!rule) {
    return {
      valid: false,
      reason: `Unknown node type combination: ${parentType} → forEach → ${starterType}`,
      suggestions: ['Ensure both nodes are valid node types.']
    };
  }

  // Check if this connection requires forEach (meaning it's valid in itemFlow)
  if (rule.valid && rule.requiresForEach) {
    return {
      valid: true
    };
  }

  // If the rule is invalid, provide error
  if (!rule.valid) {
    const validStarters = getValidForEachStarters(parentType);
    return {
      valid: false,
      reason: `${starterType} cannot start forEach itemFlow after ${parentType}. ${rule.reason || 'Type incompatible with forEach unwrapped item.'}`,
      suggestions: validStarters.length > 0
        ? [`Valid itemFlow starters for ${parentType}: ${validStarters.join(', ')}`]
        : [`${parentType} has no valid forEach itemFlow starters.`]
    };
  }

  // If valid but doesn't require forEach, it's not a valid itemFlow starter
  const validStarters = getValidForEachStarters(parentType);
  return {
    valid: false,
    reason: `${starterType} cannot start forEach itemFlow after ${parentType}. This connection does not require forEach, meaning it expects the full array, not individual items.`,
    suggestions: validStarters.length > 0
      ? [`Valid itemFlow starters for ${parentType}: ${validStarters.join(', ')}`]
      : [`${parentType} has no valid forEach itemFlow starters.`]
  };
}

/**
 * JSON Schema node structure for validation.
 * Represents a node in a JSON Schema definition.
 */
export interface JSONSchemaNode {
  type?: string | string[];
  properties?: Record<string, JSONSchemaNode>;
  items?: JSONSchemaNode | JSONSchemaNode[];
  required?: string[];
  enum?: (string | number | boolean | null)[];
  nullable?: boolean;
  anyOf?: JSONSchemaNode[];
  oneOf?: JSONSchemaNode[];
  allOf?: JSONSchemaNode[];
  const?: unknown;
  additionalProperties?: boolean | JSONSchemaNode;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  description?: string;
  default?: unknown;
  $ref?: string;
}

/**
 * Lightweight JSON Schema validator for Edge Runtime compatibility
 *
 * Validates data against a JSON Schema without using AJV's code generation.
 * This is fully Edge Runtime compatible with zero dependencies.
 *
 * @param data - The data to validate
 * @param schema - JSON Schema object (plain object, not AJV JSONSchemaType)
 * @returns The validated data cast to type T
 * @throws Error if validation fails
 */
export function validateJson<T>(data: unknown, schema: JSONSchemaNode): T {
  const errors: string[] = [];
  const MAX_DEPTH = 50; // Prevent DoS via deeply nested objects

  function validate(value: unknown, schema: JSONSchemaNode, path: string = '', depth: number = 0): void {
    // Check recursion depth to prevent DoS attacks
    if (depth > MAX_DEPTH) {
      errors.push(`${path || 'root'}: maximum nesting depth (${MAX_DEPTH}) exceeded`);
      return;
    }

    // Handle nullable values
    if (schema.nullable && (value === null || value === undefined)) {
      return;
    }

    if (value === null || value === undefined) {
      if (schema.nullable !== true) {
        errors.push(`${path || 'root'}: value is null or undefined`);
      }
      return;
    }

    // Validate type
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const expectedType = schema.type;

    if (expectedType) {
      // Handle type validation
      if (expectedType === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push(`${path || 'root'}: expected integer, got ${actualType}`);
          return;
        }
      } else if (expectedType === 'number') {
        if (typeof value !== 'number') {
          errors.push(`${path || 'root'}: expected number, got ${actualType}`);
          return;
        }
      } else if (expectedType === 'string') {
        if (typeof value !== 'string') {
          errors.push(`${path || 'root'}: expected string, got ${actualType}`);
          return;
        }
      } else if (expectedType === 'boolean') {
        if (typeof value !== 'boolean') {
          errors.push(`${path || 'root'}: expected boolean, got ${actualType}`);
          return;
        }
      } else if (expectedType === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${path || 'root'}: expected object, got ${actualType}`);
          return;
        }

        // Validate required properties
        if (schema.required && Array.isArray(schema.required)) {
          for (const reqProp of schema.required) {
            if (!(reqProp in value)) {
              errors.push(`${path}.${reqProp}: required property missing`);
            }
          }
        }

        // Validate additionalProperties and check for prototype pollution
        const dangerousProps = ['__proto__', 'constructor', 'prototype'];

        if (schema.additionalProperties === false && schema.properties) {
          const allowedProps = Object.keys(schema.properties);
          const requiredProps = schema.required || [];
          const allAllowedProps = new Set([...allowedProps, ...requiredProps]);

          // Check all keys including potentially dangerous ones
          for (const key of [...Object.keys(value), ...Object.getOwnPropertyNames(value)]) {
            // Explicitly reject dangerous properties
            if (dangerousProps.includes(key)) {
              errors.push(`${path}.${key}: dangerous property not allowed`);
              continue;
            }

            if (!allAllowedProps.has(key)) {
              errors.push(`${path}.${key}: additional property not allowed`);
            }
          }
        } else {
          // Even without additionalProperties: false, reject dangerous properties
          for (const key of dangerousProps) {
            if (key in value && Object.prototype.hasOwnProperty.call(value, key)) {
              errors.push(`${path}.${key}: dangerous property not allowed`);
            }
          }
        }

        // Validate properties
        if (schema.properties) {
          const valueObj = value as Record<string, unknown>;
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            if (propName in valueObj) {
              validate(valueObj[propName], propSchema, path ? `${path}.${propName}` : propName, depth + 1);
            }
          }
        }
      } else if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`${path || 'root'}: expected array, got ${actualType}`);
          return;
        }

        // Validate array items
        if (schema.items && !Array.isArray(schema.items)) {
          const itemSchema = schema.items;
          value.forEach((item, index) => {
            validate(item, itemSchema, `${path}[${index}]`, depth + 1);
          });
        }
      }
    }
  }

  validate(data, schema);

  if (errors.length > 0) {
    throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
  }

  return data as T;
}

/**
 * Reserved variables that are auto-injected per node type.
 * These variables come from config or computed data and cannot be overridden by users.
 */
export const RESERVED_VARIABLES = {
  extract: ['schema', 'documentText', 'schemaTitle', 'schemaDescription', 'structuredFormat'],
  categorize: ['categories', 'documentText'],
  parse: ['format', 'schema', 'describeFigures', 'citationsEnabled']
} as const;

/**
 * Validates that user-provided promptVariables don't attempt to override reserved variables.
 * Emits console warnings if reserved variables are found in user variables and removes them.
 *
 * @param nodeType - The type of node (extract, categorize, parse)
 * @param userVariables - The user-provided promptVariables object
 * @param autoInjectedVariables - The auto-injected variables object
 * @returns A cleaned variables object with reserved variables protected
 */
export function protectReservedVariables(
  nodeType: 'extract' | 'categorize' | 'parse',
  userVariables: Record<string, any> | undefined,
  autoInjectedVariables: Record<string, any>
): Record<string, any> {
  if (!userVariables || Object.keys(userVariables).length === 0) {
    return autoInjectedVariables;
  }

  const reserved = RESERVED_VARIABLES[nodeType];
  const warnings: string[] = [];

  // Check for reserved variable override attempts
  for (const key of reserved) {
    if (key in userVariables) {
      warnings.push(key);
    }
  }

  // Emit warnings if any reserved variables were attempted
  if (warnings.length > 0) {
    console.warn(
      `[doclo] Attempted to override reserved variables in ${nodeType} node: ${warnings.join(', ')}. ` +
      `These variables are auto-injected from config and cannot be overridden. ` +
      `They will be ignored.`
    );
  }

  // Merge: auto-injected first, then user variables (but reserved vars take precedence)
  return {
    ...autoInjectedVariables,
    ...userVariables,
    // Restore reserved variables to ensure they can't be overridden
    ...Object.fromEntries(
      reserved.map(key => [key, autoInjectedVariables[key]])
    )
  };
}
