// Re-export provider from the main package
// This ensures users get the latest, feature-complete implementation
export { AnthropicProvider } from '@doclo/providers-llm';

// Re-export commonly used types for convenience
export type {
  ProviderConfig,
  LLMResponse,
  MultimodalInput,
  UnifiedSchema,
  ReasoningConfig,
  LLMDerivedOptions,
  CachingConfig,
  ResponseMetrics
} from '@doclo/providers-llm';

// Re-export caching utilities
export { calculateCacheSavings } from '@doclo/providers-llm';
