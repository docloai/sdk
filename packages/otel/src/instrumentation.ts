/**
 * Doclo OpenTelemetry Instrumentation
 *
 * Main instrumentation class that bridges Doclo SDK observability hooks
 * to OpenTelemetry traces and metrics.
 *
 * @module @doclo/otel/instrumentation
 */

import { SpanKind } from '@opentelemetry/api';
import type { ObservabilityConfig } from '@doclo/core/observability';
import type { DocloOTelOptions, DocloInstrumentation } from './types.js';
import { SPAN_NAMES } from './types.js';
import { SpanManager } from './span-manager.js';
import { MetricsManager } from './metrics.js';
import {
  mapFlowStartToAttributes,
  mapFlowEndToAttributes,
  mapFlowErrorToAttributes,
  mapStepStartToAttributes,
  mapStepEndToAttributes,
  mapStepErrorToAttributes,
  mapConsensusStartToAttributes,
  mapConsensusRunToAttributes,
  mapConsensusCompleteToAttributes,
  mapConsensusRunRetryToAttributes,
  mapBatchStartToAttributes,
  mapBatchItemToAttributes,
  mapBatchItemEndToAttributes,
  mapBatchEndToAttributes,
  mapProviderRequestToAttributes,
  mapProviderResponseToAttributes,
  mapProviderRetryToAttributes,
  mapCircuitBreakerToAttributes,
} from './span-mapper.js';

/**
 * Create Doclo OpenTelemetry instrumentation.
 *
 * @param options - Configuration options
 * @returns Instrumentation instance with getHooks() method
 *
 * @example
 * ```typescript
 * import { trace, metrics } from '@opentelemetry/api';
 * import { createDocloInstrumentation } from '@doclo/otel';
 *
 * const instrumentation = createDocloInstrumentation({
 *   tracer: trace.getTracer('@doclo/sdk'),
 *   meter: metrics.getMeter('@doclo/sdk'),  // Optional
 * });
 *
 * const flow = createFlow({
 *   observability: instrumentation.getHooks()
 * });
 * ```
 */
export function createDocloInstrumentation(
  options: DocloOTelOptions,
): DocloInstrumentation {
  return new DocloInstrumentationImpl(options);
}

class DocloInstrumentationImpl implements DocloInstrumentation {
  private spanManager: SpanManager;
  private metricsManager?: MetricsManager;
  private options: DocloOTelOptions;
  private defaultAttributes: Record<string, unknown>;
  /** Maps provider request keys to span IDs for correlation */
  private providerSpanIds: Map<string, string> = new Map();

  constructor(options: DocloOTelOptions) {
    this.options = options;
    this.spanManager = new SpanManager(options.tracer);

    if (options.meter) {
      this.metricsManager = new MetricsManager(options.meter);
    }

    this.defaultAttributes = {
      'service.name': options.serviceName ?? '@doclo/sdk',
      'service.version': options.serviceVersion ?? '0.1.0',
      ...(options.defaultAttributes ?? {}),
    };
  }

  getHooks(): ObservabilityConfig {
    return {
      // Flow-level hooks
      onFlowStart: (ctx) => {
        const attributes = {
          ...this.defaultAttributes,
          ...mapFlowStartToAttributes(ctx),
        };
        this.spanManager.startFlowSpan(
          ctx.executionId,
          SPAN_NAMES.FLOW,
          attributes,
        );
      },

      onFlowEnd: (ctx) => {
        const attributes = mapFlowEndToAttributes(ctx);
        this.spanManager.endFlowSpan(ctx.executionId, attributes);
        this.metricsManager?.recordFlowEnd(ctx);
      },

      onFlowError: (ctx) => {
        const attributes = mapFlowErrorToAttributes(ctx);
        this.spanManager.errorFlowSpan(ctx.executionId, ctx.error, attributes);
        this.metricsManager?.recordFlowError(ctx);
      },

      // Step-level hooks
      onStepStart: (ctx) => {
        const attributes = {
          ...this.defaultAttributes,
          ...mapStepStartToAttributes(ctx),
        };
        this.spanManager.startSpan(
          ctx.spanId,
          ctx.executionId,
          `${SPAN_NAMES.STEP}.${ctx.stepType}`,
          attributes,
          SpanKind.INTERNAL,
        );
      },

      onStepEnd: (ctx) => {
        const attributes = mapStepEndToAttributes(ctx);
        this.spanManager.endSpan(ctx.spanId, attributes);
        this.metricsManager?.recordStepEnd(ctx);
      },

      onStepError: (ctx) => {
        const attributes = mapStepErrorToAttributes(ctx);
        this.spanManager.errorSpan(ctx.spanId, ctx.error, attributes);
      },

      // Consensus hooks
      onConsensusStart: (ctx) => {
        const spanId = `consensus:${ctx.stepId}`;
        const attributes = {
          ...this.defaultAttributes,
          ...mapConsensusStartToAttributes(ctx),
        };
        this.spanManager.startSpan(
          spanId,
          ctx.executionId,
          SPAN_NAMES.CONSENSUS,
          attributes,
          SpanKind.INTERNAL,
        );
      },

      onConsensusRunRetry: (ctx) => {
        const spanId = `consensus:${ctx.parentStepId}`;
        const attributes = mapConsensusRunRetryToAttributes(ctx);
        this.spanManager.addEvent(spanId, 'consensus.run.retry', attributes);
      },

      onConsensusRunComplete: (ctx) => {
        const spanId = `consensus_run:${ctx.consensusRunId}`;
        const parentSpanId = `consensus:${ctx.parentStepId}`;
        const attributes = {
          ...this.defaultAttributes,
          ...mapConsensusRunToAttributes(ctx),
        };

        // Create a span for this run (already completed, so start and immediately end)
        this.spanManager.startSpan(
          spanId,
          ctx.executionId,
          SPAN_NAMES.CONSENSUS_RUN,
          attributes,
          SpanKind.INTERNAL,
          parentSpanId,
        );

        if (ctx.status === 'failed' && ctx.error) {
          this.spanManager.errorSpan(spanId, ctx.error);
        } else {
          this.spanManager.endSpan(spanId);
        }
      },

      onConsensusComplete: (ctx) => {
        const spanId = `consensus:${ctx.stepId}`;
        const attributes = mapConsensusCompleteToAttributes(ctx);
        this.spanManager.endSpan(spanId, attributes);
      },

      // Batch/forEach hooks
      onBatchStart: (ctx) => {
        const attributes = {
          ...this.defaultAttributes,
          ...mapBatchStartToAttributes(ctx),
        };
        this.spanManager.startSpan(
          ctx.batchId,
          ctx.executionId,
          SPAN_NAMES.BATCH,
          attributes,
          SpanKind.INTERNAL,
        );
      },

      onBatchItemStart: (ctx) => {
        const spanId = `${ctx.batchId}:item:${ctx.itemIndex}`;
        const attributes = {
          ...this.defaultAttributes,
          ...mapBatchItemToAttributes(ctx),
        };
        this.spanManager.startSpan(
          spanId,
          ctx.executionId,
          SPAN_NAMES.BATCH_ITEM,
          attributes,
          SpanKind.INTERNAL,
          ctx.batchId,
        );
      },

      onBatchItemEnd: (ctx) => {
        const spanId = `${ctx.batchId}:item:${ctx.itemIndex}`;
        const attributes = mapBatchItemEndToAttributes(ctx);

        if (ctx.status === 'failed' && ctx.error) {
          this.spanManager.errorSpan(spanId, ctx.error, attributes);
        } else {
          this.spanManager.endSpan(spanId, attributes);
        }
      },

      onBatchEnd: (ctx) => {
        const attributes = mapBatchEndToAttributes(ctx);
        this.spanManager.endSpan(ctx.batchId, attributes);
      },

      // Provider-level hooks
      onProviderRequest: (ctx) => {
        const spanId = `provider:${ctx.executionId}:${ctx.attemptNumber}:${Date.now()}`;
        const attributes = {
          ...this.defaultAttributes,
          ...mapProviderRequestToAttributes(ctx),
        };
        this.spanManager.startSpan(
          spanId,
          ctx.executionId,
          SPAN_NAMES.PROVIDER_REQUEST,
          attributes,
          SpanKind.CLIENT,
        );
        // Store span ID in map for correlation with response
        const requestKey = `${ctx.executionId}:${ctx.attemptNumber}`;
        this.providerSpanIds.set(requestKey, spanId);
      },

      onProviderResponse: (ctx) => {
        // Look up the span ID from our correlation map
        const requestKey = `${ctx.executionId}:${ctx.attemptNumber}`;
        const spanId = this.providerSpanIds.get(requestKey);
        if (spanId && this.spanManager.isActive(spanId)) {
          const attributes = mapProviderResponseToAttributes(ctx);
          this.spanManager.endSpan(spanId, attributes);
          this.providerSpanIds.delete(requestKey);
        }
        this.metricsManager?.recordProviderResponse(ctx);
      },

      onProviderRetry: (ctx) => {
        const attributes = mapProviderRetryToAttributes(ctx);
        // Add retry event to flow span
        const flowSpan = this.spanManager.getFlowSpan(ctx.executionId);
        if (flowSpan) {
          flowSpan.addEvent('provider.retry', attributes);
        }
        this.metricsManager?.recordProviderRetry(ctx);
      },

      onCircuitBreakerTriggered: (ctx) => {
        const attributes = mapCircuitBreakerToAttributes(ctx);
        // Add circuit breaker event to flow span
        const flowSpan = this.spanManager.getFlowSpan(ctx.executionId);
        if (flowSpan) {
          flowSpan.addEvent('circuit_breaker.triggered', attributes);
        }
      },

      // Logging hook - add as span events
      onLog: (ctx) => {
        const flowSpan = this.spanManager.getFlowSpan(ctx.executionId);
        if (flowSpan) {
          flowSpan.addEvent(`log.${ctx.level}`, {
            'log.message': ctx.message,
            ...(ctx.stepId && { 'doclo.step.id': ctx.stepId }),
            ...(ctx.metadata && { 'log.metadata': JSON.stringify(ctx.metadata) }),
          });
        }
      },
    };
  }

  async flush(): Promise<void> {
    // No-op - users should flush their own tracer provider
    // This is here for API completeness
  }
}
