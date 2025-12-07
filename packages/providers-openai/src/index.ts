export { OpenAIProvider } from './openai';
import { OpenAIProvider } from './openai';
import { registerProvider } from '@doclo/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('openai', (config) => new OpenAIProvider(config));
