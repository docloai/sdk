/**
 * Prompts resource for the Doclo client
 * Fetches prompt assets from the cloud
 */

import type { DocloClient } from '../client.js';
import type { PromptAssetResponse, PromptVersionsResponse } from '../types.js';

/**
 * Resource for fetching prompt assets
 */
export class PromptsResource {
  constructor(private client: DocloClient) {}

  /**
   * Get a specific version of a prompt
   *
   * @param id - The prompt ID
   * @param version - The prompt version
   * @returns The prompt asset
   *
   * @example
   * ```typescript
   * const prompt = await client.prompts.get('invoice-extraction', '1.0.0');
   * console.log(prompt.type); // 'extraction'
   * console.log(prompt.sections?.instructions);
   * ```
   */
  async get(id: string, version: string): Promise<PromptAssetResponse> {
    return this.client.request<PromptAssetResponse>({
      method: 'GET',
      path: `/prompts/${encodeURIComponent(id)}/${encodeURIComponent(version)}`,
    });
  }

  /**
   * Get the latest version of a prompt
   *
   * @param id - The prompt ID
   * @returns The latest prompt asset
   *
   * @example
   * ```typescript
   * const prompt = await client.prompts.getLatest('invoice-extraction');
   * console.log(prompt.version); // '2.1.0'
   * ```
   */
  async getLatest(id: string): Promise<PromptAssetResponse> {
    return this.client.request<PromptAssetResponse>({
      method: 'GET',
      path: `/prompts/${encodeURIComponent(id)}/latest`,
    });
  }

  /**
   * List all versions of a prompt
   *
   * @param id - The prompt ID
   * @returns List of versions with metadata
   *
   * @example
   * ```typescript
   * const { versions } = await client.prompts.listVersions('invoice-extraction');
   * for (const v of versions) {
   *   console.log(`${v.version} (${v.status})`);
   * }
   * ```
   */
  async listVersions(id: string): Promise<PromptVersionsResponse> {
    return this.client.request<PromptVersionsResponse>({
      method: 'GET',
      path: `/prompts/${encodeURIComponent(id)}/versions`,
    });
  }
}
