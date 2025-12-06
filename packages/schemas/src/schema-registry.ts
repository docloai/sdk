/**
 * Schema Registry
 *
 * In-memory registry for storing and retrieving schema assets by ID and version
 */

import type { SchemaAsset } from './types.js';

/**
 * Parse a version reference string into ID and version
 * Format: "id@version" (e.g., "invoice-schema@2.1.0")
 */
function parseVersionRef(ref: string): { id: string; version: string } {
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
 * Registry for storing schema assets
 * Structure: Map<id, Map<version, SchemaAsset>>
 */
export class SchemaRegistry {
  private schemas: Map<string, Map<string, SchemaAsset>> = new Map();

  /**
   * Register a schema asset
   */
  register(schema: SchemaAsset): void {
    if (!this.schemas.has(schema.id)) {
      this.schemas.set(schema.id, new Map());
    }

    const versions = this.schemas.get(schema.id)!;

    if (versions.has(schema.version)) {
      console.warn(`[SchemaRegistry] Overwriting existing schema: ${schema.id}@${schema.version}`);
    }

    versions.set(schema.version, schema);
  }

  /**
   * Get a specific version of a schema
   */
  get(id: string, version: string): SchemaAsset | undefined {
    return this.schemas.get(id)?.get(version);
  }

  /**
   * Get a schema by version reference string (id@version)
   */
  getByRef(ref: string): SchemaAsset | undefined {
    const { id, version } = parseVersionRef(ref);
    return this.get(id, version);
  }

  /**
   * Get the latest version of a schema
   * Uses semver-like comparison (assumes versions are in semver format)
   */
  getLatest(id: string): SchemaAsset | undefined {
    const versions = this.schemas.get(id);
    if (!versions || versions.size === 0) {
      return undefined;
    }

    // Get all versions and sort them
    const sortedVersions = Array.from(versions.keys()).sort((a, b) => {
      // Simple semver comparison (major.minor.patch)
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aNum = aParts[i] || 0;
        const bNum = bParts[i] || 0;
        if (aNum !== bNum) {
          return bNum - aNum; // Descending order
        }
      }

      return 0;
    });

    const latestVersion = sortedVersions[0];
    return versions.get(latestVersion);
  }

  /**
   * List all versions of a schema
   */
  listVersions(id: string): string[] {
    const versions = this.schemas.get(id);
    if (!versions) {
      return [];
    }
    return Array.from(versions.keys()).sort((a, b) => {
      // Simple semver comparison (descending)
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aNum = aParts[i] || 0;
        const bNum = bParts[i] || 0;
        if (aNum !== bNum) {
          return bNum - aNum;
        }
      }

      return 0;
    });
  }

  /**
   * List all schemas in the registry
   */
  list(): SchemaAsset[] {
    const allSchemas: SchemaAsset[] = [];

    for (const versions of this.schemas.values()) {
      for (const schema of versions.values()) {
        allSchemas.push(schema);
      }
    }

    return allSchemas;
  }

  /**
   * List all schema IDs
   */
  listIds(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Check if a schema exists
   */
  has(id: string, version?: string): boolean {
    if (version) {
      return this.schemas.get(id)?.has(version) ?? false;
    }
    return this.schemas.has(id);
  }

  /**
   * Delete a schema version
   */
  delete(id: string, version: string): boolean {
    const versions = this.schemas.get(id);
    if (!versions) {
      return false;
    }

    const deleted = versions.delete(version);

    // Clean up empty ID entries
    if (versions.size === 0) {
      this.schemas.delete(id);
    }

    return deleted;
  }

  /**
   * Clear all schemas from registry
   */
  clear(): void {
    this.schemas.clear();
  }
}

/**
 * Global schema registry instance
 */
export const SCHEMA_REGISTRY = new SchemaRegistry();

/**
 * Register a schema in the global registry
 */
export function registerSchema(schema: SchemaAsset): void {
  SCHEMA_REGISTRY.register(schema);
}

/**
 * Get a schema from the global registry
 */
export function getSchema(id: string, version: string): SchemaAsset | undefined {
  return SCHEMA_REGISTRY.get(id, version);
}

/**
 * Get a schema by reference string (id@version)
 */
export function getSchemaByRef(ref: string): SchemaAsset | undefined {
  return SCHEMA_REGISTRY.getByRef(ref);
}

/**
 * Get the latest version of a schema from the global registry
 */
export function getLatestSchema(id: string): SchemaAsset | undefined {
  return SCHEMA_REGISTRY.getLatest(id);
}
