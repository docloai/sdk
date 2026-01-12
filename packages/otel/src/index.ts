/**
 * @doclo/otel - OpenTelemetry Instrumentation for Doclo SDK
 *
 * Provides automatic OpenTelemetry traces and metrics for Doclo SDK flows.
 * Implements Gen AI semantic conventions (v1.29.0) for AI/ML observability.
 *
 * @packageDocumentation
 * @module @doclo/otel
 *
 * @example Basic Usage
 * ```typescript
 * import { trace } from '@opentelemetry/api';
 * import { createDocloInstrumentation } from '@doclo/otel';
 * import { createFlow } from '@doclo/flows';
 *
 * // Create instrumentation with your tracer
 * const instrumentation = createDocloInstrumentation({
 *   tracer: trace.getTracer('@doclo/sdk', '0.1.0'),
 * });
 *
 * // Use with any flow
 * const flow = createFlow({
 *   observability: instrumentation.getHooks()
 * });
 *
 * // Execute - spans automatically created
 * const result = await flow.execute(input);
 * ```
 *
 * @example With Metrics
 * ```typescript
 * import { trace, metrics } from '@opentelemetry/api';
 * import { createDocloInstrumentation } from '@doclo/otel';
 *
 * const instrumentation = createDocloInstrumentation({
 *   tracer: trace.getTracer('@doclo/sdk'),
 *   meter: metrics.getMeter('@doclo/sdk'),  // Enables metrics
 *   serviceName: 'my-document-processor',
 *   serviceVersion: '1.0.0',
 * });
 * ```
 */

// Main instrumentation factory
export { createDocloInstrumentation } from './instrumentation.js';

// Types
export type {
  DocloOTelOptions,
  DocloInstrumentation,
  ActiveSpanEntry,
} from './types.js';

// Constants
export { METRIC_NAMES, SPAN_NAMES } from './types.js';

// Span mapping utilities (for advanced use cases)
export {
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

// Span manager (for advanced use cases)
export { SpanManager } from './span-manager.js';

// Metrics manager (for advanced use cases)
export { MetricsManager } from './metrics.js';
