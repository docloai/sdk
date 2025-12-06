/**
 * @docloai/prompts
 *
 * Prompt assets with versioning and multimodal support
 */

// Export types
export type {
  PromptAsset,
  PromptMessage,
  PromptContent,
  ImageVariable,
  PromptVariable,
  RenderedPrompt,
  RenderedMessage,
  RenderedContent,
  SchemaRef
} from './types.js';

export {
  parseVersionRef,
  createVersionRef
} from './types.js';

// Export registry
export {
  PromptRegistry,
  PROMPT_REGISTRY,
  registerPrompt,
  getPrompt,
  getPromptByRef,
  getLatestPrompt
} from './prompt-registry.js';

// Export renderer
export type {
  RenderOptions
} from './prompt-renderer.js';

export {
  PromptRenderer,
  PROMPT_RENDERER,
  renderPrompt,
  setSchemaFormatter
} from './prompt-renderer.js';

// Auto-register default prompts
import './default-prompts.js';
