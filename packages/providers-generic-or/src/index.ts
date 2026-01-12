export { GenericORProvider } from './generic-or.js';
export {
  getModelInfo,
  modelSupportsVision,
  modelSupportsReasoning,
  KNOWN_MODEL_PREFIXES,
  DEFAULT_MODEL_INFO,
  type KnownModelInfo
} from './known-models.js';

import { GenericORProvider } from './generic-or.js';
import { registerProvider } from '@doclo/providers-llm';

// Auto-register the provider when this package is imported
registerProvider('generic-or', (config) => new GenericORProvider(config));
