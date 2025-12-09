/**
 * Assets resource for the Doclo client
 * Fetches bundled assets for a flow
 */

import type { DocloClient } from '../client.js';
import type { FlowAssetsResponse } from '../types.js';

/**
 * Resource for fetching bundled flow assets
 */
export class AssetsResource {
  constructor(private client: DocloClient) {}

  /**
   * Get all prompts and schemas referenced by a flow
   *
   * @param flowId - The flow ID
   * @param version - Optional flow version (defaults to latest)
   * @returns All prompts and schemas used by the flow
   *
   * @example
   * ```typescript
   * const assets = await client.assets.getFlowAssets('flow_abc123');
   *
   * // Access individual assets
   * const prompt = assets.prompts['invoice-extraction@1.0.0'];
   * const schema = assets.schemas['invoice@2.1.0'];
   *
   * // Register all assets locally
   * for (const [ref, prompt] of Object.entries(assets.prompts)) {
   *   PROMPT_REGISTRY.register(prompt);
   * }
   * for (const [ref, schema] of Object.entries(assets.schemas)) {
   *   SCHEMA_REGISTRY.register(schema);
   * }
   * ```
   */
  async getFlowAssets(flowId: string, version?: string): Promise<FlowAssetsResponse> {
    return this.client.request<FlowAssetsResponse>({
      method: 'GET',
      path: `/flows/${encodeURIComponent(flowId)}/assets`,
      query: version ? { version } : undefined,
    });
  }
}
