/**
 * Doclo Hybrid Client
 *
 * Enables hybrid execution modes:
 * 1. Config Pull: Pull flow definitions from cloud, execute locally
 * 2. SDK Only: Build flows locally, send observability to cloud
 */

import type { VLMProvider, OCRProvider, FlowInput } from '@doclo/core';
import type { SerializableFlow, ProviderRegistry as FlowsProviderRegistry } from '@doclo/flows';
import { DocloClient } from './client.js';
import { RemotePromptRegistry, type RemotePromptRegistryOptions } from './registry/remote-prompt-registry.js';
import { RemoteSchemaRegistry, type RemoteSchemaRegistryOptions } from './registry/remote-schema-registry.js';
import { createCloudObservability, type CloudObservabilityTransport } from './observability/cloud-transport.js';
import type { FlowDefinitionResponse } from './types.js';

/**
 * Provider type - VLM or OCR provider
 */
export type FlowProvider = VLMProvider | OCRProvider;

/**
 * Provider registry type
 * Maps provider refs to provider instances
 */
export type ProviderRegistry = Record<string, FlowProvider>;

/**
 * Hybrid client configuration
 */
export interface HybridClientConfig {
  /** Doclo API key */
  apiKey: string;

  /** Base URL for the Doclo API */
  baseUrl?: string;

  /** Convex URL for data endpoints */
  convexUrl?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /**
   * Provider registry mapping provider refs to instances.
   * Required for local execution.
   *
   * @example
   * ```typescript
   * {
   *   vlm: createGeminiProvider({ apiKey: process.env.GOOGLE_API_KEY }),
   *   ocr: createSuryaProvider()
   * }
   * ```
   */
  providers: ProviderRegistry;

  /** Remote prompt registry options */
  promptRegistryOptions?: RemotePromptRegistryOptions;

  /** Remote schema registry options */
  schemaRegistryOptions?: RemoteSchemaRegistryOptions;
}

/**
 * Options for running a flow in hybrid mode
 */
export interface HybridRunOptions {
  /** Flow version (defaults to latest) */
  version?: string;

  /**
   * Observability mode:
   * - 'stream': Send events periodically during execution
   * - 'batch-at-end': Collect all events, send at end
   * @default 'stream'
   */
  observabilityMode?: 'stream' | 'batch-at-end';

  /**
   * Flush interval for stream mode (ms).
   * Set to 0 for immediate per-event sending.
   * @default 5000
   */
  flushIntervalMs?: number;

  /** Include inputs in observability events */
  includeInputs?: boolean;

  /** Include outputs in observability events */
  includeOutputs?: boolean;

  /** Additional metadata to attach to the execution */
  metadata?: Record<string, unknown>;
}

/**
 * Options for running a local flow with cloud observability
 */
export interface LocalRunOptions {
  /** Flow ID for tracking in dashboard */
  flowId?: string;

  /** Flow version for tracking */
  flowVersion?: string;

  /**
   * Observability mode:
   * - 'stream': Send events periodically during execution
   * - 'batch-at-end': Collect all events, send at end
   * @default 'stream'
   */
  observabilityMode?: 'stream' | 'batch-at-end';

  /**
   * Flush interval for stream mode (ms).
   * Set to 0 for immediate per-event sending.
   * @default 5000
   */
  flushIntervalMs?: number;

  /** Include inputs in observability events */
  includeInputs?: boolean;

  /** Include outputs in observability events */
  includeOutputs?: boolean;
}

/**
 * Result from hybrid/local execution
 */
export interface HybridFlowResult<T = unknown> {
  /** The flow output */
  output: T;

  /** Execution metrics */
  metrics: {
    totalTokens: number;
    totalCost: number;
    duration: number;
    stepsCompleted: number;
  };

  /** Execution ID (for cloud tracking) */
  executionId: string;

  /** Trace ID */
  traceId: string;
}

/**
 * Doclo Hybrid Client
 *
 * Enables local flow execution with cloud configuration and observability.
 *
 * @example
 * ```typescript
 * // Create hybrid client
 * const client = new DocloHybridClient({
 *   apiKey: process.env.DOCLO_API_KEY,
 *   providers: {
 *     vlm: createGeminiProvider({ apiKey: process.env.GOOGLE_API_KEY }),
 *     ocr: createSuryaProvider()
 *   }
 * });
 *
 * // Mode 1: Pull flow from cloud, execute locally
 * const result = await client.runHybrid('flow_invoice', input);
 *
 * // Mode 2: Build flow locally, send observability to cloud
 * const flow = createFlow()
 *   .step('parse', parse({ provider }))
 *   .build();
 * const result = await client.runLocal(flow, input, { flowId: 'my-flow' });
 *
 * // Fetch individual assets
 * const schema = await client.schemas.getLatest('invoice');
 * const prompt = await client.prompts.get('extraction', '1.0.0');
 * ```
 */
export class DocloHybridClient {
  /** The underlying cloud client */
  readonly cloud: DocloClient;

  /** Remote prompt registry */
  readonly prompts: RemotePromptRegistry;

  /** Remote schema registry */
  readonly schemas: RemoteSchemaRegistry;

  private readonly providers: ProviderRegistry;

  constructor(config: HybridClientConfig) {
    this.cloud = new DocloClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      convexUrl: config.convexUrl,
      timeout: config.timeout,
    });

    this.providers = config.providers;

    this.prompts = new RemotePromptRegistry(
      this.cloud,
      config.promptRegistryOptions
    );

    this.schemas = new RemoteSchemaRegistry(
      this.cloud,
      config.schemaRegistryOptions
    );
  }

  /**
   * Pull flow definition from cloud, execute locally.
   * Sends observability to cloud.
   *
   * @param flowId - The flow ID to execute
   * @param input - Input for the flow
   * @param options - Execution options
   *
   * @example
   * ```typescript
   * const result = await client.runHybrid('flow_invoice', {
   *   base64: documentBase64
   * });
   * console.log(result.output);
   * ```
   */
  async runHybrid<T = unknown>(
    flowId: string,
    input: FlowInput,
    options?: HybridRunOptions
  ): Promise<HybridFlowResult<T>> {
    // 1. Fetch flow definition from cloud
    const flowDef = await this.cloud.definitions.get(flowId, options?.version);

    // 2. Fetch referenced assets
    const assets = await this.cloud.assets.getFlowAssets(flowId, options?.version);

    // 3. Preload assets into local registries
    await this.preloadAssets(assets);

    // 4. Validate providers
    this.validateProviders(flowDef);

    // 5. Create cloud observability
    const observability = this.createObservability(flowId, {
      flowVersion: flowDef.version,
      mode: options?.observabilityMode,
      flushIntervalMs: options?.flushIntervalMs,
      includeInputs: options?.includeInputs,
      includeOutputs: options?.includeOutputs,
    });

    // 6. Build and execute flow
    const result = await this.executeFlow<T>(
      flowDef,
      input,
      observability
    );

    // 7. Ensure observability is flushed
    await observability.flush();

    return result;
  }

  /**
   * Execute a locally-built flow, send observability to cloud.
   *
   * @param flow - The built flow to execute
   * @param input - Input for the flow
   * @param options - Execution options
   *
   * @example
   * ```typescript
   * const flow = createFlow()
   *   .step('parse', parse({ provider }))
   *   .step('extract', extract({ provider, schema }))
   *   .build();
   *
   * const result = await client.runLocal(flow, input, {
   *   flowId: 'my-custom-flow'
   * });
   * ```
   */
  async runLocal<T = unknown>(
    flow: { run: (input: unknown, options?: { observability?: unknown; metadata?: Record<string, unknown> }) => Promise<{ output: T; metrics: unknown; executionId: string; traceId: string }> },
    input: unknown,
    options?: LocalRunOptions
  ): Promise<HybridFlowResult<T>> {
    const flowId = options?.flowId ?? 'local-flow';

    // Create cloud observability
    const observability = this.createObservability(flowId, {
      flowVersion: options?.flowVersion,
      mode: options?.observabilityMode,
      flushIntervalMs: options?.flushIntervalMs,
      includeInputs: options?.includeInputs,
      includeOutputs: options?.includeOutputs,
    });

    // Execute the flow
    const result = await flow.run(input, {
      observability,
    });

    // Ensure observability is flushed
    await observability.flush();

    return {
      output: result.output,
      metrics: result.metrics as HybridFlowResult<T>['metrics'],
      executionId: result.executionId,
      traceId: result.traceId,
    };
  }

  /**
   * Create a cloud observability config for a flow.
   * Useful for manually wiring observability to flows.
   */
  createObservability(
    flowId: string,
    options?: {
      flowVersion?: string;
      mode?: 'stream' | 'batch-at-end';
      flushIntervalMs?: number;
      includeInputs?: boolean;
      includeOutputs?: boolean;
    }
  ): CloudObservabilityTransport {
    return createCloudObservability({
      client: this.cloud,
      flowId,
      flowVersion: options?.flowVersion,
      mode: options?.mode ?? 'stream',
      flushIntervalMs: options?.flushIntervalMs ?? 5000,
      includeInputs: options?.includeInputs ?? false,
      includeOutputs: options?.includeOutputs ?? false,
    });
  }

  /**
   * Preload flow assets into local registries
   */
  private async preloadAssets(assets: {
    prompts: Record<string, unknown>;
    schemas: Record<string, unknown>;
  }): Promise<void> {
    // Preload prompts
    const promptRefs = Object.keys(assets.prompts);
    if (promptRefs.length > 0) {
      await this.prompts.preload(promptRefs);
    }

    // Preload schemas
    const schemaRefs = Object.keys(assets.schemas);
    if (schemaRefs.length > 0) {
      await this.schemas.preload(schemaRefs);
    }
  }

  /**
   * Validate that all required providers are available
   */
  private validateProviders(flowDef: FlowDefinitionResponse): void {
    const missing = flowDef.requiredProviders.filter(
      (ref) => !(ref in this.providers)
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing required providers: ${missing.join(', ')}. ` +
        `Flow requires: ${flowDef.requiredProviders.join(', ')}. ` +
        `Available: ${Object.keys(this.providers).join(', ') || 'none'}`
      );
    }
  }

  /**
   * Normalize a flow definition from cloud format to SDK format.
   * The cloud stores provider references as 'provider' but the SDK expects 'providerRef'.
   */
  private normalizeFlowDefinition(definition: SerializableFlow): SerializableFlow {
    const normalizeConfig = (config: Record<string, unknown>): Record<string, unknown> => {
      const normalized = { ...config };
      // Convert 'provider' to 'providerRef' if present
      if ('provider' in normalized && typeof normalized.provider === 'string' && !('providerRef' in normalized)) {
        normalized.providerRef = normalized.provider;
        delete normalized.provider;
      }

      // Normalize categories if present (convert objects to strings)
      if ('categories' in normalized && Array.isArray(normalized.categories)) {
        normalized.categories = normalized.categories.map((c: any) =>
          typeof c === 'object' && c !== null && 'name' in c ? c.name : c
        );
      }

      return normalized;
    };

    const normalizeStep = (step: Record<string, unknown>): Record<string, unknown> => {
      const normalized = { ...step };

      // Normalize config
      if (normalized.config && typeof normalized.config === 'object') {
        normalized.config = normalizeConfig(normalized.config as Record<string, unknown>);
      }

      // Normalize branches (for conditional nodes)
      if (normalized.branches && typeof normalized.branches === 'object') {
        const branches = normalized.branches as Record<string, Record<string, unknown>>;
        normalized.branches = Object.fromEntries(
          Object.entries(branches).map(([key, branch]) => [
            key,
            normalizeStep(branch)
          ])
        );
      }

      // Normalize itemFlow (for forEach nodes)
      if (normalized.itemFlow && typeof normalized.itemFlow === 'object') {
        normalized.itemFlow = normalizeStep(normalized.itemFlow as Record<string, unknown>);
      }

      // Normalize nested steps
      if (normalized.steps && Array.isArray(normalized.steps)) {
        normalized.steps = normalized.steps.map((s) => normalizeStep(s as Record<string, unknown>));
      }

      return normalized;
    };

    // Normalize version format (API may return "1.0" but SDK expects "1.0.0")
    let normalizedVersion = definition.version;
    if (normalizedVersion && !normalizedVersion.match(/^\d+\.\d+\.\d+$/)) {
      // Convert "1.0" to "1.0.0", "1" to "1.0.0", etc.
      const parts = normalizedVersion.split('.');
      while (parts.length < 3) {
        parts.push('0');
      }
      normalizedVersion = parts.slice(0, 3).join('.');
    }

    // Normalize all steps in the flow
    return {
      ...definition,
      version: normalizedVersion,
      steps: definition.steps.map((step) => normalizeStep(step as Record<string, unknown>)) as SerializableFlow['steps'],
    };
  }

  /**
   * Build and execute a flow from its definition
   */
  private async executeFlow<T>(
    flowDef: FlowDefinitionResponse,
    input: FlowInput,
    observability: CloudObservabilityTransport
  ): Promise<HybridFlowResult<T>> {
    // Dynamic import to make @doclo/flows optional
    const { buildFlowFromConfig, isBatchFlowResult } = await import('@doclo/flows');

    // Normalize the flow definition (convert 'provider' to 'providerRef')
    const normalizedDefinition = this.normalizeFlowDefinition(flowDef.definition as SerializableFlow);

    // Build flow registry from sub-flows (normalize each one too)
    let flowRegistry: Record<string, SerializableFlow> | undefined;
    if (flowDef.subFlows && Object.keys(flowDef.subFlows).length > 0) {
      flowRegistry = {};
      for (const [flowId, subFlowDef] of Object.entries(flowDef.subFlows)) {
        flowRegistry[flowId] = this.normalizeFlowDefinition(subFlowDef as SerializableFlow);
      }
    }

    // Build the flow using the normalized definition
    const flow = buildFlowFromConfig(
      normalizedDefinition,
      this.providers as FlowsProviderRegistry,
      flowRegistry,
      { observability }
    );

    // Execute the flow
    const result = await flow.run(input);

    // Handle both single and batch results
    if (isBatchFlowResult(result)) {
      // For batch results, aggregate the first result's output
      // (batch handling can be enhanced later)
      const firstResult = result.results[0];
      return {
        output: firstResult?.output as T,
        metrics: {
          totalTokens: (firstResult?.aggregated?.totalInputTokens ?? 0) + (firstResult?.aggregated?.totalOutputTokens ?? 0),
          totalCost: firstResult?.aggregated?.totalCostUSD ?? 0,
          duration: firstResult?.aggregated?.totalDurationMs ?? 0,
          stepsCompleted: firstResult?.aggregated?.stepCount ?? 0,
        },
        executionId: 'batch',
        traceId: 'batch',
      };
    }

    // Single flow result
    return {
      output: result.output as T,
      metrics: {
        totalTokens: (result.aggregated?.totalInputTokens ?? 0) + (result.aggregated?.totalOutputTokens ?? 0),
        totalCost: result.aggregated?.totalCostUSD ?? 0,
        duration: result.aggregated?.totalDurationMs ?? 0,
        stepsCompleted: result.aggregated?.stepCount ?? 0,
      },
      executionId: 'local',
      traceId: 'local',
    };
  }
}
