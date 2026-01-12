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

/** Caching configuration for prompt caching */
export interface CachingConfig {
  /**
   * Enable/disable prompt caching.
   * Default varies by provider:
   * - Anthropic: false (cache writes cost 1.25x-2x, opt-in)
   * - OpenAI/Google/XAI/DeepSeek: true (automatic, free)
   */
  enabled?: boolean;
  /**
   * Cache TTL for providers that support it (Anthropic only).
   * - '5m': 5-minute TTL, cache writes cost 1.25x (default)
   * - '1h': 1-hour TTL, cache writes cost 2x
   *
   * Break-even: ~1.4 reads/write (5m) or ~2.2 reads/write (1h).
   * For high-frequency flows (100+ docs/hr with same schema), caching
   * is almost always cost-effective despite the write cost.
   */
  ttl?: '5m' | '1h';
}

/** Provider configuration */
export interface ProviderConfig {
  provider: ProviderType;
  model: string;
  via?: AccessMethod;  // defaults to 'native'
  apiKey: string;
  baseUrl?: string;  // for custom endpoints
  limits?: ResourceLimits;  // optional override of security limits
  /** Optional caching configuration for prompt caching */
  caching?: CachingConfig;
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
  /** Optional system message (text-only, prepended to conversation) */
  systemPrompt?: string;
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
  // Prompt caching metrics
  /** Tokens written to cache (Anthropic only - costs 1.25x-2x) */
  cacheCreationInputTokens?: number;
  /** Tokens read from cache (all providers - significant cost savings) */
  cacheReadInputTokens?: number;
  /** Calculated cache savings percentage (0-100) based on provider discount rates */
  cacheSavingsPercent?: number;
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

  // Field normalization options (native on Extend.ai, prompt-derived on LLMs)

  /**
   * Normalize date fields to ISO 8601 format (YYYY-MM-DD)
   * When enabled, date fields in the extraction output will be formatted consistently.
   * Native support: Extend.ai (extend:type: "date")
   * LLM support: Via prompting
   */
  dateNormalization?: boolean;

  /**
   * Normalize currency fields to { amount: number, currency: string } objects
   * When enabled, monetary values are extracted as structured objects with ISO 4217 currency codes.
   * Native support: Extend.ai (extend:type: "currency")
   * LLM support: Via prompting
   */
  currencyNormalization?: boolean;

  /**
   * Detect and extract signature fields from documents
   * When enabled, signature presence is detected and locations are reported.
   * Native support: Extend.ai (extend:type: "signature"), Reducto
   * LLM support: Via prompting (less reliable)
   */
  signatureDetection?: boolean;
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

  // Field normalization metadata

  /** Detected signatures with location and confidence */
  signatures?: Array<{
    field: string;
    detected: boolean;
    bbox?: [number, number, number, number];
    page?: number;
    confidence?: number;
  }>;

  /** Normalized currency values (original → normalized mapping) */
  normalizedCurrencies?: Record<string, {
    original: string;
    amount: number;
    currency: string;  // ISO 4217 code
  }>;

  /** Normalized date values (original → normalized mapping) */
  normalizedDates?: Record<string, {
    original: string;
    normalized: string;  // ISO 8601 format (YYYY-MM-DD)
  }>;
}

/** Text completion response (for non-JSON outputs like JSX/code) */
export interface TextResponse {
  text: string;
  rawText?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
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

  /**
   * Complete a text prompt without JSON mode.
   * Use this when you need raw text output (JSX, code, markdown, etc.)
   * instead of structured JSON.
   */
  completeText?(params: {
    input: MultimodalInput;
    max_tokens?: number;
    reasoning?: ReasoningConfig;
  }): Promise<TextResponse>;
}

/** Effort level type for reasoning configuration */
export type ReasoningEffort = 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';

/** Effort to ratio mapping (aligned with OpenRouter spec) */
export const REASONING_EFFORT_RATIOS: Record<ReasoningEffort, number> = {
  xhigh: 0.95,
  high: 0.8,
  medium: 0.5,
  low: 0.2,
  minimal: 0.1,
  none: 0
};

/** Reasoning configuration (normalized across providers) */
export interface ReasoningConfig {
  /** Effort level - normalized across providers */
  effort?: ReasoningEffort;
  /** Direct token budget - used by Anthropic/Google/Qwen models */
  max_tokens?: number;
  /** Exclude reasoning tokens from response */
  exclude?: boolean;
  /** Enable with default (medium) effort. Set to false to explicitly disable. */
  enabled?: boolean;
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

/**
 * Provider-specific cache discount rates.
 * These represent the percentage savings on cached token reads.
 */
const CACHE_DISCOUNT_RATES: Record<string, number> = {
  anthropic: 0.90,  // 90% discount on cached reads (0.1x price)
  openai: 0.50,     // 50% discount
  google: 0.75,     // 75% discount (0.25x price)
  'x-ai': 0.75,     // 75% discount (Grok)
  xai: 0.75,        // alias
  deepseek: 0.90,   // 90% discount
};

/**
 * Calculate the cache savings percentage based on provider discount rates.
 *
 * @param provider - The provider name (e.g., 'anthropic', 'openai', 'google')
 * @param inputTokens - Total input tokens in the request
 * @param cacheReadTokens - Tokens read from cache
 * @returns Savings percentage (0-100) or undefined if not calculable
 *
 * @example
 * // 1000 input tokens, 800 from cache, using Anthropic (90% discount)
 * calculateCacheSavings('anthropic', 1000, 800) // => 72 (72% savings)
 */
export function calculateCacheSavings(
  provider: string,
  inputTokens: number | undefined,
  cacheReadTokens: number | undefined
): number | undefined {
  if (!inputTokens || !cacheReadTokens || inputTokens === 0) {
    return undefined;
  }

  // Normalize provider name (handle "anthropic/claude-..." format)
  const normalizedProvider = provider.includes('/')
    ? provider.split('/')[0]
    : provider;

  const discountRate = CACHE_DISCOUNT_RATES[normalizedProvider.toLowerCase()] ?? 0.50;

  // Savings = (cached tokens / total tokens) * discount rate * 100
  const savingsPercent = Math.round((cacheReadTokens / inputTokens) * discountRate * 100);

  return Math.min(savingsPercent, 100); // Cap at 100%
}
