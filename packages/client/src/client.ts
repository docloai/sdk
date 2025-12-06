/**
 * Main Doclo client class
 */

import type { DocloClientConfig, RequestOptions } from './types.js';
import { InvalidApiKeyError, ValidationError } from './errors.js';
import { docloFetch, DEFAULT_BASE_URL, DEFAULT_TIMEOUT } from './utils/fetch.js';
import { FlowsResource } from './resources/flows.js';
import { RunsResource } from './resources/runs.js';

/**
 * Private IP ranges that should be blocked for production keys (SSRF prevention)
 */
const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/,              // 192.168.0.0/16
  /^169\.254\.\d{1,3}\.\d{1,3}$/,              // Link-local
  /^0\.0\.0\.0$/,                               // All interfaces
];

/**
 * Valid API key prefixes
 */
const API_KEY_PREFIXES = ['dc_live_', 'dc_test_'] as const;

/**
 * Doclo client for executing cloud flows via API
 *
 * @example
 * ```typescript
 * import { DocloClient } from '@docloai/client';
 *
 * const client = new DocloClient({
 *   apiKey: process.env.DOCLO_API_KEY!
 * });
 *
 * // Execute a flow
 * const result = await client.flows.run('flow_abc123', {
 *   input: {
 *     document: {
 *       base64: '...',
 *       filename: 'invoice.pdf',
 *       mimeType: 'application/pdf'
 *     }
 *   }
 * });
 *
 * console.log(result.output);
 * ```
 */
export class DocloClient {
  /** Flow management and execution */
  readonly flows: FlowsResource;

  /** Execution run management */
  readonly runs: RunsResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly convexUrl: string;
  private readonly timeout: number;

  /**
   * Create a new Doclo client
   *
   * @param config - Client configuration
   * @throws InvalidApiKeyError if the API key format is invalid
   */
  constructor(config: DocloClientConfig) {
    this.validateApiKey(config.apiKey);

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.convexUrl = config.convexUrl ?? this.baseUrl;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;

    // Validate URLs (allow localhost for test keys or when explicitly configured)
    // If user explicitly provides a baseUrl, they're doing local development
    const isTestKey = config.apiKey.startsWith('dc_test_');
    const hasCustomBaseUrl = config.baseUrl !== undefined;
    const allowLocal = isTestKey || hasCustomBaseUrl;

    this.validateUrl(this.baseUrl, 'baseUrl', allowLocal);
    if (config.convexUrl) {
      this.validateUrl(this.convexUrl, 'convexUrl', allowLocal);
    }

    // Initialize resources
    this.flows = new FlowsResource(this);
    this.runs = new RunsResource(this);
  }

  /**
   * Check if the client is using a test API key
   */
  get isTestMode(): boolean {
    return this.apiKey.startsWith('dc_test_');
  }

  /**
   * Make a request to the app API (internal use)
   */
  async request<T>(options: RequestOptions): Promise<T> {
    return docloFetch<T>(this.baseUrl, this.apiKey, {
      ...options,
      timeout: options.timeout ?? this.timeout,
    });
  }

  /**
   * Make a request to the Convex API for data operations (internal use)
   */
  async requestConvex<T>(options: RequestOptions): Promise<T> {
    return docloFetch<T>(this.convexUrl, this.apiKey, {
      ...options,
      timeout: options.timeout ?? this.timeout,
    });
  }

  /**
   * Validate the API key format
   */
  private validateApiKey(apiKey: string): void {
    if (!apiKey) {
      throw new InvalidApiKeyError('API key is required');
    }

    if (typeof apiKey !== 'string') {
      throw new InvalidApiKeyError('API key must be a string');
    }

    const hasValidPrefix = API_KEY_PREFIXES.some(prefix => apiKey.startsWith(prefix));
    if (!hasValidPrefix) {
      throw new InvalidApiKeyError(
        `API key must start with one of: ${API_KEY_PREFIXES.join(', ')}`
      );
    }

    // Check minimum length (prefix + org_id_prefix + random chars)
    // dc_live_ (8) + org_id (8) + underscore (1) + random (40+) = ~57 chars minimum
    // Using 50 as minimum to allow for some flexibility
    if (apiKey.length < 50) {
      throw new InvalidApiKeyError(
        'API key is too short. Valid keys are at least 50 characters.'
      );
    }
  }

  /**
   * Validate URL format and check for SSRF vulnerabilities
   *
   * @param url - The URL to validate
   * @param fieldName - Name of the field for error messages
   * @param allowLocal - Whether to allow localhost/local IPs (for test keys)
   */
  private validateUrl(url: string, fieldName: string, allowLocal: boolean): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError('INVALID_URL', `Invalid ${fieldName}: not a valid URL`);
    }

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError(
        'INVALID_PROTOCOL',
        `Invalid ${fieldName}: only http and https protocols are allowed`
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check for localhost - allowed for test keys or local development
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost) {
      if (!allowLocal) {
        throw new ValidationError(
          'LOCALHOST_NOT_ALLOWED',
          `Invalid ${fieldName}: localhost is only allowed with test API keys (dc_test_). ` +
          `For production, use a public URL.`
        );
      }
      // localhost is allowed for test keys
      return;
    }

    // Check for private IP ranges - only block for production keys
    if (!allowLocal) {
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          throw new ValidationError(
            'PRIVATE_IP_NOT_ALLOWED',
            `Invalid ${fieldName}: private IP addresses are not allowed for security reasons`
          );
        }
      }
    }

    // Block other potentially dangerous hostnames
    const dangerousHostnames = [
      'metadata.google.internal',
      '169.254.169.254', // AWS/GCP metadata
      'metadata.internal',
    ];

    if (dangerousHostnames.includes(hostname)) {
      throw new ValidationError(
        'DANGEROUS_HOST_NOT_ALLOWED',
        `Invalid ${fieldName}: this hostname is not allowed for security reasons`
      );
    }
  }
}
