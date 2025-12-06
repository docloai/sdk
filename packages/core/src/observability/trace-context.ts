/**
 * Trace Context Generator
 *
 * Implements W3C Trace Context standard for distributed tracing.
 * Generates crypto-secure trace IDs, span IDs, and execution IDs.
 *
 * @see https://www.w3.org/TR/trace-context/
 * @module @docloai/core/observability/trace-context
 */

import { randomHex, randomUUID as cryptoRandomUUID } from '../runtime/crypto.js';
import type { TraceContext, TraceContextInput, ObservabilityConfig } from './types.js';

/**
 * W3C Trace Context version (always "00")
 */
const TRACE_CONTEXT_VERSION = '00';

/**
 * Trace flags for sampled traces
 */
export const TRACE_FLAGS_SAMPLED = 0x01;

/**
 * Trace flags for non-sampled traces
 */
export const TRACE_FLAGS_NOT_SAMPLED = 0x00;

/**
 * Generate a crypto-secure trace ID (32 lowercase hex characters)
 *
 * Format: 32 hex digits (16 bytes)
 * Example: "4bf92f3577b34da6a3ce929d0e0e4736"
 */
export function generateTraceId(): string {
  return randomHex(16);
}

/**
 * Generate a crypto-secure span ID (16 lowercase hex characters)
 *
 * Format: 16 hex digits (8 bytes)
 * Example: "00f067aa0ba902b7"
 */
export function generateSpanId(): string {
  return randomHex(8);
}

/**
 * Generate a unique execution ID
 *
 * Uses crypto-secure random bytes for uniqueness.
 * Format: UUID v4 style (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
 */
export function generateExecutionId(): string {
  return cryptoRandomUUID();
}

/**
 * Create a new trace context for flow execution
 *
 * @param config - Observability configuration
 * @param sampled - Whether this execution is sampled
 * @returns Complete trace context
 */
export function createTraceContext(
  config: ObservabilityConfig,
  sampled: boolean
): TraceContext {
  // Use custom generator if provided, otherwise use default
  const traceIdGenerator = config.generateTraceId ?? generateTraceId;
  const spanIdGenerator = config.generateSpanId ?? generateSpanId;

  // If trace context propagation is configured, use it
  if (config.traceContext) {
    const input = config.traceContext;
    return {
      traceId: input.traceId,
      spanId: spanIdGenerator(),
      parentSpanId: input.parentSpanId,
      traceFlags: input.traceFlags ?? (sampled ? TRACE_FLAGS_SAMPLED : TRACE_FLAGS_NOT_SAMPLED),
      traceState: input.traceState,
    };
  }

  // Create new trace context
  return {
    traceId: traceIdGenerator(),
    spanId: spanIdGenerator(),
    traceFlags: sampled ? TRACE_FLAGS_SAMPLED : TRACE_FLAGS_NOT_SAMPLED,
  };
}

/**
 * Create a child span context from a parent trace context
 *
 * @param parent - Parent trace context
 * @param config - Observability configuration (for custom span ID generator)
 * @returns New trace context with same traceId but new spanId
 */
export function createChildSpanContext(
  parent: TraceContext,
  config?: ObservabilityConfig
): TraceContext {
  const spanIdGenerator = config?.generateSpanId ?? generateSpanId;

  return {
    traceId: parent.traceId,
    spanId: spanIdGenerator(),
    parentSpanId: parent.spanId,
    traceFlags: parent.traceFlags,
    traceState: parent.traceState,
  };
}

/**
 * Format trace context as W3C traceparent header value
 *
 * Format: "00-{traceId}-{spanId}-{flags}"
 * Example: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
 *
 * @see https://www.w3.org/TR/trace-context/#traceparent-header
 */
export function formatTraceparent(context: TraceContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `${TRACE_CONTEXT_VERSION}-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse W3C traceparent header value
 *
 * @param traceparent - Traceparent header value
 * @returns Parsed trace context input or null if invalid
 */
export function parseTraceparent(traceparent: string): TraceContextInput | null {
  // Format: "00-{traceId}-{spanId}-{flags}"
  const parts = traceparent.split('-');

  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // Validate version
  if (version !== TRACE_CONTEXT_VERSION) {
    return null;
  }

  // Validate traceId (32 hex chars)
  if (!/^[0-9a-f]{32}$/.test(traceId)) {
    return null;
  }

  // Validate spanId (16 hex chars)
  if (!/^[0-9a-f]{16}$/.test(spanId)) {
    return null;
  }

  // Validate flags (2 hex chars)
  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return null;
  }

  return {
    traceId,
    parentSpanId: spanId,
    traceFlags: parseInt(flags, 16),
  };
}

/**
 * Format trace context as W3C tracestate header value
 *
 * @see https://www.w3.org/TR/trace-context/#tracestate-header
 */
export function formatTracestate(context: TraceContext): string | undefined {
  return context.traceState;
}

/**
 * Check if trace context is sampled
 */
export function isTraceSampled(context: TraceContext): boolean {
  return (context.traceFlags & TRACE_FLAGS_SAMPLED) === TRACE_FLAGS_SAMPLED;
}

/**
 * Validate trace ID format
 *
 * Must be 32 lowercase hex characters, not all zeros
 */
export function isValidTraceId(traceId: string): boolean {
  // Must be 32 hex characters
  if (!/^[0-9a-f]{32}$/.test(traceId)) {
    return false;
  }

  // Must not be all zeros
  if (traceId === '00000000000000000000000000000000') {
    return false;
  }

  return true;
}

/**
 * Validate span ID format
 *
 * Must be 16 lowercase hex characters, not all zeros
 */
export function isValidSpanId(spanId: string): boolean {
  // Must be 16 hex characters
  if (!/^[0-9a-f]{16}$/.test(spanId)) {
    return false;
  }

  // Must not be all zeros
  if (spanId === '0000000000000000') {
    return false;
  }

  return true;
}

/**
 * Trace Context Manager
 *
 * Manages trace context for the current execution.
 */
export class TraceContextManager {
  private traceContext: TraceContext | null = null;
  private config: ObservabilityConfig;

  constructor(config: ObservabilityConfig) {
    this.config = config;
  }

  /**
   * Initialize trace context for new execution
   */
  initialize(sampled: boolean): TraceContext {
    this.traceContext = createTraceContext(this.config, sampled);
    return this.traceContext;
  }

  /**
   * Get current trace context
   */
  getTraceContext(): TraceContext | null {
    return this.traceContext;
  }

  /**
   * Create child span context
   */
  createChildSpan(): TraceContext {
    if (!this.traceContext) {
      throw new Error('Trace context not initialized');
    }
    return createChildSpanContext(this.traceContext, this.config);
  }

  /**
   * Get traceparent header value
   */
  getTraceparent(): string | null {
    if (!this.traceContext) {
      return null;
    }
    return formatTraceparent(this.traceContext);
  }

  /**
   * Reset trace context (for testing)
   */
  reset(): void {
    this.traceContext = null;
  }
}
