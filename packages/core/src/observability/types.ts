/**
 * SDK Observability Hooks
 *
 * Comprehensive observability system for the doclo-sdk SDK.
 * All hooks are optional and async-capable. Hooks never crash execution.
 *
 * @module @doclo/core/observability
 */

/**
 * Hook Execution Order Guarantees:
 *
 * 1. onFlowStart - Called BEFORE any steps execute
 * 2. onStepStart - Called BEFORE step execution
 * 3. onStepEnd/onStepError - Called AFTER step completes (mutually exclusive)
 * 4. onConsensusStart - Called BEFORE first consensus run
 * 5. onConsensusRunRetry - Called when a consensus run will be retried (before retry)
 * 6. onConsensusRunComplete - Called after EACH consensus run completes (after all retries)
 * 7. onConsensusComplete - Called AFTER all consensus runs and agreement reached
 * 8. onFlowEnd/onFlowError - Called AFTER all steps complete (mutually exclusive)
 *
 * Async Behavior:
 * - SDK WILL wait for async hooks to complete before continuing
 * - Exception: Logs (onLog) are fire-and-forget, no waiting
 * - Hooks run serially, not in parallel
 * - If hook exceeds timeout, SDK logs warning and continues
 *
 * State Isolation:
 * - Hooks cannot modify execution state (read-only by default)
 * - Each hook receives immutable context snapshot
 * - Hooks cannot access other hooks' execution
 */

// ============================================================================
// Configuration
// ============================================================================

export interface ObservabilityConfig {
  // ========== Flow-Level Hooks ==========

  /** Called when flow execution begins */
  onFlowStart?: (context: FlowStartContext) => void | Promise<void>;

  /** Called when flow completes successfully */
  onFlowEnd?: (context: FlowEndContext) => void | Promise<void>;

  /** Called when flow fails or is cancelled */
  onFlowError?: (context: FlowErrorContext) => void | Promise<void>;

  // ========== Step-Level Hooks ==========

  /** Called before each step executes */
  onStepStart?: (context: StepStartContext) => void | Promise<void>;

  /** Called after step completes successfully */
  onStepEnd?: (context: StepEndContext) => void | Promise<void>;

  /** Called when step fails */
  onStepError?: (context: StepErrorContext) => void | Promise<void>;

  // ========== Consensus Hooks ==========

  /** Called when consensus decision begins */
  onConsensusStart?: (context: ConsensusStartContext) => void | Promise<void>;

  /** Called when a consensus run will be retried (empty result or error) */
  onConsensusRunRetry?: (context: ConsensusRunRetryContext) => void | Promise<void>;

  /** Called after each individual consensus run (after all retries for that run) */
  onConsensusRunComplete?: (context: ConsensusRunContext) => void | Promise<void>;

  /** Called when consensus decision is reached */
  onConsensusComplete?: (context: ConsensusCompleteContext) => void | Promise<void>;

  // ========== Batch/forEach Hooks ==========

  /** Called when batch processing begins */
  onBatchStart?: (context: BatchStartContext) => void | Promise<void>;

  /** Called before each batch item is processed */
  onBatchItemStart?: (context: BatchItemContext) => void | Promise<void>;

  /** Called after each batch item completes */
  onBatchItemEnd?: (context: BatchItemEndContext) => void | Promise<void>;

  /** Called when batch processing completes */
  onBatchEnd?: (context: BatchEndContext) => void | Promise<void>;

  // ========== Provider-Level Hooks ==========

  /** Called before making a provider request */
  onProviderRequest?: (context: ProviderRequestContext) => void | Promise<void>;

  /** Called after successful provider response */
  onProviderResponse?: (context: ProviderResponseContext) => void | Promise<void>;

  /** Called when provider call will be retried */
  onProviderRetry?: (context: ProviderRetryContext) => void | Promise<void>;

  /** Called when circuit breaker opens for a provider */
  onCircuitBreakerTriggered?: (context: CircuitBreakerContext) => void | Promise<void>;

  // ========== Logging Hook ==========

  /** Called for internal SDK log events (fire-and-forget) */
  onLog?: (context: LogContext) => void | Promise<void>;

  // ========== Error Handling ==========

  /** Called when a hook itself throws an error */
  onHookError?: (error: HookError) => void;

  /** If true, hook errors will crash execution. Default: false (hooks never crash) */
  failOnHookError?: boolean;

  /** Max milliseconds to wait for async hooks. Default: 5000 */
  hookTimeout?: number;

  // ========== Control Flags ==========

  /** Enable/disable all hooks. Default: true */
  enabled?: boolean;

  /** Sampling rate 0.0 to 1.0. Default: 1.0 (100%) */
  samplingRate?: number;

  /** Sampling strategy. Default: 'random' */
  samplingStrategy?: 'random' | 'custom';

  /** Custom sampler function (only used if samplingStrategy is 'custom') */
  customSampler?: (context: FlowStartContext) => boolean;

  /** Wait for async hooks to complete. Default: true */
  asyncHooks?: boolean;

  /** Don't wait for hooks (fire-and-forget). Default: false */
  fireAndForget?: boolean;

  // ========== ID Generation Overrides ==========

  /** Custom trace ID generator. Default: crypto-secure random */
  generateTraceId?: () => string;

  /** Custom span ID generator. Default: crypto-secure random */
  generateSpanId?: () => string;

  /** Custom execution ID generator. Default: crypto-secure random */
  generateExecutionId?: () => string;

  /** Propagate existing trace context (for distributed tracing) */
  traceContext?: TraceContextInput;

  // ========== Versioning ==========

  /** Observability contract version. Default: "1.0.0" */
  observabilityVersion?: string;
}

// ============================================================================
// Flow-Level Contexts
// ============================================================================

export interface FlowStartContext {
  flowId: string;
  flowVersion: string;
  executionId: string;
  timestamp: number;
  input: unknown;
  config: Record<string, unknown>; // Flow configuration
  metadata?: Record<string, unknown>; // User-provided metadata
  sdkVersion: string;
  observabilityVersion: string;
  traceContext: TraceContext;
}

export interface FlowEndContext {
  flowId: string;
  executionId: string;
  timestamp: number;
  startTime: number;
  duration: number;
  output: unknown;
  stats: FlowStats;
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface FlowErrorContext {
  flowId: string;
  executionId: string;
  timestamp: number;
  startTime: number;
  duration: number;
  error: Error;
  errorCode?: string;
  failedAtStepIndex?: number;
  partialStats: FlowStats;
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface FlowStats {
  stepsTotal: number;
  stepsCompleted: number;
  stepsFailed: number;
  totalTokens: number;
  totalCost: number;
  pagesProcessed?: number;
  documentsProcessed?: number;
}

// ============================================================================
// Step-Level Contexts
// ============================================================================

export interface StepStartContext {
  flowId: string;
  executionId: string;
  stepId: string; // Uses step.key
  stepIndex: number;
  stepType: string;
  stepName: string;
  timestamp: number;

  // Step configuration
  provider?: string;
  model?: string;
  config: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  };

  // Input data
  input: unknown;

  // Consensus info (if applicable)
  isConsensusEnabled: boolean;
  consensusConfig?: {
    runs: number;
    strategy: 'majority' | 'unanimous';
  };

  // Retry info
  isRetry: boolean;
  retryAttempt?: number;
  maxRetries?: number;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
  spanId: string; // Unique span ID for this step
}

export interface StepEndContext {
  flowId: string;
  executionId: string;
  stepId: string;
  stepIndex: number;
  timestamp: number;
  startTime: number;

  /**
   * Duration of THIS step's own work only (not rolled-up from children).
   * - For 'leaf' steps: The actual API call duration
   * - For 'wrapper' steps: The step's own API call if any, or ~0ms for pure wrappers
   * - For 'prep' steps: The preparation time (usually minimal)
   */
  duration: number;

  // Results
  output: unknown;

  /**
   * Token usage for THIS step's own API call only (not rolled-up from children).
   * - For 'leaf' steps: The actual token usage
   * - For 'wrapper' steps: Tokens from step's own call (e.g., categorize), or 0 for pure wrappers
   * - For 'prep' steps: Always 0
   */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };

  /**
   * Cost of THIS step's own API call only (not rolled-up from children).
   * - For 'leaf' steps: The actual cost
   * - For 'wrapper' steps: Cost from step's own call (e.g., categorize), or $0 for pure wrappers
   * - For 'prep' steps: Always $0
   */
  cost: number;

  /**
   * Type of step for metrics interpretation:
   * - 'leaf': Actual LLM/API call (parse, extract, categorize single call)
   * - 'wrapper': Orchestration step with children (conditional, consensus parent, forEach)
   * - 'prep': Utility step with no API call (output node, data transformation)
   */
  metricKind: 'leaf' | 'wrapper' | 'prep';

  // Response metadata
  responseId?: string;
  finishReason?: string; // "stop", "length", "content_filter"
  modelUsed?: string; // Actual model (may differ from requested)

  // HTTP metadata
  httpStatusCode?: number;
  httpMethod?: string;
  httpUrl?: string;

  // OpenTelemetry attributes
  otelAttributes: Record<string, string | number | boolean>;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
  spanId: string;
}

export interface StepErrorContext {
  flowId: string;
  executionId: string;
  stepId: string;
  stepIndex: number;
  timestamp: number;
  startTime: number;
  duration: number;

  error: Error;
  errorCode?: string; // "TIMEOUT", "RATE_LIMIT", "INVALID_RESPONSE"

  // Partial usage (if call partially succeeded)
  partialUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  partialCost?: number;

  // Retry info
  willRetry: boolean;
  retryAttempt?: number;
  nextRetryDelay?: number;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
  spanId: string;
}

// ============================================================================
// Consensus Contexts
// ============================================================================

export interface ConsensusStartContext {
  flowId: string;
  executionId: string;
  stepId: string; // Parent step ID
  timestamp: number;
  runsPlanned: number;
  strategy: 'majority' | 'unanimous';
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface ConsensusRunContext {
  flowId: string;
  executionId: string;
  parentStepId: string;
  consensusRunId: string; // Unique ID for this consensus run
  runIndex: number; // 0-based
  timestamp: number;
  startTime: number;
  duration: number;

  output: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  cost: number;

  status: 'success' | 'failed';
  error?: Error;

  // Retry information for this run
  totalAttempts: number; // How many attempts (1 = no retry, 2+ = retried)
  wasRetried: boolean; // Convenience: totalAttempts > 1

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface ConsensusCompleteContext {
  flowId: string;
  executionId: string;
  stepId: string;
  timestamp: number;

  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;

  agreement: number; // 0.0 to 1.0
  agreedOutput: unknown;

  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  totalCost: number;

  // Retry statistics (aggregate across all runs)
  totalRetries: number; // Total retry attempts across all runs
  runsWithRetries: number; // How many runs needed retries

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

/**
 * Context for consensus run retry events.
 * Fires immediately when a retry is about to occur (before the retry attempt).
 */
export interface ConsensusRunRetryContext {
  flowId: string;
  executionId: string;
  parentStepId: string;
  consensusRunId: string; // Unique ID for this consensus run
  runIndex: number; // 0-based

  timestamp: number;

  // Retry details
  attemptNumber: number; // Current failed attempt (1-based)
  maxAttempts: number; // Total attempts allowed
  reason: 'empty_result' | 'error';
  error?: Error; // Present if reason === 'error'

  // Partial metrics from failed attempt (if available)
  partialUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  partialCost?: number;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

// ============================================================================
// Batch/forEach Contexts
// ============================================================================

export interface BatchStartContext {
  flowId: string;
  executionId: string;
  batchId: string;
  stepId: string; // Parent forEach step ID
  totalItems: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface BatchItemContext {
  flowId: string;
  executionId: string;
  batchId: string;
  stepId: string;
  itemIndex: number;
  totalItems: number;
  item: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface BatchItemEndContext extends BatchItemContext {
  result: unknown;
  duration: number;
  error?: Error;
  status: 'success' | 'failed';
}

export interface BatchEndContext {
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
  results: unknown[];
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

// ============================================================================
// Provider-Level Contexts
// ============================================================================

export interface ProviderRequestContext {
  flowId: string;
  executionId: string;
  stepId?: string; // May not have step context
  timestamp: number;

  provider: string;
  model: string;

  // Request details
  input: unknown;
  schema?: unknown;

  // HTTP details
  httpMethod?: string;
  httpUrl?: string;

  // Retry context
  attemptNumber: number;
  maxAttempts?: number;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface ProviderResponseContext {
  flowId: string;
  executionId: string;
  stepId?: string;
  timestamp: number;
  startTime: number;
  duration: number;

  provider: string;
  model: string;
  modelUsed?: string; // Actual model used

  // Response details
  output: unknown;

  // Metrics
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  cost?: number;

  // HTTP details
  httpStatusCode?: number;
  httpMethod?: string;
  httpUrl?: string;

  // Response metadata
  responseId?: string;
  finishReason?: string;

  attemptNumber: number;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface ProviderRetryContext {
  flowId: string;
  executionId: string;
  stepId?: string;
  timestamp: number;

  provider: string;
  model: string;

  error: Error;
  errorCode?: string;

  attemptNumber: number;
  maxAttempts: number;
  nextRetryDelay: number; // milliseconds

  // Partial metrics if available
  partialUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  };

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

export interface CircuitBreakerContext {
  flowId: string;
  executionId: string;
  timestamp: number;

  provider: string;
  model?: string;

  failureCount: number;
  threshold: number;
  cooldownMs: number;

  lastError?: Error;

  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

// ============================================================================
// Logging Context
// ============================================================================

export interface LogContext {
  flowId: string;
  executionId: string;
  stepId?: string; // Optional - may be flow-level log
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  traceContext: TraceContext;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Union of all possible hook context types.
 * Used for generic hook handling where the specific type is unknown.
 */
export type HookContext =
  | FlowStartContext
  | FlowEndContext
  | FlowErrorContext
  | StepStartContext
  | StepEndContext
  | StepErrorContext
  | ConsensusStartContext
  | ConsensusRunContext
  | ConsensusCompleteContext
  | ConsensusRunRetryContext
  | BatchStartContext
  | BatchItemContext
  | BatchItemEndContext
  | BatchEndContext
  | ProviderRequestContext
  | ProviderResponseContext
  | ProviderRetryContext
  | CircuitBreakerContext
  | LogContext;

export interface HookError {
  hookName: string;
  error: Error;
  context: HookContext; // The context that was passed to the hook
  timestamp: number;
}

// ============================================================================
// Trace Context (W3C Trace Context)
// ============================================================================

export interface TraceContext {
  traceId: string; // For distributed tracing
  spanId: string; // Current span ID
  parentSpanId?: string;
  traceFlags: number; // W3C trace flags (0x01 = sampled)
  traceState?: string; // W3C trace state
}

export interface TraceContextInput {
  traceId: string;
  parentSpanId: string;
  traceFlags?: number;
  traceState?: string;
}

// ============================================================================
// Execution Context Access
// ============================================================================

export interface ExecutionContext {
  flowId: string;
  executionId: string;
  currentStepId?: string;
  currentStepIndex?: number;
  startTime: number;
  status: 'running' | 'completed' | 'failed';
  customAttributes: Record<string, unknown>;
  customMetrics: CustomMetric[];
}

export interface CustomMetric {
  name: string;
  value: number;
  unit?: string;
  timestamp: number;
}
