import type { LLMProvider, ProviderConfig, ProviderType } from './types';

/**
 * Factory function type for creating provider instances
 */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;

/**
 * Normalize provider type aliases (e.g., 'x-ai' -> 'xai')
 */
function normalizeProviderType(type: ProviderType): ProviderType {
  if (type === 'x-ai') return 'xai';
  return type;
}

/**
 * Provider registry for dynamic provider loading
 *
 * This allows provider packages to register themselves when imported,
 * avoiding hardcoded imports in the core package.
 */
class ProviderRegistry {
  private factories: Map<ProviderType, ProviderFactory> = new Map();

  /**
   * Register a provider factory
   * Called by each provider package when it's imported
   */
  register(type: ProviderType, factory: ProviderFactory): void {
    const normalizedType = normalizeProviderType(type);
    this.factories.set(normalizedType, factory);
  }

  /**
   * Check if a provider is registered
   */
  has(type: ProviderType): boolean {
    const normalizedType = normalizeProviderType(type);
    return this.factories.has(normalizedType);
  }

  /**
   * Get a provider factory
   */
  get(type: ProviderType): ProviderFactory | undefined {
    const normalizedType = normalizeProviderType(type);
    return this.factories.get(normalizedType);
  }

  /**
   * Create a provider instance
   * @throws Error if provider is not registered
   */
  create(config: ProviderConfig): LLMProvider {
    const normalizedType = normalizeProviderType(config.provider);
    const factory = this.factories.get(normalizedType);
    if (!factory) {
      const registered = Array.from(this.factories.keys()).join(', ') || 'none';
      throw new Error(
        `Provider '${config.provider}' is not registered. ` +
        `Registered providers: ${registered}. ` +
        `Make sure to import the provider package (e.g., import '@doclo/providers-${normalizedType}').`
      );
    }
    // Pass config with normalized provider type
    return factory({ ...config, provider: normalizedType });
  }

  /**
   * Get all registered provider types
   */
  getRegisteredTypes(): ProviderType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.factories.clear();
  }
}

/**
 * Global provider registry instance
 */
export const providerRegistry = new ProviderRegistry();

/**
 * Register a provider factory
 * Convenience function for provider packages
 */
export function registerProvider(type: ProviderType, factory: ProviderFactory): void {
  providerRegistry.register(type, factory);
}

/**
 * Create a provider instance from the registry
 */
export function createProviderFromRegistry(config: ProviderConfig): LLMProvider {
  return providerRegistry.create(config);
}
