/**
 * OpenTelemetry Metrics
 *
 * Metric definitions and recording for Doclo SDK instrumentation.
 * Follows Gen AI semantic conventions for AI/ML metrics.
 *
 * @module @doclo/otel/metrics
 */

import type { Meter, Counter, Histogram, Attributes } from '@opentelemetry/api';
import type {
  FlowEndContext,
  FlowErrorContext,
  StepEndContext,
  ProviderResponseContext,
  ProviderRetryContext,
} from '@doclo/core/observability';
import { METRIC_NAMES } from './types.js';

/**
 * Manages OpenTelemetry metrics for Doclo SDK.
 */
export class MetricsManager {
  private meter: Meter;

  // Histograms
  private tokenUsageHistogram: Histogram;
  private operationDurationHistogram: Histogram;
  private flowDurationHistogram: Histogram;

  // Counters
  private flowCompletedCounter: Counter;
  private stepCompletedCounter: Counter;
  private providerRequestsCounter: Counter;
  private providerRetriesCounter: Counter;
  private costTotalCounter: Counter;

  constructor(meter: Meter) {
    this.meter = meter;

    // Token usage histogram (Gen AI semantic convention)
    this.tokenUsageHistogram = meter.createHistogram(METRIC_NAMES.TOKEN_USAGE, {
      description: 'Token usage per Gen AI operation',
      unit: 'token',
    });

    // Operation duration histogram (Gen AI semantic convention)
    this.operationDurationHistogram = meter.createHistogram(
      METRIC_NAMES.OPERATION_DURATION,
      {
        description: 'Duration of Gen AI operations',
        unit: 's',
      },
    );

    // Flow duration histogram
    this.flowDurationHistogram = meter.createHistogram(METRIC_NAMES.FLOW_DURATION, {
      description: 'End-to-end flow execution duration',
      unit: 's',
    });

    // Flow completion counter
    this.flowCompletedCounter = meter.createCounter(METRIC_NAMES.FLOW_COMPLETED, {
      description: 'Total flows completed',
      unit: '{flow}',
    });

    // Step completion counter
    this.stepCompletedCounter = meter.createCounter(METRIC_NAMES.STEP_COMPLETED, {
      description: 'Total steps completed by type',
      unit: '{step}',
    });

    // Provider requests counter
    this.providerRequestsCounter = meter.createCounter(METRIC_NAMES.PROVIDER_REQUESTS, {
      description: 'Total provider API requests',
      unit: '{request}',
    });

    // Provider retries counter
    this.providerRetriesCounter = meter.createCounter(METRIC_NAMES.PROVIDER_RETRIES, {
      description: 'Total provider retry attempts',
      unit: '{retry}',
    });

    // Cost counter
    this.costTotalCounter = meter.createCounter(METRIC_NAMES.COST_TOTAL, {
      description: 'Total cost in USD',
      unit: 'USD',
    });
  }

  /**
   * Record flow completion metrics
   */
  recordFlowEnd(ctx: FlowEndContext): void {
    const baseAttributes: Attributes = {
      'doclo.flow.id': ctx.flowId,
      'doclo.flow.status': 'success',
    };

    // Flow completed counter
    this.flowCompletedCounter.add(1, baseAttributes);

    // Flow duration (convert ms to seconds)
    this.flowDurationHistogram.record(ctx.duration / 1000, baseAttributes);

    // Total cost for the flow
    if (ctx.stats.totalCost > 0) {
      this.costTotalCounter.add(ctx.stats.totalCost, baseAttributes);
    }
  }

  /**
   * Record flow error metrics
   */
  recordFlowError(ctx: FlowErrorContext): void {
    const baseAttributes: Attributes = {
      'doclo.flow.id': ctx.flowId,
      'doclo.flow.status': 'error',
      'error.type': ctx.error.name,
    };

    // Flow completed counter (with error status)
    this.flowCompletedCounter.add(1, baseAttributes);

    // Flow duration (even for errors)
    this.flowDurationHistogram.record(ctx.duration / 1000, baseAttributes);

    // Partial cost
    if (ctx.partialStats.totalCost > 0) {
      this.costTotalCounter.add(ctx.partialStats.totalCost, baseAttributes);
    }
  }

  /**
   * Record step completion metrics
   */
  recordStepEnd(ctx: StepEndContext): void {
    // Extract Gen AI attributes from context (support both old and new convention names)
    const genAiProvider =
      (ctx.otelAttributes['gen_ai.provider.name'] as string | undefined) ||
      (ctx.otelAttributes['gen_ai.system'] as string | undefined);
    const genAiModel = ctx.otelAttributes['gen_ai.request.model'] as string | undefined;
    const operationName = ctx.otelAttributes['gen_ai.operation.name'] as string | undefined;

    const baseAttributes: Attributes = {
      'doclo.flow.id': ctx.flowId,
      'doclo.step.metric_kind': ctx.metricKind,
      ...(genAiProvider && { 'gen_ai.provider.name': genAiProvider }),
      ...(genAiModel && { 'gen_ai.request.model': genAiModel }),
      ...(operationName && { 'gen_ai.operation.name': operationName }),
    };

    // Step completed counter
    this.stepCompletedCounter.add(1, {
      ...baseAttributes,
      'doclo.step.status': 'success',
    });

    // Only record token/duration metrics for leaf nodes (actual LLM calls)
    if (ctx.metricKind === 'leaf') {
      // Token usage histogram - input tokens
      if (ctx.usage.inputTokens > 0) {
        this.tokenUsageHistogram.record(ctx.usage.inputTokens, {
          ...baseAttributes,
          'gen_ai.token.type': 'input',
        });
      }

      // Token usage histogram - output tokens
      if (ctx.usage.outputTokens > 0) {
        this.tokenUsageHistogram.record(ctx.usage.outputTokens, {
          ...baseAttributes,
          'gen_ai.token.type': 'output',
        });
      }

      // Operation duration (convert ms to seconds)
      this.operationDurationHistogram.record(ctx.duration / 1000, baseAttributes);

      // Cost
      if (ctx.cost > 0) {
        this.costTotalCounter.add(ctx.cost, baseAttributes);
      }
    }
  }

  /**
   * Record provider response metrics
   */
  recordProviderResponse(ctx: ProviderResponseContext): void {
    const baseAttributes: Attributes = {
      'gen_ai.provider.name': ctx.provider,
      'gen_ai.request.model': ctx.model,
      ...(ctx.modelUsed && { 'gen_ai.response.model': ctx.modelUsed }),
    };

    // Provider requests counter
    this.providerRequestsCounter.add(1, {
      ...baseAttributes,
      'doclo.provider.status': 'success',
    });

    // Token usage
    if (ctx.usage.inputTokens > 0) {
      this.tokenUsageHistogram.record(ctx.usage.inputTokens, {
        ...baseAttributes,
        'gen_ai.token.type': 'input',
      });
    }
    if (ctx.usage.outputTokens > 0) {
      this.tokenUsageHistogram.record(ctx.usage.outputTokens, {
        ...baseAttributes,
        'gen_ai.token.type': 'output',
      });
    }

    // Duration
    this.operationDurationHistogram.record(ctx.duration / 1000, baseAttributes);

    // Cost
    if (ctx.cost !== undefined && ctx.cost > 0) {
      this.costTotalCounter.add(ctx.cost, baseAttributes);
    }
  }

  /**
   * Record provider retry metrics
   */
  recordProviderRetry(ctx: ProviderRetryContext): void {
    const baseAttributes: Attributes = {
      'gen_ai.provider.name': ctx.provider,
      'gen_ai.request.model': ctx.model,
      'error.type': ctx.error.name,
      'doclo.retry.attempt': ctx.attemptNumber,
    };

    // Provider retries counter
    this.providerRetriesCounter.add(1, baseAttributes);

    // Also count as a failed request
    this.providerRequestsCounter.add(1, {
      ...baseAttributes,
      'doclo.provider.status': 'retry',
    });
  }
}
