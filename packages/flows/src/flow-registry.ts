/**
 * Flow Registry for Serializable Trigger Nodes
 *
 * This registry allows flows to be referenced by string IDs in serialized configs.
 * Used by the config API (serializable version) of trigger nodes.
 *
 * ## Usage
 *
 * ### Registration
 * ```typescript
 * import { registerFlow } from '@doclo/flows';
 * import { createFlow } from '@doclo/flows';
 * import { parse, extract } from '@doclo/nodes';
 *
 * // Register a flow builder
 * registerFlow('invoice-processing-v2', (providers) =>
 *   createFlow()
 *     .step('parse', parse({ provider: providers.ocr }))
 *     .step('extract', extract({ provider: providers.vlm, schema: invoiceSchema }))
 * );
 * ```
 *
 * ### Retrieval
 * ```typescript
 * import { getFlow } from '@doclo/flows';
 *
 * const flowBuilder = getFlow('invoice-processing-v2');
 * if (flowBuilder) {
 *   const flow = flowBuilder(myProviders);
 *   const result = await flow.build().run(input);
 * }
 * ```
 *
 * ### Serialization
 * ```typescript
 * import { buildFlowFromConfig } from '@doclo/flows';
 *
 * const flowDef = {
 *   version: '1.0.0',
 *   steps: [
 *     {
 *       type: 'step',
 *       nodeType: 'trigger',
 *       config: {
 *         type: 'trigger',
 *         flowRef: 'invoice-processing-v2'  // References registered flow
 *       }
 *     }
 *   ]
 * };
 *
 * const flow = buildFlowFromConfig(flowDef, { providers, flows: FLOW_REGISTRY });
 * ```
 */

import type { ProviderRegistry } from '@doclo/nodes';
import type { BuiltFlow } from './flow-builder';

/**
 * Flow builder function signature
 * Takes optional provider registry and returns a Flow instance with build() method
 *
 * A FlowBuilder is a function that:
 * 1. Accepts an optional ProviderRegistry (for provider injection/override)
 * 2. Returns a Flow instance (from createFlow()) that has a build() method
 * 3. The build() method returns a BuiltFlow with run() and validate()
 */
export type FlowBuilder<TInput = any, TOutput = any> = (providers?: ProviderRegistry) => {
  build: () => BuiltFlow<TInput, TOutput>;
};

/**
 * Global flow registry
 * Maps flow IDs to flow builder functions
 */
export const FLOW_REGISTRY = new Map<string, FlowBuilder>();

/**
 * Register a flow builder in the global registry
 *
 * @param id - Unique identifier for the flow
 * @param builder - Flow builder function that accepts providers
 *
 * @example
 * ```typescript
 * registerFlow('invoice-processing', (providers) =>
 *   createFlow()
 *     .step('parse', parse({ provider: providers.ocr }))
 *     .step('extract', extract({ provider: providers.vlm, schema }))
 * );
 * ```
 */
export function registerFlow<TInput = any, TOutput = any>(
  id: string,
  builder: FlowBuilder<TInput, TOutput>
): void {
  if (FLOW_REGISTRY.has(id)) {
    console.warn(`[Flow Registry] Overwriting existing flow: ${id}`);
  }
  FLOW_REGISTRY.set(id, builder);
}

/**
 * Get a flow builder from the registry
 *
 * @param id - Flow identifier
 * @returns Flow builder function or undefined if not found
 *
 * @example
 * ```typescript
 * const builder = getFlow('invoice-processing');
 * if (builder) {
 *   const flow = builder(providers);
 *   const result = await flow.build().run(input);
 * }
 * ```
 */
export function getFlow<TInput = any, TOutput = any>(
  id: string
): FlowBuilder<TInput, TOutput> | undefined {
  return FLOW_REGISTRY.get(id) as FlowBuilder<TInput, TOutput> | undefined;
}

/**
 * Check if a flow is registered
 *
 * @param id - Flow identifier
 * @returns true if flow is registered
 */
export function hasFlow(id: string): boolean {
  return FLOW_REGISTRY.has(id);
}

/**
 * Unregister a flow from the registry
 *
 * @param id - Flow identifier
 * @returns true if flow was removed, false if it didn't exist
 */
export function unregisterFlow(id: string): boolean {
  return FLOW_REGISTRY.delete(id);
}

/**
 * Clear all registered flows
 * Useful for testing or resetting state
 */
export function clearRegistry(): void {
  FLOW_REGISTRY.clear();
}

/**
 * Get all registered flow IDs
 *
 * @returns Array of flow identifiers
 */
export function listFlows(): string[] {
  return Array.from(FLOW_REGISTRY.keys());
}

/**
 * Get the number of registered flows
 *
 * @returns Number of flows in registry
 */
export function getFlowCount(): number {
  return FLOW_REGISTRY.size;
}
