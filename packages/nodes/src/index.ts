import {
  node,
  type DocumentIR,
  type OCRProvider,
  type VLMProvider,
  type LLMProvider,
  type FlowInput,
  type SplitDocument,
  type ParseNodeConfig,
  type SplitNodeConfig,
  type CategorizeNodeConfig,
  type ExtractNodeConfig,
  type ExtractInputMode,
  type ChunkNodeConfig,
  type ChunkOutput,
  type ChunkMetadata,
  type CombineNodeConfig,
  type OutputNodeConfig,
  type ConsensusConfig,
  type ConsensusMetadata,
  type ConsensusRunResult,
  type FieldVotingDetails,
  type OutputWithConsensus,
  type CitationSourceType,
  type OutputWithCitations,
  type NodeCtx,
  type IRPage,
  type IRLine,
  validateJson,
  isPDFDocument,
  detectDocumentType,
  getPDFPageCount,
  splitPDFIntoChunks
} from "@doclo/core";
import { safeJsonParse } from "@doclo/core/security";
import type {
  ObservabilityConfig,
  ConsensusStartContext,
  ConsensusRunRetryContext,
  ConsensusRunContext,
  ConsensusCompleteContext,
  TraceContext,
} from "@doclo/core/observability";
import {
  executeHook,
  generateSpanId,
} from "@doclo/core/observability";
import { PROMPT_REGISTRY, renderPrompt } from "@doclo/prompts";
import { SCHEMA_REGISTRY } from "@doclo/schemas";

/**
 * Sanitize object to prevent prototype pollution
 * Removes dangerous keys like __proto__, constructor, prototype
 */
function sanitizeObject<T = any>(obj: any): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const clean: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key) && !dangerous.includes(key)) {
      clean[key] = obj[key];
    }
  }

  return clean;
}

/**
 * Parse provider name in format "provider:model" to separate fields
 * Example: "google:gemini-2.5-flash" -> { provider: "google", model: "gemini-2.5-flash" }
 */
function parseProviderName(name: string): { provider: string; model: string } {
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) {
    // No colon found, treat entire name as provider
    return { provider: name, model: 'unknown' };
  }
  return {
    provider: name.substring(0, colonIndex),
    model: name.substring(colonIndex + 1)
  };
}

/**
 * Resolve schema from config - handles ref strings, enhanced schemas, and plain objects
 */
function resolveSchema(schemaConfig: any): any {
  // Handle schema reference: { ref: "bdn@1.0.0" }
  if (schemaConfig && typeof schemaConfig === 'object' && 'ref' in schemaConfig) {
    const ref = schemaConfig.ref as string;
    const [id, version] = ref.includes('@') ? ref.split('@') : [ref, undefined];
    const schemaAsset = version
      ? SCHEMA_REGISTRY.get(id, version)
      : SCHEMA_REGISTRY.getLatest(id);
    if (!schemaAsset) {
      throw new Error(`Schema not found: ${ref}`);
    }
    return schemaAsset.schema;
  }

  // Handle enhanced schema: { schema: {...}, contextPrompt: "...", ... }
  if (schemaConfig && typeof schemaConfig === 'object' && 'schema' in schemaConfig) {
    return schemaConfig; // Return as-is, caller will extract .schema property
  }

  // Plain schema object
  return schemaConfig;
}

/**
 * Calculate field-level agreement scores for consensus results
 * Returns a map of field paths to agreement scores (0.0 to 1.0)
 */
function calculateFieldAgreement<T>(results: T[]): Record<string, number> {
  if (results.length === 0) return {};
  if (results.length === 1) return flattenObject(results[0], 1.0);

  const fieldValues = new Map<string, any[]>();

  // Collect all field values
  for (const result of results) {
    const flattened = flattenObject(result);
    for (const [path, value] of Object.entries(flattened)) {
      if (!fieldValues.has(path)) {
        fieldValues.set(path, []);
      }
      fieldValues.get(path)!.push(value);
    }
  }

  // Calculate agreement for each field
  const agreement: Record<string, number> = {};
  for (const [path, values] of fieldValues.entries()) {
    const valueCounts = new Map<string, number>();
    for (const value of values) {
      const key = JSON.stringify(value);
      valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
    }

    // Find the most common value count
    const maxCount = Math.max(...valueCounts.values());
    agreement[path] = maxCount / results.length;
  }

  return agreement;
}

/**
 * Flatten nested objects to dot-notation paths
 */
function flattenObject(obj: any, defaultValue?: any): Record<string, any> {
  const result: Record<string, any> = {};

  function traverse(current: any, path: string = '') {
    if (current === null || current === undefined) {
      if (path) result[path] = defaultValue !== undefined ? defaultValue : current;
      return;
    }

    if (typeof current !== 'object' || current instanceof Date) {
      if (path) result[path] = defaultValue !== undefined ? defaultValue : current;
      return;
    }

    if (Array.isArray(current)) {
      result[path] = defaultValue !== undefined ? defaultValue : current;
      // Also track array length agreement
      result[`${path}.length`] = current.length;
      return;
    }

    // Regular object
    const keys = Object.keys(current);
    if (keys.length === 0 && path) {
      result[path] = defaultValue !== undefined ? defaultValue : current;
      return;
    }

    for (const key of keys) {
      const newPath = path ? `${path}.${key}` : key;
      traverse(current[key], newPath);
    }
  }

  traverse(obj);
  return result;
}

/**
 * Build detailed voting information for consensus results
 */
function buildVotingDetails<T>(results: T[], winner: T, tieBreakerUsed?: string | null): FieldVotingDetails[] {
  if (results.length === 0) return [];

  const fieldVoting: Map<string, Map<string, { count: number; runIndices: number[] }>> = new Map();

  // Collect voting data for each field
  results.forEach((result, runIndex) => {
    const flattened = flattenObject(result);
    for (const [path, value] of Object.entries(flattened)) {
      if (!fieldVoting.has(path)) {
        fieldVoting.set(path, new Map());
      }

      const valueKey = JSON.stringify(value === undefined ? null : value);
      const fieldMap = fieldVoting.get(path)!;

      if (!fieldMap.has(valueKey)) {
        fieldMap.set(valueKey, { count: 0, runIndices: [] });
      }

      const entry = fieldMap.get(valueKey)!;
      entry.count++;
      entry.runIndices.push(runIndex);
    }
  });

  // Build voting details
  const votingDetails: FieldVotingDetails[] = [];
  const winnerFlattened = flattenObject(winner);

  for (const [fieldPath, valueMap] of fieldVoting.entries()) {
    const values = Array.from(valueMap.entries()).map(([valueKey, data]) => ({
      value: safeJsonParse(valueKey),
      count: data.count,
      percentage: (data.count / results.length) * 100,
      runIndices: data.runIndices
    })).sort((a, b) => b.count - a.count);

    const winnerValue = winnerFlattened[fieldPath];
    const topCount = values[0]?.count || 0;
    const isTie = values.filter(v => v.count === topCount).length > 1;
    const agreementScore = topCount / results.length;

    votingDetails.push({
      fieldPath,
      values,
      winner: winnerValue,
      isTie,
      agreementScore
    });
  }

  return votingDetails;
}

/**
 * Calculate overall consensus confidence level
 */
function getConfidenceLevel(fieldAgreement: Record<string, number>): 'high' | 'medium' | 'low' {
  const scores = Object.values(fieldAgreement);
  if (scores.length === 0) return 'low';

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  if (average >= 0.9) return 'high';
  if (average >= 0.7) return 'medium';
  return 'low';
}

/**
 * Check if a result is empty (null, undefined, empty object, or empty array)
 */
function isEmptyResult(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value as object).length === 0;
}

/**
 * Reconstruct nested object from dot-notation flattened paths
 */
function unflattenObject(flat: Record<string, any>): any {
  // Handle root-level array/primitive case (empty string key means root value)
  if ('' in flat) {
    return flat[''];
  }

  const result: any = {};

  // Sort paths by length (shortest first) so parents are processed before children
  const sortedPaths = Object.keys(flat).sort((a, b) => a.split('.').length - b.split('.').length);

  for (const path of sortedPaths) {
    // Skip array length metadata entries
    if (path.endsWith('.length')) continue;

    const value = flat[path];
    const keys = path.split('.');
    let current = result;
    let skipPath = false;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      // Skip if parent is null/undefined or not an object (can't traverse into it)
      if (current[key] === null || current[key] === undefined || typeof current[key] !== 'object') {
        skipPath = true;
        break;
      }
      current = current[key];
    }

    if (!skipPath) {
      current[keys[keys.length - 1]] = value;
    }
  }

  return result;
}

/**
 * Compose winner from per-field majority votes (field-level consensus)
 */
function composeFieldLevelWinner<T>(results: T[]): {
  winner: T;
  isSynthetic: boolean;
  fieldWinners: Record<string, { value: any; votes: number }>;
} {
  if (results.length === 0) throw new Error('No results to compose field-level consensus from');
  if (results.length === 1) {
    return { winner: results[0], isSynthetic: false, fieldWinners: {} };
  }

  const fieldVotes = new Map<string, Map<string, { count: number; value: any }>>();

  // Collect votes per field
  for (const result of results) {
    const flattened = flattenObject(result);
    for (const [path, value] of Object.entries(flattened)) {
      if (!fieldVotes.has(path)) {
        fieldVotes.set(path, new Map());
      }
      const valueKey = JSON.stringify(value);
      const pathMap = fieldVotes.get(path)!;
      if (!pathMap.has(valueKey)) {
        pathMap.set(valueKey, { count: 0, value });
      }
      pathMap.get(valueKey)!.count++;
    }
  }

  // Select per-field winners (majority vote per field)
  const winnerFlat: Record<string, any> = {};
  const fieldWinners: Record<string, { value: any; votes: number }> = {};

  for (const [path, votes] of fieldVotes.entries()) {
    let maxCount = 0;
    let winningValue: any;
    for (const { count, value } of votes.values()) {
      if (count > maxCount) {
        maxCount = count;
        winningValue = value;
      }
    }
    winnerFlat[path] = winningValue;
    fieldWinners[path] = { value: winningValue, votes: maxCount };
  }

  const winner = unflattenObject(winnerFlat) as T;

  // Check if winner matches any original result exactly
  const winnerKey = JSON.stringify(winner);
  const isSynthetic = !results.some(r => JSON.stringify(r) === winnerKey);

  return { winner, isSynthetic, fieldWinners };
}

/** Consensus runner - runs a function N times and returns majority result or metadata */
async function runWithConsensus<T>(
  fn: () => Promise<T>,
  config?: ConsensusConfig,
  ctx?: import('@doclo/core/internal/validation-utils').NodeCtx,
  observabilityContext?: {
    observability?: ObservabilityConfig;
    flowId?: string;
    executionId?: string;
    stepId?: string;
    stepIndex?: number;
    traceContext?: TraceContext;
    metadata?: Record<string, unknown>;
  }
): Promise<T | OutputWithConsensus<T>> {
  // Handle single run or no config case (but with retry support)
  if (!config || (config.runs === 1 && !config.retryOnFailure)) {
    // Simple single-run path without retry
    if (config?.includeMetadata) {
      const startTime = Date.now();
      const result = await fn();
      const endTime = Date.now();

      const metadata: ConsensusMetadata<T> = {
        totalRuns: 1,
        successfulRuns: 1,
        failedRuns: 0,
        strategy: 'majority',
        selectedResult: result,
        selectedRunIndex: 0,
        confidence: 'high',
        overallAgreement: 1.0,
        fieldAgreement: flattenObject(result, 1.0),
        votingDetails: [],
        runs: [{
          runIndex: 0,
          value: result,
          success: true,
          startTime,
          endTime,
          duration: endTime - startTime
        }],
        executionTime: endTime - startTime,
        wasRetry: false,
        tieBreakerUsed: null,
        votingLevel: 'object',
        isSyntheticResult: false,
        totalRetries: 0,
        emptyResultsFiltered: 0
      };

      return { data: result, consensus: metadata };
    }
    return fn();
  }

  const executionStartTime = Date.now();
  const parallel = config.parallel !== false;
  const strategy = config.strategy || 'majority';
  const onTie = config.onTie || 'random';

  const runResults: ConsensusRunResult<T>[] = [];
  const successfulResults: T[] = [];
  const allRunMetrics: import('@doclo/core/internal/validation-utils').StepMetric[][] = [];

  // onConsensusStart hook
  if (observabilityContext?.observability && observabilityContext.traceContext && observabilityContext.executionId) {
    const consensusStartContext: ConsensusStartContext = {
      flowId: observabilityContext.flowId ?? 'flow',
      executionId: observabilityContext.executionId,
      stepId: observabilityContext.stepId ?? 'consensus',
      timestamp: executionStartTime,
      runsPlanned: config.runs,
      strategy,
      metadata: observabilityContext.metadata,
      traceContext: observabilityContext.traceContext,
    };
    await executeHook(observabilityContext.observability.onConsensusStart, {
      hookName: 'onConsensusStart',
      config: observabilityContext.observability,
      context: consensusStartContext,
    });
  }

  // Helper to capture metrics from a single run
  const captureMetricsForRun = async <R>(runFn: () => Promise<R>): Promise<{ result: R; metrics: import('@doclo/core/internal/validation-utils').StepMetric[] }> => {
    const capturedMetrics: import('@doclo/core/internal/validation-utils').StepMetric[] = [];

    if (ctx?.metrics) {
      // Save original push function
      const originalPush = ctx.metrics.push;

      // Replace with interceptor
      ctx.metrics.push = (metric: import('@doclo/core/internal/validation-utils').StepMetric) => {
        capturedMetrics.push(metric);
        originalPush(metric); // Still push to original array
      };

      try {
        const result = await runFn();
        return { result, metrics: capturedMetrics };
      } finally {
        // Restore original push function
        ctx.metrics.push = originalPush;
      }
    } else {
      // No ctx available, just run without metrics
      const result = await runFn();
      return { result, metrics: [] };
    }
  };

  // Retry configuration
  const retryEnabled = config.retryOnFailure === true;
  const maxRetries = config.maxRetries ?? 1;
  let totalRetries = 0;

  if (parallel) {
    // Parallel execution: All runs start simultaneously
    const runPromises = Array.from({ length: config.runs }, async (_, i) => {
      const startTime = Date.now();
      let lastError: string | undefined;
      let lastMetrics: import('@doclo/core/internal/validation-utils').StepMetric[] = [];
      let attempts = 0;
      const maxAttempts = retryEnabled ? maxRetries + 1 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        attempts = attempt + 1;
        try {
          const { result: value, metrics } = await captureMetricsForRun(fn);
          lastMetrics = metrics;

          if (!isEmptyResult(value)) {
            // Success with non-empty result
            return {
              runIndex: i,
              value,
              metrics,
              success: true,
              startTime,
              endTime: Date.now(),
              duration: Date.now() - startTime,
              attempts
            };
          }

          // Empty result - retry if enabled
          lastError = 'Empty result';
          if (attempt < maxAttempts - 1) {
            totalRetries++;
            console.warn(`Consensus run ${i} returned empty result (attempt ${attempt + 1}/${maxAttempts}), retrying...`);

            // Emit onConsensusRunRetry hook
            if (observabilityContext?.observability?.onConsensusRunRetry && observabilityContext.traceContext && observabilityContext.executionId) {
              const retryContext: ConsensusRunRetryContext = {
                flowId: observabilityContext.flowId ?? 'flow',
                executionId: observabilityContext.executionId,
                parentStepId: observabilityContext.stepId ?? 'consensus',
                consensusRunId: `${observabilityContext.executionId}-consensus-${i}`,
                runIndex: i,
                timestamp: Date.now(),
                attemptNumber: attempt + 1,
                maxAttempts,
                reason: 'empty_result',
                partialUsage: lastMetrics.length > 0 ? {
                  inputTokens: lastMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
                  outputTokens: lastMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
                } : undefined,
                partialCost: lastMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0) || undefined,
                metadata: observabilityContext.metadata,
                traceContext: observabilityContext.traceContext,
              };
              await executeHook(observabilityContext.observability.onConsensusRunRetry, {
                hookName: 'onConsensusRunRetry',
                config: observabilityContext.observability,
                context: retryContext,
              });
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (attempt < maxAttempts - 1) {
            totalRetries++;
            console.warn(`Consensus run ${i} failed (attempt ${attempt + 1}/${maxAttempts}): ${lastError}, retrying...`);

            // Emit onConsensusRunRetry hook
            if (observabilityContext?.observability?.onConsensusRunRetry && observabilityContext.traceContext && observabilityContext.executionId) {
              const retryContext: ConsensusRunRetryContext = {
                flowId: observabilityContext.flowId ?? 'flow',
                executionId: observabilityContext.executionId,
                parentStepId: observabilityContext.stepId ?? 'consensus',
                consensusRunId: `${observabilityContext.executionId}-consensus-${i}`,
                runIndex: i,
                timestamp: Date.now(),
                attemptNumber: attempt + 1,
                maxAttempts,
                reason: 'error',
                error: error instanceof Error ? error : new Error(String(error)),
                partialUsage: lastMetrics.length > 0 ? {
                  inputTokens: lastMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
                  outputTokens: lastMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
                } : undefined,
                partialCost: lastMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0) || undefined,
                metadata: observabilityContext.metadata,
                traceContext: observabilityContext.traceContext,
              };
              await executeHook(observabilityContext.observability.onConsensusRunRetry, {
                hookName: 'onConsensusRunRetry',
                config: observabilityContext.observability,
                context: retryContext,
              });
            }
          }
        }
      }

      // All attempts exhausted
      return {
        runIndex: i,
        value: null as T | null,
        metrics: lastMetrics,
        success: false,
        error: lastError,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        attempts
      };
    });

    const outcomes = await Promise.all(runPromises);

    for (const outcome of outcomes) {
      runResults.push(outcome);
      if (outcome.success && outcome.value !== null && !isEmptyResult(outcome.value)) {
        successfulResults.push(outcome.value);
      } else if (!outcome.success) {
        console.warn(`Consensus run ${outcome.runIndex} failed:`, 'error' in outcome ? outcome.error : 'Unknown error');
      } else {
        console.warn(`Consensus run ${outcome.runIndex} returned empty result`);
      }

      // Store metrics for this run
      const runMetrics = 'metrics' in outcome ? outcome.metrics : [];
      allRunMetrics.push(runMetrics);

      // onConsensusRunComplete hook
      if (observabilityContext?.observability && observabilityContext.traceContext && observabilityContext.executionId) {
        // Aggregate metrics from this run
        const usage = {
          inputTokens: runMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
          outputTokens: runMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
          totalTokens: runMetrics.reduce((sum, m) => sum + ((m.inputTokens ?? 0) + (m.outputTokens ?? 0)), 0),
          cacheCreationInputTokens: runMetrics.reduce((sum, m) => sum + (m.cacheCreationInputTokens ?? 0), 0) || undefined,
          cacheReadInputTokens: runMetrics.reduce((sum, m) => sum + (m.cacheReadInputTokens ?? 0), 0) || undefined,
        };
        const cost = runMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0);

        const runAttempts = 'attempts' in outcome ? outcome.attempts : 1;
        const consensusRunContext: ConsensusRunContext = {
          flowId: observabilityContext.flowId ?? 'flow',
          executionId: observabilityContext.executionId,
          parentStepId: observabilityContext.stepId ?? 'consensus',
          consensusRunId: `${observabilityContext.executionId}-consensus-${outcome.runIndex}`,
          runIndex: outcome.runIndex,
          timestamp: outcome.endTime,
          startTime: outcome.startTime,
          duration: outcome.duration,
          output: outcome.value,
          usage,
          cost,
          status: outcome.success ? 'success' : 'failed',
          error: 'error' in outcome && outcome.error ? new Error(outcome.error) : undefined,
          totalAttempts: runAttempts,
          wasRetried: runAttempts > 1,
          metadata: observabilityContext.metadata,
          traceContext: observabilityContext.traceContext,
        };
        await executeHook(observabilityContext.observability.onConsensusRunComplete, {
          hookName: 'onConsensusRunComplete',
          config: observabilityContext.observability,
          context: consensusRunContext,
        });
      }
    }
  } else {
    // Sequential execution: Runs one at a time
    for (let i = 0; i < config.runs; i++) {
      const startTime = Date.now();
      let lastError: string | undefined;
      let lastMetrics: import('@doclo/core/internal/validation-utils').StepMetric[] = [];
      let finalValue: T | null = null;
      let success = false;
      let attempts = 0;
      const maxAttempts = retryEnabled ? maxRetries + 1 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        attempts = attempt + 1;
        try {
          const { result: value, metrics: runMetrics } = await captureMetricsForRun(fn);
          lastMetrics = runMetrics;

          if (!isEmptyResult(value)) {
            // Success with non-empty result
            finalValue = value;
            success = true;
            break;
          }

          // Empty result - retry if enabled
          lastError = 'Empty result';
          if (attempt < maxAttempts - 1) {
            totalRetries++;
            console.warn(`Consensus run ${i} returned empty result (attempt ${attempt + 1}/${maxAttempts}), retrying...`);

            // Emit onConsensusRunRetry hook
            if (observabilityContext?.observability?.onConsensusRunRetry && observabilityContext.traceContext && observabilityContext.executionId) {
              const retryContext: ConsensusRunRetryContext = {
                flowId: observabilityContext.flowId ?? 'flow',
                executionId: observabilityContext.executionId,
                parentStepId: observabilityContext.stepId ?? 'consensus',
                consensusRunId: `${observabilityContext.executionId}-consensus-${i}`,
                runIndex: i,
                timestamp: Date.now(),
                attemptNumber: attempt + 1,
                maxAttempts,
                reason: 'empty_result',
                partialUsage: lastMetrics.length > 0 ? {
                  inputTokens: lastMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
                  outputTokens: lastMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
                } : undefined,
                partialCost: lastMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0) || undefined,
                metadata: observabilityContext.metadata,
                traceContext: observabilityContext.traceContext,
              };
              await executeHook(observabilityContext.observability.onConsensusRunRetry, {
                hookName: 'onConsensusRunRetry',
                config: observabilityContext.observability,
                context: retryContext,
              });
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (attempt < maxAttempts - 1) {
            totalRetries++;
            console.warn(`Consensus run ${i} failed (attempt ${attempt + 1}/${maxAttempts}): ${lastError}, retrying...`);

            // Emit onConsensusRunRetry hook
            if (observabilityContext?.observability?.onConsensusRunRetry && observabilityContext.traceContext && observabilityContext.executionId) {
              const retryContext: ConsensusRunRetryContext = {
                flowId: observabilityContext.flowId ?? 'flow',
                executionId: observabilityContext.executionId,
                parentStepId: observabilityContext.stepId ?? 'consensus',
                consensusRunId: `${observabilityContext.executionId}-consensus-${i}`,
                runIndex: i,
                timestamp: Date.now(),
                attemptNumber: attempt + 1,
                maxAttempts,
                reason: 'error',
                error: error instanceof Error ? error : new Error(String(error)),
                partialUsage: lastMetrics.length > 0 ? {
                  inputTokens: lastMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
                  outputTokens: lastMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
                } : undefined,
                partialCost: lastMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0) || undefined,
                metadata: observabilityContext.metadata,
                traceContext: observabilityContext.traceContext,
              };
              await executeHook(observabilityContext.observability.onConsensusRunRetry, {
                hookName: 'onConsensusRunRetry',
                config: observabilityContext.observability,
                context: retryContext,
              });
            }
          }
        }
      }

      const endTime = Date.now();
      const runResult: ConsensusRunResult<T> = {
        runIndex: i,
        value: finalValue,
        success,
        startTime,
        endTime,
        duration: endTime - startTime,
        attempts,
        ...(success ? {} : { error: lastError })
      };
      runResults.push(runResult);

      if (success && finalValue !== null) {
        successfulResults.push(finalValue);
      } else {
        console.warn(`Consensus run ${i} failed after ${attempts} attempt(s):`, lastError);
      }

      // Store metrics for this run
      allRunMetrics.push(lastMetrics);

      // onConsensusRunComplete hook
      if (observabilityContext?.observability && observabilityContext.traceContext && observabilityContext.executionId) {
        const usage = {
          inputTokens: lastMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
          outputTokens: lastMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
          totalTokens: lastMetrics.reduce((sum, m) => sum + ((m.inputTokens ?? 0) + (m.outputTokens ?? 0)), 0),
          cacheCreationInputTokens: lastMetrics.reduce((sum, m) => sum + (m.cacheCreationInputTokens ?? 0), 0) || undefined,
          cacheReadInputTokens: lastMetrics.reduce((sum, m) => sum + (m.cacheReadInputTokens ?? 0), 0) || undefined,
        };
        const cost = lastMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0);

        const consensusRunContext: ConsensusRunContext = {
          flowId: observabilityContext.flowId ?? 'flow',
          executionId: observabilityContext.executionId,
          parentStepId: observabilityContext.stepId ?? 'consensus',
          consensusRunId: `${observabilityContext.executionId}-consensus-${i}`,
          runIndex: i,
          timestamp: endTime,
          startTime,
          duration: endTime - startTime,
          output: finalValue,
          usage,
          cost,
          status: success ? 'success' : 'failed',
          error: success ? undefined : new Error(lastError || 'Unknown error'),
          totalAttempts: attempts,
          wasRetried: attempts > 1,
          metadata: observabilityContext.metadata,
          traceContext: observabilityContext.traceContext,
        };
        await executeHook(observabilityContext.observability.onConsensusRunComplete, {
          hookName: 'onConsensusRunComplete',
          config: observabilityContext.observability,
          context: consensusRunContext,
        });
      }
    }
  }

  // Check minimum required results
  const minRequired = strategy === 'unanimous' ? config.runs : Math.ceil(config.runs / 2);
  if (successfulResults.length < minRequired) {
    throw new Error(
      `Consensus failed: Only ${successfulResults.length}/${config.runs} runs succeeded (minimum ${minRequired} required)`
    );
  }

  let winner: T;
  let selectedRunIndex: number = -1;
  let wasRetry = false;
  let tieBreakerUsed: 'random' | 'retry' | 'fail' | null = null;
  let isSyntheticResult = false;
  const votingLevel = config.level || 'object';

  // Count empty results that were filtered
  const emptyResultsFiltered = runResults.filter(r => !r.success && r.error === 'Empty result').length;

  // Unanimous strategy check
  if (strategy === 'unanimous') {
    const first = JSON.stringify(successfulResults[0]);
    const allSame = successfulResults.every(r => JSON.stringify(r) === first);
    if (!allSame) {
      throw new Error('Consensus failed: unanimous strategy requires all results to match');
    }
    winner = successfulResults[0];
    selectedRunIndex = runResults.findIndex(r => r.success && JSON.stringify(r.value) === first);
  } else if (votingLevel === 'field') {
    // Field-level voting: compose winner from per-field majority votes
    const fieldResult = composeFieldLevelWinner(successfulResults);
    winner = fieldResult.winner;
    isSyntheticResult = fieldResult.isSynthetic;

    // Find closest matching run for selectedRunIndex
    const winnerKey = JSON.stringify(winner);
    selectedRunIndex = runResults.findIndex(r => r.success && JSON.stringify(r.value) === winnerKey);
    if (selectedRunIndex === -1) {
      // Winner is synthetic (composed from multiple runs), use first successful run
      selectedRunIndex = runResults.findIndex(r => r.success);
    }
  } else {
    // Object-level majority vote (default)
    const counts = new Map<string, { count: number; value: T; indices: number[] }>();

    successfulResults.forEach((result, idx) => {
      const key = JSON.stringify(result);
      const runIndex = runResults.findIndex((r, i) => r.success && i >= idx && JSON.stringify(r.value) === key);

      if (counts.has(key)) {
        const entry = counts.get(key)!;
        entry.count++;
        entry.indices.push(runIndex);
      } else {
        counts.set(key, { count: 1, value: result, indices: [runIndex] });
      }
    });

    // Find max count
    let maxCount = 0;
    const winners: { value: T; indices: number[] }[] = [];

    for (const { count, value, indices } of counts.values()) {
      if (count > maxCount) {
        maxCount = count;
        winners.length = 0;
        winners.push({ value, indices });
      } else if (count === maxCount) {
        winners.push({ value, indices });
      }
    }

    // Handle ties
    if (winners.length > 1) {
      tieBreakerUsed = onTie;

      if (onTie === 'fail') {
        throw new Error(`Consensus failed: tie between ${winners.length} results`);
      } else if (onTie === 'retry') {
        // Retry once more
        wasRetry = true;
        const retryStartTime = Date.now();
        winner = await fn();
        const retryEndTime = Date.now();

        // Add retry run to results
        runResults.push({
          runIndex: config.runs,
          value: winner,
          success: true,
          startTime: retryStartTime,
          endTime: retryEndTime,
          duration: retryEndTime - retryStartTime
        });
        selectedRunIndex = config.runs;
      } else {
        // Default: random
        const selected = winners[Math.floor(Math.random() * winners.length)];
        winner = selected.value;
        selectedRunIndex = selected.indices[0];
      }
    } else {
      winner = winners[0].value;
      selectedRunIndex = winners[0].indices[0];
    }
  }

  // Calculate metadata (for hook and potential return)
  const fieldAgreement = calculateFieldAgreement(successfulResults);
  const overallAgreement = Object.values(fieldAgreement).length > 0
    ? Object.values(fieldAgreement).reduce((sum, score) => sum + score, 0) / Object.values(fieldAgreement).length
    : 0;

  // onConsensusComplete hook (called regardless of includeMetadata)
  if (observabilityContext?.observability && observabilityContext.traceContext && observabilityContext.executionId) {
    // Aggregate metrics from all runs
    const flatMetrics = allRunMetrics.flat();
    const totalUsage = {
      inputTokens: flatMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
      outputTokens: flatMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
      totalTokens: flatMetrics.reduce((sum, m) => sum + ((m.inputTokens ?? 0) + (m.outputTokens ?? 0)), 0),
      cacheCreationInputTokens: flatMetrics.reduce((sum, m) => sum + (m.cacheCreationInputTokens ?? 0), 0) || undefined,
      cacheReadInputTokens: flatMetrics.reduce((sum, m) => sum + (m.cacheReadInputTokens ?? 0), 0) || undefined,
    };
    const totalCost = flatMetrics.reduce((sum, m) => sum + (m.costUSD ?? 0), 0);

    const runsWithRetries = runResults.filter(r => (r.attempts ?? 1) > 1).length;
    const consensusCompleteContext: ConsensusCompleteContext = {
      flowId: observabilityContext.flowId ?? 'flow',
      executionId: observabilityContext.executionId,
      stepId: observabilityContext.stepId ?? 'consensus',
      timestamp: Date.now(),
      totalRuns: config.runs + (wasRetry ? 1 : 0),
      successfulRuns: successfulResults.length + (wasRetry ? 1 : 0),
      failedRuns: config.runs - successfulResults.length,
      agreedOutput: winner,
      agreement: overallAgreement,
      totalUsage,
      totalCost,
      totalRetries,
      runsWithRetries,
      metadata: observabilityContext.metadata,
      traceContext: observabilityContext.traceContext,
    };
    await executeHook(observabilityContext.observability.onConsensusComplete, {
      hookName: 'onConsensusComplete',
      config: observabilityContext.observability,
      context: consensusCompleteContext,
    });
  }

  // If not including metadata, return just the winner
  if (!config.includeMetadata) {
    return winner;
  }

  // Continue calculating full metadata for return
  const confidence = getConfidenceLevel(fieldAgreement);
  const votingDetails = buildVotingDetails(successfulResults, winner, tieBreakerUsed);

  const metadata: ConsensusMetadata<T> = {
    totalRuns: config.runs + (wasRetry ? 1 : 0),
    successfulRuns: successfulResults.length + (wasRetry ? 1 : 0),
    failedRuns: config.runs - successfulResults.length,
    strategy,
    selectedResult: winner,
    selectedRunIndex,
    confidence,
    overallAgreement,
    fieldAgreement,
    votingDetails,
    runs: runResults,
    executionTime: Date.now() - executionStartTime,
    wasRetry,
    tieBreakerUsed,
    // New fields for enhanced consensus features
    votingLevel,
    isSyntheticResult,
    totalRetries,
    emptyResultsFiltered
  };

  return { data: winner, consensus: metadata };
}

/** Check if provider is VLM */
function isVLMProvider(provider: any): provider is VLMProvider {
  return 'capabilities' in provider && provider.capabilities?.supportsImages === true;
}

/** Check if provider is OCR */
function isOCRProvider(provider: any): provider is OCRProvider {
  return 'parseToIR' in provider && typeof provider.parseToIR === 'function';
}

/** Check if provider is LLM (text-only provider with completeJson) */
function isLLMProvider(provider: any): provider is LLMProvider {
  // Provider with completeJson and no capabilities (legacy)
  if ('completeJson' in provider && !('capabilities' in provider)) {
    return true;
  }
  // Provider with completeJson and capabilities but NOT supporting images (text-only LLM)
  if ('completeJson' in provider && 'capabilities' in provider && provider.capabilities?.supportsImages !== true) {
    return true;
  }
  return false;
}

/**
 * Validate provider compatibility with node requirements
 * Throws descriptive error if provider is incompatible
 */
function validateProviderCompatibility(
  nodeName: string,
  provider: any,
  requirements: {
    acceptsOCR?: boolean;
    acceptsLLM?: boolean;
    requiresVLM?: boolean;
  }
): void {
  const isVLM = isVLMProvider(provider);
  const isOCR = isOCRProvider(provider);
  const isLLM = isLLMProvider(provider);

  // VLM providers are compatible with everything
  if (isVLM) return;

  // Check OCR compatibility
  if (isOCR && !requirements.acceptsOCR) {
    throw new Error(
      `${nodeName} node requires a VLM provider (vision-capable), but received an OCR provider. ` +
      `OCR providers can only be used with the parse() node. ` +
      `\n\nProvider: ${provider.name}` +
      `\n\nTip: Use createVLMProvider() instead of createOCRProvider() for ${nodeName}.`
    );
  }

  // Check LLM compatibility
  if (isLLM && requirements.requiresVLM) {
    throw new Error(
      `${nodeName} node requires a VLM provider (vision-capable), but received a text-only LLM provider. ` +
      `This node needs to process images/PDFs directly. ` +
      `\n\nProvider: ${provider.name}` +
      `\n\nTip: Use a VLM like GPT-4o, Claude 3, or Gemini Flash instead.`
    );
  }

  // Unknown provider type
  if (!isVLM && !isOCR && !isLLM) {
    throw new Error(
      `${nodeName} node received an invalid provider. Provider must implement either ` +
      `OCRProvider, LLMProvider, or VLMProvider interface. ` +
      `\n\nProvider: ${JSON.stringify(provider)}` +
      `\n\nTip: Use createVLMProvider(), createOCRProvider(), or buildLLMProvider().`
    );
  }
}

/**
 * Calculate character offsets for all lines in DocumentIR
 * This enables precise text location tracking for citations
 */
function calculateCharacterOffsets(ir: DocumentIR): DocumentIR {
  let globalCharOffset = 0;

  for (let pageIdx = 0; pageIdx < ir.pages.length; pageIdx++) {
    const page = ir.pages[pageIdx];
    const pageNumber = page.pageNumber || pageIdx + 1;

    for (let lineIdx = 0; lineIdx < page.lines.length; lineIdx++) {
      const line = page.lines[lineIdx];
      const lineLength = (line.text ?? '').length;

      // Add character offsets
      line.startChar = globalCharOffset;
      line.endChar = globalCharOffset + lineLength;

      // Add line ID for easy reference
      line.lineId = `p${pageNumber}_l${lineIdx}`;

      // Update global offset (add newline)
      globalCharOffset += lineLength + 1;
    }

    // Ensure pageNumber is set
    if (!page.pageNumber) {
      page.pageNumber = pageNumber;
    }
  }

  return ir;
}

/** Parse node - OCR or VLM-based document parsing */
export function parse(config: ParseNodeConfig) {
  const parseNode = node<FlowInput, DocumentIR | DocumentIR[]>("parse", async (input: FlowInput, ctx: NodeCtx) => {
    // Helper to parse a single input
    const parseOneInput = async (inputToParse: FlowInput, chunkMetadata?: { chunkIndex: number; totalChunks: number; pageRange: [number, number] }): Promise<DocumentIR> => {
      const t0 = Date.now();
      let ir: DocumentIR;
      let costUSD: number | undefined;
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let cacheCreationInputTokens: number | undefined;
      let cacheReadInputTokens: number | undefined;

      // Check if provider is OCR or VLM
      if ('parseToIR' in config.provider) {
        // OCRProvider
        ir = await (config.provider as OCRProvider).parseToIR(inputToParse);
        // Extract cost from DocumentIR extras
        costUSD = ir.extras?.costUSD as number | undefined;
        // Store provider type for source tracking
        ir.extras = { ...ir.extras, providerType: 'ocr' };
      } else if (isVLMProvider(config.provider)) {
        // VLMProvider - use vision to extract text structure
        const vlm = config.provider as VLMProvider;

        // Determine output format (default: 'text')
        const format = config.format || 'text';

        // Build schema and prompt based on format
        let schema: any;
        let promptText: string;

        if (config.promptRef) {
          // Use prompt from registry
          const [promptId, version] = config.promptRef.includes('@')
            ? config.promptRef.split('@')
            : [config.promptRef, undefined];

          const promptAsset = version
            ? PROMPT_REGISTRY.get(promptId, version)
            : PROMPT_REGISTRY.getLatest(promptId);
          if (!promptAsset) {
            throw new Error(`Prompt not found: ${config.promptRef}`);
          }

          // Build schema based on format (still needed for structured output)
          if (format === 'markdown' || format === 'html') {
            const formatFieldName = format;
            schema = {
              type: 'object' as const,
              properties: {
                pages: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      [formatFieldName]: {
                        type: 'string' as const,
                        description: format === 'markdown'
                          ? 'Page content in markdown format'
                          : 'Page content in HTML format'
                      }
                    },
                    required: [formatFieldName]
                  }
                }
              },
              required: ['pages' as const]
            };
          } else {
            const lineSchema = config.citations?.enabled
              ? {
                type: 'object' as const,
                properties: {
                  text: { type: 'string' as const },
                  lineId: { type: 'string' as const, description: 'Line identifier' }
                },
                required: ['text' as const, 'lineId' as const]
              }
              : {
                type: 'object' as const,
                properties: { text: { type: 'string' as const } },
                required: ['text' as const]
              };

            schema = {
              type: 'object' as const,
              properties: {
                pages: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      lines: { type: 'array' as const, items: lineSchema }
                    },
                    required: ['lines' as const]
                  }
                }
              },
              required: ['pages' as const]
            };
          }

          // Warn about redundant variables
          if (config.promptVariables) {
            const redundant = ['format', 'schema', 'describeFigures', 'citationsEnabled']
              .filter(key => key in (config.promptVariables || {}));
            if (redundant.length > 0) {
              console.warn(
                `[doclo] Passing ${redundant.join(', ')} in promptVariables is redundant - ` +
                `these are auto-injected from config. You can safely remove them.`
              );
            }
          }

          // Render prompt with variables
          // Auto-injected variables first, then user variables can override
          const variables = {
            format,
            schema,
            describeFigures: config.describeFigures,
            citationsEnabled: config.citations?.enabled,
            ...config.promptVariables
          };

          const rendered = renderPrompt(promptAsset, {
            variables,
            additionalInstructions: config.additionalInstructions
          });
          promptText = rendered.messages.map((msg: any) => {
            const content = msg.content?.[0];
            return content?.text ?? content ?? '';
          }).join('\n\n');

          // Auto-inject format instruction if not present in rendered prompt
          // This ensures UI format selection always takes effect
          if (config.autoInjectFormat !== false && format) {
            const promptLower = promptText.toLowerCase();
            // Check if format value or {{format}} placeholder is present
            if (!promptLower.includes(format) && !promptText.includes('{{format}}')) {
              promptText += `\n\nOUTPUT FORMAT: ${format}`;
            }
          }

        } else {
          // Fall back to default prompt building
          if (format === 'markdown' || format === 'html') {
            // Structured format: page-level markdown/html (no line-level citations)
            const formatFieldName = format; // 'markdown' or 'html'

            schema = {
              type: 'object' as const,
              properties: {
                pages: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      [formatFieldName]: {
                        type: 'string' as const,
                        description: format === 'markdown'
                          ? 'Page content in markdown format, preserving tables, lists, headers'
                          : 'Page content in HTML format, preserving tables, lists, headers'
                      }
                    },
                    required: [formatFieldName]
                  }
                }
              },
              required: ['pages' as const]
            };

            // Build prompt for structured output
            promptText = format === 'markdown'
              ? 'Extract all text from this document in markdown format. Preserve tables using markdown table syntax, preserve lists, headers, and formatting.'
              : 'Extract all text from this document in HTML format. Use HTML tables for tabular data, preserve lists, headers, and formatting.';

            if (config.describeFigures) {
              promptText += '\n\nWhen you encounter charts, figures, diagrams, or images, describe them in text with a [Figure: description] or [Chart: description] marker.';
            }
          } else {
            // Default 'text' format: line-level with optional citations
            const lineSchema = config.citations?.enabled
              ? {
                type: 'object' as const,
                properties: {
                  text: { type: 'string' as const },
                  lineId: {
                    type: 'string' as const,
                    description: 'Line identifier in format p{page}_l{line}, e.g., p1_l0, p1_l1'
                  }
                },
                required: ['text' as const, 'lineId' as const]
              }
              : {
                type: 'object' as const,
                properties: {
                  text: { type: 'string' as const }
                },
                required: ['text' as const]
              };

            schema = {
              type: 'object' as const,
              properties: {
                pages: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      lines: {
                        type: 'array' as const,
                        items: lineSchema
                      }
                    },
                    required: ['lines' as const]
                  }
                }
              },
              required: ['pages' as const]
            };

            promptText = 'Extract all text from this document, preserving line structure.';

            if (config.citations?.enabled) {
              promptText += '\n\nFor each line, provide a unique line ID in the format p{page}_l{line} (e.g., p1_l0 for page 1, line 0).';
            }

            if (config.describeFigures) {
              promptText += '\n\nWhen you encounter charts, figures, diagrams, or images, describe them as text lines.';
            }
          }

          // Add additional prompt if provided
          if (config.additionalPrompt) {
            promptText += `\n\nAdditional guidance:\n${config.additionalPrompt}`;
          }
          if (config.additionalInstructions) {
            promptText += `\n\nAdditional guidance:\n${config.additionalInstructions}`;
          }
        }

        // Determine the data URL (prefer base64 over url)
        const dataUrl = inputToParse.base64 || inputToParse.url;

        // Detect document type using magic bytes (fixes raw base64 PDF detection)
        const detectedType = detectDocumentType(dataUrl);
        const isPDF = detectedType === 'application/pdf';

        const result = await vlm.completeJson({
          prompt: {
            text: promptText,
            images: dataUrl && !isPDF ? [{ base64: dataUrl, mimeType: detectedType as any }] : undefined,
            pdfs: dataUrl && isPDF ? [{ base64: dataUrl }] : undefined
          },
          schema,
          reasoning: config.reasoning
        });

        // Handle response based on format
        if (format === 'markdown' || format === 'html') {
          // Convert structured format to DocumentIR with lines
          const responseData = result.json as any;
          const pages = responseData.pages || [];

          ir = {
            pages: pages.map((page: any, pageIdx: number) => {
              const formattedContent = page[format] || '';

              // Split formatted content into lines for compatibility
              const lines = formattedContent.split('\n').map((text: string) => ({
                text,
                bbox: undefined  // No bbox for structured formats
              }));

              return {
                pageNumber: pageIdx + 1,
                width: 612,  // Default page dimensions
                height: 792,
                lines,
                [format]: formattedContent  // Store full markdown/html
              };
            })
          };
        } else {
          // Default text format
          ir = result.json as DocumentIR;
        }

        // Extract cost and token metrics from VLM result
        costUSD = result.costUSD;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        cacheCreationInputTokens = result.cacheCreationInputTokens;
        cacheReadInputTokens = result.cacheReadInputTokens;
        // Store provider type for source tracking
        ir.extras = { ...ir.extras, providerType: 'vlm' };
      } else {
        throw new Error('Provider must be OCRProvider or VLMProvider');
      }

      // Push metrics (includes token counts for VLM, only cost for OCR)
      const { provider, model } = parseProviderName(config.provider.name);
      ctx.metrics.push({
        step: "parse",
        configStepId: ctx.stepId,
        startMs: t0,
        provider,
        model,
        ms: Date.now() - t0,
        costUSD,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        attemptNumber: 1,  // Parse doesn't use fallback manager, always attempt 1
        metadata: {
          kind: 'leaf'  // Mark as actual LLM/OCR call
        }
      });

      // Add chunk metadata if provided
      if (chunkMetadata) {
        ir.extras = {
          ...ir.extras,
          ...chunkMetadata
        };
      }

      // Auto-add page count for PDFs (if not already set by provider)
      if (ir.extras?.pageCount === undefined) {
        const dataUrl = inputToParse.base64 || inputToParse.url;
        if (dataUrl && isPDFDocument(dataUrl)) {
          try {
            const pageCount = await getPDFPageCount(dataUrl);
            ir.extras = {
              ...ir.extras,
              pageCount
            };
          } catch (error) {
            // If PDF page count extraction fails, continue without it
            // This could happen for malformed PDFs or non-standard data URIs
            console.warn('[doclo] Failed to extract PDF page count:', error);
          }
        }
      }

      // Add character offsets and line IDs if citations enabled
      if (config.citations?.enabled) {
        ir = calculateCharacterOffsets(ir);
      }

      return ir;
    };

    // Wrapper for consensus support
    const parseOnce = () => parseOneInput(input);

    // Handle chunked parsing for large documents
    if (config.chunked) {
      const maxPages = config.chunked.maxPagesPerChunk;
      const overlap = config.chunked.overlap || 0;

      // Determine the data URL (prefer base64 over url)
      const dataUrl = input.base64 || input.url;
      if (!dataUrl) {
        throw new Error('Chunked parsing requires base64 or url input');
      }

      // Only PDFs can be chunked (images are single-page)
      const isPDF = isPDFDocument(dataUrl);
      if (!isPDF) {
        // For non-PDFs, just parse normally (they're single-page)
        return runWithConsensus(parseOnce, config.consensus, ctx, ctx?.observability ? {
          observability: ctx.observability.config,
          flowId: ctx.observability.flowId,
          executionId: ctx.observability.executionId,
          stepId: ctx.observability.stepId,
          stepIndex: ctx.observability.stepIndex,
          traceContext: ctx.observability.traceContext,
          metadata: ctx.observability.metadata,
        } : undefined) as Promise<DocumentIR>;
      }

      // Get total page count
      const totalPages = await getPDFPageCount(dataUrl);

      // Calculate page ranges with overlap
      const pageRanges: Array<[number, number]> = [];
      for (let startPage = 1; startPage <= totalPages; startPage += maxPages - overlap) {
        const endPage = Math.min(startPage + maxPages - 1, totalPages);
        pageRanges.push([startPage, endPage]);

        // If we've reached the end, break
        if (endPage >= totalPages) break;
      }

      // Split PDF into chunks
      const pdfChunks = await splitPDFIntoChunks(dataUrl, pageRanges);

      // Parse each chunk (parallel by default for speed)
      const parallel = config.chunked.parallel !== false;  // Default: true

      if (parallel) {
        // Process all chunks in parallel (faster for rate-limit-friendly APIs)
        const chunkPromises = pdfChunks.map((chunk, i) => {
          const chunkInput: FlowInput = { base64: chunk };
          const chunkMetadata = {
            chunkIndex: i,
            totalChunks: pdfChunks.length,
            pageRange: pageRanges[i] as [number, number]
          };

          return runWithConsensus(
            () => parseOneInput(chunkInput, chunkMetadata),
            config.consensus,
            ctx,
            ctx?.observability ? {
              observability: ctx.observability.config,
              flowId: ctx.observability.flowId,
              executionId: ctx.observability.executionId,
              stepId: ctx.observability.stepId,
              stepIndex: ctx.observability.stepIndex,
              traceContext: ctx.observability.traceContext,
              metadata: ctx.observability.metadata,
            } : undefined
          ) as Promise<DocumentIR>;
        });

        const results = await Promise.allSettled(chunkPromises);
        const documentChunks: DocumentIR[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled') {
            documentChunks.push(result.value);
          } else {
            throw new Error(
              `Chunk ${i + 1}/${pdfChunks.length} failed to parse: ${result.reason}`
            );
          }
        }

        return documentChunks;
      } else {
        // Sequential processing (safer but slower)
        const documentChunks: DocumentIR[] = [];
        for (let i = 0; i < pdfChunks.length; i++) {
          const chunkInput: FlowInput = { base64: pdfChunks[i] };
          const chunkMetadata = {
            chunkIndex: i,
            totalChunks: pdfChunks.length,
            pageRange: pageRanges[i] as [number, number]
          };

          const parsedChunk = await runWithConsensus(
            () => parseOneInput(chunkInput, chunkMetadata),
            config.consensus,
            ctx,
            ctx.observability ? {
              observability: ctx.observability.config,
              flowId: ctx.observability.flowId,
              executionId: ctx.observability.executionId,
              stepId: ctx.observability.stepId,
              stepIndex: ctx.observability.stepIndex,
              traceContext: ctx.observability.traceContext,
              metadata: ctx.observability.metadata,
            } : undefined
          ) as DocumentIR;

          documentChunks.push(parsedChunk);
        }

        return documentChunks;
      }
    }

    // Normal parsing (non-chunked)
    return runWithConsensus(parseOnce, config.consensus, ctx, ctx?.observability ? {
      observability: ctx.observability.config,
      flowId: ctx.observability.flowId,
      executionId: ctx.observability.executionId,
      stepId: ctx.observability.stepId,
      stepIndex: ctx.observability.stepIndex,
      traceContext: ctx.observability.traceContext,
      metadata: ctx.observability.metadata,
    } : undefined) as Promise<DocumentIR>;
  });

  // Add type metadata for validation
  parseNode.__meta = {
    inputTypes: ['FlowInput'],
    outputType: (cfg: ParseNodeConfig) => cfg.chunked ? 'DocumentIR[]' : 'DocumentIR',
    requiresProvider: ['OCR', 'VLM'],
    acceptsArray: false,
    outputsArray: (cfg: ParseNodeConfig) => !!cfg.chunked,
    description: 'Convert PDFs/images to DocumentIR using OCR or VLM providers'
  };

  return parseNode;
}

/** Split node - VLM identifies document boundaries and types */
export function split(config: SplitNodeConfig) {
  // Validate provider compatibility at build time
  validateProviderCompatibility('split', config.provider, {
    requiresVLM: true,
    acceptsOCR: false,
    acceptsLLM: false
  });

  const splitNode = node<FlowInput, SplitDocument[]>("split", async (input: FlowInput, ctx: NodeCtx) => {
    const splitOnce = async () => {
      // Resolve schemas from registry if schemaRef is provided
      let schemas = config.schemas;
      let schemaId: string | undefined;
      let schemaVersion: string | undefined;

      if (config.schemaRef) {
        const atIndex = config.schemaRef.indexOf('@');
        if (atIndex === -1) {
          schemaId = config.schemaRef;
          const schemaAsset = SCHEMA_REGISTRY.getLatest(schemaId);
          if (!schemaAsset) {
            throw new Error(`Schema not found: ${config.schemaRef}`);
          }
          schemaVersion = schemaAsset.version;
          // SchemaAsset.schema contains the actual schema data
          schemas = (schemaAsset.schema as any).schemas || schemaAsset.schema;
        } else {
          schemaId = config.schemaRef.substring(0, atIndex);
          schemaVersion = config.schemaRef.substring(atIndex + 1);
          const schemaAsset = SCHEMA_REGISTRY.get(schemaId, schemaVersion);
          if (!schemaAsset) {
            throw new Error(`Schema not found: ${config.schemaRef}`);
          }
          schemas = (schemaAsset.schema as any).schemas || schemaAsset.schema;
        }
      }

      const schemaNames = Object.keys(schemas);
      if (config.includeOther !== false) {
        schemaNames.push('other');
      }

      const schema = {
        type: 'object' as const,
        properties: {
          documents: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                type: { type: 'string' as const, enum: schemaNames },
                pages: { type: 'array' as const, items: { type: 'number' as const } }
              },
              required: ['type' as const, 'pages' as const]
            }
          }
        },
        required: ['documents' as const]
      };

      const t0 = Date.now();

      // Determine the data URL (prefer base64 over url)
      const dataUrl = input.base64 || input.url;

      // Detect document type using magic bytes (fixes raw base64 PDF detection)
      const detectedType = detectDocumentType(dataUrl);
      const isPDF = detectedType === 'application/pdf';

      const result = await config.provider.completeJson({
        prompt: {
          text: `Identify and split documents in this file. Categorize each as one of: ${schemaNames.join(', ')}. Return the page numbers for each document.`,
          images: dataUrl && !isPDF ? [{ base64: dataUrl, mimeType: detectedType as any }] : undefined,
          pdfs: dataUrl && isPDF ? [{ base64: dataUrl }] : undefined
        },
        schema,
        reasoning: config.reasoning
      });

      const splitResult = result.json as { documents: Array<{ type: string; pages: number[] }> };
      const documents: SplitDocument[] = splitResult.documents.map(doc => ({
        type: doc.type,
        schema: schemas[doc.type] || {},
        pages: doc.pages,
        input: { ...input, pages: doc.pages }
      }));

      const { provider, model } = parseProviderName(config.provider.name);
      ctx.metrics.push({
        step: "split",
        configStepId: ctx.stepId,
        startMs: t0,
        provider,
        model,
        ms: Date.now() - t0,
        costUSD: result.costUSD,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheCreationInputTokens: result.cacheCreationInputTokens,
        cacheReadInputTokens: result.cacheReadInputTokens,
        attemptNumber: 1,  // Split doesn't use fallback manager, always attempt 1
        metadata: {
          kind: 'leaf',  // Mark as actual LLM call
          // Include schema metadata if available
          ...(schemaId && {
            schemaId,
            ...(schemaVersion && { schemaVersion })
          })
        }
      });

      return documents;
    };

    return runWithConsensus(splitOnce, config.consensus, ctx, ctx?.observability ? {
      observability: ctx.observability.config,
      flowId: ctx.observability.flowId,
      executionId: ctx.observability.executionId,
      stepId: ctx.observability.stepId,
      stepIndex: ctx.observability.stepIndex,
      traceContext: ctx.observability.traceContext,
      metadata: ctx.observability.metadata,
    } : undefined) as Promise<SplitDocument[]>;
  });

  // Add type metadata for validation
  splitNode.__meta = {
    inputTypes: ['FlowInput'],
    outputType: 'SplitDocument[]',
    requiresProvider: ['VLM'],
    acceptsArray: false,
    outputsArray: true,
    description: 'Split multi-document PDFs into typed documents (requires forEach for processing)'
  };

  return splitNode;
}

/**
 * Format categories for inclusion in AI prompt.
 * Produces readable format with descriptions when available.
 */
function formatCategoriesForPrompt(categories: (string | { name: string; description?: string })[]): string {
  return categories.map(cat => {
    if (typeof cat === 'string') return `- ${cat}`;
    if (cat?.description) return `- ${cat.name}: ${cat.description}`;
    return `- ${cat.name}`;
  }).join('\n');
}

/** Categorize node - LLM/VLM categorizes content */
export function categorize(config: CategorizeNodeConfig) {
  // Categorize can work with either DocumentIR (text) or FlowInput (visual)
  // LLM providers work for DocumentIR input; VLM providers work for both
  // Runtime validation at line 1893 ensures VLM is used for FlowInput
  validateProviderCompatibility('categorize', config.provider, {
    requiresVLM: false,  // Allow LLM for DocumentIR input (runtime checks VLM for FlowInput)
    acceptsOCR: false,
    acceptsLLM: true     // LLM can categorize DocumentIR text
  });

  const categorizeNode = node<DocumentIR | FlowInput, { input: DocumentIR | FlowInput; category: string }>("categorize", async (input: DocumentIR | FlowInput, ctx: NodeCtx) => {
    const categorizeOnce = async () => {
      // Normalize categories - handle both string[] and object[] with name property
      // Cloud flow definitions may send categories as objects: { name: string, description?: string }
      const normalizedCategories: string[] = (config.categories as any[]).map((cat: any) => {
        if (typeof cat === 'string') return cat;
        if (cat && typeof cat === 'object' && 'name' in cat) return cat.name;
        return String(cat);
      });

      // Format categories with descriptions for the prompt
      const formattedCategories = formatCategoriesForPrompt(config.categories);

      const schema = {
        type: 'object' as const,
        properties: {
          category: { type: 'string' as const, enum: normalizedCategories }
        },
        required: ['category' as const]
      };

      const t0 = Date.now();
      let result;

      // Check if input is DocumentIR or FlowInput
      // DocumentIR has pages with lines, FlowInput may have pages as numbers
      const isDocumentIR = 'pages' in input &&
        Array.isArray((input as any).pages) &&
        (input as any).pages.length > 0 &&
        typeof (input as any).pages[0] === 'object' &&
        'lines' in (input as any).pages[0];

      if (isDocumentIR) {
        // DocumentIR - use text prompt
        const ir = input as DocumentIR;
        console.log('[DEBUG] categorize: isDocumentIR=true, processing pages');
        const text = ir.pages.flatMap((p: IRPage) => {
          if (!p.lines) {
            console.log('[DEBUG] categorize: page has no lines', p);
            return [];
          }
          return p.lines.map((l: IRLine) => {
            if (!l) {
              console.log('[DEBUG] categorize: line is undefined');
              return '';
            }
            return l.text ?? '';
          });
        }).join('\n');

        // Build prompt
        let prompt: string;

        if (config.promptRef) {
          // Use prompt from registry
          const [promptId, version] = config.promptRef.includes('@')
            ? config.promptRef.split('@')
            : [config.promptRef, undefined];

          const promptAsset = version
            ? PROMPT_REGISTRY.get(promptId, version)
            : PROMPT_REGISTRY.getLatest(promptId);
          if (!promptAsset) {
            throw new Error(`Prompt not found: ${config.promptRef}`);
          }

          // Warn about redundant variables
          if (config.promptVariables) {
            const redundant = ['categories', 'documentText']
              .filter(key => key in (config.promptVariables || {}));
            if (redundant.length > 0) {
              console.warn(
                `[doclo] Passing ${redundant.join(', ')} in promptVariables is redundant - ` +
                `these are auto-injected from config. You can safely remove them.`
              );
            }
          }

          // Render prompt with variables
          // Auto-injected variables first, then user variables can override
          const variables = {
            categories: formattedCategories,
            documentText: text,
            ...config.promptVariables
          };

          const rendered = renderPrompt(promptAsset, {
            variables,
            additionalInstructions: config.additionalInstructions
          });
          console.log('[DEBUG] categorize: rendered prompt messages', JSON.stringify(rendered.messages, null, 2));
          prompt = rendered.messages.map((msg: any) => {
            if (!msg) {
              console.log('[DEBUG] categorize: msg is undefined');
              return '';
            }
            const content = msg.content?.[0];
            if (!content) {
              console.log('[DEBUG] categorize: content is undefined for msg', msg);
              return '';
            }
            return content?.text ?? content ?? '';
          }).join('\n\n');

        } else {
          // Fall back to default prompt
          prompt = `Categorize this document into one of the following categories:\n\n${formattedCategories}`;
          if (config.additionalPrompt) {
            prompt += `\n\nAdditional guidance:\n${config.additionalPrompt}`;
          }
          if (config.additionalInstructions) {
            prompt += `\n\nAdditional guidance:\n${config.additionalInstructions}`;
          }
          prompt += `\n\n${text}`;
        }

        result = await config.provider.completeJson({
          prompt,
          schema,
          reasoning: config.reasoning
        });
      } else {
        // FlowInput - needs VLM
        if (!isVLMProvider(config.provider)) {
          throw new Error('VLMProvider required for categorizing FlowInput');
        }
        const flowInput = input as FlowInput;

        // Determine the data URL (prefer base64 over url)
        const dataUrl = flowInput.base64 || flowInput.url;

        // Detect document type using magic bytes (fixes raw base64 PDF detection)
        const detectedType = detectDocumentType(dataUrl);
        const isPDF = detectedType === 'application/pdf';

        // Build prompt
        let promptText: string;

        if (config.promptRef) {
          // Use prompt from registry
          const [promptId, version] = config.promptRef.includes('@')
            ? config.promptRef.split('@')
            : [config.promptRef, undefined];

          const promptAsset = version
            ? PROMPT_REGISTRY.get(promptId, version)
            : PROMPT_REGISTRY.getLatest(promptId);
          if (!promptAsset) {
            throw new Error(`Prompt not found: ${config.promptRef}`);
          }

          // Warn about redundant variables
          if (config.promptVariables) {
            const redundant = ['categories']
              .filter(key => key in (config.promptVariables || {}));
            if (redundant.length > 0) {
              console.warn(
                `[doclo] Passing ${redundant.join(', ')} in promptVariables is redundant - ` +
                `these are auto-injected from config. You can safely remove them.`
              );
            }
          }

          // Render prompt with variables
          // Auto-injected variables first, then user variables can override
          const variables = {
            categories: formattedCategories,
            ...config.promptVariables
          };

          const rendered = renderPrompt(promptAsset, {
            variables,
            additionalInstructions: config.additionalInstructions
          });
          console.log('[DEBUG] categorize (FlowInput): rendered prompt messages', JSON.stringify(rendered.messages, null, 2));
          promptText = rendered.messages.map((msg: any) => {
            if (!msg) {
              console.log('[DEBUG] categorize (FlowInput): msg is undefined');
              return '';
            }
            const content = msg.content?.[0];
            if (!content) {
              console.log('[DEBUG] categorize (FlowInput): content is undefined for msg', msg);
              return '';
            }
            return content?.text ?? content ?? '';
          }).join('\n\n');

        } else {
          // Fall back to default prompt
          promptText = `Categorize this document into one of the following categories:\n\n${formattedCategories}`;
          if (config.additionalPrompt) {
            promptText += `\n\nAdditional guidance:\n${config.additionalPrompt}`;
          }
          if (config.additionalInstructions) {
            promptText += `\n\nAdditional guidance:\n${config.additionalInstructions}`;
          }
        }

        console.log('[DEBUG] categorize (FlowInput): calling provider.completeJson with prompt length:', promptText?.length);
        console.log('[DEBUG] categorize (FlowInput): schema:', JSON.stringify(schema));
        try {
          result = await config.provider.completeJson({
            prompt: {
              text: promptText,
              images: dataUrl && !isPDF ? [{ base64: dataUrl, mimeType: detectedType as any }] : undefined,
              pdfs: dataUrl && isPDF ? [{ base64: dataUrl }] : undefined
            },
            schema,
            reasoning: config.reasoning
          });
          console.log('[DEBUG] categorize (FlowInput): provider returned result:', JSON.stringify(result, null, 2).substring(0, 500));
        } catch (providerErr: any) {
          console.log('[DEBUG] categorize (FlowInput): provider.completeJson threw error:', providerErr?.message);
          console.log('[DEBUG] categorize (FlowInput): error stack:', providerErr?.stack);
          throw providerErr;
        }
      }

      const { provider, model } = parseProviderName(config.provider.name);

      // Extract promptId and promptVersion from promptRef if present
      let promptId: string | undefined;
      let promptVersion: string | undefined;
      if (config.promptRef) {
        const atIndex = config.promptRef.indexOf('@');
        if (atIndex === -1) {
          promptId = config.promptRef;
        } else {
          promptId = config.promptRef.substring(0, atIndex);
          promptVersion = config.promptRef.substring(atIndex + 1);
        }
      }

      ctx.metrics.push({
        step: "categorize",
        configStepId: ctx.stepId,
        startMs: t0,
        provider,
        model,
        ms: Date.now() - t0,
        costUSD: result.costUSD,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheCreationInputTokens: result.cacheCreationInputTokens,
        cacheReadInputTokens: result.cacheReadInputTokens,
        attemptNumber: 1,  // Categorize doesn't use fallback manager, always attempt 1
        metadata: {
          kind: 'leaf',  // Mark as actual LLM call
          // Include prompt metadata if available
          ...(promptId && {
            promptId,
            ...(promptVersion && { promptVersion })
          })
        }
      });

      return { input, category: (result.json as { category: string }).category };
    };

    return runWithConsensus(categorizeOnce, config.consensus, ctx, ctx?.observability ? {
      observability: ctx.observability.config,
      flowId: ctx.observability.flowId,
      executionId: ctx.observability.executionId,
      stepId: ctx.observability.stepId,
      stepIndex: ctx.observability.stepIndex,
      traceContext: ctx.observability.traceContext,
      metadata: ctx.observability.metadata,
    } : undefined) as Promise<{ input: DocumentIR | FlowInput; category: string; }>;
  });

  // Add type metadata for validation
  categorizeNode.__meta = {
    inputTypes: ['DocumentIR', 'FlowInput'],
    outputType: '{input,category}',
    requiresProvider: ['VLM'],
    acceptsArray: false,
    outputsArray: false,
    description: 'Classify document type or assess quality (wraps input in {input, category})'
  };

  return categorizeNode;
}

/**
 * Normalize bounding box to 0-1 coordinates
 */
function normalizeBBox(bbox: { x: number; y: number; w: number; h: number }, pageWidth: number, pageHeight: number) {
  return {
    x: bbox.x / pageWidth,
    y: bbox.y / pageHeight,
    w: bbox.w / pageWidth,
    h: bbox.h / pageHeight
  };
}

/**
 * Wrap user schema to include citation tracking
 * LLM will return both the data AND citation references
 */
function buildCitationSchema(userSchema: object, config: any): object {
  if (!config.enabled) {
    return userSchema;
  }

  // Build citation schema that wraps user schema
  return {
    type: 'object',
    properties: {
      data: userSchema,  // Original schema
      citations: {
        type: 'array',
        description: 'For each field in data, provide citations showing which lines/pages the value came from',
        items: {
          type: 'object',
          properties: {
            fieldPath: {
              type: 'string',
              description: 'JSON path to the field (e.g., "invoice.total", "lineItems[0].description")'
            },
            value: {
              description: 'The extracted value (for verification)'
            },
            lineReferences: {
              type: 'array',
              description: 'Line numbers or IDs where this value was found',
              items: { type: 'string' }
            },
            ...(config.detectInferred && {
              isInferred: {
                type: 'boolean',
                description: 'True if this value was calculated or inferred rather than directly extracted'
              },
              reasoning: {
                type: 'string',
                description: 'Explain how you inferred this value (required if isInferred=true)'
              }
            }),
            ...(config.includeConfidence !== false && {
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Confidence in this extraction (0-1)'
              }
            })
          },
          required: ['fieldPath', 'value', 'lineReferences']
        }
      }
    },
    required: ['data', 'citations']
  };
}

/**
 * Map LLM citation references back to actual line citations with bboxes
 */
function mapLineCitations(
  llmCitations: any[],
  ir: DocumentIR | null,
  sourceType: string,
  config: any
): any[] {
  const fieldCitations: any[] = [];

  for (const llmCitation of llmCitations) {
    const lineCitations: any[] = [];

    for (const lineRef of llmCitation.lineReferences || []) {
      // Parse line reference (e.g., "p1_l5" or "5" or "page 2, line 3")
      const match = lineRef.match(/p(\d+)_l(\d+)/) || lineRef.match(/(\d+)/);
      if (!match) continue;

      const pageNum = match[1] && match[2] ? parseInt(match[1]) : 1;
      const lineIdx = match[2] ? parseInt(match[2]) : parseInt(match[1]);

      // Find the actual line in IR
      if (ir && ir.pages[pageNum - 1]) {
        const page = ir.pages[pageNum - 1];
        const line = page.lines[lineIdx];

        if (line) {
          const citation: any = {
            pageNumber: pageNum,
            lineIndex: lineIdx,
            text: config.includeTextSnippets !== false ? (line.text ?? '') : '',
            sourceType,
            startChar: line.startChar,
            endChar: line.endChar
          };

          // Add bbox if available
          if (config.includeBoundingBoxes !== false && line.bbox) {
            const normalized = normalizeBBox(line.bbox, page.width, page.height);
            // Clamp to [0, 1] range
            citation.bbox = {
              x: Math.max(0, Math.min(1, normalized.x)),
              y: Math.max(0, Math.min(1, normalized.y)),
              w: Math.max(0, Math.min(1, normalized.w)),
              h: Math.max(0, Math.min(1, normalized.h))
            };
          }

          // Add confidence if requested
          if (config.includeConfidence !== false && llmCitation.confidence !== undefined) {
            citation.confidence = Math.max(0, Math.min(1, llmCitation.confidence));
          }

          // Filter by minConfidence if set
          if (config.minConfidence && citation.confidence !== undefined) {
            if (citation.confidence < config.minConfidence) {
              continue;  // Skip low-confidence citations
            }
          }

          lineCitations.push(citation);
        }
      } else {
        // No IR available (VLM direct path) - create citation without bbox
        const citation: any = {
          pageNumber: pageNum,
          lineIndex: lineIdx,
          text: '',
          sourceType
        };

        if (llmCitation.confidence !== undefined) {
          citation.confidence = llmCitation.confidence;
        }

        lineCitations.push(citation);
      }
    }

    fieldCitations.push({
      fieldPath: llmCitation.fieldPath,
      value: llmCitation.value,
      citations: lineCitations,
      reasoning: llmCitation.reasoning,
      confidence: llmCitation.confidence
    });
  }

  return fieldCitations;
}

/**
 * Determine the effective input mode when 'auto' is specified.
 * Logic:
 * 1. If only DocumentIR available -> 'ir'
 * 2. If only FlowInput available -> 'source' (requires VLM)
 * 3. If both available:
 *    - If provider is VLM and preferVisual !== false -> 'ir+source'
 *    - Otherwise -> 'ir'
 */
function resolveAutoInputMode(
  input: any,
  config: ExtractNodeConfig,
  ctx: NodeCtx
): 'ir' | 'ir+source' | 'source' {
  // Detect input types
  const isChunkOutput = 'chunks' in input && Array.isArray((input as any).chunks);

  const hasDocumentIR = !isChunkOutput &&
    'pages' in input &&
    Array.isArray((input as any).pages) &&
    (input as any).pages.length > 0 &&
    typeof (input as any).pages[0] === 'object' &&
    'lines' in (input as any).pages[0];

  // ChunkOutput also has sourceDocument which can serve as IR
  const hasIRFromChunk = isChunkOutput && (input as any).sourceDocument;

  const hasIR = hasDocumentIR || hasIRFromChunk;

  const isInputFlowInput = !hasDocumentIR && !isChunkOutput &&
    (input.base64 || input.url);

  // Check for source availability in artifacts
  const hasSourceInArtifacts = !!(
    ctx.artifacts.__flowInput ||
    ctx.artifacts.__originalFlowInput
  );

  const hasSource = isInputFlowInput || hasSourceInArtifacts;

  const providerIsVLM = isVLMProvider(config.provider);
  const preferVisual = config.preferVisual !== false; // default true

  // Decision tree
  if (hasIR && hasSource && providerIsVLM && preferVisual) {
    return 'ir+source';
  }

  if (hasIR) {
    return 'ir';
  }

  if (hasSource) {
    if (!providerIsVLM) {
      throw new Error(
        'Auto input mode detected FlowInput but provider is not VLM. ' +
        'Use a VLM provider for direct document extraction, or add a parse() step first.'
      );
    }
    return 'source';
  }

  throw new Error(
    'Auto input mode could not detect valid input. ' +
    'Expected DocumentIR, ChunkOutput, or FlowInput (image/PDF).'
  );
}

/**
 * Helper to resolve extract node inputs based on inputMode configuration.
 * Returns the DocumentIR and/or source FlowInput based on the mode.
 * For 'auto' mode, resolves to the appropriate concrete mode.
 */
function resolveExtractInputs(
  input: any,
  config: ExtractNodeConfig,
  ctx: NodeCtx
): { ir: DocumentIR | null; source: FlowInput | null; isChunkOutput: boolean; effectiveMode: 'ir' | 'ir+source' | 'source' } {
  // Resolve 'auto' mode first (default is now 'auto')
  let effectiveMode: 'ir' | 'ir+source' | 'source';
  const configuredMode = config.inputMode ?? 'auto';

  if (configuredMode === 'auto') {
    effectiveMode = resolveAutoInputMode(input, config, ctx);
  } else {
    effectiveMode = configuredMode;
  }

  // Check if input is ChunkOutput
  const isChunkOutput = 'chunks' in input && Array.isArray((input as any).chunks);

  // Detect input types
  const isDocumentIR = !isChunkOutput &&
    'pages' in input &&
    Array.isArray((input as any).pages) &&
    (input as any).pages.length > 0 &&
    typeof (input as any).pages[0] === 'object' &&
    'lines' in (input as any).pages[0];

  const isFlowInput = !isDocumentIR && !isChunkOutput && (input.base64 || input.url);

  let ir: DocumentIR | null = null;
  let source: FlowInput | null = null;

  // Resolve IR
  if (effectiveMode === 'ir' || effectiveMode === 'ir+source') {
    if (isDocumentIR) {
      ir = input as DocumentIR;
    } else if (isChunkOutput && (input as any).sourceDocument) {
      // ChunkOutput has sourceDocument for IR
      ir = (input as any).sourceDocument;
    } else if (effectiveMode === 'ir' && !isChunkOutput) {
      throw new Error(
        'Extract inputMode="ir" requires DocumentIR input. ' +
        'Use inputMode="source" for direct VLM extraction from FlowInput.'
      );
    }
  }

  // Resolve source document (handles forEach/split contexts via artifacts)
  if (effectiveMode === 'source' || effectiveMode === 'ir+source') {
    if (config.useOriginalSource && ctx.artifacts.__originalFlowInput) {
      // Use original unsplit document (before split/forEach)
      source = ctx.artifacts.__originalFlowInput as FlowInput;
    } else if (ctx.artifacts.__flowInput) {
      // Use current flow's input (segment source in forEach context)
      source = ctx.artifacts.__flowInput as FlowInput;
    } else if (isFlowInput) {
      // Input is already FlowInput (direct VLM path)
      source = input as FlowInput;
    }

    if (!source) {
      throw new Error(
        `Extract inputMode="${effectiveMode}" requires source document but none found. ` +
        'Ensure flow input is a document (base64/url) or use inputMode="ir".'
      );
    }
  }

  return { ir, source, isChunkOutput, effectiveMode };
}

/** Extract node - LLM/VLM extracts structured data with optional citation tracking */
export function extract<T = any>(config: ExtractNodeConfig<T>) {
  const configuredMode = config.inputMode ?? 'auto';

  // For text-only extraction (inputMode='ir'), LLM providers are acceptable
  // For visual modes ('source', 'ir+source'), VLM is required
  const requiresVLM = configuredMode !== 'ir';
  const acceptsLLM = configuredMode === 'ir';

  validateProviderCompatibility('extract', config.provider, {
    requiresVLM,
    acceptsOCR: false,
    acceptsLLM
  });

  if (configuredMode !== 'auto') {
    // Warn if VLM provider explicitly used with inputMode='ir' (text-only, missing visual context)
    if (isVLMProvider(config.provider) && configuredMode === 'ir') {
      console.warn(
        '[doclo] VLMProvider used with explicit inputMode="ir" (text-only). ' +
        'Consider inputMode="ir+source" or "auto" to leverage visual capabilities.'
      );
    }

    // Validate provider for explicit ir+source mode
    if (configuredMode === 'ir+source' && !isVLMProvider(config.provider)) {
      throw new Error(
        'inputMode="ir+source" requires VLMProvider for multimodal extraction.'
      );
    }

    // Validate provider for explicit source mode
    if (configuredMode === 'source' && !isVLMProvider(config.provider)) {
      throw new Error(
        'inputMode="source" requires VLMProvider for direct document extraction.'
      );
    }
  }

  // Determine return type based on citation config
  type ReturnType = typeof config.citations extends { enabled: true }
    ? OutputWithCitations<T>
    : T;

  const extractNode = node<DocumentIR | FlowInput, ReturnType>("extract", async (input: DocumentIR | FlowInput, ctx: NodeCtx) => {
    // === PREP PHASE (runs once, before consensus) ===
    const prepStartTime = Date.now();

    // Resolve inputs based on inputMode (handles 'auto' mode internally)
    const { ir, source, isChunkOutput, effectiveMode } = resolveExtractInputs(input, config, ctx);

    // For backward compatibility, also detect types directly for the existing paths
    const isDocumentIR = ir !== null;

    // Determine source type - prioritize sourceMetadata from ChunkOutput
    const sourceType: CitationSourceType =
      (isChunkOutput && (input as any).sourceMetadata?.providerType) ||
      (ir?.extras?.providerType as CitationSourceType) ||
      (ir ? 'ocr' : 'vlm');

    // Use resolved IR for citation mapping
    let sourceIR: DocumentIR | null = ir;

    // Prepared config for provider call
    let preparedPrompt: string | { text: string; images?: any[]; pdfs?: any[] };
    let extractionSchema: any;

    if (effectiveMode === 'ir+source' && ir && source) {
      // === HYBRID PATH: IR text + source document for visual context ===
      sourceIR = ir;

      // Collect structured formats (markdown/html) and plain text from IR
      const markdown = ir.pages.map((p: IRPage) => p.markdown).filter(Boolean).join('\n\n---PAGE BREAK---\n\n');
      const html = ir.pages.map((p: IRPage) => p.html).filter(Boolean).join('\n\n---PAGE BREAK---\n\n');
      const plainText = ir.pages.flatMap((p: IRPage) => p.lines.map((l: IRLine) => l.text ?? '')).join('\n');

      let documentText = '';
      let structuredFormat: 'markdown' | 'html' | null = null;

      if (markdown) {
        structuredFormat = 'markdown';
        documentText = `=== PARSED TEXT (MARKDOWN) ===\n${markdown}`;
      } else if (html) {
        structuredFormat = 'html';
        documentText = `=== PARSED TEXT (HTML) ===\n${html}`;
      } else {
        documentText = `=== PARSED TEXT ===\n${plainText}`;
      }

      // Resolve schema (handle ref, enhanced, or plain)
      const resolvedSchema = resolveSchema(config.schema);
      const isEnhanced = resolvedSchema && typeof resolvedSchema === 'object' && 'schema' in resolvedSchema;
      const actualSchema = isEnhanced ? (resolvedSchema as any).schema : resolvedSchema;
      const enhanced = isEnhanced ? (resolvedSchema as any) : null;

      // Build schema with citation tracking if enabled
      extractionSchema = config.citations?.enabled
        ? buildCitationSchema(actualSchema, config.citations)
        : actualSchema;

      // Build hybrid prompt
      const schemaTitle = (actualSchema as any).title || 'the provided schema';
      const schemaDescription = (actualSchema as any).description || '';

      let promptText = `You are extracting structured data from a document.

You have access to BOTH:
1. PARSED TEXT - OCR/parsed content for precise values and text
2. ORIGINAL DOCUMENT - The visual document for layout verification

TASK: Extract all relevant data according to ${schemaTitle}.
${schemaDescription ? `\nCONTEXT: ${schemaDescription}` : ''}

INSTRUCTIONS:
- Use PARSED TEXT for accurate field values (numbers, dates, names)
- Use ORIGINAL DOCUMENT to verify layout and visual elements
- For ambiguous values, trust the visual document over parsed text
- For missing or unclear fields, use null
- Preserve exact text for reference numbers and addresses

${documentText}

Extract the structured data now:`;

      if (enhanced?.extractionRules) {
        promptText = promptText.replace('Extract the structured data now:',
          `EXTRACTION RULES:\n${enhanced.extractionRules}\n\nExtract the structured data now:`);
      }

      if (config.additionalInstructions) {
        promptText = promptText.replace('Extract the structured data now:',
          `ADDITIONAL INSTRUCTIONS:\n${config.additionalInstructions}\n\nExtract the structured data now:`);
      }

      if (config.additionalPrompt) {
        promptText = promptText.replace('Extract the structured data now:',
          `ADDITIONAL INSTRUCTIONS:\n${config.additionalPrompt}\n\nExtract the structured data now:`);
      }

      // Detect source type and build multimodal prompt
      const sourceUrl = source.base64 || source.url;
      const detectedType = detectDocumentType(sourceUrl);
      const isPDF = detectedType === 'application/pdf';

      preparedPrompt = {
        text: promptText,
        images: sourceUrl && !isPDF ? [{ base64: sourceUrl, mimeType: detectedType as any }] : undefined,
        pdfs: sourceUrl && isPDF ? [{ base64: sourceUrl }] : undefined
      };

    } else if (isDocumentIR && ir) {
      // === TEXT-ONLY PATH (existing DocumentIR logic) ===
      sourceIR = ir;

      // Collect structured formats (markdown/html) and plain text
      const markdown = ir.pages.map((p: IRPage) => p.markdown).filter(Boolean).join('\n\n---PAGE BREAK---\n\n');
      const html = ir.pages.map((p: IRPage) => p.html).filter(Boolean).join('\n\n---PAGE BREAK---\n\n');
      const plainText = ir.pages.flatMap((p: IRPage) => p.lines.map((l: IRLine) => l.text ?? '')).join('\n');

      let documentText = '';
      let structuredFormat: 'markdown' | 'html' | null = null;

      if (markdown) {
        structuredFormat = 'markdown';
        documentText = `=== MARKDOWN (preserves layout, tables, headers) ===\n${markdown}\n\n=== PLAIN TEXT (line by line) ===\n${plainText}`;
      } else if (html) {
        structuredFormat = 'html';
        documentText = `=== HTML (preserves layout, tables, headers) ===\n${html}\n\n=== PLAIN TEXT (line by line) ===\n${plainText}`;
      } else {
        documentText = plainText;
      }

      // Resolve schema (handle ref, enhanced, or plain)
      const resolvedSchema = resolveSchema(config.schema);
      const isEnhanced = resolvedSchema && typeof resolvedSchema === 'object' && 'schema' in resolvedSchema;
      const actualSchema = isEnhanced ? (resolvedSchema as any).schema : resolvedSchema;
      const enhanced = isEnhanced ? (resolvedSchema as any) : null;

      // Build schema with citation tracking if enabled
      extractionSchema = config.citations?.enabled
        ? buildCitationSchema(actualSchema, config.citations)
        : actualSchema;

      // Build prompt - check for promptRef first
      let prompt: string;

      if (config.promptRef) {
        // Use prompt from registry
        const [promptId, version] = config.promptRef.includes('@')
          ? config.promptRef.split('@')
          : [config.promptRef, undefined];

        const promptAsset = version
          ? PROMPT_REGISTRY.get(promptId, version)
          : PROMPT_REGISTRY.getLatest(promptId);
        if (!promptAsset) {
          throw new Error(`Prompt not found: ${config.promptRef}`);
        }

        // Warn about redundant variables
        if (config.promptVariables) {
          const redundant = ['schema', 'documentText', 'structuredFormat', 'schemaTitle', 'schemaDescription']
            .filter(key => key in (config.promptVariables || {}));
          if (redundant.length > 0) {
            console.warn(
              `[doclo] Passing ${redundant.join(', ')} in promptVariables is redundant - ` +
              `these are auto-injected from config. You can safely remove them.`
            );
          }
        }

        // Render prompt with variables
        const variables = {
          schema: actualSchema,
          documentText,
          structuredFormat,
          schemaTitle: (actualSchema as any).title || 'the provided schema',
          schemaDescription: (actualSchema as any).description || '',
          ...config.promptVariables
        };

        const rendered = renderPrompt(promptAsset, {
          variables,
          additionalInstructions: config.additionalInstructions
        });

        // Convert rendered messages to single prompt text
        prompt = rendered.messages.map((msg: any) => {
          const content = msg.content?.[0];
          return content?.text ?? content ?? '';
        }).join('\n\n');

      } else {
        // Fall back to default prompt building
        const schemaTitle = (actualSchema as any).title || 'the provided schema';
        const schemaDescription = (actualSchema as any).description || '';

        prompt = `You are extracting structured data from a document.\n\nTASK: Extract all relevant data from the document text below and structure it according to ${schemaTitle}.\n\n${schemaDescription ? `CONTEXT: ${schemaDescription}\n` : ''}`;

        if (enhanced?.contextPrompt) {
          prompt += `\nDOCUMENT CONTEXT: ${enhanced.contextPrompt}\n`;
        }

        prompt += `\nINSTRUCTIONS:\n- Extract ALL fields that have data in the document, even if partially visible\n- Use the field descriptions in the schema as guidance for where to find each value\n- For missing or unclear fields, use null rather than guessing\n- Pay close attention to numeric precision (decimals, units)\n- Preserve exact text for names, addresses, and reference numbers\n- For dates, use YYYY-MM-DD format unless specified otherwise\n${structuredFormat ? `- The ${structuredFormat.toUpperCase()} format shows document structure (tables, headers); use it to understand layout\n- The plain text shows exact line-by-line content; use it for precise values` : ''}`;

        // Add citation instructions if enabled
        if (config.citations?.enabled) {
          prompt += `\n\nCITATION TRACKING:\n- For each field you extract, record which line(s) contained that value\n- Lines are labeled with IDs like "p1_l5" (page 1, line 5)\n- For each field, provide the line ID(s) where you found the value`;

          if (config.citations.detectInferred) {
            prompt += `\n- If you calculate or infer a value (not directly stated), mark it as inferred and explain your reasoning`;
          }

          if (config.citations.includeConfidence !== false) {
            prompt += `\n- Provide a confidence score (0-1) for each extracted field`;
          }
        }

        // Add extraction rules, hints, examples
        if (enhanced?.extractionRules) {
          prompt += `\n\nEXTRACTION RULES:\n${enhanced.extractionRules}`;
        }
        if (enhanced?.hints && enhanced.hints.length > 0) {
          prompt += `\n\nHINTS:\n${enhanced.hints.map((h: string) => `- ${h}`).join('\n')}`;
        }
        if (enhanced?.examples && enhanced.examples.length > 0) {
          prompt += `\n\nEXAMPLES:`;
          enhanced.examples.forEach((ex: any) => {
            prompt += `\n\n${ex.description}`;
            prompt += `\nInput: ${ex.input}`;
            prompt += `\nOutput: ${JSON.stringify(ex.output, null, 2)}`;
          });
        }
        if (config.additionalPrompt) {
          prompt += `\n\nADDITIONAL INSTRUCTIONS:\n${config.additionalPrompt}`;
        }
        if (config.additionalInstructions) {
          prompt += `\n\nADDITIONAL INSTRUCTIONS:\n${config.additionalInstructions}`;
        }

        prompt += `\n\nDOCUMENT TEXT:\n${documentText}\n\nExtract the structured data now:`;
      }

      preparedPrompt = prompt;

    } else if (source) {
      // === SOURCE-ONLY PATH (VLM direct extraction) ===
      if (!isVLMProvider(config.provider)) {
        throw new Error('VLMProvider required for extracting from FlowInput');
      }

      // Use resolved source (handles useOriginalSource and artifact lookup)
      const dataUrl = source.base64 || source.url;
      // Detect document type using magic bytes (fixes raw base64 PDF detection)
      const detectedType = detectDocumentType(dataUrl);
      const isPDF = detectedType === 'application/pdf';

      // Resolve schema (handle ref, enhanced, or plain)
      const resolvedSchema = resolveSchema(config.schema);
      const isEnhanced = resolvedSchema && typeof resolvedSchema === 'object' && 'schema' in resolvedSchema;
      const actualSchema = isEnhanced ? (resolvedSchema as any).schema : resolvedSchema;
      const enhanced = isEnhanced ? (resolvedSchema as any) : null;

      // Build schema with citation tracking if enabled
      extractionSchema = config.citations?.enabled
        ? buildCitationSchema(actualSchema, config.citations)
        : actualSchema;

      // Build VLM prompt - check for promptRef first
      let promptText: string;

      if (config.promptRef) {
        // Use prompt from registry
        const [promptId, version] = config.promptRef.includes('@')
          ? config.promptRef.split('@')
          : [config.promptRef, undefined];

        const promptAsset = version
          ? PROMPT_REGISTRY.get(promptId, version)
          : PROMPT_REGISTRY.getLatest(promptId);
        if (!promptAsset) {
          throw new Error(`Prompt not found: ${config.promptRef}`);
        }

        // Warn about redundant variables
        if (config.promptVariables) {
          const redundant = ['schema', 'schemaTitle', 'schemaDescription']
            .filter(key => key in (config.promptVariables || {}));
          if (redundant.length > 0) {
            console.warn(
              `[doclo] Passing ${redundant.join(', ')} in promptVariables is redundant - ` +
              `these are auto-injected from config. You can safely remove them.`
            );
          }
        }

        // Render prompt with variables
        const variables = {
          schema: actualSchema,
          schemaTitle: (actualSchema as any).title || 'the provided schema',
          schemaDescription: (actualSchema as any).description || '',
          ...config.promptVariables
        };

        const rendered = renderPrompt(promptAsset, {
          variables,
          additionalInstructions: config.additionalInstructions
        });

        // Convert rendered messages to single prompt text
        promptText = rendered.messages.map((msg: any) => {
          const content = msg.content?.[0];
          return content?.text ?? content ?? '';
        }).join('\n\n');

      } else {
        // Fall back to default VLM prompt
        promptText = 'Extract structured data from this document';

        if (config.citations?.enabled) {
          promptText += `\n\nFor each field you extract, note which page and approximate line/section it came from.`;
          if (config.citations.detectInferred) {
            promptText += ` Mark calculated or inferred values and explain your reasoning.`;
          }
        }

        if (enhanced?.contextPrompt) {
          promptText += `\n\nDocument context: ${enhanced.contextPrompt}`;
        }
        if (enhanced?.extractionRules) {
          promptText += `\n\nExtraction rules: ${enhanced.extractionRules}`;
        }
        if (config.additionalPrompt) {
          promptText += `\n\nAdditional instructions: ${config.additionalPrompt}`;
        }
        if (config.additionalInstructions) {
          promptText += `\n\nAdditional instructions: ${config.additionalInstructions}`;
        }
      }

      preparedPrompt = {
        text: promptText,
        images: dataUrl && !isPDF ? [{ base64: dataUrl, mimeType: detectedType as any }] : undefined,
        pdfs: dataUrl && isPDF ? [{ base64: dataUrl }] : undefined
      };
    } else {
      // No valid input configuration
      throw new Error(
        `Invalid extract configuration: effectiveMode="${effectiveMode}" but ` +
        `ir=${!!ir}, source=${!!source}. Check your flow inputs and inputMode setting.`
      );
    }

    const prepTimeMs = Date.now() - prepStartTime;

    // Record prep metrics (once, before consensus runs)
    if (ctx?.metrics && config.consensus) {
      const { provider, model } = parseProviderName(config.provider.name);
      ctx.metrics.push({
        step: "extract-prep",
        configStepId: ctx.stepId,
        startMs: prepStartTime,
        provider,
        model,
        ms: prepTimeMs,
        metadata: { kind: 'prep' }
      });
    }

    // === EXECUTION PHASE (runs N times for consensus) ===
    const extractOnce = async (): Promise<ReturnType> => {
      const t0 = Date.now();

      // Set observability context on provider if supported
      if ((config.provider as any).__setObservabilityContext && ctx.observability) {
        (config.provider as any).__setObservabilityContext({
          config: ctx.observability.config,
          flowId: ctx.observability.flowId,
          executionId: ctx.observability.executionId,
          stepId: ctx.observability.stepId,
          traceContext: ctx.observability.traceContext,
          metadata: ctx.observability.metadata,
        });
      }

      // Provider call with prepared config
      const result = await (config.provider as any).completeJson({
        prompt: preparedPrompt,
        schema: extractionSchema,
        reasoning: config.reasoning
      });

      // Add metrics - now this is just the provider call time!
      if (ctx?.metrics) {
        const { provider, model } = parseProviderName(config.provider.name);
        ctx.metrics.push({
          step: "extract",
          configStepId: ctx.stepId,
          startMs: t0,
          provider,
          model,
          ms: Date.now() - t0,
          costUSD: result.metrics?.costUSD ?? result.costUSD,
          inputTokens: result.metrics?.inputTokens ?? result.inputTokens,
          outputTokens: result.metrics?.outputTokens ?? result.outputTokens,
          cacheCreationInputTokens: result.metrics?.cacheCreationInputTokens ?? result.cacheCreationInputTokens,
          cacheReadInputTokens: result.metrics?.cacheReadInputTokens ?? result.cacheReadInputTokens,
          attemptNumber: result.metrics?.attemptNumber ?? 1,
          metadata: { kind: 'leaf' }
        });
      }

      // Return with or without citations based on config
      if (config.citations?.enabled) {
        const rawResult = result.json as { data: T; citations: any[] };
        const fieldCitations = mapLineCitations(
          rawResult.citations || [],
          sourceIR,
          sourceType,
          config.citations
        );

        return {
          data: rawResult.data,
          citations: fieldCitations,
          metadata: {
            totalPages: sourceIR?.pages.length,
            sourceType,
            hasInferredValues: fieldCitations.some(c => c.reasoning),
            processingTime: Date.now() - t0
          }
        } as ReturnType;
      } else {
        return result.json as ReturnType;
      }
    };

    return runWithConsensus(extractOnce, config.consensus, ctx, ctx?.observability ? {
      observability: ctx.observability.config,
      flowId: ctx.observability.flowId,
      executionId: ctx.observability.executionId,
      stepId: ctx.observability.stepId,
      stepIndex: ctx.observability.stepIndex,
      traceContext: ctx.observability.traceContext,
      metadata: ctx.observability.metadata,
    } : undefined) as Promise<ReturnType>;
  });

  // Add type metadata for validation
  extractNode.__meta = {
    inputTypes: ['DocumentIR', 'FlowInput', 'ChunkOutput'],
    outputType: (cfg: ExtractNodeConfig) => cfg.citations?.enabled ? 'OutputWithCitations<T>' : 'T',
    requiresProvider: ['VLM'],
    acceptsArray: false,
    outputsArray: false,
    description: 'Extract structured data with optional citation tracking (terminal node in most flows)'
  };

  return extractNode;
}

/** Chunk node - Split parsed document into chunks for RAG/embeddings */
export function chunk(config: ChunkNodeConfig) {
  const chunkNode = node<DocumentIR | DocumentIR[], ChunkOutput>("chunk", async (input: DocumentIR | DocumentIR[], ctx: NodeCtx) => {
    const t0 = Date.now();

    // Normalize input to array
    const documents = Array.isArray(input) ? input : [input];

    // Extract full text and build page mapping
    let fullText = '';
    const pageMapping: Array<{ pageNumber: number; startChar: number; endChar: number; text: string }> = [];

    for (let docIdx = 0; docIdx < documents.length; docIdx++) {
      const doc = documents[docIdx];
      for (let pageIdx = 0; pageIdx < doc.pages.length; pageIdx++) {
        const page = doc.pages[pageIdx];
        const pageText = page.lines.map((l: IRLine) => l.text ?? '').join('\n');
        const startChar = fullText.length;
        fullText += pageText + '\n\n';  // Add page break
        const endChar = fullText.length;

        // Calculate actual page number (accounting for chunks)
        const pageRange = doc.extras?.pageRange as [number, number] | undefined;
        const basePageNum = (pageRange?.[0] || 1) - 1;  // Get chunk's starting page
        const actualPageNum = basePageNum + pageIdx + 1;

        pageMapping.push({
          pageNumber: actualPageNum,
          startChar,
          endChar,
          text: pageText
        });
      }
    }

    const chunks: ChunkMetadata[] = [];

    // Apply chunking strategy
    switch (config.strategy) {
      case 'recursive': {
        const maxSize = config.maxSize || 1000;
        const minSize = config.minSize || 100;
        const overlap = config.overlap || 0;
        const separators = config.separators || ['\n\n', '\n', '. ', ' '];

        chunks.push(...recursiveChunk(fullText, maxSize, minSize, overlap, separators, pageMapping, 'recursive'));
        break;
      }

      case 'section': {
        const maxSize = config.maxSize || 2000;
        const minSize = config.minSize || 100;

        chunks.push(...sectionChunk(fullText, maxSize, minSize, pageMapping));
        break;
      }

      case 'page': {
        const pagesPerChunk = config.pagesPerChunk || 1;
        const combineShortPages = config.combineShortPages !== false;
        const minPageContent = config.minPageContent || 100;

        chunks.push(...pageChunk(pageMapping, pagesPerChunk, combineShortPages, minPageContent));
        break;
      }

      case 'fixed': {
        const size = config.size || 512;
        const unit = config.unit || 'characters';
        const overlap = config.overlap || 0;

        chunks.push(...fixedChunk(fullText, size, unit, overlap, pageMapping));
        break;
      }

      default:
        throw new Error(`Unknown chunking strategy: ${config.strategy}`);
    }

    const totalSize = chunks.reduce((sum, c) => sum + c.charCount, 0);

    const result: ChunkOutput = {
      chunks,
      totalChunks: chunks.length,
      averageChunkSize: chunks.length > 0 ? Math.round(totalSize / chunks.length) : 0,
      // Preserve source metadata for citation tracking
      sourceMetadata: documents[0]?.extras?.providerType ? {
        providerType: documents[0].extras.providerType as string
      } : undefined,
      // Preserve original DocumentIR for citation mapping
      sourceDocument: documents[0]
    };

    ctx.metrics.push({
      step: "chunk",
      configStepId: ctx.stepId,
      startMs: t0,
      ms: Date.now() - t0,
      costUSD: 0,
      attemptNumber: 1,
      metadata: { kind: 'wrapper', type: 'utility' }
    });

    return result;
  });

  // Add type metadata for validation
  chunkNode.__meta = {
    inputTypes: ['DocumentIR', 'DocumentIR[]'],
    outputType: 'ChunkOutput',
    acceptsArray: true,
    outputsArray: false,
    description: 'Split parsed document into chunks for RAG/embeddings (no provider required)'
  };

  return chunkNode;
}

/** Recursive chunking - split by hierarchical separators */
function recursiveChunk(
  text: string,
  maxSize: number,
  minSize: number,
  overlap: number,
  separators: string[],
  pageMapping: Array<{ pageNumber: number; startChar: number; endChar: number; text: string }>,
  strategy: string
): ChunkMetadata[] {
  const chunks: ChunkMetadata[] = [];
  let chunkId = 0;

  function splitRecursive(content: string, startChar: number, sepIndex: number): void {
    if (content.length <= maxSize) {
      if (content.trim().length >= minSize) {
        chunks.push(createChunkMetadata(content, startChar, chunkId++, pageMapping, strategy));
      }
      return;
    }

    if (sepIndex >= separators.length) {
      // No more separators - split by maxSize
      for (let i = 0; i < content.length; i += maxSize - overlap) {
        const chunk = content.slice(i, i + maxSize);
        if (chunk.trim().length >= minSize) {
          chunks.push(createChunkMetadata(chunk, startChar + i, chunkId++, pageMapping, strategy));
        }
      }
      return;
    }

    const separator = separators[sepIndex];
    const parts = content.split(separator);

    let currentChunk = '';
    let currentStart = startChar;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] + (i < parts.length - 1 ? separator : '');

      if ((currentChunk + part).length <= maxSize) {
        currentChunk += part;
      } else {
        if (currentChunk.trim().length >= minSize) {
          chunks.push(createChunkMetadata(currentChunk, currentStart, chunkId++, pageMapping, strategy));
        }

        // Add overlap from previous chunk
        if (overlap > 0 && currentChunk.length > overlap) {
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + part;
          currentStart += currentChunk.length - overlapText.length - part.length;
        } else {
          currentChunk = part;
          currentStart += currentChunk.length - part.length;
        }
      }
    }

    if (currentChunk.trim().length >= minSize) {
      chunks.push(createChunkMetadata(currentChunk, currentStart, chunkId++, pageMapping, strategy));
    }
  }

  splitRecursive(text, 0, 0);
  return chunks;
}

/** Section-based chunking - split by headers/sections */
function sectionChunk(
  text: string,
  maxSize: number,
  minSize: number,
  pageMapping: Array<{ pageNumber: number; startChar: number; endChar: number; text: string }>
): ChunkMetadata[] {
  const chunks: ChunkMetadata[] = [];

  // Simple header detection (lines that are all caps or start with #)
  const lines = text.split('\n');
  const sections: Array<{ header: string; content: string; startChar: number }> = [];

  let currentSection = { header: '', content: '', startChar: 0 };
  let charPos = 0;

  for (const line of lines) {
    const isHeader = /^#{1,6}\s/.test(line) || (line.trim().length > 0 && line === line.toUpperCase() && line.trim().length < 60);

    if (isHeader && currentSection.content.length > 0) {
      sections.push(currentSection);
      currentSection = { header: line.trim(), content: '', startChar: charPos };
    } else {
      currentSection.content += line + '\n';
    }

    charPos += line.length + 1;
  }

  if (currentSection.content.length > 0) {
    sections.push(currentSection);
  }

  // Chunk each section, combining small ones
  let combinedContent = '';
  let combinedStart = 0;
  let chunkId = 0;

  for (const section of sections) {
    const sectionText = section.header ? `${section.header}\n${section.content}` : section.content;

    if ((combinedContent + sectionText).length <= maxSize || combinedContent.length === 0) {
      if (combinedContent.length === 0) {
        combinedStart = section.startChar;
      }
      combinedContent += sectionText;
    } else {
      if (combinedContent.trim().length >= minSize) {
        chunks.push(createChunkMetadata(combinedContent, combinedStart, chunkId++, pageMapping, 'section', section.header));
      }
      combinedContent = sectionText;
      combinedStart = section.startChar;
    }
  }

  if (combinedContent.trim().length >= minSize) {
    chunks.push(createChunkMetadata(combinedContent, combinedStart, chunkId++, pageMapping, 'section'));
  }

  return chunks;
}

/** Page-based chunking - one or more pages per chunk */
function pageChunk(
  pageMapping: Array<{ pageNumber: number; startChar: number; endChar: number; text: string }>,
  pagesPerChunk: number,
  combineShortPages: boolean,
  minPageContent: number
): ChunkMetadata[] {
  const chunks: ChunkMetadata[] = [];
  let chunkId = 0;

  for (let i = 0; i < pageMapping.length; i += pagesPerChunk) {
    const pages = pageMapping.slice(i, i + pagesPerChunk);
    const content = pages.map(p => p.text).join('\n\n');

    if (combineShortPages && content.length < minPageContent && i + pagesPerChunk < pageMapping.length) {
      // Skip short pages and combine with next
      continue;
    }

    const startChar = pages[0].startChar;
    const pageNumbers = pages.map(p => p.pageNumber);

    chunks.push({
      content,
      id: `chunk_page_${chunkId}`,
      index: chunkId++,
      startChar,
      endChar: startChar + content.length,
      pageNumbers,
      strategy: 'page',
      wordCount: content.split(/\s+/).length,
      charCount: content.length
    });
  }

  return chunks;
}

/** Fixed-size chunking - consistent chunk sizes */
function fixedChunk(
  text: string,
  size: number,
  unit: 'tokens' | 'characters',
  overlap: number,
  pageMapping: Array<{ pageNumber: number; startChar: number; endChar: number; text: string }>
): ChunkMetadata[] {
  const chunks: ChunkMetadata[] = [];
  let chunkId = 0;

  // For simplicity, treat tokens as ~4 characters (rough approximation)
  const effectiveSize = unit === 'tokens' ? size * 4 : size;
  const effectiveOverlap = unit === 'tokens' ? overlap * 4 : overlap;

  for (let i = 0; i < text.length; i += effectiveSize - effectiveOverlap) {
    const chunk = text.slice(i, i + effectiveSize);
    if (chunk.trim().length > 0) {
      chunks.push(createChunkMetadata(chunk, i, chunkId++, pageMapping, 'fixed'));
    }
  }

  return chunks;
}

/** Helper to create chunk metadata */
function createChunkMetadata(
  content: string,
  startChar: number,
  index: number,
  pageMapping: Array<{ pageNumber: number; startChar: number; endChar: number; text: string }>,
  strategy: string,
  section?: string
): ChunkMetadata {
  const endChar = startChar + content.length;

  // Find which pages this chunk spans
  const pageNumbers = pageMapping
    .filter(p => p.startChar < endChar && p.endChar > startChar)
    .map(p => p.pageNumber);

  // Approximate token count (1 token ~= 4 characters)
  const tokenCount = Math.ceil(content.length / 4);

  return {
    content,
    id: `chunk_${strategy}_${index}`,
    index,
    startChar,
    endChar,
    pageNumbers,
    section,
    strategy,
    tokenCount,
    wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
    charCount: content.length
  };
}

/** Combine node - Merge results from multiple parallel operations */
export function combine<T = any>(config?: CombineNodeConfig) {
  const combineNode = node<T[], T | T[]>("combine", async (inputs: T[], ctx: NodeCtx) => {
    const t0 = Date.now();
    const strategy = config?.strategy || 'merge';

    let result: T | T[];

    switch (strategy) {
      case 'merge': {
        // Intelligent merge - deduplicate and merge objects
        if (inputs.length === 0) {
          result = [] as T[];
          break;
        }

        // If all inputs are arrays, flatten them
        if (inputs.every((i: T) => Array.isArray(i))) {
          result = (inputs as any[]).flat() as T[];
        }
        // If all inputs are objects, merge their properties
        else if (inputs.every((i: T) => typeof i === 'object' && i !== null && !Array.isArray(i))) {
          result = Object.assign({}, ...inputs.map(sanitizeObject)) as T;
        }
        // Otherwise, return as array
        else {
          result = inputs as T[];
        }
        break;
      }

      case 'concatenate': {
        // Simple concatenation - always return array
        result = inputs as T[];
        break;
      }

      case 'first': {
        // Return first non-null result
        result = inputs.find((i: T) => i != null) || inputs[0];
        break;
      }

      case 'last': {
        // Return last non-null result
        result = inputs.reverse().find((i: T) => i != null) || inputs[inputs.length - 1];
        break;
      }

      default:
        throw new Error(`Unknown combine strategy: ${strategy}`);
    }

    ctx.metrics.push({
      step: "combine",
      configStepId: ctx.stepId,
      startMs: t0,
      ms: Date.now() - t0,
      costUSD: 0,
      attemptNumber: 1,
      metadata: { kind: 'wrapper', type: 'utility' }
    });

    return result;
  });

  // Add type metadata for validation
  combineNode.__meta = {
    inputTypes: ['T[]'],
    outputType: (cfg?: CombineNodeConfig) => {
      const strategy = cfg?.strategy || 'merge';
      return strategy === 'concatenate' ? 'T[]' : 'T | T[]';
    },
    acceptsArray: true,
    outputsArray: (cfg?: CombineNodeConfig) => (cfg?.strategy || 'merge') === 'concatenate',
    description: 'Merge results from forEach operations (no provider required)'
  };

  return combineNode;
}

/**
 * Output node - Explicitly control which data is returned from a flow
 *
 * @param config - Output configuration (optional)
 * @returns Node function for output selection
 *
 * @example
 * // Single output
 * .output({ name: 'invoice_data' })
 *
 * // Select specific source
 * .output({ name: 'result', source: 'step2' })
 *
 * // Transform with pick
 * .output({ transform: 'pick', fields: ['id', 'amount'] })
 *
 * // Merge multiple sources
 * .output({ source: ['step1', 'step2'], transform: 'merge' })
 */
export function output<T = any>(config?: OutputNodeConfig) {
  const outputNode = node<any, T>("output", async (input: any, ctx: NodeCtx) => {
    const artifacts = (ctx as any).artifacts || {};

    // Determine source data
    let sourceData: any;

    if (!config?.source) {
      // No source specified - use input (previous step)
      sourceData = input;
    } else if (Array.isArray(config.source)) {
      // Multiple sources - get all
      sourceData = config.source.map((id: string) => artifacts[id]);
    } else {
      // Single source - get from artifacts
      sourceData = artifacts[config.source];
    }

    // Apply transform if specified
    let result: any;

    if (!config?.transform) {
      result = sourceData;
    } else {
      switch (config.transform) {
        case 'merge':
          // Merge multiple objects
          if (Array.isArray(sourceData)) {
            result = Object.assign({}, ...(sourceData as any[]).map(sanitizeObject));
          } else {
            result = sourceData;
          }
          break;

        case 'pick':
          // Pick specific fields
          if (config.fields && typeof sourceData === 'object') {
            result = {};
            for (const field of config.fields) {
              if (field in sourceData) {
                result[field] = sourceData[field];
              }
            }
          } else {
            result = sourceData;
          }
          break;

        case 'first':
          result = Array.isArray(sourceData) ? sourceData[0] : sourceData;
          break;

        case 'last':
          result = Array.isArray(sourceData) ? sourceData[sourceData.length - 1] : sourceData;
          break;

        case 'custom':
          if (config.customTransform) {
            result = config.customTransform(sourceData, artifacts);
          } else {
            result = sourceData;
          }
          break;

        default:
          result = sourceData;
      }
    }

    // Return the transformed result
    // Flow execution will handle this specially to support multiple outputs
    return result;
  });

  // Add type metadata for validation
  (outputNode as any).__meta = {
    inputTypes: ['any'],
    outputType: 'any',
    acceptsArray: true,
    outputsArray: false,
    description: 'Explicit output selection and transformation (no provider required)',
    isOutputNode: true,
    outputName: config?.name?.trim() || undefined
  };

  return outputNode;
}

// Re-export OutputNodeConfig type
export type { OutputNodeConfig };

// Trigger node for flow composition
export { trigger, type TriggerNodeConfig, type FlowBuilder, type ProviderRegistry } from './trigger';

// Legacy exports for backward compatibility
export const parseNode = (cfg: { ocr: OCRProvider }) => parse({ provider: cfg.ocr });

export const extractNode = <T>(cfg: {
  llm: VLMProvider;
  schema: object;
  makePrompt: (ir: DocumentIR) => string;
}) =>
  node<DocumentIR, T>("extract", async (ir: DocumentIR, ctx: NodeCtx) => {
    const prompt = cfg.makePrompt(ir);
    const t0 = Date.now();
    const { json, costUSD, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens } = await cfg.llm.completeJson({ prompt, schema: cfg.schema });
    const out = validateJson<T>(json, cfg.schema);
    const { provider, model } = parseProviderName(cfg.llm.name);
    ctx.metrics.push({
      step: "extract",
      configStepId: ctx.stepId,
      startMs: t0,
      provider,
      model,
      ms: Date.now() - t0,
      costUSD,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      attemptNumber: 1,
      metadata: { kind: 'leaf' }
    });
    return out;
  });
