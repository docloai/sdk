/**
 * Doclo Client Type Definitions
 */

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Configuration options for the Doclo client
 */
export interface DocloClientConfig {
  /** API key for authentication (dc_live_... or dc_test_...) */
  apiKey: string;
  /** Base URL for the app API - used for running flows (default: https://api.doclo.cloud) */
  baseUrl?: string;
  /** Convex URL for data endpoints - used for runs status/cancel (defaults to baseUrl) */
  convexUrl?: string;
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Document input for flow execution
 */
export interface DocumentInput {
  /** Base64-encoded document content */
  base64: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'application/pdf', 'image/png') */
  mimeType: string;
}

/**
 * Input for a flow run
 */
export interface FlowRunInput {
  /** The document to process */
  document: DocumentInput;
  /** Optional variables to pass to the flow */
  variables?: Record<string, unknown>;
}

/**
 * Options for running a flow
 */
export interface FlowRunOptions {
  /** Input data for the flow */
  input: FlowRunInput;
  /** Webhook URL to receive completion notification */
  webhookUrl?: string;
  /** Custom metadata to attach to the execution */
  metadata?: Record<string, unknown>;
  /** Idempotency key to prevent duplicate executions */
  idempotencyKey?: string;
  /** If true, wait for completion before returning (sync mode) */
  wait?: boolean;
  /** Timeout in ms for sync mode (default: 30000) */
  timeout?: number;
  /** Specific flow version to run */
  version?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Possible execution statuses
 */
export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  /** Total tokens used across all steps */
  tokensUsed: number;
  /** Total cost in USD */
  cost: number;
  /** Number of steps completed */
  stepsRun: number;
  /** Total number of steps in the flow */
  stepsTotal: number;
}

/**
 * A flow execution result
 */
export interface Execution<T = unknown> {
  /** Unique execution ID */
  id: string;
  /** ID of the flow that was executed */
  flowId: string;
  /** Current status of the execution */
  status: ExecutionStatus;
  /** When the execution was created */
  createdAt: string;
  /** When the execution completed (if finished) */
  completedAt?: string;
  /** Duration in milliseconds (if finished) */
  duration?: number;
  /** Extracted output data (if successful) */
  output?: T;
  /** Execution metrics (if available) */
  metrics?: ExecutionMetrics;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Custom metadata attached to the execution */
  metadata?: Record<string, unknown>;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Information about a flow
 */
export interface FlowInfo {
  /** Unique flow ID */
  id: string;
  /** Display name */
  name: string;
  /** Flow description */
  description?: string;
  /** JSON Schema for required input variables */
  inputSchema?: object;
  /** Current version */
  version: string;
  /** When the flow was created */
  createdAt: string;
  /** When the flow was last updated */
  updatedAt: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** Array of items */
  data: T[];
  /** Whether there are more items */
  hasMore: boolean;
  /** Cursor for fetching next page */
  nextCursor?: string;
}

/**
 * Pagination options for list requests
 */
export interface PaginationOptions {
  /** Maximum number of items to return (default: 20, max: 100) */
  limit?: number;
  /** Cursor from previous response */
  cursor?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

/**
 * Webhook event payload
 */
export interface WebhookEvent<T = unknown> {
  /** Event type */
  event: WebhookEventType;
  /** When the event occurred */
  timestamp: string;
  /** Event data */
  data: Execution<T>;
}

// ============================================================================
// Rate Limit Types
// ============================================================================

/**
 * Rate limit information from response headers
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp when the window resets */
  reset: number;
  /** Seconds to wait before retrying (when rate limited) */
  retryAfter?: number;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * HTTP request options (internal)
 */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeout?: number;
}

/**
 * API error response format
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Flow Definition Types (Hybrid SDK)
// ============================================================================

/**
 * Serializable flow definition from cloud
 */
export interface FlowDefinitionResponse {
  /** Flow ID */
  flowId: string;
  /** Flow version */
  version: string;
  /** The full serializable flow JSON */
  definition: SerializableFlowDefinition;
  /** Sub-flows referenced by conditional branches (keyed by flowRef name) */
  subFlows?: Record<string, SerializableFlowDefinition>;
  /** Provider refs used in this flow (e.g., ["vlm", "ocr"]) */
  requiredProviders: string[];
  /** Assets referenced by this flow */
  referencedAssets: {
    prompts: string[];  // e.g., ["invoice-extraction@1.0.0"]
    schemas: string[];  // e.g., ["invoice@2.1.0"]
  };
  /** When the flow was created */
  createdAt: string;
  /** When the flow was last updated */
  updatedAt: string;
}

/**
 * Serializable flow definition structure
 * This matches the SerializableFlow type from @doclo/flows
 */
export interface SerializableFlowDefinition {
  version: string;
  steps: SerializableStep[];
  inputValidation?: {
    acceptedFormats?: Array<
      | 'application/pdf'
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp'
    >;
    throwOnInvalid?: boolean;
  };
}

/**
 * Serializable step (simplified type for client)
 */
export type SerializableStep = {
  type: 'step' | 'conditional' | 'forEach';
  id: string;
  name?: string;
  nodeType?: string;
  config?: Record<string, unknown>;
  branches?: Record<string, unknown>;
  itemFlow?: unknown;
};

// ============================================================================
// Prompt Asset Types (Hybrid SDK)
// ============================================================================

/**
 * Prompt asset from cloud
 */
export interface PromptAssetResponse {
  /** Prompt ID */
  id: string;
  /** Prompt version */
  version: string;
  /** Prompt type */
  type: 'extraction' | 'parse' | 'categorize' | 'custom';
  /** Prompt status */
  status: 'active' | 'draft' | 'archived';
  /** Message-based prompt content */
  messages?: PromptMessage[];
  /** Section-based prompt content */
  sections?: PromptSections;
  /** Variable definitions */
  variables?: Record<string, PromptVariable>;
  /** Auto-inject variable names */
  autoInject?: string[];
  /** Description */
  description?: string;
  /** Tags */
  tags?: string[];
  /** Changelog */
  changelog?: string;
  /** When created */
  createdAt: string;
  /** When updated */
  updatedAt: string;
}

/**
 * Prompt message for message-based prompts
 */
export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: string | { variable: string };
  }>;
}

/**
 * Section-based prompt content
 */
export interface PromptSections {
  system?: string;
  context?: string;
  instructions?: string;
  examples?: string;
  notes?: string;
}

/**
 * Prompt variable definition
 */
export interface PromptVariable {
  type: 'string' | 'number' | 'image' | 'schema' | 'object';
  description?: string;
  required?: boolean;
  default?: unknown;
  source?: 'auto' | 'user' | 'computed';
  overridable?: boolean;
}

/**
 * Prompt versions list response
 */
export interface PromptVersionsResponse {
  id: string;
  versions: Array<{
    version: string;
    status: 'active' | 'draft' | 'archived';
    createdAt: string;
  }>;
}

// ============================================================================
// Schema Asset Types (Hybrid SDK)
// ============================================================================

/**
 * Schema asset from cloud
 */
export interface SchemaAssetResponse {
  /** Schema ID */
  id: string;
  /** Schema version */
  version: string;
  /** The JSON Schema object */
  schema: Record<string, unknown>;
  /** Description */
  description?: string;
  /** Tags */
  tags?: string[];
  /** Changelog */
  changelog?: string;
  /** When created */
  createdAt: string;
  /** When updated */
  updatedAt: string;
}

/**
 * Schema versions list response
 */
export interface SchemaVersionsResponse {
  id: string;
  versions: Array<{
    version: string;
    createdAt: string;
  }>;
}

// ============================================================================
// Flow Assets Bundle Types (Hybrid SDK)
// ============================================================================

/**
 * Flow assets bundle response
 */
export interface FlowAssetsResponse {
  /** Flow ID */
  flowId: string;
  /** Flow version */
  flowVersion: string;
  /** Prompts keyed by "id@version" */
  prompts: Record<string, PromptAssetResponse>;
  /** Schemas keyed by "id@version" */
  schemas: Record<string, SchemaAssetResponse>;
}

// ============================================================================
// Observability Ingest Types (Hybrid SDK)
// ============================================================================

/**
 * Observability ingest request
 */
export interface ObservabilityIngestRequest {
  /** Execution ID */
  executionId: string;
  /** Flow ID */
  flowId: string;
  /** Flow version */
  flowVersion?: string;
  /** SDK version */
  sdkVersion: string;
  /** W3C trace ID */
  traceId: string;
  /** Batched events */
  events: ObservabilityEvent[];
}

/**
 * Observability event union type
 */
export type ObservabilityEvent =
  | { type: 'flow_start'; data: FlowStartEventData }
  | { type: 'flow_end'; data: FlowEndEventData }
  | { type: 'flow_error'; data: FlowErrorEventData }
  | { type: 'step_start'; data: StepStartEventData }
  | { type: 'step_end'; data: StepEndEventData }
  | { type: 'step_error'; data: StepErrorEventData }
  | { type: 'consensus_start'; data: ConsensusStartEventData }
  | { type: 'consensus_run_complete'; data: ConsensusRunEventData }
  | { type: 'consensus_complete'; data: ConsensusCompleteEventData }
  | { type: 'batch_start'; data: BatchStartEventData }
  | { type: 'batch_item_end'; data: BatchItemEndEventData }
  | { type: 'batch_end'; data: BatchEndEventData }
  | { type: 'provider_request'; data: ProviderRequestEventData }
  | { type: 'provider_response'; data: ProviderResponseEventData }
  | { type: 'provider_retry'; data: ProviderRetryEventData };

/**
 * W3C Trace context
 */
export interface TraceContextData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * Flow stats
 */
export interface FlowStatsData {
  stepsTotal: number;
  stepsCompleted: number;
  stepsFailed: number;
  totalTokens: number;
  totalCost: number;
  pagesProcessed?: number;
  documentsProcessed?: number;
}

/**
 * Token usage
 */
export interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

// Event data types
export interface FlowStartEventData {
  flowId: string;
  flowVersion: string;
  executionId: string;
  timestamp: number;
  input?: unknown;
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sdkVersion: string;
  observabilityVersion: string;
  traceContext: TraceContextData;
}

export interface FlowEndEventData {
  flowId: string;
  executionId: string;
  timestamp: number;
  startTime: number;
  duration: number;
  output?: unknown;
  stats: FlowStatsData;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface FlowErrorEventData {
  flowId: string;
  executionId: string;
  timestamp: number;
  startTime: number;
  duration: number;
  error: { message: string; name: string; stack?: string };
  errorCode?: string;
  failedAtStepIndex?: number;
  partialStats: FlowStatsData;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface StepStartEventData {
  flowId: string;
  executionId: string;
  stepId: string;
  stepIndex: number;
  stepType: string;
  stepName: string;
  timestamp: number;
  provider?: string;
  model?: string;
  config: Record<string, unknown>;
  input?: unknown;
  isConsensusEnabled: boolean;
  consensusConfig?: {
    runs: number;
    strategy: 'majority' | 'unanimous';
  };
  isRetry: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
  spanId: string;
}

export interface StepEndEventData {
  flowId: string;
  executionId: string;
  stepId: string;
  stepIndex: number;
  timestamp: number;
  startTime: number;
  duration: number;
  output?: unknown;
  usage: TokenUsageData;
  cost: number;
  metricKind: 'leaf' | 'wrapper' | 'prep';
  responseId?: string;
  finishReason?: string;
  modelUsed?: string;
  httpStatusCode?: number;
  httpMethod?: string;
  httpUrl?: string;
  otelAttributes: Record<string, string | number | boolean>;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
  spanId: string;
}

export interface StepErrorEventData {
  flowId: string;
  executionId: string;
  stepId: string;
  stepIndex: number;
  timestamp: number;
  startTime: number;
  duration: number;
  error: { message: string; name: string; stack?: string };
  errorCode?: string;
  partialUsage?: Partial<TokenUsageData>;
  partialCost?: number;
  willRetry: boolean;
  retryAttempt?: number;
  nextRetryDelay?: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
  spanId: string;
}

export interface ConsensusStartEventData {
  flowId: string;
  executionId: string;
  stepId: string;
  timestamp: number;
  runsPlanned: number;
  strategy: 'majority' | 'unanimous';
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface ConsensusRunEventData {
  flowId: string;
  executionId: string;
  parentStepId: string;
  consensusRunId: string;
  runIndex: number;
  timestamp: number;
  startTime: number;
  duration: number;
  output?: unknown;
  usage: TokenUsageData;
  cost: number;
  status: 'success' | 'failed';
  error?: { message: string; name: string };
  totalAttempts: number;
  wasRetried: boolean;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface ConsensusCompleteEventData {
  flowId: string;
  executionId: string;
  stepId: string;
  timestamp: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  agreement: number;
  agreedOutput?: unknown;
  totalUsage: TokenUsageData;
  totalCost: number;
  totalRetries: number;
  runsWithRetries: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface BatchStartEventData {
  flowId: string;
  executionId: string;
  batchId: string;
  stepId: string;
  totalItems: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface BatchItemEndEventData {
  flowId: string;
  executionId: string;
  batchId: string;
  stepId: string;
  itemIndex: number;
  totalItems: number;
  item?: unknown;
  timestamp: number;
  duration: number;
  result?: unknown;
  error?: { message: string; name: string };
  status: 'success' | 'failed';
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface BatchEndEventData {
  flowId: string;
  executionId: string;
  batchId: string;
  stepId: string;
  timestamp: number;
  startTime: number;
  duration: number;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  results?: unknown[];
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface ProviderRequestEventData {
  flowId: string;
  executionId: string;
  stepId?: string;
  timestamp: number;
  provider: string;
  model: string;
  input?: unknown;
  schema?: unknown;
  httpMethod?: string;
  httpUrl?: string;
  attemptNumber: number;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface ProviderResponseEventData {
  flowId: string;
  executionId: string;
  stepId?: string;
  timestamp: number;
  startTime: number;
  duration: number;
  provider: string;
  model: string;
  modelUsed?: string;
  output?: unknown;
  usage: TokenUsageData;
  cost?: number;
  httpStatusCode?: number;
  httpMethod?: string;
  httpUrl?: string;
  responseId?: string;
  finishReason?: string;
  attemptNumber: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

export interface ProviderRetryEventData {
  flowId: string;
  executionId: string;
  stepId?: string;
  timestamp: number;
  provider: string;
  model: string;
  error: { message: string; name: string };
  errorCode?: string;
  attemptNumber: number;
  maxAttempts: number;
  nextRetryDelay: number;
  partialUsage?: Partial<TokenUsageData>;
  metadata?: Record<string, unknown>;
  traceContext: TraceContextData;
}

/**
 * Observability ingest response
 */
export interface ObservabilityIngestResponse {
  /** Number of events received */
  received: number;
  /** Execution ID */
  executionId: string;
}
