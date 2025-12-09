/**
 * Schemas resource for the Doclo client
 * Fetches schema assets from the cloud
 */

import type { DocloClient } from '../client.js';
import type { SchemaAssetResponse, SchemaVersionsResponse } from '../types.js';

/**
 * Resource for fetching schema assets
 */
export class SchemasResource {
  constructor(private client: DocloClient) {}

  /**
   * Get a specific version of a schema
   *
   * @param id - The schema ID
   * @param version - The schema version
   * @returns The schema asset
   *
   * @example
   * ```typescript
   * const schemaAsset = await client.schemas.get('invoice', '2.1.0');
   * console.log(schemaAsset.schema); // { type: 'object', properties: { ... } }
   *
   * // Use with extract node
   * import { extract } from '@doclo/nodes';
   * const node = extract({ provider, schema: schemaAsset.schema });
   * ```
   */
  async get(id: string, version: string): Promise<SchemaAssetResponse> {
    return this.client.request<SchemaAssetResponse>({
      method: 'GET',
      path: `/schemas/${encodeURIComponent(id)}/${encodeURIComponent(version)}`,
    });
  }

  /**
   * Get the latest version of a schema
   *
   * @param id - The schema ID
   * @returns The latest schema asset
   *
   * @example
   * ```typescript
   * const schemaAsset = await client.schemas.getLatest('invoice');
   * console.log(schemaAsset.version); // '2.1.0'
   * ```
   */
  async getLatest(id: string): Promise<SchemaAssetResponse> {
    return this.client.request<SchemaAssetResponse>({
      method: 'GET',
      path: `/schemas/${encodeURIComponent(id)}/latest`,
    });
  }

  /**
   * List all versions of a schema
   *
   * @param id - The schema ID
   * @returns List of versions with metadata
   *
   * @example
   * ```typescript
   * const { versions } = await client.schemas.listVersions('invoice');
   * for (const v of versions) {
   *   console.log(`${v.version} - ${v.createdAt}`);
   * }
   * ```
   */
  async listVersions(id: string): Promise<SchemaVersionsResponse> {
    return this.client.request<SchemaVersionsResponse>({
      method: 'GET',
      path: `/schemas/${encodeURIComponent(id)}/versions`,
    });
  }
}
