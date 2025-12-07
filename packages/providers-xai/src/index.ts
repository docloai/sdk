export { XAIProvider } from './xai';
import { XAIProvider } from './xai';
import { registerProvider } from '@doclo/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('xai', (config) => new XAIProvider(config));
