/**
 * Prompt Asset Types
 *
 * These types define the structure of prompts as first-class assets
 * with versioning, multimodal support, and variable substitution.
 */

/**
 * A prompt asset with versioning and multimodal support
 */
export type PromptAsset = {
  // Identity
  id: string;              // "invoice-extraction"
  version: string;         // "1.2.0" (semver)
  type?: 'extraction' | 'parse' | 'categorize' | 'custom';  // Optional: advisory only, not enforced
  status?: 'active' | 'draft' | 'archived';  // Lifecycle status (default: 'active')

  // Content - EITHER messages (template-based) OR sections (template-free)
  messages?: PromptMessage[];       // Template-based format (classic)
  sections?: PromptSections;        // Template-free format (new)

  // Variables that can be injected into template
  variables?: Record<string, PromptVariable>;

  // Auto-inject specification (explicit list of auto-injected variables)
  // This makes it clear which variables are provided by the SDK
  autoInject?: string[];

  // Metadata
  description?: string;
  tags?: string[];
  changelog?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
};

/**
 * Template-free prompt sections
 * Allows creating prompts without template syntax
 */
export type PromptSections = {
  /** System-level instructions (e.g., "You are an expert extractor") */
  system?: string;

  /** Context that varies per execution (auto-injected, e.g., schema, categories) */
  context?: string;

  /** User's custom instructions (e.g., "Focus on numerical precision") */
  instructions?: string;

  /** Examples section (few-shot learning) */
  examples?: string;

  /** Additional notes or constraints */
  notes?: string;
};

/**
 * A single message in a prompt (supports multimodal content)
 */
export type PromptMessage = {
  role: 'system' | 'user' | 'assistant';
  content: PromptContent[];
};

/**
 * Content within a message (text or image)
 */
export type PromptContent =
  | { type: 'text'; text: string }                           // Template string with {{variables}}
  | { type: 'image'; source: string | ImageVariable };       // URL, base64, or variable reference

/**
 * Reference to an image variable
 */
export type ImageVariable = {
  variable: string;  // Reference to a variable name
};

/**
 * Variable definition in a prompt
 */
export type PromptVariable = {
  type: 'string' | 'number' | 'image' | 'schema' | 'object';
  description?: string;
  required?: boolean;
  default?: any;

  /**
   * How this variable is populated:
   * - 'auto': Auto-injected by the SDK from node config
   * - 'user': Provided by user in promptVariables
   * - 'computed': Computed at runtime from document/context
   */
  source?: 'auto' | 'user' | 'computed';

  /**
   * Whether users can override this variable.
   * Reserved variables (like schema, categories) cannot be overridden.
   * Default: true
   */
  overridable?: boolean;
};

/**
 * Rendered prompt ready for LLM/VLM consumption
 */
export type RenderedPrompt = {
  messages: RenderedMessage[];
};

/**
 * A rendered message with resolved variables
 */
export type RenderedMessage = {
  role: 'system' | 'user' | 'assistant';
  content: RenderedContent[];
};

/**
 * Rendered content (OpenAI/Anthropic format)
 */
export type RenderedContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };  // OpenAI format

/**
 * Schema reference format for node configs
 */
export type SchemaRef = {
  ref: string;  // "schema-id@version" format
};

/**
 * Parse a version reference string into ID and version
 * Format: "id@version" (e.g., "invoice-extraction@1.2.0")
 */
export function parseVersionRef(ref: string): { id: string; version: string } {
  const atIndex = ref.lastIndexOf('@');
  if (atIndex === -1) {
    throw new Error(`Invalid version reference format: "${ref}". Expected format: "id@version"`);
  }

  const id = ref.substring(0, atIndex);
  const version = ref.substring(atIndex + 1);

  if (!id || !version) {
    throw new Error(`Invalid version reference format: "${ref}". Expected format: "id@version"`);
  }

  return { id, version };
}

/**
 * Create a version reference string from ID and version
 */
export function createVersionRef(id: string, version: string): string {
  return `${id}@${version}`;
}
