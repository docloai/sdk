export { AnthropicProvider } from './anthropic';
import { AnthropicProvider } from './anthropic';
import { registerProvider } from '@doclo/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('anthropic', (config) => new AnthropicProvider(config));
