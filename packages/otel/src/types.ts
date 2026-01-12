/**
 * OpenTelemetry Instrumentation Types
 *
 * Type definitions for @doclo/otel package.
 *
 * @module @doclo/otel/types
 */

import type { Tracer, Meter, Span, Attributes } from '@opentelemetry/api';
import type { ObservabilityConfig } from '@doclo/core/observability';

/**
 * Options for creating Doclo OpenTelemetry instrumentation
 */
export interface DocloOTelOptions {
  /**
   * OpenTelemetry Tracer instance for creating spans.
   * Required - traces are always enabled.
   *
   * @example
   * ```typescript
   * import { trace } from '@opentelemetry/api';
   * const tracer = trace.getTracer('@doclo/sdk', '0.1.0');
   * ```
   */
  tracer: Tracer;

  /**
   * OpenTelemetry Meter instance for recording metrics.
   * Optional - metrics are only recorded if meter is provided.
   *
   * @example
   * ```typescript
   * import { metrics } from '@opentelemetry/api';
   * const meter = metrics.getMeter('@doclo/sdk', '0.1.0');
   * ```
   */
  meter?: Meter;

  /**
   * Service name for span attributes.
   * @default '@doclo/sdk'
   */
  serviceName?: string;

  /**
   * Service version for span attributes.
   * @default '0.1.0'
   */
  serviceVersion?: string;

  /**
   * Whether to record input/output data in span attributes.
   * Disable for privacy-sensitive applications.
   * @default false
   */
  recordPayloads?: boolean;

  /**
   * Custom attributes to add to all spans.
   */
  defaultAttributes?: Attributes;
}

/**
 * Active span tracking entry
 */
export interface ActiveSpanEntry {
  span: Span;
  startTime: number;
  parentSpanId?: string;
}

/**
 * Doclo OpenTelemetry instrumentation interface
 */
export interface DocloInstrumentation {
  /**
   * Get observability hooks that create OpenTelemetry spans and metrics.
   * Pass these hooks to flow configuration.
   *
   * @example
   * ```typescript
   * const instrumentation = createDocloInstrumentation({ tracer });
   * const flow = createFlow({
   *   observability: instrumentation.getHooks()
   * });
   * ```
   */
  getHooks(): ObservabilityConfig;

  /**
   * Force flush any pending spans (useful for serverless).
   * Note: This is a no-op as we use the tracer provider's flush.
   */
  flush(): Promise<void>;
}

/**
 * Metric names following Gen AI semantic conventions
 */
export const METRIC_NAMES = {
  /** Token usage histogram (input/output) */
  TOKEN_USAGE: 'gen_ai.client.token.usage',
  /** Operation duration histogram */
  OPERATION_DURATION: 'gen_ai.client.operation.duration',
  /** Flow completion counter */
  FLOW_COMPLETED: 'doclo.flow.completed',
  /** Flow duration histogram */
  FLOW_DURATION: 'doclo.flow.duration',
  /** Step completion counter */
  STEP_COMPLETED: 'doclo.step.completed',
  /** Provider request counter */
  PROVIDER_REQUESTS: 'doclo.provider.requests',
  /** Provider retry counter */
  PROVIDER_RETRIES: 'doclo.provider.retries',
  /** Cost counter in USD */
  COST_TOTAL: 'doclo.cost.total',
} as const;

/**
 * Span names for different operation types
 */
export const SPAN_NAMES = {
  FLOW: 'doclo.flow',
  STEP: 'doclo.step',
  CONSENSUS: 'doclo.consensus',
  CONSENSUS_RUN: 'doclo.consensus.run',
  BATCH: 'doclo.batch',
  BATCH_ITEM: 'doclo.batch.item',
  PROVIDER_REQUEST: 'doclo.provider.request',
} as const;
