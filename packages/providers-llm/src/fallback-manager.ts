import type {
  FallbackConfig,
  LLMProvider,
  MultimodalInput,
  UnifiedSchema,
  LLMResponse,
  CircuitBreakerState,
  JsonMode,
  ProviderConfig,
  ReasoningConfig
} from "./types";
import { createProviderFromRegistry } from "./provider-registry";
import type {
  ObservabilityConfig,
  ProviderRequestContext,
  ProviderResponseContext,
  ProviderRetryContext,
  CircuitBreakerContext,
  TraceContext,
} from "@doclo/core/observability";
import {
  executeHook,
  generateSpanId,
  createLogger,
} from "@doclo/core/observability";

export class FallbackManager {
  private config: FallbackConfig;
  private circuitBreakers: Map<string, CircuitBreakerState>;

  constructor(config: FallbackConfig) {
    this.config = config;
    this.circuitBreakers = new Map();
  }

  async executeWithFallback<T>(
    input: MultimodalInput,
    schema: UnifiedSchema<T>,
    max_tokens?: number,
    reasoning?: ReasoningConfig,
    mode?: JsonMode,
    observability?: {
      config?: ObservabilityConfig;
      flowId?: string;
      executionId?: string;
      stepId?: string;
      traceContext?: TraceContext;
      metadata?: Record<string, unknown>;
    }
  ): Promise<LLMResponse<T>> {
    const errors: Array<{ provider: string; error: Error }> = [];

    // Create logger for this execution
    const logger = createLogger({
      observability: observability?.config,
      flowId: observability?.flowId,
      executionId: observability?.executionId,
      stepId: observability?.stepId,
      traceContext: observability?.traceContext,
      metadata: observability?.metadata,
    });

    for (const [providerIndex, providerConfig] of this.config.providers.entries()) {
      const providerKey = `${providerConfig.provider}:${providerConfig.model}`;

      // Check circuit breaker
      if (this.isCircuitOpen(providerKey)) {
        logger.warn(`Circuit breaker open for ${providerKey}, skipping`);

        // onCircuitBreakerTriggered hook
        if (observability?.config && observability.traceContext && observability.executionId) {
          const cbState = this.circuitBreakers.get(providerKey);
          const circuitBreakerContext: CircuitBreakerContext = {
            flowId: observability.flowId ?? 'flow',
            executionId: observability.executionId,
            timestamp: Date.now(),
            provider: providerConfig.provider,
            model: providerConfig.model,
            failureCount: cbState?.consecutiveFailures ?? 0,
            threshold: this.config.circuitBreakerThreshold ?? 5,
            cooldownMs: 60000, // Default cooldown
            metadata: observability.metadata,
            traceContext: observability.traceContext,
          };
          await executeHook(observability.config.onCircuitBreakerTriggered, {
            hookName: 'onCircuitBreakerTriggered',
            config: observability.config,
            context: circuitBreakerContext,
          });
        }

        continue;
      }

      // Create provider instance
      const provider = this.createProvider(providerConfig);

      // Primary (index 0) uses primaryMaxRetries, fallbacks use maxRetries
      const maxRetriesForProvider = providerIndex === 0
        ? (this.config.primaryMaxRetries ?? this.config.maxRetries)
        : this.config.maxRetries;

      // Try with retries
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= maxRetriesForProvider; attempt++) {
        try {
          logger.info(`Attempting ${providerKey} (attempt ${attempt}/${maxRetriesForProvider})`);

          const requestStartTime = Date.now();

          // onProviderRequest hook
          if (observability?.config && observability.traceContext && observability.executionId) {
            const providerRequestContext: ProviderRequestContext = {
              flowId: observability.flowId ?? 'flow',
              executionId: observability.executionId,
              stepId: observability.stepId,
              timestamp: requestStartTime,
              provider: providerConfig.provider,
              model: providerConfig.model,
              input: input,
              schema: schema,
              attemptNumber: attempt,
              maxAttempts: maxRetriesForProvider,
              metadata: observability.metadata,
              traceContext: observability.traceContext,
            };
            await executeHook(observability.config.onProviderRequest, {
              hookName: 'onProviderRequest',
              config: observability.config,
              context: providerRequestContext,
            });
          }

          const response = await provider.completeJson({ input, schema, max_tokens, reasoning, mode });

          // Success! Validate and return
          if (this.validateResponse(response)) {
            this.recordSuccess(providerKey);

            // onProviderResponse hook
            if (observability?.config && observability.traceContext && observability.executionId) {
              const providerResponseContext: ProviderResponseContext = {
                flowId: observability.flowId ?? 'flow',
                executionId: observability.executionId,
                stepId: observability.stepId,
                timestamp: Date.now(),
                startTime: requestStartTime,
                duration: Date.now() - requestStartTime,
                provider: providerConfig.provider,
                model: providerConfig.model,
                modelUsed: response.metrics.model,
                output: response.json,
                usage: {
                  inputTokens: response.metrics.inputTokens ?? 0,
                  outputTokens: response.metrics.outputTokens ?? 0,
                  totalTokens: (response.metrics.inputTokens ?? 0) + (response.metrics.outputTokens ?? 0),
                  cacheCreationInputTokens: response.metrics.cacheCreationInputTokens,
                  cacheReadInputTokens: response.metrics.cacheReadInputTokens,
                },
                cost: response.metrics.costUSD ?? 0,
                finishReason: response.metrics.finishReason,
                attemptNumber: attempt,
                metadata: observability.metadata,
                traceContext: observability.traceContext,
              };
              await executeHook(observability.config.onProviderResponse, {
                hookName: 'onProviderResponse',
                config: observability.config,
                context: providerResponseContext,
              });
            }

            return {
              ...response,
              metrics: {
                ...response.metrics,
                attemptNumber: attempt
              }
            };
          } else {
            throw new Error("Response validation failed: incomplete or invalid data");
          }
        } catch (error) {
          lastError = error as Error;
          logger.error(`${providerKey} attempt ${attempt} failed`, lastError, { providerKey, attempt });

          // Check if retryable
          if (!this.isRetryable(lastError) || attempt === maxRetriesForProvider) {
            break;
          }

          const retryDelay = this.calculateDelay(attempt);

          // onProviderRetry hook
          if (observability?.config && observability.traceContext && observability.executionId) {
            const providerRetryContext: ProviderRetryContext = {
              flowId: observability.flowId ?? 'flow',
              executionId: observability.executionId,
              stepId: observability.stepId,
              timestamp: Date.now(),
              provider: providerConfig.provider,
              model: providerConfig.model,
              attemptNumber: attempt,
              maxAttempts: maxRetriesForProvider,
              error: lastError,
              nextRetryDelay: retryDelay,
              metadata: observability.metadata,
              traceContext: observability.traceContext,
            };
            await executeHook(observability.config.onProviderRetry, {
              hookName: 'onProviderRetry',
              config: observability.config,
              context: providerRetryContext,
            });
          }

          // Wait before retry with exponential backoff + jitter
          await this.sleep(retryDelay);
        }
      }

      // All retries failed for this provider
      if (lastError) {
        errors.push({ provider: providerKey, error: lastError });
        this.recordFailure(providerKey);
      }
    }

    // All providers exhausted
    throw new Error(
      `All providers failed:\n${errors.map(e => `  ${e.provider}: ${e.error.message}`).join('\n')}`
    );
  }

  private createProvider(config: ProviderConfig): LLMProvider {
    return createProviderFromRegistry(config);
  }

  private validateResponse(response: LLMResponse): boolean {
    // Check if response has valid JSON
    if (!response.json || typeof response.json !== 'object') {
      return false;
    }

    // Empty objects are valid - the schema determines if they're acceptable
    // Models may return {} when no data matches the extraction criteria
    return true;
  }

  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Retryable status codes
    const retryablePatterns = [
      '408', '429', '500', '502', '503', '504',
      'timeout', 'rate limit', 'overloaded'
    ];

    return retryablePatterns.some(pattern =>
      message.includes(pattern)
    );
  }

  private calculateDelay(attempt: number): number {
    if (!this.config.useExponentialBackoff) {
      return this.config.retryDelay;
    }

    // Exponential backoff: baseDelay * (2 ^ attempt) + jitter
    const exponentialDelay = this.config.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;  // 0-1000ms jitter
    return Math.min(exponentialDelay + jitter, 30000);  // Max 30s
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Circuit breaker logic
  private isCircuitOpen(providerKey: string): boolean {
    const state = this.circuitBreakers.get(providerKey);
    if (!state || !state.isOpen) return false;

    // Check if enough time has passed to try again (30 seconds)
    if (state.lastFailureTime && Date.now() - state.lastFailureTime > 30000) {
      this.circuitBreakers.set(providerKey, {
        consecutiveFailures: 0,
        isOpen: false
      });
      return false;
    }

    return true;
  }

  private recordSuccess(providerKey: string): void {
    this.circuitBreakers.set(providerKey, {
      consecutiveFailures: 0,
      isOpen: false
    });
  }

  private recordFailure(providerKey: string): void {
    const state = this.circuitBreakers.get(providerKey) || {
      consecutiveFailures: 0,
      isOpen: false
    };

    state.consecutiveFailures++;
    state.lastFailureTime = Date.now();

    // Open circuit if threshold reached
    const threshold = this.config.circuitBreakerThreshold || 3;
    if (state.consecutiveFailures >= threshold) {
      state.isOpen = true;
      // Use console.warn here as we don't have observability context in this method
      console.warn(`Circuit breaker opened for ${providerKey} after ${state.consecutiveFailures} failures`);
    }

    this.circuitBreakers.set(providerKey, state);
  }
}
