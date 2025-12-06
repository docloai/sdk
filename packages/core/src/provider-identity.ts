/**
 * Provider Identity Types
 *
 * Implements the 3-layer hierarchy for provider identification:
 * 1. Provider (Company/Vendor) - e.g., datalab, openai, anthropic
 * 2. Model - e.g., surya, marker-ocr, claude-sonnet-4.5
 * 3. Method - e.g., native, openrouter, self-hosted
 */

/**
 * Provider vendors (companies)
 * These represent the company or organization providing the service
 */
export type ProviderVendor =
  | 'datalab'      // Datalab (surya, marker-ocr, marker-vlm)
  | 'reducto'      // Reducto (unified document processing)
  | 'unsiloed'     // Unsiloed (unified document processing)
  | 'openai'       // OpenAI (gpt-4.1, o3, o4-mini)
  | 'anthropic'    // Anthropic (claude-*)
  | 'google'       // Google (gemini-*)
  | 'xai';         // xAI (grok-*)

/**
 * Access methods for providers
 * - native: Direct API call to provider's official endpoint
 * - openrouter: Via OpenRouter aggregator (LLM only)
 * - self-hosted: Self-hosted instance (e.g., pip install surya-ocr)
 */
export type AccessMethod = 'native' | 'openrouter' | 'self-hosted';

/**
 * Complete provider identity combining all three layers
 */
export interface ProviderIdentity {
  /** The company/vendor (e.g., 'datalab') */
  readonly provider: ProviderVendor;

  /** The specific model/version (e.g., 'surya', 'marker-vlm') */
  readonly model: string;

  /** How the provider is accessed (e.g., 'native', 'self-hosted') */
  readonly method: AccessMethod;
}

/**
 * Convert provider identity to canonical string format
 * Format: "provider:model" (e.g., "datalab:surya")
 *
 * @example
 * ```typescript
 * toProviderString({ provider: 'datalab', model: 'surya', method: 'native' })
 * // => "datalab:surya"
 * ```
 */
export function toProviderString(identity: ProviderIdentity): string {
  return `${identity.provider}:${identity.model}`;
}

/**
 * Parse canonical provider string back to partial identity
 * Note: method cannot be determined from string alone
 *
 * @example
 * ```typescript
 * parseProviderString("datalab:surya")
 * // => { provider: 'datalab', model: 'surya' }
 * ```
 */
export function parseProviderString(str: string): { provider: string; model: string } {
  const colonIndex = str.indexOf(':');
  if (colonIndex === -1) {
    // Legacy format: just model name (e.g., "surya")
    return { provider: str, model: str };
  }
  return {
    provider: str.slice(0, colonIndex),
    model: str.slice(colonIndex + 1)
  };
}

/**
 * Check if an endpoint appears to be self-hosted
 * Used to determine the access method for OCR providers
 */
export function isLocalEndpoint(endpoint?: string): boolean {
  if (!endpoint) return false;
  return (
    endpoint.includes('localhost') ||
    endpoint.includes('127.0.0.1') ||
    endpoint.includes('0.0.0.0') ||
    endpoint.startsWith('http://192.168.') ||
    endpoint.startsWith('http://10.')
  );
}

/**
 * Create a provider identity with inferred method
 *
 * @param provider - The vendor/company
 * @param model - The model name
 * @param opts - Options including endpoint for method inference
 */
export function createIdentity(
  provider: ProviderVendor,
  model: string,
  opts?: { endpoint?: string; via?: 'openrouter' | 'native' }
): ProviderIdentity {
  let method: AccessMethod = 'native';

  if (opts?.via === 'openrouter') {
    method = 'openrouter';
  } else if (isLocalEndpoint(opts?.endpoint)) {
    method = 'self-hosted';
  }

  return { provider, model, method };
}
