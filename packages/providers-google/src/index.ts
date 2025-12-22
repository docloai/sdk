// Re-export provider from the main package
// This ensures users get the latest, feature-complete implementation
export { GoogleProvider } from '@doclo/providers-llm';

// Re-export commonly used types for convenience
export type {
  ProviderConfig,
  LLMResponse,
  MultimodalInput,
  UnifiedSchema,
  ReasoningConfig,
  LLMDerivedOptions
} from '@doclo/providers-llm';
