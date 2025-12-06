/**
 * Universal Environment Configuration
 *
 * Provides environment variable access for both Node.js and Edge Runtime.
 * Supports multiple patterns:
 * - Node.js: process.env
 * - Vercel Edge Functions: process.env (available)
 * - Cloudflare Workers: env bindings (passed as config)
 *
 * @module @docloai/core/runtime/env
 */

/**
 * Runtime environment configuration
 *
 * Can be set explicitly or will fall back to process.env when available.
 */
export interface RuntimeEnv {
  /**
   * Node environment (development, production, test)
   */
  NODE_ENV?: string;

  /**
   * Debug flag for validation messages
   */
  DEBUG_VALIDATION?: string;

  /**
   * Skip flow validation (use with caution!)
   */
  DOCLO_SKIP_VALIDATION?: string;

  /**
   * Endpoint for security event logging
   */
  SECURITY_LOG_ENDPOINT?: string;

  /**
   * Additional environment variables
   */
  [key: string]: string | undefined;
}

/**
 * Global runtime environment configuration
 *
 * Set this at application startup to configure environment for Edge Runtime.
 * Falls back to process.env when not set.
 *
 * @example
 * ```typescript
 * // Cloudflare Workers
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     setRuntimeEnv(env);
 *     // ... use SDK
 *   }
 * }
 *
 * // Vercel Edge Functions (process.env works, but can override)
 * setRuntimeEnv({ NODE_ENV: 'production' });
 * ```
 */
let globalRuntimeEnv: RuntimeEnv | null = null;

/**
 * Set global runtime environment configuration
 *
 * Use this to configure environment variables in Edge Runtime environments
 * where process.env is not available (like Cloudflare Workers).
 *
 * @param env - Environment configuration object
 */
export function setRuntimeEnv(env: RuntimeEnv): void {
  globalRuntimeEnv = env;
}

/**
 * Get global runtime environment configuration
 *
 * @returns Current runtime environment config or null
 */
export function getRuntimeEnv(): RuntimeEnv | null {
  return globalRuntimeEnv;
}

/**
 * Clear global runtime environment configuration (for testing)
 */
export function clearRuntimeEnv(): void {
  globalRuntimeEnv = null;
}

/**
 * Get environment variable value
 *
 * Priority:
 * 1. Explicitly set runtime env (via setRuntimeEnv)
 * 2. process.env (Node.js, Vercel Edge)
 * 3. undefined
 *
 * @param key - Environment variable name
 * @param defaultValue - Optional default value if not found
 * @returns Environment variable value or undefined
 *
 * @example
 * ```typescript
 * const nodeEnv = getEnv('NODE_ENV', 'development');
 * const isProduction = nodeEnv === 'production';
 *
 * const skipValidation = getEnv('DOCLO_SKIP_VALIDATION') === 'true';
 * ```
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  // 1. Check explicitly set runtime env
  if (globalRuntimeEnv && key in globalRuntimeEnv) {
    return globalRuntimeEnv[key];
  }

  // 2. Check process.env (Node.js, Vercel Edge)
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value !== undefined) {
      return value;
    }
  }

  // 3. Return default value
  return defaultValue;
}

/**
 * Check if running in production mode
 *
 * @returns True if NODE_ENV is 'production'
 */
export function isProduction(): boolean {
  return getEnv('NODE_ENV') === 'production';
}

/**
 * Check if running in development mode
 *
 * @returns True if NODE_ENV is 'development'
 */
export function isDevelopment(): boolean {
  return getEnv('NODE_ENV') === 'development';
}

/**
 * Check if running in test mode
 *
 * @returns True if NODE_ENV is 'test'
 */
export function isTest(): boolean {
  return getEnv('NODE_ENV') === 'test';
}

/**
 * Check if debug validation is enabled
 *
 * @returns True if DEBUG_VALIDATION is set to any truthy value
 */
export function isDebugValidation(): boolean {
  const debug = getEnv('DEBUG_VALIDATION');
  return Boolean(debug && debug !== '0' && debug !== 'false');
}

/**
 * Check if validation should be skipped
 *
 * CAUTION: Only use in trusted environments!
 *
 * @returns True if DOCLO_SKIP_VALIDATION is 'true'
 */
export function shouldSkipValidation(): boolean {
  return getEnv('DOCLO_SKIP_VALIDATION') === 'true';
}

/**
 * Detect current runtime environment
 *
 * @returns Runtime type: 'node', 'edge-vercel', 'workerd' (Cloudflare), 'browser', or 'unknown'
 */
export function detectRuntime(): 'node' | 'edge-vercel' | 'workerd' | 'browser' | 'unknown' {
  // Check for Cloudflare Workers
  if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
    return 'workerd';
  }

  // Check for Vercel Edge Functions
  if (typeof globalThis !== 'undefined' && 'EdgeRuntime' in globalThis) {
    return 'edge-vercel';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  // Check for browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }

  return 'unknown';
}

/**
 * Check if running in an Edge Runtime environment
 *
 * @returns True if running in Vercel Edge or Cloudflare Workers
 */
export function isEdgeRuntime(): boolean {
  const runtime = detectRuntime();
  return runtime === 'edge-vercel' || runtime === 'workerd';
}

/**
 * Check if running in Node.js
 *
 * @returns True if running in Node.js
 */
export function isNodeRuntime(): boolean {
  return detectRuntime() === 'node';
}
