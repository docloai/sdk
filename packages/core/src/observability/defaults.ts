/**
 * Observability Configuration Defaults
 *
 * Provides default configuration values and config merging utilities.
 *
 * @module @docloai/core/observability/defaults
 */

import type { ObservabilityConfig } from './types.js';

/**
 * Default observability configuration
 */
export const DEFAULT_OBSERVABILITY_CONFIG: Required<Omit<ObservabilityConfig,
  | 'onFlowStart' | 'onFlowEnd' | 'onFlowError'
  | 'onStepStart' | 'onStepEnd' | 'onStepError'
  | 'onConsensusStart' | 'onConsensusRunRetry' | 'onConsensusRunComplete' | 'onConsensusComplete'
  | 'onBatchStart' | 'onBatchItemStart' | 'onBatchItemEnd' | 'onBatchEnd'
  | 'onProviderRequest' | 'onProviderResponse' | 'onProviderRetry' | 'onCircuitBreakerTriggered'
  | 'onLog' | 'onHookError'
  | 'customSampler' | 'generateTraceId' | 'generateSpanId' | 'generateExecutionId'
  | 'traceContext' | 'observabilityVersion'
>> = {
  enabled: true,
  samplingRate: 1.0,
  samplingStrategy: 'random',
  asyncHooks: true,
  fireAndForget: false,
  hookTimeout: 5000,
  failOnHookError: false,
};

/**
 * Merge user config with defaults
 *
 * User config takes precedence over defaults.
 */
export function mergeConfig(userConfig?: ObservabilityConfig): ObservabilityConfig {
  if (!userConfig) {
    return { ...DEFAULT_OBSERVABILITY_CONFIG };
  }

  return {
    ...DEFAULT_OBSERVABILITY_CONFIG,
    ...userConfig,
  };
}

/**
 * Determine if execution should be sampled
 *
 * Uses sampling strategy from config.
 */
export function shouldSample(config: ObservabilityConfig): boolean {
  // Always sample if no rate specified
  if (config.samplingRate === undefined || config.samplingRate === 1.0) {
    return true;
  }

  // Never sample if rate is 0
  if (config.samplingRate === 0.0) {
    return false;
  }

  // Custom sampler (will be called later with flow context)
  if (config.samplingStrategy === 'custom' && config.customSampler) {
    // Custom sampler will be called in flow execution
    // For now, assume sampled (decision made later)
    return true;
  }

  // Random sampling (default)
  return Math.random() < config.samplingRate;
}

/**
 * Validate observability configuration
 *
 * Checks for invalid values and warns about issues.
 */
export function validateConfig(config: ObservabilityConfig): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate sampling rate
  if (config.samplingRate !== undefined) {
    if (config.samplingRate < 0 || config.samplingRate > 1) {
      errors.push('samplingRate must be between 0.0 and 1.0');
    }
  }

  // Validate hook timeout
  if (config.hookTimeout !== undefined) {
    if (config.hookTimeout <= 0) {
      errors.push('hookTimeout must be positive');
    }
    if (config.hookTimeout > 60000) {
      warnings.push('hookTimeout > 60s may cause long execution delays');
    }
  }

  // Validate sampling strategy
  if (config.samplingStrategy === 'custom' && !config.customSampler) {
    errors.push('customSampler required when samplingStrategy is "custom"');
  }

  // Validate trace context propagation
  if (config.traceContext) {
    const { traceId, parentSpanId } = config.traceContext;

    // Validate trace ID format
    if (!/^[0-9a-f]{32}$/.test(traceId)) {
      errors.push('traceContext.traceId must be 32 lowercase hex characters');
    }

    // Validate parent span ID format
    if (!/^[0-9a-f]{16}$/.test(parentSpanId)) {
      errors.push('traceContext.parentSpanId must be 16 lowercase hex characters');
    }

    // Validate trace ID is not all zeros
    if (traceId === '00000000000000000000000000000000') {
      errors.push('traceContext.traceId cannot be all zeros');
    }

    // Validate parent span ID is not all zeros
    if (parentSpanId === '0000000000000000') {
      errors.push('traceContext.parentSpanId cannot be all zeros');
    }
  }

  // Warn about conflicting options
  if (config.asyncHooks === false && config.hookTimeout !== undefined) {
    warnings.push('hookTimeout has no effect when asyncHooks is false');
  }

  if (config.fireAndForget === true && config.hookTimeout !== undefined) {
    warnings.push('hookTimeout has no effect when fireAndForget is true');
  }

  if (config.enabled === false && Object.keys(config).length > 1) {
    warnings.push('Observability is disabled, other config options have no effect');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Get observability version
 *
 * Returns the version of the observability contract.
 */
export function getObservabilityVersion(config?: ObservabilityConfig): string {
  return config?.observabilityVersion ?? '1.0.0';
}

/**
 * Check if observability is effectively disabled
 *
 * Returns true if observability is explicitly disabled or sampling rate is 0.
 */
export function isObservabilityDisabled(config: ObservabilityConfig): boolean {
  return config.enabled === false || config.samplingRate === 0.0;
}

/**
 * Check if any hooks are configured
 *
 * Returns true if at least one hook is defined.
 */
export function hasAnyHooks(config: ObservabilityConfig): boolean {
  return !!(
    config.onFlowStart ||
    config.onFlowEnd ||
    config.onFlowError ||
    config.onStepStart ||
    config.onStepEnd ||
    config.onStepError ||
    config.onConsensusStart ||
    config.onConsensusRunRetry ||
    config.onConsensusRunComplete ||
    config.onConsensusComplete ||
    config.onBatchStart ||
    config.onBatchItemStart ||
    config.onBatchItemEnd ||
    config.onBatchEnd ||
    config.onProviderRequest ||
    config.onProviderResponse ||
    config.onProviderRetry ||
    config.onCircuitBreakerTriggered ||
    config.onLog
  );
}

/**
 * Create minimal config for testing
 *
 * Useful for unit tests that don't need full observability.
 */
export function createMinimalConfig(overrides?: Partial<ObservabilityConfig>): ObservabilityConfig {
  return {
    enabled: true,
    samplingRate: 1.0,
    asyncHooks: false, // Faster for tests
    fireAndForget: false,
    hookTimeout: 1000, // Shorter for tests
    failOnHookError: false,
    ...overrides,
  };
}
