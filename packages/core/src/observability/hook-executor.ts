/**
 * Hook Executor
 *
 * Executes observability hooks with timeout protection and error isolation.
 * Ensures hooks never crash flow execution.
 *
 * @module @docloai/core/observability/hook-executor
 */

import type { HookError, ObservabilityConfig, HookContext } from './types.js';

/**
 * Default hook timeout in milliseconds
 */
const DEFAULT_HOOK_TIMEOUT = 5000;

/**
 * Generic hook function type.
 * The context parameter accepts any hook context type since this executor
 * handles all observability hooks (onFlowStart, onStepEnd, onLog, etc.).
 * Each specific hook in ObservabilityConfig has its own typed signature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenericHookFunction = (context: any) => void | Promise<void>;

/**
 * Hook execution options
 */
interface HookExecutionOptions {
  /** Hook name for error reporting */
  hookName: string;
  /** Observability configuration */
  config: ObservabilityConfig;
  /** Context passed to hook - specific type depends on which hook is being called */
  context: HookContext;
  /** Whether this is a fire-and-forget hook (e.g., onLog) */
  fireAndForget?: boolean;
}

/**
 * Execute a hook with timeout protection and error isolation
 *
 * @param hook - The hook function to execute
 * @param options - Execution options
 * @returns Promise that resolves when hook completes (or times out)
 */
export async function executeHook(
  hook: GenericHookFunction | undefined,
  options: HookExecutionOptions
): Promise<void> {
  const { hookName, config, context, fireAndForget = false } = options;

  // Skip if hook not defined
  if (!hook) {
    return;
  }

  // Skip if observability disabled
  if (config.enabled === false) {
    return;
  }

  // Fire-and-forget: don't wait for hook
  if (fireAndForget || config.fireAndForget) {
    // Execute hook but don't wait
    executeHookWithErrorHandling(hook, hookName, context, config).catch(() => {
      // Silently ignore errors in fire-and-forget mode
    });
    return;
  }

  // Normal execution: wait for hook with timeout
  const timeout = config.hookTimeout ?? DEFAULT_HOOK_TIMEOUT;

  try {
    await executeHookWithTimeout(hook, context, timeout, hookName, config);
  } catch (error) {
    // Error already handled in executeHookWithTimeout
    // This catch is just to prevent unhandled rejection
  }
}

/**
 * Execute hook with error handling
 */
async function executeHookWithErrorHandling(
  hook: GenericHookFunction,
  hookName: string,
  context: HookContext,
  config: ObservabilityConfig
): Promise<void> {
  try {
    const result = hook(context);
    // If hook returns a promise, await it
    if (result && typeof result.then === 'function') {
      await result;
    }
  } catch (error) {
    handleHookError(error as Error, hookName, context, config);
  }
}

/**
 * Execute hook with timeout protection
 */
async function executeHookWithTimeout(
  hook: GenericHookFunction,
  context: HookContext,
  timeoutMs: number,
  hookName: string,
  config: ObservabilityConfig
): Promise<void> {
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Hook '${hookName}' exceeded timeout of ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // Create hook execution promise
  const hookPromise = executeHookWithErrorHandling(hook, hookName, context, config);

  // Race between hook and timeout
  try {
    await Promise.race([hookPromise, timeoutPromise]);
  } catch (error) {
    // Timeout or error occurred
    if (error instanceof Error && error.message.includes('exceeded timeout')) {
      // Timeout error
      handleHookError(error, hookName, context, config);
    }
    // Other errors already handled in executeHookWithErrorHandling
  }
}

/**
 * Handle hook execution error
 */
function handleHookError(
  error: Error,
  hookName: string,
  context: HookContext,
  config: ObservabilityConfig
): void {
  const hookError: HookError = {
    hookName,
    error,
    context,
    timestamp: Date.now(),
  };

  // Call onHookError if provided
  if (config.onHookError) {
    try {
      config.onHookError(hookError);
    } catch (onHookErrorError) {
      // onHookError itself failed, log to console as fallback
      console.error('[Observability] onHookError handler failed:', onHookErrorError);
      console.error('[Observability] Original hook error:', hookError);
    }
  } else {
    // No onHookError handler, log to console
    console.warn(`[Observability] Hook '${hookName}' failed:`, error);
  }

  // If failOnHookError is true, throw the error
  if (config.failOnHookError) {
    throw error;
  }

  // Otherwise, silently continue (error isolated)
}

/**
 * Execute multiple hooks serially with timeout protection
 *
 * This ensures hooks run one at a time in the order they're provided.
 *
 * @param hooks - Array of hook execution configs
 */
export async function executeHooksSerial(
  hooks: Array<{
    hook: GenericHookFunction | undefined;
    options: HookExecutionOptions;
  }>
): Promise<void> {
  for (const { hook, options } of hooks) {
    await executeHook(hook, options);
  }
}

/**
 * Check if observability is enabled for this execution
 *
 * Takes sampling into account.
 */
export function isObservabilityEnabled(config: ObservabilityConfig): boolean {
  // Check if explicitly disabled
  if (config.enabled === false) {
    return false;
  }

  // Always enabled if no sampling rate specified
  if (config.samplingRate === undefined || config.samplingRate === 1.0) {
    return true;
  }

  // Never sample if rate is 0
  if (config.samplingRate === 0.0) {
    return false;
  }

  // Random sampling based on rate
  // Note: This decision is made once per flow execution in flow-builder
  // and stored, so sampling is consistent throughout the execution
  return Math.random() < config.samplingRate;
}
