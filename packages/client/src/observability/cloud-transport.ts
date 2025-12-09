/**
 * Cloud Observability Transport
 *
 * Sends observability events from local SDK execution to the Doclo cloud.
 * Supports streaming (real-time) and batch-at-end modes.
 */

import type { DocloClient } from '../client.js';
import type {
  ObservabilityEvent,
  ObservabilityIngestRequest,
} from '../types.js';

// Re-export types for convenience
export type { ObservabilityEvent } from '../types.js';

/**
 * Cloud observability transport options
 */
export interface CloudObservabilityOptions {
  /** Doclo client instance */
  client: DocloClient;

  /** Flow ID for tracking */
  flowId: string;

  /** Optional flow version */
  flowVersion?: string;

  /**
   * Transport mode:
   * - 'stream': Send events periodically during execution (real-time dashboard).
   *             Set flushIntervalMs: 0 for immediate per-event sending.
   * - 'batch-at-end': Collect all events, send on flush() (fewer API calls)
   */
  mode?: 'stream' | 'batch-at-end';

  /**
   * Batch size threshold for stream mode.
   * Events are flushed when buffer reaches this size.
   * Ignored if flushIntervalMs is 0.
   * @default 50
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds for stream mode.
   * Set to 0 for immediate per-event sending.
   * @default 5000
   */
  flushIntervalMs?: number;

  /**
   * Maximum retry attempts for failed sends.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay between retries in milliseconds (uses exponential backoff).
   * @default 1000
   */
  retryDelayMs?: number;

  /**
   * Maximum events to buffer before dropping oldest.
   * Prevents memory issues in long-running processes.
   * @default 1000
   */
  maxBufferSize?: number;

  /**
   * Called when events are dropped due to errors or buffer overflow.
   */
  onError?: (error: Error, droppedEvents: number) => void;

  /**
   * Include input data in flow_start and step_start events.
   * Set to false for privacy.
   * @default false
   */
  includeInputs?: boolean;

  /**
   * Include output data in flow_end, step_end, etc.
   * Set to false for privacy.
   * @default false
   */
  includeOutputs?: boolean;

  /**
   * SDK version string for tracking.
   * @default "0.1.0"
   */
  sdkVersion?: string;
}

/**
 * Cloud observability transport interface
 */
export interface CloudObservability {
  /**
   * Add an event to the buffer.
   * In stream mode, may trigger a flush.
   */
  push(event: ObservabilityEvent): void;

  /**
   * Manually flush buffered events to cloud.
   * Required for 'batch-at-end' mode.
   */
  flush(): Promise<void>;

  /**
   * Get count of pending events in buffer.
   */
  getPendingCount(): number;

  /**
   * Stop the transport and flush remaining events.
   */
  close(): Promise<void>;

  /**
   * Set the execution ID (required before pushing events).
   */
  setExecutionId(executionId: string): void;

  /**
   * Set the trace ID (required before pushing events).
   */
  setTraceId(traceId: string): void;
}

/**
 * Internal event with retry metadata
 */
interface BufferedEvent {
  event: ObservabilityEvent;
  retries: number;
  addedAt: number;
}

/**
 * Create a cloud observability transport
 *
 * @example
 * ```typescript
 * // Stream mode (real-time) - default
 * const transport = createCloudTransport({
 *   client,
 *   flowId: 'my-flow',
 *   mode: 'stream',
 *   flushIntervalMs: 5000
 * });
 *
 * // Push events as they occur
 * transport.setExecutionId('exec_123');
 * transport.setTraceId('trace_abc');
 * transport.push({ type: 'flow_start', data: { ... } });
 *
 * // At end, ensure all events are sent
 * await transport.close();
 * ```
 */
export function createCloudTransport(
  options: CloudObservabilityOptions
): CloudObservability {
  const {
    client,
    flowId,
    flowVersion,
    mode = 'stream',
    batchSize = 50,
    flushIntervalMs = 5000,
    maxRetries = 3,
    retryDelayMs = 1000,
    maxBufferSize = 1000,
    onError,
    includeInputs = false,
    includeOutputs = false,
    sdkVersion = '0.1.0',
  } = options;

  let buffer: BufferedEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let executionId: string | null = null;
  let traceId: string | null = null;
  let isClosed = false;
  let flushPromise: Promise<void> | null = null;

  /**
   * Strip input/output data based on privacy settings
   */
  function sanitizeEvent(event: ObservabilityEvent): ObservabilityEvent {
    const data = { ...event.data };

    // Remove inputs if not included
    if (!includeInputs && 'input' in data) {
      delete (data as Record<string, unknown>).input;
    }

    // Remove outputs if not included
    if (!includeOutputs) {
      if ('output' in data) {
        delete (data as Record<string, unknown>).output;
      }
      if ('agreedOutput' in data) {
        delete (data as Record<string, unknown>).agreedOutput;
      }
      if ('result' in data) {
        delete (data as Record<string, unknown>).result;
      }
      if ('results' in data) {
        delete (data as Record<string, unknown>).results;
      }
    }

    return { type: event.type, data } as ObservabilityEvent;
  }

  /**
   * Send a batch of events to the cloud
   */
  async function sendBatch(events: BufferedEvent[]): Promise<BufferedEvent[]> {
    if (events.length === 0 || !executionId || !traceId) {
      return [];
    }

    const request: ObservabilityIngestRequest = {
      executionId,
      flowId,
      flowVersion,
      sdkVersion,
      traceId,
      events: events.map((e) => sanitizeEvent(e.event)),
    };

    try {
      await client.observability.ingest(request);
      return []; // All events sent successfully
    } catch (error) {
      // Separate retriable and non-retriable events
      const retriable: BufferedEvent[] = [];
      const dropped: BufferedEvent[] = [];

      for (const bufferedEvent of events) {
        if (bufferedEvent.retries < maxRetries) {
          retriable.push({
            ...bufferedEvent,
            retries: bufferedEvent.retries + 1,
          });
        } else {
          dropped.push(bufferedEvent);
        }
      }

      if (dropped.length > 0) {
        onError?.(error as Error, dropped.length);
      }

      return retriable;
    }
  }

  /**
   * Flush the buffer
   */
  async function flush(): Promise<void> {
    // If already flushing, wait for it
    if (flushPromise) {
      await flushPromise;
      return;
    }

    if (buffer.length === 0) {
      return;
    }

    // Take all events from buffer
    const eventsToSend = [...buffer];
    buffer = [];

    // Clear any pending timer
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    flushPromise = (async () => {
      let remaining = eventsToSend;
      let attempt = 0;

      while (remaining.length > 0 && attempt < maxRetries) {
        remaining = await sendBatch(remaining);

        if (remaining.length > 0) {
          // Wait before retry with exponential backoff
          const delay = retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
        }
      }

      // Put failed events back in buffer (they've been retried)
      if (remaining.length > 0) {
        buffer.unshift(...remaining);
      }
    })();

    try {
      await flushPromise;
    } finally {
      flushPromise = null;
    }
  }

  /**
   * Schedule a flush if in stream mode
   */
  function scheduleFlush(): void {
    if (mode !== 'stream' || isClosed) {
      return;
    }

    // Immediate mode
    if (flushIntervalMs === 0) {
      void flush();
      return;
    }

    // Batch size threshold
    if (buffer.length >= batchSize) {
      void flush();
      return;
    }

    // Timer-based flush
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, flushIntervalMs);
    }
  }

  return {
    push(event: ObservabilityEvent): void {
      if (isClosed) {
        return;
      }

      // Add to buffer
      buffer.push({
        event,
        retries: 0,
        addedAt: Date.now(),
      });

      // Enforce max buffer size
      while (buffer.length > maxBufferSize) {
        const dropped = buffer.shift();
        if (dropped) {
          onError?.(new Error('Buffer overflow'), 1);
        }
      }

      // Schedule flush in stream mode
      scheduleFlush();
    },

    async flush(): Promise<void> {
      return flush();
    },

    getPendingCount(): number {
      return buffer.length;
    },

    async close(): Promise<void> {
      isClosed = true;

      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      await flush();
    },

    setExecutionId(id: string): void {
      executionId = id;
    },

    setTraceId(id: string): void {
      traceId = id;
    },
  };
}

/**
 * Create an ObservabilityConfig that sends events to the cloud.
 *
 * This wraps createCloudTransport with the ObservabilityConfig interface
 * expected by @doclo/flows.
 *
 * @example
 * ```typescript
 * const obs = createCloudObservability({
 *   client,
 *   flowId: 'my-flow',
 *   mode: 'stream'
 * });
 *
 * const flow = createFlow({ observability: obs })
 *   .step('parse', parse({ provider }))
 *   .build();
 *
 * const result = await flow.run(input);
 *
 * // Ensure all events are sent
 * await obs.flush();
 * ```
 */
export function createCloudObservability(options: CloudObservabilityOptions): CloudObservabilityTransport {
  const transport = createCloudTransport(options);

  // Create the observability config with all hooks wired to the transport
  const config: CloudObservabilityTransport = {
    // Control flags
    enabled: true,
    samplingRate: 1.0,
    asyncHooks: true,
    fireAndForget: false,

    // Flow-level hooks
    onFlowStart: (ctx) => {
      transport.setExecutionId(ctx.executionId);
      transport.setTraceId(ctx.traceContext.traceId);
      transport.push({
        type: 'flow_start',
        data: {
          flowId: ctx.flowId,
          flowVersion: ctx.flowVersion,
          executionId: ctx.executionId,
          timestamp: ctx.timestamp,
          input: ctx.input,
          config: ctx.config,
          metadata: ctx.metadata,
          sdkVersion: ctx.sdkVersion,
          observabilityVersion: ctx.observabilityVersion,
          traceContext: ctx.traceContext,
        },
      });
    },

    onFlowEnd: (ctx) => {
      transport.push({
        type: 'flow_end',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          output: ctx.output,
          stats: ctx.stats,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onFlowError: (ctx) => {
      transport.push({
        type: 'flow_error',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          error: { message: ctx.error.message, name: ctx.error.name, stack: ctx.error.stack },
          errorCode: ctx.errorCode,
          failedAtStepIndex: ctx.failedAtStepIndex,
          partialStats: ctx.partialStats,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    // Step-level hooks
    onStepStart: (ctx) => {
      transport.push({
        type: 'step_start',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          stepIndex: ctx.stepIndex,
          stepType: ctx.stepType,
          stepName: ctx.stepName,
          timestamp: ctx.timestamp,
          provider: ctx.provider,
          model: ctx.model,
          config: ctx.config,
          input: ctx.input,
          isConsensusEnabled: ctx.isConsensusEnabled,
          consensusConfig: ctx.consensusConfig,
          isRetry: ctx.isRetry,
          retryAttempt: ctx.retryAttempt,
          maxRetries: ctx.maxRetries,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
          spanId: ctx.spanId,
        },
      });
    },

    onStepEnd: (ctx) => {
      transport.push({
        type: 'step_end',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          stepIndex: ctx.stepIndex,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          output: ctx.output,
          usage: ctx.usage,
          cost: ctx.cost,
          metricKind: ctx.metricKind,
          responseId: ctx.responseId,
          finishReason: ctx.finishReason,
          modelUsed: ctx.modelUsed,
          httpStatusCode: ctx.httpStatusCode,
          httpMethod: ctx.httpMethod,
          httpUrl: ctx.httpUrl,
          otelAttributes: ctx.otelAttributes,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
          spanId: ctx.spanId,
        },
      });
    },

    onStepError: (ctx) => {
      transport.push({
        type: 'step_error',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          stepIndex: ctx.stepIndex,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          error: { message: ctx.error.message, name: ctx.error.name, stack: ctx.error.stack },
          errorCode: ctx.errorCode,
          partialUsage: ctx.partialUsage,
          partialCost: ctx.partialCost,
          willRetry: ctx.willRetry,
          retryAttempt: ctx.retryAttempt,
          nextRetryDelay: ctx.nextRetryDelay,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
          spanId: ctx.spanId,
        },
      });
    },

    // Consensus hooks
    onConsensusStart: (ctx) => {
      transport.push({
        type: 'consensus_start',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          timestamp: ctx.timestamp,
          runsPlanned: ctx.runsPlanned,
          strategy: ctx.strategy,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onConsensusRunComplete: (ctx) => {
      transport.push({
        type: 'consensus_run_complete',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          parentStepId: ctx.parentStepId,
          consensusRunId: ctx.consensusRunId,
          runIndex: ctx.runIndex,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          output: ctx.output,
          usage: ctx.usage,
          cost: ctx.cost,
          status: ctx.status,
          error: ctx.error ? { message: ctx.error.message, name: ctx.error.name } : undefined,
          totalAttempts: ctx.totalAttempts,
          wasRetried: ctx.wasRetried,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onConsensusComplete: (ctx) => {
      transport.push({
        type: 'consensus_complete',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          timestamp: ctx.timestamp,
          totalRuns: ctx.totalRuns,
          successfulRuns: ctx.successfulRuns,
          failedRuns: ctx.failedRuns,
          agreement: ctx.agreement,
          agreedOutput: ctx.agreedOutput,
          totalUsage: ctx.totalUsage,
          totalCost: ctx.totalCost,
          totalRetries: ctx.totalRetries,
          runsWithRetries: ctx.runsWithRetries,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    // Batch hooks
    onBatchStart: (ctx) => {
      transport.push({
        type: 'batch_start',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          batchId: ctx.batchId,
          stepId: ctx.stepId,
          totalItems: ctx.totalItems,
          timestamp: ctx.timestamp,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onBatchItemEnd: (ctx) => {
      transport.push({
        type: 'batch_item_end',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          batchId: ctx.batchId,
          stepId: ctx.stepId,
          itemIndex: ctx.itemIndex,
          totalItems: ctx.totalItems,
          item: ctx.item,
          timestamp: ctx.timestamp,
          duration: ctx.duration,
          result: ctx.result,
          error: ctx.error ? { message: ctx.error.message, name: ctx.error.name } : undefined,
          status: ctx.status,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onBatchEnd: (ctx) => {
      transport.push({
        type: 'batch_end',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          batchId: ctx.batchId,
          stepId: ctx.stepId,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          totalItems: ctx.totalItems,
          successfulItems: ctx.successfulItems,
          failedItems: ctx.failedItems,
          results: ctx.results,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    // Provider hooks
    onProviderRequest: (ctx) => {
      transport.push({
        type: 'provider_request',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          timestamp: ctx.timestamp,
          provider: ctx.provider,
          model: ctx.model,
          input: ctx.input,
          schema: ctx.schema,
          httpMethod: ctx.httpMethod,
          httpUrl: ctx.httpUrl,
          attemptNumber: ctx.attemptNumber,
          maxAttempts: ctx.maxAttempts,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onProviderResponse: (ctx) => {
      transport.push({
        type: 'provider_response',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          timestamp: ctx.timestamp,
          startTime: ctx.startTime,
          duration: ctx.duration,
          provider: ctx.provider,
          model: ctx.model,
          modelUsed: ctx.modelUsed,
          output: ctx.output,
          usage: ctx.usage,
          cost: ctx.cost,
          httpStatusCode: ctx.httpStatusCode,
          httpMethod: ctx.httpMethod,
          httpUrl: ctx.httpUrl,
          responseId: ctx.responseId,
          finishReason: ctx.finishReason,
          attemptNumber: ctx.attemptNumber,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    onProviderRetry: (ctx) => {
      transport.push({
        type: 'provider_retry',
        data: {
          flowId: ctx.flowId,
          executionId: ctx.executionId,
          stepId: ctx.stepId,
          timestamp: ctx.timestamp,
          provider: ctx.provider,
          model: ctx.model,
          error: { message: ctx.error.message, name: ctx.error.name },
          errorCode: ctx.errorCode,
          attemptNumber: ctx.attemptNumber,
          maxAttempts: ctx.maxAttempts,
          nextRetryDelay: ctx.nextRetryDelay,
          partialUsage: ctx.partialUsage,
          metadata: ctx.metadata,
          traceContext: ctx.traceContext,
        },
      });
    },

    // Extended interface
    flush: () => transport.flush(),
    getPendingCount: () => transport.getPendingCount(),
    close: () => transport.close(),
  };

  return config;
}

/**
 * Extended ObservabilityConfig with cloud transport methods
 */
export interface CloudObservabilityTransport {
  // Standard ObservabilityConfig hooks
  enabled?: boolean;
  samplingRate?: number;
  asyncHooks?: boolean;
  fireAndForget?: boolean;

  onFlowStart?: (ctx: import('@doclo/core/observability').FlowStartContext) => void | Promise<void>;
  onFlowEnd?: (ctx: import('@doclo/core/observability').FlowEndContext) => void | Promise<void>;
  onFlowError?: (ctx: import('@doclo/core/observability').FlowErrorContext) => void | Promise<void>;
  onStepStart?: (ctx: import('@doclo/core/observability').StepStartContext) => void | Promise<void>;
  onStepEnd?: (ctx: import('@doclo/core/observability').StepEndContext) => void | Promise<void>;
  onStepError?: (ctx: import('@doclo/core/observability').StepErrorContext) => void | Promise<void>;
  onConsensusStart?: (ctx: import('@doclo/core/observability').ConsensusStartContext) => void | Promise<void>;
  onConsensusRunComplete?: (ctx: import('@doclo/core/observability').ConsensusRunContext) => void | Promise<void>;
  onConsensusComplete?: (ctx: import('@doclo/core/observability').ConsensusCompleteContext) => void | Promise<void>;
  onBatchStart?: (ctx: import('@doclo/core/observability').BatchStartContext) => void | Promise<void>;
  onBatchItemEnd?: (ctx: import('@doclo/core/observability').BatchItemEndContext) => void | Promise<void>;
  onBatchEnd?: (ctx: import('@doclo/core/observability').BatchEndContext) => void | Promise<void>;
  onProviderRequest?: (ctx: import('@doclo/core/observability').ProviderRequestContext) => void | Promise<void>;
  onProviderResponse?: (ctx: import('@doclo/core/observability').ProviderResponseContext) => void | Promise<void>;
  onProviderRetry?: (ctx: import('@doclo/core/observability').ProviderRetryContext) => void | Promise<void>;

  // Cloud transport methods
  flush(): Promise<void>;
  getPendingCount(): number;
  close(): Promise<void>;
}
