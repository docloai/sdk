/**
 * Provider Configuration
 *
 * Serializable provider configurations for doclo-sdk.
 * These configs can be stored in databases and reconstructed at runtime.
 */

/**
 * Type for dynamically imported module with potential default export.
 * Used for ESM/CJS interop when dynamically loading provider packages.
 */
interface DynamicModuleExports {
  [exportName: string]: unknown;
  default?: Record<string, unknown>;
}

/**
 * Base provider configuration
 */
export type BaseProviderConfig = {
  id: string;  // Unique identifier for this provider instance
  name?: string; // Human-readable name
};

/**
 * VLM (Vision Language Model) provider configuration
 */
export type VLMProviderConfig = BaseProviderConfig & {
  type: 'vlm';
  provider: 'openai' | 'anthropic' | 'google' | 'xai';
  model: string;
  via?: 'openrouter' | 'native';
  baseUrl?: string;
  // API key stored separately (not serialized)
};

/**
 * OCR provider configuration
 */
export type OCRProviderConfig = BaseProviderConfig & (
  | {
    type: 'ocr';
    provider: 'surya';
    endpoint?: string;
    // API key stored separately
  }
  | {
    type: 'ocr';
    provider: 'marker';
    force_ocr?: boolean;
    use_llm?: boolean;
    // API key stored separately
  }
);

/**
 * All provider configurations
 */
export type ProviderConfig = VLMProviderConfig | OCRProviderConfig;

/**
 * Provider secrets (API keys, credentials)
 * Stored separately from provider configs for security
 */
export type ProviderSecrets = Record<string, {
  apiKey?: string;
  /** Additional secret values (e.g., endpoint URLs, tokens) */
  [key: string]: string | undefined;
}>;

/**
 * Base provider interface - common methods shared by all providers
 */
export interface ProviderInstance {
  /** Optional provider name for identification */
  name?: string;
  /** Capabilities of this provider instance */
  capabilities?: Record<string, unknown>;
}

/**
 * Provider registry - maps provider IDs to instantiated providers
 * Uses a generic constraint to allow type narrowing when the provider type is known
 */
export type ProviderRegistry<T extends ProviderInstance = ProviderInstance> = Record<string, T>;

/**
 * Helper to create VLM provider config
 */
export function defineVLMProvider(config: Omit<VLMProviderConfig, 'type'>): VLMProviderConfig {
  return {
    type: 'vlm',
    ...config
  };
}

/**
 * Helper to create Surya OCR provider config
 */
export function defineSuryaProvider(config: Omit<Extract<OCRProviderConfig, { provider: 'surya' }>, 'type'>): OCRProviderConfig {
  return {
    type: 'ocr',
    ...config
  };
}

/**
 * Helper to create Marker OCR provider config
 */
export function defineMarkerProvider(config: Omit<Extract<OCRProviderConfig, { provider: 'marker' }>, 'type'>): OCRProviderConfig {
  return {
    type: 'ocr',
    ...config
  };
}

/**
 * Build a provider instance from config and secrets
 *
 * @param config - Provider configuration
 * @param secrets - Provider secrets (API keys)
 * @returns Provider instance
 *
 * @example
 * ```typescript
 * const config: VLMProviderConfig = {
 *   type: 'vlm',
 *   id: 'gemini-flash',
 *   provider: 'google',
 *   model: 'google/gemini-2.5-flash-preview-09-2025',
 *   via: 'openrouter'
 * };
 *
 * const secrets: ProviderSecrets = {
 *   'gemini-flash': {
 *     apiKey: process.env.OPENROUTER_API_KEY
 *   }
 * };
 *
 * const provider = await buildProviderFromConfig(config, secrets);
 * ```
 */
export async function buildProviderFromConfig(
  config: ProviderConfig,
  secrets: ProviderSecrets
): Promise<ProviderInstance> {
  const secret = secrets[config.id];

  if (!secret || !secret.apiKey) {
    throw new Error(`API key not found for provider "${config.id}"`);
  }

  if (config.type === 'vlm') {
    // Dynamic import to avoid build-time dependencies
    try {
      // @ts-ignore - Dynamic import, package may not be installed
      const module: DynamicModuleExports = await import(/* webpackIgnore: true */ '@doclo/providers-llm');
      const createVLMProvider = (module.createVLMProvider || module.default?.createVLMProvider) as
        | ((opts: {
            provider: string;
            model: string;
            apiKey: string;
            via?: 'openrouter';
            baseUrl?: string;
          }) => ProviderInstance)
        | undefined;

      if (!createVLMProvider) {
        throw new Error('@doclo/providers-llm does not export createVLMProvider');
      }

      return createVLMProvider({
        provider: config.provider,
        model: config.model,
        apiKey: secret.apiKey,
        via: config.via === 'openrouter' ? 'openrouter' : undefined,
        baseUrl: config.baseUrl
      });
    } catch (error) {
      throw new Error(
        `Failed to create VLM provider: ${(error as Error).message}. ` +
        `Make sure @doclo/providers-llm is installed.`
      );
    }
  } else if (config.type === 'ocr') {
    // Dynamic import to avoid build-time dependencies
    try {
      // @ts-ignore - Dynamic import, package may not be installed
      const module: DynamicModuleExports = await import(/* webpackIgnore: true */ '@doclo/providers-datalab');

      if (config.provider === 'surya') {
        const suryaProvider = (module.suryaProvider || module.default?.suryaProvider) as
          | ((opts: { endpoint?: string; apiKey: string }) => ProviderInstance)
          | undefined;
        if (!suryaProvider) {
          throw new Error('@doclo/providers-datalab does not export suryaProvider');
        }

        return suryaProvider({
          endpoint: config.endpoint,
          apiKey: secret.apiKey
        });
      } else if (config.provider === 'marker') {
        const markerProvider = (module.markerProvider || module.default?.markerProvider) as
          | ((opts: { apiKey: string; force_ocr?: boolean; use_llm?: boolean }) => ProviderInstance)
          | undefined;
        if (!markerProvider) {
          throw new Error('@doclo/providers-datalab does not export markerProvider');
        }

        return markerProvider({
          apiKey: secret.apiKey,
          force_ocr: config.force_ocr,
          use_llm: config.use_llm
        });
      } else {
        // This branch is unreachable due to discriminated union, but TypeScript doesn't know that
        const exhaustiveCheck: never = config;
        throw new Error(`Unknown OCR provider: ${(exhaustiveCheck as OCRProviderConfig).provider}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to create OCR provider: ${(error as Error).message}. ` +
        `Make sure @doclo/providers-datalab is installed.`
      );
    }
  } else {
    // This branch is unreachable due to discriminated union, but TypeScript doesn't know that
    const exhaustiveCheck: never = config;
    throw new Error(`Unknown provider type: ${(exhaustiveCheck as ProviderConfig).type}`);
  }
}

/**
 * Build multiple providers from configs
 *
 * @param configs - Array of provider configurations
 * @param secrets - Provider secrets
 * @returns Provider registry (map of IDs to instances)
 *
 * @example
 * ```typescript
 * const configs: ProviderConfig[] = [
 *   { type: 'vlm', id: 'gemini', provider: 'google', model: '...', via: 'openrouter' },
 *   { type: 'ocr', id: 'surya', provider: 'surya' }
 * ];
 *
 * const secrets: ProviderSecrets = {
 *   'gemini': { apiKey: process.env.OPENROUTER_API_KEY },
 *   'surya': { apiKey: process.env.SURYA_API_KEY }
 * };
 *
 * const providers = await buildProvidersFromConfigs(configs, secrets);
 * // providers = { gemini: VLMProvider, surya: OCRProvider }
 * ```
 */
export async function buildProvidersFromConfigs(
  configs: ProviderConfig[],
  secrets: ProviderSecrets
): Promise<ProviderRegistry> {
  const registry: ProviderRegistry = {};

  for (const config of configs) {
    try {
      registry[config.id] = await buildProviderFromConfig(config, secrets);
    } catch (error) {
      throw new Error(
        `Failed to build provider "${config.id}": ${(error as Error).message}`
      );
    }
  }

  return registry;
}
