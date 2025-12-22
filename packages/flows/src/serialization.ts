/**
 * Flow Serialization
 *
 * Provides serialization/deserialization for doclo-sdk flows.
 * Supports all flow types: sequential steps, conditional branches, and forEach loops.
 *
 * Limitations:
 * - Provider instances must be reconstructed at runtime
 */

import type { NodeDef, VLMProvider, OCRProvider, JSONSchemaNode, FlowContext, FlowInput } from "@doclo/core";
import { createFlow, type FlowOptions, type Flow, type BuiltFlow } from './flow-builder.js';
import { parse, extract, split, categorize, trigger, output } from '@doclo/nodes';
import { createConditionalCompositeNode, createForEachCompositeNode } from './composite-nodes.js';

/**
 * Union type for providers used in flow serialization
 */
type FlowProvider = VLMProvider | OCRProvider;

/**
 * JSON value type for literal field mappings
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNodeDef = NodeDef<any, any>;

/**
 * Serializable input validation configuration
 */
export type SerializableInputValidation = {
  /**
   * List of accepted MIME types.
   * If specified, input must match one of these types or validation fails.
   */
  acceptedFormats?: Array<
    | 'application/pdf'
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
  >;
  /**
   * Whether to throw on validation failure.
   * @default true
   */
  throwOnInvalid?: boolean;
};

/**
 * Serializable flow definition
 */
export type SerializableFlow = {
  version: string;
  steps: SerializableStep[];
  /**
   * Optional input format validation configuration.
   * Allows specifying accepted MIME types for early validation.
   */
  inputValidation?: SerializableInputValidation;
};

/**
 * Serializable step definition
 */
export type SerializableStep =
  | SerializableStandardStep
  | SerializableConditionalStep
  | SerializableForEachStep;

/**
 * Standard sequential step
 */
export type SerializableStandardStep = {
  type: 'step';
  id: string;
  name?: string;
  nodeType: 'parse' | 'extract' | 'split' | 'categorize' | 'trigger' | 'output';
  config: NodeConfig;
};

/**
 * Flow reference (alternative to inline SerializableFlow)
 * Used to reduce JSON nesting depth for complex flows
 */
export type FlowReference = {
  flowRef: string;
};

/**
 * Conditional step (categorize + branches)
 *
 * Branches can be either inline flows or references to separate flows.
 * Use references to avoid hitting database JSON nesting limits (e.g., Convex's 16-level limit).
 */
export type SerializableConditionalStep = {
  type: 'conditional';
  id: string;
  name?: string;
  nodeType: 'categorize';
  config: CategorizeConfig;
  branches: Record<string, SerializableFlow | FlowReference>;
};

/**
 * ForEach step (split + item flow)
 *
 * itemFlow can be either an inline flow or a reference to a separate flow.
 * Use references to avoid hitting database JSON nesting limits.
 */
export type SerializableForEachStep = {
  type: 'forEach';
  id: string;
  name?: string;
  nodeType: 'split';
  config: SplitConfig;
  itemFlow: SerializableFlow | FlowReference;
};

/**
 * Input mapping configuration for trigger nodes
 * Declarative alternatives to mapInput functions (for serialization)
 */
export type InputMappingConfig =
  | { type: 'passthrough' }                    // Use input as-is (default)
  | { type: 'unwrap' }                         // Unwrap { input: X } → X
  | { type: 'artifact'; path: string }         // Get from context.artifacts by path
  | { type: 'merge'; artifactPath: string }    // Merge input with artifact
  | { type: 'construct'; fields: Record<string, FieldMapping> };  // Build new object

export type FieldMapping =
  | { source: 'input'; path?: string }          // Get from input (optionally by path)
  | { source: 'artifact'; path: string }        // Get from artifacts by path
  | { source: 'literal'; value: JsonValue };    // Static value

/**
 * Node configuration (without provider instances)
 */
export type NodeConfig =
  | ParseConfig
  | ExtractConfig
  | SplitConfig
  | CategorizeConfig
  | TriggerConfig
  | OutputConfig;

export type ParseConfig = {
  type: 'parse';
  providerRef: string;
  consensus?: {
    runs: number;
    strategy?: 'majority' | 'unanimous';
    onTie?: 'random' | 'fail' | 'retry';
  };
  maxTokens?: number;
};

export type ExtractConfig = {
  type: 'extract';
  providerRef: string;
  schema: JSONSchemaNode;
  consensus?: {
    runs: number;
    strategy?: 'majority' | 'unanimous';
    onTie?: 'random' | 'fail' | 'retry';
  };
  reasoning?: {
    enabled?: boolean;
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
  };
  maxTokens?: number;
};

export type SplitConfig = {
  type: 'split';
  providerRef: string;
  /**
   * Simple category definitions (recommended).
   * Each category can be a string or an object with name and optional description.
   */
  categories?: (string | { name: string; description?: string })[];
  /**
   * @deprecated Use `categories` instead. Full schema definitions for backwards compatibility.
   */
  schemas?: Record<string, JSONSchemaNode>;
  includeOther?: boolean;
  consensus?: {
    runs: number;
    strategy?: 'majority' | 'unanimous';
    onTie?: 'random' | 'fail' | 'retry';
  };
  schemaRef?: string;  // Reference to schema asset (e.g., "document-split@2.0.0")
  maxTokens?: number;
};

export type CategorizeConfig = {
  type: 'categorize';
  providerRef: string;
  categories: string[];
  consensus?: {
    runs: number;
    strategy?: 'majority' | 'unanimous';
    onTie?: 'random' | 'fail' | 'retry';
  };
  promptRef?: string;  // Reference to prompt asset (e.g., "default-categorize@1.0.0")
  maxTokens?: number;
};

export type TriggerConfig = {
  type: 'trigger';
  flowRef: string;                             // Reference to registered flow
  providerOverrides?: Record<string, string>;  // Map child provider refs to parent refs
  inputMapping?: InputMappingConfig;           // Declarative input transformation
  mergeMetrics?: boolean;                      // Merge child metrics (default: true)
  timeout?: number;                            // Timeout in milliseconds
};

export type OutputConfig = {
  type: 'output';
  name?: string;                               // Output name (for multi-output flows)
  source?: string | string[];                  // Source step ID(s) to pull from
  transform?: 'first' | 'last' | 'merge' | 'pick';  // Transformation strategy (custom not serializable)
  fields?: string[];                           // Fields to pick (when transform: 'pick')
};

/**
 * Provider registry for deserialization
 */
export type ProviderRegistry = Record<string, FlowProvider>;

/**
 * Extract node metadata from a node (if available)
 * Note: This is a best-effort extraction since nodes don't currently
 * expose their config. Returns null for nodes without metadata.
 */
export function extractNodeMetadata(node: NodeDef<unknown, unknown>): { nodeType: string; config: NodeConfig } | null {
  // Nodes created with the @doclo/nodes functions don't expose config
  // This is a limitation of the current architecture
  // For now, we return null and require manual config specification
  return null;
}

/**
 * Validation error for flow serialization
 */
export class FlowSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowSerializationError';
  }
}

/**
 * Flow registry type
 * Maps flow IDs to SerializableFlow objects (from database/Convex)
 */
export type FlowRegistry = Record<string, SerializableFlow>;

/**
 * Type guard to check if a value is a FlowReference
 */
export function isFlowReference(value: SerializableFlow | FlowReference): value is FlowReference {
  return typeof value === 'object' && value !== null && 'flowRef' in value && typeof value.flowRef === 'string';
}

/**
 * Resolve a flow reference to a SerializableFlow
 *
 * @param flowOrRef - Either an inline flow or a flow reference
 * @param flows - Flow registry to resolve references from
 * @returns SerializableFlow
 * @throws FlowSerializationError if reference cannot be resolved
 */
export function resolveFlowReference(
  flowOrRef: SerializableFlow | FlowReference,
  flows?: FlowRegistry
): SerializableFlow {
  if (isFlowReference(flowOrRef)) {
    if (!flows) {
      throw new FlowSerializationError(
        `Flow reference "${flowOrRef.flowRef}" found but no flow registry provided`
      );
    }

    const resolvedFlow = flows[flowOrRef.flowRef];
    if (!resolvedFlow) {
      throw new FlowSerializationError(
        `Flow reference "${flowOrRef.flowRef}" not found in registry. Available flows: ${Object.keys(flows).join(', ')}`
      );
    }

    return resolvedFlow;
  }

  return flowOrRef;
}

/**
 * Build a flow from a serializable definition
 *
 * @param flowDef - Serializable flow definition
 * @param providers - Provider registry (map of provider refs to provider instances)
 * @param flows - Optional flow registry for:
 *   - Trigger nodes (map of flow refs to flow builders)
 *   - Conditional branches (when using flowRef instead of inline SerializableFlow)
 *   - ForEach itemFlow (when using flowRef instead of inline SerializableFlow)
 * @returns Executable flow
 *
 * @example
 * ```typescript
 * const flowDef: SerializableFlow = {
 *   version: '1.0.0',
 *   steps: [
 *     {
 *       type: 'step',
 *       id: 'parse',
 *       nodeType: 'parse',
 *       config: { type: 'parse', providerRef: 'ocr' }
 *     },
 *     {
 *       type: 'step',
 *       id: 'extract',
 *       nodeType: 'extract',
 *       config: {
 *         type: 'extract',
 *         providerRef: 'llm',
 *         schema: { ... }
 *       }
 *     }
 *   ]
 * };
 *
 * const providers = {
 *   ocr: suryaProvider,
 *   llm: geminiProvider
 * };
 *
 * const flow = buildFlowFromConfig(flowDef, providers);
 * ```
 */
export function buildFlowFromConfig(
  flowDef: SerializableFlow,
  providers: ProviderRegistry,
  flows?: FlowRegistry,
  options?: FlowOptions
): BuiltFlow<FlowInput, unknown> {
  // Validate version
  if (flowDef.version !== '1.0.0') {
    throw new FlowSerializationError(`Unsupported flow version: ${flowDef.version}`);
  }

  // Merge inputValidation from flowDef with options (flowDef takes precedence)
  const mergedOptions: FlowOptions = {
    ...options,
    inputValidation: flowDef.inputValidation ?? options?.inputValidation
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flow: Flow<any, any> = createFlow(mergedOptions);

  for (const step of flowDef.steps) {
    if (step.type === 'step') {
      // Standard sequential step
      const node = createNodeFromConfig(step.nodeType, step.config, providers, flows);
      flow = flow.step(step.id, node, step.name);

    } else if (step.type === 'conditional') {
      // Create composite node that handles categorize + branch execution
      const node = createConditionalCompositeNode({
        stepId: step.id,
        categorizeConfig: step.config,
        branches: step.branches,
        providers,
        flows: flows || {}
      });
      flow = flow.step(step.id, node, step.name);

    } else if (step.type === 'forEach') {
      // Create composite node that handles split + forEach execution
      const node = createForEachCompositeNode({
        stepId: step.id,
        splitConfig: step.config,
        itemFlow: step.itemFlow,
        providers,
        flows: flows || {}
      });
      flow = flow.step(step.id, node, step.name);

    } else {
      // Exhaustive check - this should be unreachable
      const exhaustiveCheck: never = step;
      throw new FlowSerializationError(`Unknown step type: ${(exhaustiveCheck as SerializableStep).type}`);
    }
  }

  return flow.build();
}

/**
 * Helper to safely traverse a nested object by path
 */
function getByPath(obj: unknown, path: string[]): unknown {
  return path.reduce((current: unknown, key: string) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Create an input mapper function from declarative config
 * Uses 'any' for input/context to match the expected function signature in trigger nodes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createInputMapper(mappingConfig: InputMappingConfig): (input: any, context: FlowContext) => unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (input: any, context: FlowContext) => {
    switch (mappingConfig.type) {
      case 'passthrough':
        return input;

      case 'unwrap':
        if (input && typeof input === 'object' && 'input' in input) {
          return (input as Record<string, unknown>).input;
        }
        return input;

      case 'artifact': {
        const pathParts = mappingConfig.path.split('.');
        return getByPath(context.artifacts, pathParts);
      }

      case 'merge': {
        const pathParts = mappingConfig.artifactPath.split('.');
        const artifactValue = getByPath(context.artifacts, pathParts);
        if (typeof input === 'object' && input !== null && typeof artifactValue === 'object' && artifactValue !== null) {
          return { ...input, ...artifactValue };
        }
        return input;
      }

      case 'construct': {
        const result: Record<string, unknown> = {};
        for (const [fieldName, fieldMapping] of Object.entries(mappingConfig.fields)) {
          switch (fieldMapping.source) {
            case 'input':
              if (fieldMapping.path) {
                const pathParts = fieldMapping.path.split('.');
                result[fieldName] = getByPath(input, pathParts);
              } else {
                result[fieldName] = input;
              }
              break;

            case 'artifact': {
              const pathParts = fieldMapping.path.split('.');
              result[fieldName] = getByPath(context.artifacts, pathParts);
              break;
            }

            case 'literal':
              result[fieldName] = fieldMapping.value;
              break;
          }
        }
        return result;
      }

      default:
        return input;
    }
  };
}

/**
 * Type guard to check if config has providerRef
 */
function hasProviderRef(config: NodeConfig): config is NodeConfig & { providerRef: string } {
  return 'providerRef' in config && typeof config.providerRef === 'string';
}

/**
 * Helper to create a node from config
 */
function createNodeFromConfig(
  nodeType: string,
  config: NodeConfig,
  providers: ProviderRegistry,
  flows?: FlowRegistry
): AnyNodeDef {
  // For trigger nodes, flowRef is required instead of providerRef
  if (nodeType === 'trigger') {
    const cfg = config as TriggerConfig;

    if (!flows || !flows[cfg.flowRef]) {
      throw new FlowSerializationError(
        `Flow "${cfg.flowRef}" not found in flow registry. ` +
        `Available flows: ${flows ? Object.keys(flows).join(', ') : 'none'}`
      );
    }

    // Map provider overrides
    const overrideProviders: Record<string, FlowProvider> = {};
    if (cfg.providerOverrides) {
      for (const [childRef, parentRef] of Object.entries(cfg.providerOverrides)) {
        if (!providers[parentRef]) {
          throw new FlowSerializationError(
            `Provider "${parentRef}" not found in provider registry. ` +
            `Available providers: ${Object.keys(providers).join(', ')}`
          );
        }
        overrideProviders[childRef] = providers[parentRef];
      }
    }

    // Get flow builder from registry
    const flowBuilder = flows[cfg.flowRef];

    return trigger({
      flow: flowBuilder,
      flowId: cfg.flowRef,
      providers: Object.keys(overrideProviders).length > 0 ? overrideProviders : undefined,
      mapInput: cfg.inputMapping ? createInputMapper(cfg.inputMapping) : undefined,
      mergeMetrics: cfg.mergeMetrics,
      timeout: cfg.timeout
    });
  }

  // For output nodes, no provider is required (they pull from artifacts)
  if (nodeType === 'output') {
    const cfg = config as OutputConfig;
    return output({
      name: cfg.name,
      source: cfg.source,
      transform: cfg.transform,
      fields: cfg.fields
    });
  }

  // For other nodes, providerRef is required
  if (!hasProviderRef(config)) {
    throw new FlowSerializationError(
      `Config for node type "${nodeType}" is missing providerRef`
    );
  }

  const provider = providers[config.providerRef];
  if (!provider) {
    throw new FlowSerializationError(
      `Provider "${config.providerRef}" not found in registry. ` +
      `Available providers: ${Object.keys(providers).join(', ')}`
    );
  }

  switch (nodeType) {
    case 'parse': {
      const cfg = config as ParseConfig;
      // parse expects OCRProvider
      return parse({
        provider: provider as OCRProvider,
        consensus: cfg.consensus,
        maxTokens: cfg.maxTokens
      });
    }

    case 'extract': {
      const cfg = config as ExtractConfig;
      // extract expects VLMProvider
      return extract({
        provider: provider as VLMProvider,
        schema: cfg.schema,
        consensus: cfg.consensus,
        reasoning: cfg.reasoning,
        maxTokens: cfg.maxTokens
      });
    }

    case 'split': {
      const cfg = config as SplitConfig;
      // split expects VLMProvider
      return split({
        provider: provider as VLMProvider,
        // Support both categories (new) and schemas (legacy)
        ...(cfg.categories && { categories: cfg.categories }),
        ...(cfg.schemas && { schemas: cfg.schemas }),
        ...(cfg.schemaRef && { schemaRef: cfg.schemaRef }),
        includeOther: cfg.includeOther,
        consensus: cfg.consensus,
        maxTokens: cfg.maxTokens
      });
    }

    case 'categorize': {
      const cfg = config as CategorizeConfig;
      // categorize expects VLMProvider
      return categorize({
        provider: provider as VLMProvider,
        categories: cfg.categories,
        consensus: cfg.consensus,
        maxTokens: cfg.maxTokens
      });
    }

    default:
      throw new FlowSerializationError(`Unknown node type: ${nodeType}`);
  }
}

/**
 * Helper to create a serializable flow definition
 *
 * @example
 * ```typescript
 * const flowDef = defineFlowConfig({
 *   version: '1.0.0',
 *   steps: [
 *     {
 *       type: 'step',
 *       id: 'parse',
 *       nodeType: 'parse',
 *       config: { type: 'parse', providerRef: 'ocr' }
 *     }
 *   ]
 * });
 *
 * // Save to database
 * await db.flows.create({ definition: JSON.stringify(flowDef) });
 *
 * // Later, load and build
 * const loaded = JSON.parse(row.definition);
 * const flow = buildFlowFromConfig(loaded, providers);
 * ```
 */
export function defineFlowConfig(config: Omit<SerializableFlow, 'version'>): SerializableFlow {
  return {
    version: '1.0.0',
    ...config
  };
}
