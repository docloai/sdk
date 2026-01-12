/**
 * Span Manager
 *
 * Manages active span lifecycle for OpenTelemetry instrumentation.
 * Tracks parent-child relationships and ensures proper span cleanup.
 *
 * @module @doclo/otel/span-manager
 */

import type { Span, Tracer, Context, Attributes } from '@opentelemetry/api';
import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import type { ActiveSpanEntry } from './types.js';

/**
 * Manages active spans during flow execution.
 * Handles span creation, parent-child relationships, and cleanup.
 */
export class SpanManager {
  private tracer: Tracer;
  private activeSpans: Map<string, ActiveSpanEntry> = new Map();
  private flowSpans: Map<string, Span> = new Map();
  private contextStack: Map<string, Context> = new Map();

  constructor(tracer: Tracer) {
    this.tracer = tracer;
  }

  /**
   * Start a flow span (root span for a flow execution)
   */
  startFlowSpan(
    executionId: string,
    name: string,
    attributes: Record<string, unknown>,
  ): Span {
    const span = this.tracer.startSpan(name, {
      kind: SpanKind.SERVER,
      attributes: attributes as Attributes,
    });

    this.flowSpans.set(executionId, span);
    this.contextStack.set(executionId, trace.setSpan(context.active(), span));

    return span;
  }

  /**
   * End a flow span
   */
  endFlowSpan(executionId: string, attributes?: Record<string, unknown>): void {
    const span = this.flowSpans.get(executionId);
    if (span) {
      if (attributes) {
        span.setAttributes(attributes as Attributes);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      this.flowSpans.delete(executionId);
      this.contextStack.delete(executionId);
    }
  }

  /**
   * End a flow span with error
   */
  errorFlowSpan(
    executionId: string,
    error: Error,
    attributes?: Record<string, unknown>,
  ): void {
    const span = this.flowSpans.get(executionId);
    if (span) {
      if (attributes) {
        span.setAttributes(attributes as Attributes);
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      this.flowSpans.delete(executionId);
      this.contextStack.delete(executionId);
    }
  }

  /**
   * Start a child span (step, consensus run, batch item, etc.)
   */
  startSpan(
    spanId: string,
    executionId: string,
    name: string,
    attributes: Record<string, unknown>,
    kind: SpanKind = SpanKind.INTERNAL,
    parentSpanId?: string,
  ): Span {
    // Get parent context
    let parentContext = this.contextStack.get(executionId) || context.active();

    // If we have a specific parent span ID, use that span's context
    if (parentSpanId) {
      const parentEntry = this.activeSpans.get(parentSpanId);
      if (parentEntry) {
        parentContext = trace.setSpan(context.active(), parentEntry.span);
      }
    }

    // Create span within parent context
    const span = this.tracer.startSpan(
      name,
      {
        kind,
        attributes: attributes as Attributes,
      },
      parentContext,
    );

    this.activeSpans.set(spanId, {
      span,
      startTime: Date.now(),
      parentSpanId,
    });

    // Update context stack for this span
    this.contextStack.set(spanId, trace.setSpan(context.active(), span));

    return span;
  }

  /**
   * End a span successfully
   */
  endSpan(spanId: string, attributes?: Record<string, unknown>): void {
    const entry = this.activeSpans.get(spanId);
    if (entry) {
      if (attributes) {
        entry.span.setAttributes(attributes as Attributes);
      }
      entry.span.setStatus({ code: SpanStatusCode.OK });
      entry.span.end();
      this.activeSpans.delete(spanId);
      this.contextStack.delete(spanId);
    }
  }

  /**
   * End a span with error
   */
  errorSpan(
    spanId: string,
    error: Error,
    attributes?: Record<string, unknown>,
  ): void {
    const entry = this.activeSpans.get(spanId);
    if (entry) {
      if (attributes) {
        entry.span.setAttributes(attributes as Attributes);
      }
      entry.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      entry.span.recordException(error);
      entry.span.end();
      this.activeSpans.delete(spanId);
      this.contextStack.delete(spanId);
    }
  }

  /**
   * Add attributes to an active span
   */
  addAttributes(spanId: string, attributes: Record<string, unknown>): void {
    const entry = this.activeSpans.get(spanId);
    if (entry) {
      entry.span.setAttributes(attributes as Attributes);
    }
  }

  /**
   * Add an event to an active span
   */
  addEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    const entry = this.activeSpans.get(spanId);
    if (entry) {
      entry.span.addEvent(name, attributes as Attributes);
    }
  }

  /**
   * Get an active span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId)?.span;
  }

  /**
   * Get the flow span for an execution
   */
  getFlowSpan(executionId: string): Span | undefined {
    return this.flowSpans.get(executionId);
  }

  /**
   * Get the context for a span or execution
   */
  getContext(id: string): Context | undefined {
    return this.contextStack.get(id);
  }

  /**
   * Check if a span is active
   */
  isActive(spanId: string): boolean {
    return this.activeSpans.has(spanId);
  }

  /**
   * Get count of active spans (for debugging)
   */
  getActiveSpanCount(): number {
    return this.activeSpans.size;
  }

  /**
   * Clear all spans (for testing/cleanup)
   */
  clear(): void {
    // End all active spans
    for (const [, entry] of this.activeSpans) {
      entry.span.setStatus({ code: SpanStatusCode.UNSET });
      entry.span.end();
    }
    this.activeSpans.clear();

    // End all flow spans
    for (const [, span] of this.flowSpans) {
      span.setStatus({ code: SpanStatusCode.UNSET });
      span.end();
    }
    this.flowSpans.clear();

    this.contextStack.clear();
  }
}
