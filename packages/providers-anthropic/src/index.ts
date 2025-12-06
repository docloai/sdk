export { AnthropicProvider } from './anthropic';
import { AnthropicProvider } from './anthropic';
import { registerProvider } from '@docloai/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('anthropic', (config) => new AnthropicProvider(config));
