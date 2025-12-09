/**
 * Definitions resource for the Doclo client
 * Fetches flow definitions for local execution
 */

import type { DocloClient } from '../client.js';
import type { FlowDefinitionResponse } from '../types.js';

/**
 * Resource for fetching flow definitions
 */
export class DefinitionsResource {
  constructor(private client: DocloClient) {}

  /**
   * Get a flow definition for local execution
   *
   * @param flowId - The flow ID
   * @param version - Optional specific version (defaults to latest)
   * @returns Flow definition including the serializable flow JSON
   *
   * @example
   * ```typescript
   * const definition = await client.definitions.get('flow_abc123');
   * console.log(definition.requiredProviders); // ['vlm', 'ocr']
   *
   * // Use with @doclo/flows to execute locally
   * import { buildFlowFromConfig } from '@doclo/flows';
   * const flow = buildFlowFromConfig(definition.definition, providers);
   * const result = await flow.run(input);
   * ```
   */
  async get(flowId: string, version?: string): Promise<FlowDefinitionResponse> {
    return this.client.request<FlowDefinitionResponse>({
      method: 'GET',
      path: `/flows/${encodeURIComponent(flowId)}/definition`,
      query: version ? { version } : undefined,
    });
  }
}
