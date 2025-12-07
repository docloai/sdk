/**
 * TypeScript utility types for auto-injected prompt variables
 *
 * These types document which variables are automatically injected by each node type,
 * helping users understand what's available in their prompt templates.
 */

/**
 * Variables auto-injected by the Extract node
 */
export interface ExtractAutoVariables {
  /**
   * The JSON schema for extraction, from config.schema
   */
  schema: object;

  /**
   * The document text extracted from DocumentIR or FlowInput
   */
  documentText: string;

  /**
   * Schema title from schema.title or default value
   * Default: "the provided schema"
   */
  schemaTitle: string;

  /**
   * Schema description from schema.description or empty string
   */
  schemaDescription: string;

  /**
   * Generated formatting instructions for markdown/html output
   * Only present when using structured formats
   */
  structuredFormat?: string;
}

/**
 * Variables auto-injected by the Categorize node
 */
export interface CategorizeAutoVariables {
  /**
   * Array of available categories from config.categories
   */
  categories: string[];

  /**
   * The document text extracted from DocumentIR or FlowInput
   */
  documentText: string;
}

/**
 * Variables auto-injected by the Parse node
 */
export interface ParseAutoVariables {
  /**
   * Output format from config.format
   * Default: 'text'
   */
  format: 'text' | 'markdown' | 'html';

  /**
   * Schema for structured parsing, if provided in config
   */
  schema?: object;

  /**
   * Whether to describe figures/charts/diagrams from config.describeFigures
   * Default: false
   */
  describeFigures: boolean;

  /**
   * Whether citation tracking is enabled from config.citations?.enabled
   */
  citationsEnabled: boolean | undefined;
}

/**
 * Union type of all auto-injected variables across all node types
 */
export type AllAutoVariables = ExtractAutoVariables | CategorizeAutoVariables | ParseAutoVariables;

/**
 * Utility type to get the auto-injected variables for a specific node type
 */
export type AutoVariablesForNode<T extends 'extract' | 'categorize' | 'parse'> =
  T extends 'extract' ? ExtractAutoVariables :
  T extends 'categorize' ? CategorizeAutoVariables :
  T extends 'parse' ? ParseAutoVariables :
  never;

/**
 * Helper type for custom promptVariables that combines auto-injected vars with user vars
 */
export type PromptVariables<
  TNodeType extends 'extract' | 'categorize' | 'parse',
  TCustomVars extends Record<string, any> = {}
> = AutoVariablesForNode<TNodeType> & TCustomVars;
