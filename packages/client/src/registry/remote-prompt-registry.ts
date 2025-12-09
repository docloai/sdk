/**
 * Remote Prompt Registry
 *
 * Fetches prompts from the cloud and optionally populates the local registry.
 */

import type { DocloClient } from '../client.js';
import type { PromptAssetResponse } from '../types.js';

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  etag?: string;
}

/**
 * Remote prompt registry options
 */
export interface RemotePromptRegistryOptions {
  /**
   * TTL for cached prompts in milliseconds.
   * @default 600000 (10 minutes)
   */
  ttlMs?: number;

  /**
   * If true, automatically register fetched prompts in the local PROMPT_REGISTRY.
   * @default true
   */
  autoRegisterLocal?: boolean;
}

/**
 * Remote prompt registry
 *
 * Fetches prompts from the Doclo cloud with caching support.
 *
 * @example
 * ```typescript
 * const prompts = new RemotePromptRegistry(client);
 *
 * // Fetch a specific version
 * const prompt = await prompts.get('invoice-extraction', '1.0.0');
 *
 * // Fetch latest version
 * const latest = await prompts.getLatest('invoice-extraction');
 *
 * // Preload multiple prompts
 * await prompts.preload([
 *   'invoice-extraction@1.0.0',
 *   'categorize-documents@2.0.0'
 * ]);
 * ```
 */
export class RemotePromptRegistry {
  private cache = new Map<string, CacheEntry<PromptAssetResponse>>();
  private ttlMs: number;
  private autoRegisterLocal: boolean;

  constructor(
    private client: DocloClient,
    options?: RemotePromptRegistryOptions
  ) {
    this.ttlMs = options?.ttlMs ?? 600000; // 10 minutes
    this.autoRegisterLocal = options?.autoRegisterLocal ?? true;
  }

  /**
   * Get a specific version of a prompt
   */
  async get(id: string, version: string): Promise<PromptAssetResponse> {
    const cacheKey = `${id}@${version}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.value;
    }

    // Fetch from cloud
    const prompt = await this.client.prompts.get(id, version);

    // Update cache
    this.cache.set(cacheKey, {
      value: prompt,
      fetchedAt: Date.now(),
    });

    // Register in local registry if enabled
    if (this.autoRegisterLocal) {
      await this.registerLocal(prompt);
    }

    return prompt;
  }

  /**
   * Get the latest version of a prompt
   */
  async getLatest(id: string): Promise<PromptAssetResponse> {
    const cacheKey = `${id}@latest`;

    // Check cache (with shorter TTL for latest)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs / 2) {
      return cached.value;
    }

    // Fetch from cloud
    const prompt = await this.client.prompts.getLatest(id);

    // Update cache (both latest and versioned)
    const now = Date.now();
    this.cache.set(cacheKey, { value: prompt, fetchedAt: now });
    this.cache.set(`${id}@${prompt.version}`, { value: prompt, fetchedAt: now });

    // Register in local registry if enabled
    if (this.autoRegisterLocal) {
      await this.registerLocal(prompt);
    }

    return prompt;
  }

  /**
   * Preload multiple prompts by reference
   *
   * @param refs - Array of prompt references (e.g., "invoice-extraction@1.0.0")
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
   * Parse a prompt reference string (format: "id@version")
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
   * Register a prompt in the local PROMPT_REGISTRY
   */
  private async registerLocal(prompt: PromptAssetResponse): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies and make @doclo/prompts optional
      const { PROMPT_REGISTRY } = await import('@doclo/prompts');

      // Check if already registered
      const existing = PROMPT_REGISTRY.get(prompt.id, prompt.version);
      if (existing) {
        // Already registered, skip
        return;
      }

      // Convert response to PromptAsset format
      // Use unknown cast since our response types may differ slightly from @doclo/prompts
      const asset = {
        id: prompt.id,
        version: prompt.version,
        type: prompt.type,
        status: prompt.status,
        messages: prompt.messages,
        sections: prompt.sections,
        variables: prompt.variables,
        autoInject: prompt.autoInject,
        description: prompt.description,
        tags: prompt.tags,
        changelog: prompt.changelog,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      } as unknown as Parameters<typeof PROMPT_REGISTRY.register>[0];

      PROMPT_REGISTRY.register(asset);
    } catch {
      // @doclo/prompts not available or import failed
      // Silently skip local registration
    }
  }
}
