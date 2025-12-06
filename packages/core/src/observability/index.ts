/**
 * Observability Module
 *
 * Comprehensive observability system for the doclo-sdk SDK.
 * Provides hooks, tracing, and monitoring capabilities.
 *
 * @module @docloai/core/observability
 * @example
 * ```typescript
 * import { ObservabilityConfig } from '@docloai/core/observability';
 *
 * const config: ObservabilityConfig = {
 *   onFlowStart: (ctx) => console.log('Flow started:', ctx.flowId),
 *   onStepEnd: (ctx) => console.log('Step completed:', ctx.stepId, ctx.duration),
 * };
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Main configuration
  ObservabilityConfig,

  // Flow-level contexts
  FlowStartContext,
  FlowEndContext,
  FlowErrorContext,
  FlowStats,

  // Step-level contexts
  StepStartContext,
  StepEndContext,
  StepErrorContext,

  // Consensus contexts
  ConsensusStartContext,
  ConsensusRunRetryContext,
  ConsensusRunContext,
  ConsensusCompleteContext,

  // Batch/forEach contexts
  BatchStartContext,
  BatchItemContext,
  BatchItemEndContext,
  BatchEndContext,

  // Provider-level contexts
  ProviderRequestContext,
  ProviderResponseContext,
  ProviderRetryContext,
  CircuitBreakerContext,

  // Logging context
  LogContext,

  // Error handling
  HookError,

  // Trace context
  TraceContext,
  TraceContextInput,

  // Execution context
  ExecutionContext,
  CustomMetric,
} from './types.js';

// ============================================================================
// Hook Executor
// ============================================================================

// Note: Hook executor is for SDK internal use (not for end users)
// It's used by the SDK to execute hooks with timeout/error protection

export {
  executeHook,
  executeHooksSerial,
  isObservabilityEnabled,
} from './hook-executor.js';

// ============================================================================
// Trace Context Utilities
// ============================================================================

export {
  generateTraceId,
  generateSpanId,
  generateExecutionId,
  createTraceContext,
  createChildSpanContext,
  formatTraceparent,
  parseTraceparent,
  formatTracestate,
  isTraceSampled,
  isValidTraceId,
  isValidSpanId,
  TraceContextManager,
  TRACE_FLAGS_SAMPLED,
  TRACE_FLAGS_NOT_SAMPLED,
} from './trace-context.js';

// ============================================================================
// OpenTelemetry Attributes
// ============================================================================

export {
  buildOtelAttributes,
  buildProviderRequestAttributes,
  buildProviderResponseAttributes,
  buildStepAttributes,
  buildFullOtelContext,
  normalizeFinishReason,
  addStandardSpanAttributes,
  FINISH_REASON_MAPPING,
} from './otel-attributes.js';

// ============================================================================
// Configuration Defaults
// ============================================================================

export {
  DEFAULT_OBSERVABILITY_CONFIG,
  mergeConfig,
  shouldSample,
  validateConfig,
  getObservabilityVersion,
  isObservabilityDisabled,
  hasAnyHooks,
  createMinimalConfig,
} from './defaults.js';

// ============================================================================
// Logger
// ============================================================================

export {
  Logger,
  createLogger,
  type LogLevel,
  type LoggerOptions,
} from './logger.js';

// ============================================================================
// Version
// ============================================================================

/**
 * Observability module version
 */
export const OBSERVABILITY_VERSION = '1.0.0';
