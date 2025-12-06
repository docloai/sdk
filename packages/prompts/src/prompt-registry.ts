/**
 * Prompt Registry
 *
 * In-memory registry for storing and retrieving prompt assets by ID and version
 */

import type { PromptAsset } from './types.js';
import { parseVersionRef, createVersionRef } from './types.js';

/**
 * Registry for storing prompt assets
 * Structure: Map<id, Map<version, PromptAsset>>
 */
export class PromptRegistry {
  private prompts: Map<string, Map<string, PromptAsset>> = new Map();

  /**
   * Register a prompt asset
   */
  register(prompt: PromptAsset): void {
    if (!this.prompts.has(prompt.id)) {
      this.prompts.set(prompt.id, new Map());
    }

    const versions = this.prompts.get(prompt.id)!;

    if (versions.has(prompt.version)) {
      console.warn(`[PromptRegistry] Overwriting existing prompt: ${prompt.id}@${prompt.version}`);
    }

    versions.set(prompt.version, prompt);
  }

  /**
   * Get a specific version of a prompt
   */
  get(id: string, version: string): PromptAsset | undefined {
    return this.prompts.get(id)?.get(version);
  }

  /**
   * Get a prompt by version reference string (id@version)
   */
  getByRef(ref: string): PromptAsset | undefined {
    const { id, version } = parseVersionRef(ref);
    return this.get(id, version);
  }

  /**
   * Get the latest version of a prompt
   * Uses semver-like comparison (assumes versions are in semver format)
   */
  getLatest(id: string): PromptAsset | undefined {
    const versions = this.prompts.get(id);
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
   * List all versions of a prompt
   */
  listVersions(id: string): string[] {
    const versions = this.prompts.get(id);
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
   * List all prompts in the registry
   */
  list(): PromptAsset[] {
    const allPrompts: PromptAsset[] = [];

    for (const versions of this.prompts.values()) {
      for (const prompt of versions.values()) {
        allPrompts.push(prompt);
      }
    }

    return allPrompts;
  }

  /**
   * List all prompt IDs
   */
  listIds(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * Check if a prompt exists
   */
  has(id: string, version?: string): boolean {
    if (version) {
      return this.prompts.get(id)?.has(version) ?? false;
    }
    return this.prompts.has(id);
  }

  /**
   * Delete a prompt version
   */
  delete(id: string, version: string): boolean {
    const versions = this.prompts.get(id);
    if (!versions) {
      return false;
    }

    const deleted = versions.delete(version);

    // Clean up empty ID entries
    if (versions.size === 0) {
      this.prompts.delete(id);
    }

    return deleted;
  }

  /**
   * Clear all prompts from registry
   */
  clear(): void {
    this.prompts.clear();
  }
}

/**
 * Global prompt registry instance
 */
export const PROMPT_REGISTRY = new PromptRegistry();

/**
 * Register a prompt in the global registry
 */
export function registerPrompt(prompt: PromptAsset): void {
  PROMPT_REGISTRY.register(prompt);
}

/**
 * Get a prompt from the global registry
 */
export function getPrompt(id: string, version: string): PromptAsset | undefined {
  return PROMPT_REGISTRY.get(id, version);
}

/**
 * Get a prompt by reference string (id@version)
 */
export function getPromptByRef(ref: string): PromptAsset | undefined {
  return PROMPT_REGISTRY.getByRef(ref);
}

/**
 * Get the latest version of a prompt from the global registry
 */
export function getLatestPrompt(id: string): PromptAsset | undefined {
  return PROMPT_REGISTRY.getLatest(id);
}
