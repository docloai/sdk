export { XAIProvider } from './xai';
import { XAIProvider } from './xai';
import { registerProvider } from '@docloai/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('xai', (config) => new XAIProvider(config));
