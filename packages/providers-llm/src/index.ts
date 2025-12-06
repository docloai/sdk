// Export types
export * from "./types";

// Export schema translator
export { SchemaTranslator } from "./schema-translator";

// Export schema prompt formatter
export { buildSchemaPromptSection, formatSchemaForPrompt, combineSchemaAndUserPrompt } from "./schema-prompt-formatter";

// Export provider registry
export { providerRegistry, registerProvider, createProviderFromRegistry } from "./provider-registry";
export type { ProviderFactory } from "./provider-registry";

// Export providers (backward compatibility - still export from local files)
// These will be deprecated in favor of importing from individual provider packages
export { OpenAIProvider } from "./providers/openai";
export { AnthropicProvider } from "./providers/anthropic";
export { GoogleProvider } from "./providers/google";
export { XAIProvider } from "./providers/xai";

// Export fallback manager
export { FallbackManager } from "./fallback-manager";

// Export adapter
export { adaptToCoreLLMProvider } from "./adapter";

// Factory functions
import type { VLMProvider as CoreVLMProvider } from "@docloai/core";
import type { ObservabilityConfig, TraceContext } from "@docloai/core/observability";
import type { FallbackConfig, LLMProvider, MultimodalInput, ProviderConfig, AccessMethod, ReasoningConfig } from "./types";
import { FallbackManager } from "./fallback-manager";
import { createProviderFromRegistry, providerRegistry } from "./provider-registry";
import { adaptToCoreLLMProvider } from "./adapter";

// Register built-in providers for backward compatibility
// Users can also import individual provider packages to register them
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleProvider } from "./providers/google";
import { XAIProvider } from "./providers/xai";

// Auto-register providers if not already registered
if (!providerRegistry.has('openai')) {
  providerRegistry.register('openai', (config) => new OpenAIProvider(config));
}
if (!providerRegistry.has('anthropic')) {
  providerRegistry.register('anthropic', (config) => new AnthropicProvider(config));
}
if (!providerRegistry.has('google')) {
  providerRegistry.register('google', (config) => new GoogleProvider(config));
}
if (!providerRegistry.has('xai')) {
  providerRegistry.register('xai', (config) => new XAIProvider(config));
}

/**
 * Create a single VLM provider with direct instantiation (no retry/fallback logic).
 *
 * Use this for:
 * - Simple scripts and quick prototypes
 * - Testing individual provider behavior
 * - Benchmarking (no retry overhead)
 * - Cases where you want immediate failures without retry logic
 *
 * For production applications requiring resilience, use `buildLLMProvider()` instead.
 *
 * @example
 * ```typescript
 * const provider = createVLMProvider({
 *   provider: 'google',
 *   model: 'gemini-2.5-flash-preview-09-2025',
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   via: 'openrouter'
 * });
 * ```
 *
 * @param config - Provider configuration
 * @returns CoreVLMProvider instance (no retry/fallback wrapper)
 */
export function createVLMProvider(config: {
  provider: 'openai' | 'anthropic' | 'google' | 'xai' | 'x-ai';
  model: string;
  apiKey: string;
  via?: 'openrouter';
  baseUrl?: string;
}): CoreVLMProvider {
  let internalProvider: LLMProvider;

  // Build proper ProviderConfig with explicit typing
  const providerConfig: ProviderConfig = {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    via: config.via as AccessMethod | undefined,
    baseUrl: config.baseUrl
  };

  // Use registry to create provider (allows external provider packages to register)
  internalProvider = createProviderFromRegistry(providerConfig);

  // Adapt to core VLMProvider interface
  return {
    name: internalProvider.name,
    capabilities: {
      supportsImages: true,
      supportsPDFs: internalProvider.capabilities.supportsPDFs,
      maxPDFPages: internalProvider.capabilities.maxPDFPages
    },
    async completeJson(input: {
      prompt: string | import("@docloai/core").MultimodalInput;
      schema: object;
      max_tokens?: number;
      reasoning?: import("./types").ReasoningConfig;
    }) {
      // Convert input to internal MultimodalInput format
      let multimodalInput: MultimodalInput;

      if (typeof input.prompt === 'string') {
        multimodalInput = { text: input.prompt };
      } else {
        multimodalInput = input.prompt as any;
      }

      // Call internal provider with reasoning parameters
      const response = await internalProvider.completeJson({
        input: multimodalInput,
        schema: input.schema as any,
        max_tokens: input.max_tokens,
        reasoning: input.reasoning
      });

      // Return in core format
      return {
        json: response.json,
        rawText: response.rawText,
        costUSD: response.metrics.costUSD,
        inputTokens: response.metrics.inputTokens,
        outputTokens: response.metrics.outputTokens
      };
    }
  };
}

/**
 * Build a production-ready LLM provider with retry logic, fallback support, and circuit breakers.
 *
 * Features:
 * - **Retry Logic**: Configurable retries with exponential backoff for transient failures
 * - **Fallback Chain**: Automatically tries next provider if current one fails
 * - **Circuit Breaker**: Temporarily skips providers with repeated failures
 * - **Observability**: Full integration with observability hooks for monitoring
 * - **Mode Support**: Supports both strict and relaxed JSON modes
 *
 * Works with single OR multiple providers:
 * - Single provider: Gets retry logic and circuit breaker protection
 * - Multiple providers: Adds fallback to alternative providers
 *
 * Use this for:
 * - Production applications requiring high availability
 * - Cases where you need retry logic even with a single provider
 * - Multi-provider fallback chains
 * - Advanced error handling and monitoring
 *
 * @example Single provider with retry
 * ```typescript
 * const provider = buildLLMProvider({
 *   providers: [{
 *     provider: 'google',
 *     model: 'gemini-2.5-flash-preview-09-2025',
 *     apiKey: process.env.OPENROUTER_API_KEY,
 *     via: 'openrouter'
 *   }],
 *   maxRetries: 2,
 *   retryDelay: 1000,
 *   useExponentialBackoff: true,
 *   circuitBreakerThreshold: 3
 * });
 * ```
 *
 * @example Multi-provider fallback
 * ```typescript
 * const provider = buildLLMProvider({
 *   providers: [
 *     { provider: 'google', model: 'gemini-2.5-flash', apiKey: key1 },
 *     { provider: 'openai', model: 'gpt-4.1', apiKey: key2 },
 *     { provider: 'anthropic', model: 'claude-haiku-4.5', apiKey: key3 }
 *   ],
 *   maxRetries: 2,
 *   retryDelay: 1000,
 *   useExponentialBackoff: true
 * });
 * ```
 *
 * @param config - Fallback configuration with providers array and retry settings
 * @returns CoreVLMProvider with retry/fallback capabilities (compatible with flow interface)
 */
export function buildLLMProvider(config: FallbackConfig): CoreVLMProvider {
  const manager = new FallbackManager(config);

  // Observability context storage
  let observabilityContext: {
    config?: ObservabilityConfig;
    flowId?: string;
    executionId?: string;
    stepId?: string;
    traceContext?: TraceContext;
    metadata?: Record<string, unknown>;
  } | undefined;

  // Return CoreVLMProvider interface (compatible with createVLMProvider)
  const coreProvider: CoreVLMProvider = {
    name: config.providers.map(p => `${p.provider}:${p.model}`).join(" -> "),
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      maxPDFPages: Math.min(...config.providers.map(_ => 100))
    },
    async completeJson(input: {
      prompt: string | import("@docloai/core").MultimodalInput;
      schema: object;
      max_tokens?: number;
      reasoning?: import("./types").ReasoningConfig;
    }) {
      // Convert input to internal MultimodalInput format (same as createVLMProvider)
      let multimodalInput: MultimodalInput;

      if (typeof input.prompt === 'string') {
        multimodalInput = { text: input.prompt };
      } else {
        multimodalInput = input.prompt as any;
      }

      // Call fallback manager with converted input
      const response = await manager.executeWithFallback(
        multimodalInput,
        input.schema as any,
        input.max_tokens,
        input.reasoning,
        undefined, // mode - defaults to strict when schema provided
        observabilityContext
      );

      // Return in core format
      return {
        json: response.json,
        rawText: response.rawText,
        costUSD: response.metrics.costUSD,
        inputTokens: response.metrics.inputTokens,
        outputTokens: response.metrics.outputTokens,
        cacheCreationInputTokens: response.metrics.cacheCreationInputTokens,
        cacheReadInputTokens: response.metrics.cacheReadInputTokens
      };
    }
  };

  // Attach observability context setter
  (coreProvider as any).__setObservabilityContext = (ctx: typeof observabilityContext) => {
    observabilityContext = ctx;
  };

  return coreProvider;
}

// Export comprehensive metadata (MIME types, capabilities, helpers)
export * from './metadata.js';
