/**
 * Remote Schema Registry
 *
 * Fetches schemas from the cloud and optionally populates the local registry.
 */

import type { DocloClient } from '../client.js';
import type { SchemaAssetResponse } from '../types.js';

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  etag?: string;
}

/**
 * Remote schema registry options
 */
export interface RemoteSchemaRegistryOptions {
  /**
   * TTL for cached schemas in milliseconds.
   * @default 600000 (10 minutes)
   */
  ttlMs?: number;

  /**
   * If true, automatically register fetched schemas in the local SCHEMA_REGISTRY.
   * @default true
   */
  autoRegisterLocal?: boolean;
}

/**
 * Remote schema registry
 *
 * Fetches schemas from the Doclo cloud with caching support.
 *
 * @example
 * ```typescript
 * const schemas = new RemoteSchemaRegistry(client);
 *
 * // Fetch a specific version
 * const schema = await schemas.get('invoice', '2.1.0');
 *
 * // Fetch latest version
 * const latest = await schemas.getLatest('invoice');
 *
 * // Preload multiple schemas
 * await schemas.preload([
 *   'invoice@2.1.0',
 *   'receipt@1.0.0'
 * ]);
 * ```
 */
export class RemoteSchemaRegistry {
  private cache = new Map<string, CacheEntry<SchemaAssetResponse>>();
  private ttlMs: number;
  private autoRegisterLocal: boolean;

  constructor(
    private client: DocloClient,
    options?: RemoteSchemaRegistryOptions
  ) {
    this.ttlMs = options?.ttlMs ?? 600000; // 10 minutes
    this.autoRegisterLocal = options?.autoRegisterLocal ?? true;
  }

  /**
   * Get a specific version of a schema
   */
  async get(id: string, version: string): Promise<SchemaAssetResponse> {
    const cacheKey = `${id}@${version}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.value;
    }

    // Fetch from cloud
    const schema = await this.client.schemas.get(id, version);

    // Update cache
    this.cache.set(cacheKey, {
      value: schema,
      fetchedAt: Date.now(),
    });

    // Register in local registry if enabled
    if (this.autoRegisterLocal) {
      await this.registerLocal(schema);
    }

    return schema;
  }

  /**
   * Get the latest version of a schema
   */
  async getLatest(id: string): Promise<SchemaAssetResponse> {
    const cacheKey = `${id}@latest`;

    // Check cache (with shorter TTL for latest)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs / 2) {
      return cached.value;
    }

    // Fetch from cloud
    const schema = await this.client.schemas.getLatest(id);

    // Update cache (both latest and versioned)
    const now = Date.now();
    this.cache.set(cacheKey, { value: schema, fetchedAt: now });
    this.cache.set(`${id}@${schema.version}`, { value: schema, fetchedAt: now });

    // Register in local registry if enabled
    if (this.autoRegisterLocal) {
      await this.registerLocal(schema);
    }

    return schema;
  }

  /**
   * Preload multiple schemas by reference
   *
   * @param refs - Array of schema references (e.g., "invoice@2.1.0")
   */
  async preload(refs: string[]): Promise<void> {
    const fetches = refs.map(async (ref) => {
      const { id, version } = this.parseRef(ref);
      if (version) {
        await this.get(id, version);
      } else {
        await this.getLatest(id);
      }
    });

    await Promise.all(fetches);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Parse a schema reference string (format: "id@version")
   */
  private parseRef(ref: string): { id: string; version?: string } {
    const atIndex = ref.lastIndexOf('@');
    if (atIndex === -1) {
      return { id: ref };
    }
    return {
      id: ref.substring(0, atIndex),
      version: ref.substring(atIndex + 1),
    };
  }

  /**
   * Register a schema in the local SCHEMA_REGISTRY
   */
  private async registerLocal(schema: SchemaAssetResponse): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies and make @doclo/schemas optional
      const { SCHEMA_REGISTRY } = await import('@doclo/schemas');

      // Check if already registered
      const existing = SCHEMA_REGISTRY.get(schema.id, schema.version);
      if (existing) {
        // Already registered, skip
        return;
      }

      // Convert response to SchemaAsset format
      const asset = {
        id: schema.id,
        version: schema.version,
        schema: schema.schema,
        description: schema.description,
        tags: schema.tags,
        changelog: schema.changelog,
        createdAt: schema.createdAt,
        updatedAt: schema.updatedAt,
      };

      SCHEMA_REGISTRY.register(asset);
    } catch {
      // @doclo/schemas not available or import failed
      // Silently skip local registration
    }
  }
}
