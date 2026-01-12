/**
 * Span Mapper
 *
 * Maps hook context objects to OpenTelemetry span attributes.
 * Reuses attribute builders from @doclo/core/observability.
 *
 * @module @doclo/otel/span-mapper
 */

import type { Attributes } from '@opentelemetry/api';
import type {
  FlowStartContext,
  FlowEndContext,
  FlowErrorContext,
  StepStartContext,
  StepEndContext,
  StepErrorContext,
  ConsensusStartContext,
  ConsensusRunContext,
  ConsensusCompleteContext,
  ConsensusRunRetryContext,
  BatchStartContext,
  BatchItemContext,
  BatchItemEndContext,
  BatchEndContext,
  ProviderRequestContext,
  ProviderResponseContext,
  ProviderRetryContext,
  CircuitBreakerContext,
} from '@doclo/core/observability';

/**
 * Map FlowStartContext to span attributes
 */
export function mapFlowStartToAttributes(ctx: FlowStartContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.flow.version': ctx.flowVersion,
    'doclo.execution.id': ctx.executionId,
    'doclo.sdk.version': ctx.sdkVersion,
    'doclo.observability.version': ctx.observabilityVersion,
    'otel.trace.id': ctx.traceContext.traceId,
    'otel.span.id': ctx.traceContext.spanId,
  };
}

/**
 * Map FlowEndContext to span attributes
 */
export function mapFlowEndToAttributes(ctx: FlowEndContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.flow.duration_ms': ctx.duration,
    'doclo.flow.steps.total': ctx.stats.stepsTotal,
    'doclo.flow.steps.completed': ctx.stats.stepsCompleted,
    'doclo.flow.steps.failed': ctx.stats.stepsFailed,
    'doclo.flow.tokens.total': ctx.stats.totalTokens,
    'doclo.flow.cost.usd': ctx.stats.totalCost,
    ...(ctx.stats.pagesProcessed !== undefined && {
      'doclo.flow.pages.processed': ctx.stats.pagesProcessed,
    }),
    ...(ctx.stats.documentsProcessed !== undefined && {
      'doclo.flow.documents.processed': ctx.stats.documentsProcessed,
    }),
  };
}

/**
 * Map FlowErrorContext to span attributes
 */
export function mapFlowErrorToAttributes(ctx: FlowErrorContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.flow.duration_ms': ctx.duration,
    'error.type': ctx.error.name,
    'error.message': ctx.error.message,
    ...(ctx.errorCode && { 'doclo.error.code': ctx.errorCode }),
    ...(ctx.failedAtStepIndex !== undefined && {
      'doclo.flow.failed_at_step': ctx.failedAtStepIndex,
    }),
    'doclo.flow.steps.completed': ctx.partialStats.stepsCompleted,
    'doclo.flow.tokens.total': ctx.partialStats.totalTokens,
    'doclo.flow.cost.usd': ctx.partialStats.totalCost,
  };
}

/**
 * Map StepStartContext to span attributes
 */
export function mapStepStartToAttributes(ctx: StepStartContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.step.id': ctx.stepId,
    'doclo.step.index': ctx.stepIndex,
    'doclo.step.type': ctx.stepType,
    'doclo.step.name': ctx.stepName,
    'otel.span.id': ctx.spanId,
  };

  if (ctx.provider) {
    attrs['gen_ai.provider.name'] = ctx.provider;
  }
  if (ctx.model) {
    attrs['gen_ai.request.model'] = ctx.model;
  }
  if (ctx.config.temperature !== undefined) {
    attrs['gen_ai.request.temperature'] = ctx.config.temperature;
  }
  if (ctx.config.maxTokens !== undefined) {
    attrs['gen_ai.request.max_tokens'] = ctx.config.maxTokens;
  }
  if (ctx.config.topP !== undefined) {
    attrs['gen_ai.request.top_p'] = ctx.config.topP;
  }
  if (ctx.config.topK !== undefined) {
    attrs['gen_ai.request.top_k'] = ctx.config.topK;
  }

  if (ctx.isConsensusEnabled) {
    attrs['doclo.consensus.enabled'] = true;
    if (ctx.consensusConfig) {
      attrs['doclo.consensus.runs'] = ctx.consensusConfig.runs;
      attrs['doclo.consensus.strategy'] = ctx.consensusConfig.strategy;
    }
  }

  if (ctx.isRetry) {
    attrs['doclo.retry.is_retry'] = true;
    if (ctx.retryAttempt !== undefined) {
      attrs['doclo.retry.attempt'] = ctx.retryAttempt;
    }
    if (ctx.maxRetries !== undefined) {
      attrs['doclo.retry.max_attempts'] = ctx.maxRetries;
    }
  }

  return attrs;
}

/**
 * Map StepEndContext to span attributes
 */
export function mapStepEndToAttributes(ctx: StepEndContext): Attributes {
  const attrs: Attributes = {
    // Include OTel attributes from context (already built by @doclo/core)
    ...ctx.otelAttributes,
    // Add Doclo-specific attributes
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.step.id': ctx.stepId,
    'doclo.step.index': ctx.stepIndex,
    'doclo.step.duration_ms': ctx.duration,
    'doclo.step.metric_kind': ctx.metricKind,
    'otel.span.id': ctx.spanId,
    // Token usage
    'gen_ai.usage.input_tokens': ctx.usage.inputTokens,
    'gen_ai.usage.output_tokens': ctx.usage.outputTokens,
    'gen_ai.usage.total_tokens': ctx.usage.totalTokens,
    // Cost
    'doclo.step.cost.usd': ctx.cost,
  };

  if (ctx.usage.cacheCreationInputTokens !== undefined) {
    attrs['gen_ai.usage.cache_creation_tokens'] = ctx.usage.cacheCreationInputTokens;
  }
  if (ctx.usage.cacheReadInputTokens !== undefined) {
    attrs['gen_ai.usage.cache_read_tokens'] = ctx.usage.cacheReadInputTokens;
  }
  if (ctx.responseId) {
    attrs['gen_ai.response.id'] = ctx.responseId;
  }
  if (ctx.finishReason) {
    attrs['gen_ai.response.finish_reasons'] = [ctx.finishReason];
  }
  if (ctx.modelUsed) {
    attrs['gen_ai.response.model'] = ctx.modelUsed;
  }
  if (ctx.httpStatusCode !== undefined) {
    attrs['http.status_code'] = ctx.httpStatusCode;
  }
  if (ctx.httpMethod) {
    attrs['http.method'] = ctx.httpMethod;
  }
  if (ctx.httpUrl) {
    attrs['http.url'] = ctx.httpUrl;
  }

  return attrs;
}

/**
 * Map StepErrorContext to span attributes
 */
export function mapStepErrorToAttributes(ctx: StepErrorContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.step.id': ctx.stepId,
    'doclo.step.index': ctx.stepIndex,
    'doclo.step.duration_ms': ctx.duration,
    'otel.span.id': ctx.spanId,
    'error.type': ctx.error.name,
    'error.message': ctx.error.message,
    'doclo.retry.will_retry': ctx.willRetry,
  };

  if (ctx.errorCode) {
    attrs['doclo.error.code'] = ctx.errorCode;
  }
  if (ctx.retryAttempt !== undefined) {
    attrs['doclo.retry.attempt'] = ctx.retryAttempt;
  }
  if (ctx.nextRetryDelay !== undefined) {
    attrs['doclo.retry.next_delay_ms'] = ctx.nextRetryDelay;
  }
  if (ctx.partialUsage) {
    if (ctx.partialUsage.inputTokens !== undefined) {
      attrs['gen_ai.usage.input_tokens'] = ctx.partialUsage.inputTokens;
    }
    if (ctx.partialUsage.outputTokens !== undefined) {
      attrs['gen_ai.usage.output_tokens'] = ctx.partialUsage.outputTokens;
    }
  }
  if (ctx.partialCost !== undefined) {
    attrs['doclo.step.cost.usd'] = ctx.partialCost;
  }

  return attrs;
}

/**
 * Map ConsensusStartContext to span attributes
 */
export function mapConsensusStartToAttributes(ctx: ConsensusStartContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.step.id': ctx.stepId,
    'doclo.consensus.runs_planned': ctx.runsPlanned,
    'doclo.consensus.strategy': ctx.strategy,
  };
}

/**
 * Map ConsensusRunContext to span attributes
 */
export function mapConsensusRunToAttributes(ctx: ConsensusRunContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.consensus.parent_step_id': ctx.parentStepId,
    'doclo.consensus.run_id': ctx.consensusRunId,
    'doclo.consensus.run_index': ctx.runIndex,
    'doclo.consensus.run_duration_ms': ctx.duration,
    'doclo.consensus.run_status': ctx.status,
    'gen_ai.usage.input_tokens': ctx.usage.inputTokens,
    'gen_ai.usage.output_tokens': ctx.usage.outputTokens,
    'gen_ai.usage.total_tokens': ctx.usage.totalTokens,
    'doclo.step.cost.usd': ctx.cost,
    'doclo.consensus.total_attempts': ctx.totalAttempts,
    'doclo.consensus.was_retried': ctx.wasRetried,
  };

  if (ctx.error) {
    attrs['error.type'] = ctx.error.name;
    attrs['error.message'] = ctx.error.message;
  }

  return attrs;
}

/**
 * Map ConsensusCompleteContext to span attributes
 */
export function mapConsensusCompleteToAttributes(ctx: ConsensusCompleteContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.step.id': ctx.stepId,
    'doclo.consensus.total_runs': ctx.totalRuns,
    'doclo.consensus.successful_runs': ctx.successfulRuns,
    'doclo.consensus.failed_runs': ctx.failedRuns,
    'doclo.consensus.agreement': ctx.agreement,
    'gen_ai.usage.input_tokens': ctx.totalUsage.inputTokens,
    'gen_ai.usage.output_tokens': ctx.totalUsage.outputTokens,
    'gen_ai.usage.total_tokens': ctx.totalUsage.totalTokens,
    'doclo.step.cost.usd': ctx.totalCost,
    'doclo.consensus.total_retries': ctx.totalRetries,
    'doclo.consensus.runs_with_retries': ctx.runsWithRetries,
  };
}

/**
 * Map ConsensusRunRetryContext to span attributes
 */
export function mapConsensusRunRetryToAttributes(ctx: ConsensusRunRetryContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.consensus.parent_step_id': ctx.parentStepId,
    'doclo.consensus.run_id': ctx.consensusRunId,
    'doclo.consensus.run_index': ctx.runIndex,
    'doclo.retry.attempt': ctx.attemptNumber,
    'doclo.retry.max_attempts': ctx.maxAttempts,
    'doclo.retry.reason': ctx.reason,
  };

  if (ctx.error) {
    attrs['error.type'] = ctx.error.name;
    attrs['error.message'] = ctx.error.message;
  }
  if (ctx.partialUsage) {
    if (ctx.partialUsage.inputTokens !== undefined) {
      attrs['gen_ai.usage.input_tokens'] = ctx.partialUsage.inputTokens;
    }
    if (ctx.partialUsage.outputTokens !== undefined) {
      attrs['gen_ai.usage.output_tokens'] = ctx.partialUsage.outputTokens;
    }
  }
  if (ctx.partialCost !== undefined) {
    attrs['doclo.step.cost.usd'] = ctx.partialCost;
  }

  return attrs;
}

/**
 * Map BatchStartContext to span attributes
 */
export function mapBatchStartToAttributes(ctx: BatchStartContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.batch.id': ctx.batchId,
    'doclo.step.id': ctx.stepId,
    'doclo.batch.total_items': ctx.totalItems,
  };
}

/**
 * Map BatchItemContext to span attributes
 */
export function mapBatchItemToAttributes(ctx: BatchItemContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.batch.id': ctx.batchId,
    'doclo.step.id': ctx.stepId,
    'doclo.batch.item_index': ctx.itemIndex,
    'doclo.batch.total_items': ctx.totalItems,
  };
}

/**
 * Map BatchItemEndContext to span attributes
 */
export function mapBatchItemEndToAttributes(ctx: BatchItemEndContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.batch.id': ctx.batchId,
    'doclo.step.id': ctx.stepId,
    'doclo.batch.item_index': ctx.itemIndex,
    'doclo.batch.total_items': ctx.totalItems,
    'doclo.batch.item_duration_ms': ctx.duration,
    'doclo.batch.item_status': ctx.status,
  };

  if (ctx.error) {
    attrs['error.type'] = ctx.error.name;
    attrs['error.message'] = ctx.error.message;
  }

  return attrs;
}

/**
 * Map BatchEndContext to span attributes
 */
export function mapBatchEndToAttributes(ctx: BatchEndContext): Attributes {
  return {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'doclo.batch.id': ctx.batchId,
    'doclo.step.id': ctx.stepId,
    'doclo.batch.duration_ms': ctx.duration,
    'doclo.batch.total_items': ctx.totalItems,
    'doclo.batch.successful_items': ctx.successfulItems,
    'doclo.batch.failed_items': ctx.failedItems,
  };
}

/**
 * Map ProviderRequestContext to span attributes
 */
export function mapProviderRequestToAttributes(ctx: ProviderRequestContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'gen_ai.provider.name': ctx.provider,
    'gen_ai.request.model': ctx.model,
    'doclo.provider.attempt': ctx.attemptNumber,
  };

  if (ctx.stepId) {
    attrs['doclo.step.id'] = ctx.stepId;
  }
  if (ctx.httpMethod) {
    attrs['http.method'] = ctx.httpMethod;
  }
  if (ctx.httpUrl) {
    attrs['http.url'] = ctx.httpUrl;
  }
  if (ctx.maxAttempts !== undefined) {
    attrs['doclo.retry.max_attempts'] = ctx.maxAttempts;
  }

  return attrs;
}

/**
 * Map ProviderResponseContext to span attributes
 */
export function mapProviderResponseToAttributes(ctx: ProviderResponseContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'gen_ai.provider.name': ctx.provider,
    'gen_ai.request.model': ctx.model,
    'doclo.provider.duration_ms': ctx.duration,
    'gen_ai.usage.input_tokens': ctx.usage.inputTokens,
    'gen_ai.usage.output_tokens': ctx.usage.outputTokens,
    'gen_ai.usage.total_tokens': ctx.usage.totalTokens,
    'doclo.provider.attempt': ctx.attemptNumber,
  };

  if (ctx.stepId) {
    attrs['doclo.step.id'] = ctx.stepId;
  }
  if (ctx.modelUsed) {
    attrs['gen_ai.response.model'] = ctx.modelUsed;
  }
  if (ctx.cost !== undefined) {
    attrs['doclo.step.cost.usd'] = ctx.cost;
  }
  if (ctx.httpStatusCode !== undefined) {
    attrs['http.status_code'] = ctx.httpStatusCode;
  }
  if (ctx.httpMethod) {
    attrs['http.method'] = ctx.httpMethod;
  }
  if (ctx.httpUrl) {
    attrs['http.url'] = ctx.httpUrl;
  }
  if (ctx.responseId) {
    attrs['gen_ai.response.id'] = ctx.responseId;
  }
  if (ctx.finishReason) {
    attrs['gen_ai.response.finish_reasons'] = [ctx.finishReason];
  }
  if (ctx.usage.cacheCreationInputTokens !== undefined) {
    attrs['gen_ai.usage.cache_creation_tokens'] = ctx.usage.cacheCreationInputTokens;
  }
  if (ctx.usage.cacheReadInputTokens !== undefined) {
    attrs['gen_ai.usage.cache_read_tokens'] = ctx.usage.cacheReadInputTokens;
  }

  return attrs;
}

/**
 * Map ProviderRetryContext to span attributes
 */
export function mapProviderRetryToAttributes(ctx: ProviderRetryContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'gen_ai.provider.name': ctx.provider,
    'gen_ai.request.model': ctx.model,
    'error.type': ctx.error.name,
    'error.message': ctx.error.message,
    'doclo.retry.attempt': ctx.attemptNumber,
    'doclo.retry.max_attempts': ctx.maxAttempts,
    'doclo.retry.next_delay_ms': ctx.nextRetryDelay,
  };

  if (ctx.stepId) {
    attrs['doclo.step.id'] = ctx.stepId;
  }
  if (ctx.errorCode) {
    attrs['doclo.error.code'] = ctx.errorCode;
  }
  if (ctx.partialUsage) {
    if (ctx.partialUsage.inputTokens !== undefined) {
      attrs['gen_ai.usage.input_tokens'] = ctx.partialUsage.inputTokens;
    }
    if (ctx.partialUsage.outputTokens !== undefined) {
      attrs['gen_ai.usage.output_tokens'] = ctx.partialUsage.outputTokens;
    }
  }

  return attrs;
}

/**
 * Map CircuitBreakerContext to span attributes
 */
export function mapCircuitBreakerToAttributes(ctx: CircuitBreakerContext): Attributes {
  const attrs: Attributes = {
    'doclo.flow.id': ctx.flowId,
    'doclo.execution.id': ctx.executionId,
    'gen_ai.provider.name': ctx.provider,
    'doclo.circuit_breaker.failure_count': ctx.failureCount,
    'doclo.circuit_breaker.threshold': ctx.threshold,
    'doclo.circuit_breaker.cooldown_ms': ctx.cooldownMs,
  };

  if (ctx.model) {
    attrs['gen_ai.request.model'] = ctx.model;
  }
  if (ctx.lastError) {
    attrs['error.type'] = ctx.lastError.name;
    attrs['error.message'] = ctx.lastError.message;
  }

  return attrs;
}
