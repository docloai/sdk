import type { JSONSchemaType } from "ajv";

/** Unified internal schema (standard JSON Schema) */
export type UnifiedSchema<T = any> = JSONSchemaType<T>;

/** Provider types - 'x-ai' is an alias for 'xai', 'generic-or' for generic OpenRouter models */
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'xai' | 'x-ai' | 'generic-or';

/** Access method */
export type AccessMethod = 'openrouter' | 'native';

/** Resource limit configuration (optional overrides for defaults) */
export interface ResourceLimits {
  /**
   * Maximum file size in bytes (default: 100MB)
   *
   * SECURITY WARNING: Increasing this limit can expose your application
   * to memory exhaustion attacks. Only increase if you control the input sources.
   */
  maxFileSize?: number;

  /**
   * Request timeout in milliseconds (default: 30000ms / 30 seconds)
   *
   * SECURITY WARNING: Increasing this timeout can cause hung requests.
   * Only increase for known slow endpoints (e.g., processing large files).
   */
  requestTimeout?: number;

  /**
   * Maximum JSON nesting depth (default: 100)
   *
   * SECURITY WARNING: Deeply nested JSON can cause stack overflows.
   * Only increase if you're processing complex nested structures.
   */
  maxJsonDepth?: number;
}

/** Provider configuration */
export interface ProviderConfig {
  provider: ProviderType;
  model: string;
  via?: AccessMethod;  // defaults to 'native'
  apiKey: string;
  baseUrl?: string;  // for custom endpoints
  limits?: ResourceLimits;  // optional override of security limits
}

/** Fallback configuration */
export interface FallbackConfig {
  providers: ProviderConfig[];  // ordered list
  maxRetries: number;           // per fallback provider (default: 2)
  primaryMaxRetries?: number;   // retries for primary provider only (default: same as maxRetries)
  retryDelay: number;           // base delay in ms (default: 1000)
  useExponentialBackoff: boolean;  // default: true
  circuitBreakerThreshold?: number;  // skip provider after N consecutive failures
}

/** Image input */
export interface ImageInput {
  url?: string;
  base64?: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

/** PDF input */
export interface PDFInput {
  url?: string;
  base64?: string;
  fileId?: string;  // for Files API (Claude, Gemini)
}

/** Multimodal input (unified) */
export interface MultimodalInput {
  text?: string;
  images?: ImageInput[];
  pdfs?: PDFInput[];
}

/** Response metrics */
export interface ResponseMetrics {
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  attemptNumber: number;
  provider: string;
  model: string;
  // Prompt caching metrics (OpenRouter/Anthropic)
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  // HTTP metadata (for observability)
  httpStatusCode?: number;
  httpMethod?: string;
  httpUrl?: string;
  responseId?: string;
  finishReason?: string;
  modelUsed?: string; // Actual model used (may differ from requested)
}

/** LLM response */
export interface LLMResponse<T = unknown> {
  json: T;
  rawText?: string;
  metrics: ResponseMetrics;
  reasoning?: string;  // Reasoning text (if not excluded)
  reasoning_details?: ReasoningDetail[];  // Structured reasoning details
  metadata?: LLMExtractedMetadata;  // Extracted metadata (when derived options are enabled)
}

/** Provider capability flags */
export interface ProviderCapabilities {
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsPDFs: boolean;
  maxPDFPages?: number;
  maxPDFSize?: number;  // in MB
  maxContextTokens?: number;
}

/** JSON output mode */
export type JsonMode = 'strict' | 'relaxed';

/**
 * LLM-derived feature options that are implemented via prompting
 * These options are normalized across providers and work through prompt engineering
 */
export interface LLMDerivedOptions {
  /** Format for text output (markdown, html, json, text) */
  outputFormat?: 'markdown' | 'html' | 'json' | 'text';
  /** Format for tables within text fields */
  tableFormat?: 'markdown' | 'html' | 'csv';
  /** Add page break markers (---) between pages */
  pageMarkers?: boolean;
  /** Include per-field confidence scores (attached to result, not in JSON) */
  includeConfidence?: boolean;
  /** Include source citations with bounding boxes (attached to result, not in JSON) */
  includeSources?: boolean;
  /** Include block type classification for each extracted element */
  includeBlockTypes?: boolean;
  /** Extract document headers (repeated content at top of pages) */
  extractHeaders?: boolean;
  /** Extract document footers (repeated content at bottom of pages) */
  extractFooters?: boolean;
  /** Document chunking strategy */
  chunkingStrategy?: 'page' | 'section' | 'paragraph' | 'semantic';
  /** Maximum chunk size in characters (when using chunking) */
  maxChunkSize?: number;
  /** Language hints for the document */
  languageHints?: string[];
}

/**
 * Extracted metadata from LLM response (populated when derived options are enabled)
 */
export interface LLMExtractedMetadata {
  /** Per-field confidence scores (0-1) */
  confidence?: Record<string, number>;
  /** Source citations with bounding boxes */
  sources?: Array<{
    field: string;
    text: string;
    bbox?: [number, number, number, number];  // [y_min, x_min, y_max, x_max]
    page?: number;
  }>;
  /** Block type classifications */
  blockTypes?: Record<string, string>;
  /** Extracted headers */
  headers?: Array<{ text: string; pages: number[] }>;
  /** Extracted footers */
  footers?: Array<{ text: string; pages: number[] }>;
}

/** Provider interface */
export interface LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  completeJson<T>(params: {
    input: MultimodalInput;
    schema?: UnifiedSchema<T>;  // Optional (required for strict mode, optional for relaxed)
    mode?: JsonMode;  // 'strict' (default) or 'relaxed'
    max_tokens?: number;  // Max tokens for response (needed for reasoning budget calculation)
    reasoning?: ReasoningConfig;  // Reasoning configuration
    embedSchemaInPrompt?: boolean;  // Embed schema field names in prompt (default: true)
    derivedOptions?: LLMDerivedOptions;  // LLM-derived feature options
  }): Promise<LLMResponse<T>>;
}

/** Reasoning configuration (normalized across providers) */
export interface ReasoningConfig {
  effort?: 'low' | 'medium' | 'high';  // Normalized effort level
  exclude?: boolean;  // Exclude reasoning tokens from response
  enabled?: boolean;  // Enable with default (medium) effort
}

/** Reasoning detail types (from OpenRouter API) */
export type ReasoningDetail =
  | { type: 'reasoning.summary'; summary: string; id: string | null; format: string; index?: number }
  | { type: 'reasoning.encrypted'; data: string; id: string | null; format: string; index?: number }
  | { type: 'reasoning.text'; text: string; signature?: string | null; id: string | null; format: string; index?: number };

/** Circuit breaker state */
export interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureTime?: number;
  isOpen: boolean;
}
