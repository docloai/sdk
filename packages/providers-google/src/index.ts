export { GoogleProvider } from './google';
import { GoogleProvider } from './google';
import { registerProvider } from '@doclo/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('google', (config) => new GoogleProvider(config));
