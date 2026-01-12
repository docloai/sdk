import fs from 'fs';
import path from 'path';
import { createFlow, parse, extract, type BuiltFlow } from '@doclo/flows';
import { resolveDocument, type FlowResult, type StepMetric, type VLMProvider, type OCRProvider } from '@doclo/core';
import { safeJsonParse } from '@doclo/core/security';
import { createVLMProvider } from '@doclo/providers-llm';
import { suryaProvider, markerOCRProvider, markerVLMProvider } from '@doclo/providers-datalab';
import { bdnSchema } from '@doclo/schemas';
import { compareResults } from './comparator.js';
import type {
  BenchmarkCase,
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkOptions,
  TruthData,
  PerformanceMetrics,
  LoadConfigOptions,
  RunBenchmarkCaseOptions,
  BenchmarkProgressEvent,
  BenchmarksProgressEvent,
  JsonObject
} from './types.js';

/**
 * Union type for supported provider instances used in benchmarks.
 * Covers both VLM providers (for extraction) and OCR providers (for parsing).
 */
type BenchmarkProvider = VLMProvider | OCRProvider;

/**
 * Registry of provider instances by name.
 */
type BenchmarkProviderRegistry = Record<string, BenchmarkProvider>;

/**
 * Resolve a path relative to a base path
 * If the path is already absolute, returns it as-is
 * @param relativePath - The path to resolve
 * @param basePath - The base path to resolve against
 * @returns Absolute path
 */
function resolvePath(relativePath: string, basePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.resolve(basePath, relativePath);
}

/**
 * Load benchmark configuration from file or accept config object
 * @param configPathOrObject - Path to config file OR config object
 * @param options - Optional configuration options
 * @returns BenchmarkConfig with _basePath set for path resolution
 */
export function loadConfig(
  configPathOrObject: string | BenchmarkConfig,
  options?: LoadConfigOptions
): BenchmarkConfig {
  let config: BenchmarkConfig;
  let configDir: string;

  if (typeof configPathOrObject === 'string') {
    // Load from file
    const configPath = configPathOrObject;
    const content = fs.readFileSync(configPath, 'utf-8');
    config = safeJsonParse(content) as BenchmarkConfig;

    // Default basePath: directory containing the config file
    configDir = path.dirname(path.resolve(configPath));
  } else {
    // Use provided config object
    config = configPathOrObject;

    // Default basePath: current working directory
    configDir = process.cwd();
  }

  // Allow explicit basePath override
  const basePath = options?.basePath || config._basePath || configDir;

  // Store resolved basePath in config for later use
  config._basePath = basePath;

  return config;
}

/**
 * Load truth data from file
 * @param truthPath - Path to truth data file (can be relative or absolute)
 * @param basePath - Optional base path for resolving relative paths
 */
export function loadTruthData(truthPath: string, basePath?: string): TruthData {
  const resolvedPath = basePath ? resolvePath(truthPath, basePath) : truthPath;
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return safeJsonParse(content) as TruthData;
}

/**
 * Expand environment variables in a string
 * Replaces ${VAR_NAME} with process.env.VAR_NAME
 */
function expandEnvVars(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || '';
  });
}

/**
 * Create provider instances from config
 */
function createProviders(config: BenchmarkConfig): BenchmarkProviderRegistry {
  const providers: BenchmarkProviderRegistry = {};

  if (config.providers) {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      // Expand environment variables in apiKey
      const apiKey = expandEnvVars(providerConfig.apiKey);

      // Handle Surya providers
      if (providerConfig.provider === 'surya') {
        const endpoint = expandEnvVars(providerConfig.endpoint);
        providers[name] = suryaProvider({
          endpoint,
          apiKey
        });
      }
      // Handle Marker providers
      else if (providerConfig.provider === 'marker') {
        if (providerConfig.use_llm) {
          // Marker VLM provider
          providers[name] = markerVLMProvider({
            apiKey,
            force_ocr: providerConfig.force_ocr ?? true
          });
        } else {
          // Marker OCR provider
          providers[name] = markerOCRProvider({
            apiKey,
            force_ocr: providerConfig.force_ocr ?? true
          });
        }
      } else {
        // Standard VLM provider (OpenAI, Anthropic, Google, etc.)
        providers[name] = createVLMProvider({
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey,
          via: providerConfig.via
        });
      }
    }
  }

  // Add OCR provider if configured
  if (process.env.SURYA_API_KEY) {
    providers.surya = suryaProvider({
      endpoint: process.env.SURYA_ENDPOINT || 'https://www.datalab.to/api/v1/ocr',
      apiKey: process.env.SURYA_API_KEY
    });
  }

  // Add Datalab API key if available (for Marker providers)
  if (process.env.DATALAB_API_KEY) {
    if (!providers['marker-ocr']) {
      providers['marker-ocr'] = markerOCRProvider({
        apiKey: process.env.DATALAB_API_KEY,
        force_ocr: true
      });
    }
    if (!providers['marker-vlm']) {
      providers['marker-vlm'] = markerVLMProvider({
        apiKey: process.env.DATALAB_API_KEY,
        force_ocr: true
      });
    }
  }

  return providers;
}

/**
 * JSON Schema type for benchmark schemas
 */
type JSONSchemaObject = {
  type?: string;
  properties?: Record<string, JSONSchemaObject>;
  items?: JSONSchemaObject;
  required?: string[];
  description?: string;
  [key: string]: unknown;
};

/**
 * Get schema by name
 */
function getSchema(schemaName: string): JSONSchemaObject {
  const schemaMap: Record<string, JSONSchemaObject> = {
    bdn: bdnSchema as JSONSchemaObject,
    // Add more schemas as they're added to @doclo/schemas
  };

  const schema = schemaMap[schemaName];
  if (!schema) {
    throw new Error(`Unknown schema: ${schemaName}. Available schemas: ${Object.keys(schemaMap).join(', ')}`);
  }

  return schema;
}

/**
 * Flow execution result with metrics and output
 */
interface FlowExecutionResult {
  result: FlowResult<JsonObject>;
  performance: PerformanceMetrics;
}

/**
 * Build and execute flow for a benchmark case
 */
async function executeFlow(
  benchmarkCase: BenchmarkCase,
  config: BenchmarkConfig,
  providers: BenchmarkProviderRegistry
): Promise<FlowExecutionResult> {
  const flowDef = config.flows[benchmarkCase.flow];
  if (!flowDef) {
    throw new Error(`Flow "${benchmarkCase.flow}" not found in config`);
  }

  const schema = getSchema(benchmarkCase.schemaName);

  // Resolve document path using config's basePath if available
  // Supports local paths, HTTP/HTTPS URLs, and data URIs
  const documentPath = config._basePath
    ? resolvePath(benchmarkCase.documentPath, config._basePath)
    : benchmarkCase.documentPath;

  const input = {
    base64: await resolveDocument(documentPath)
  };

  // Build flow from definition
  // Note: The flow builder uses method chaining, which TypeScript has trouble tracking
  // across dynamic step additions. We use ReturnType to get the built flow type.
  let flowBuilder = createFlow();

  for (const step of flowDef.steps) {
    const provider = providers[step.provider];
    if (!provider) {
      throw new Error(`Provider "${step.provider}" not found. Available: ${Object.keys(providers).join(', ')}`);
    }

    if (step.type === 'parse') {
      // Parse nodes accept OCR providers
      flowBuilder = flowBuilder.step('parse', parse({ provider: provider as OCRProvider })) as typeof flowBuilder;
    } else if (step.type === 'extract') {
      // Extract nodes require VLM providers
      flowBuilder = flowBuilder.step('extract', extract({
        provider: provider as VLMProvider,
        schema,
        reasoning: benchmarkCase.reasoning
      })) as typeof flowBuilder;
    }
    // Add more node types as needed
  }

  const startTime = Date.now();
  const builtFlow = flowBuilder.build();
  const result = await builtFlow.run(input) as FlowResult<JsonObject>;
  const durationMs = Date.now() - startTime;

  // Handle both regular FlowResult and forEach results
  const metrics: StepMetric[] = result.metrics || [];
  const output = result.output as JsonObject;

  const performance: PerformanceMetrics = {
    durationMs,
    costUSD: metrics.reduce((sum, m) => sum + (m.costUSD || 0), 0),
    providerCalls: metrics.length
  };

  return { result: { ...result, output, metrics }, performance };
}

/**
 * Run a single benchmark case (one execution)
 */
async function runSingleExecution(
  benchmarkCase: BenchmarkCase,
  config: BenchmarkConfig,
  truthData: TruthData,
  providers: BenchmarkProviderRegistry
): Promise<BenchmarkResult> {
  const errors: string[] = [];

  try {
    // Execute flow
    const { result, performance } = await executeFlow(benchmarkCase, config, providers);

    // Compare results
    const accuracy = compareResults(
      truthData.expected,
      result.output,
      truthData.config
    );

    return {
      caseId: benchmarkCase.id,
      status: 'success',
      accuracy,
      performance,
      flowResult: result
    };

  } catch (error) {
    errors.push((error as Error).message);

    // Return error result with 0% accuracy
    return {
      caseId: benchmarkCase.id,
      status: 'error',
      accuracy: {
        overall: 0,
        fieldLevel: {},
        required: { present: 0, total: 0, percentage: 0 },
        optional: { present: 0, total: 0, percentage: 0 }
      },
      performance: {
        durationMs: 0,
        costUSD: 0,
        providerCalls: 0
      },
      errors
    };
  }
}

/**
 * Calculate statistics for a set of values
 */
function calculateStats(values: number[]): { mean: number; stdDev: number; min: number; max: number } {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { mean, stdDev, min, max };
}

/**
 * Helper to safely emit progress events for single benchmark case
 */
async function emitProgress(
  onProgress: ((event: BenchmarkProgressEvent) => void | Promise<void>) | undefined,
  event: BenchmarkProgressEvent
): Promise<void> {
  if (!onProgress) return;

  try {
    await onProgress(event);
  } catch (error) {
    console.error('Error in progress callback:', error);
  }
}

/**
 * Helper to safely emit progress events for multiple benchmarks
 */
async function emitBenchmarksProgress(
  onProgress: ((event: BenchmarksProgressEvent) => void | Promise<void>) | undefined,
  event: BenchmarksProgressEvent
): Promise<void> {
  if (!onProgress) return;

  try {
    await onProgress(event);
  } catch (error) {
    console.error('Error in progress callback:', error);
  }
}

/**
 * Run a single benchmark case (with optional sampling)
 */
export async function runBenchmarkCase(
  benchmarkCase: BenchmarkCase,
  config: BenchmarkConfig,
  options?: RunBenchmarkCaseOptions
): Promise<BenchmarkResult> {
  const errors: string[] = [];

  try {
    // Load truth data with basePath resolution
    const truthData = loadTruthData(benchmarkCase.truthPath, config._basePath);

    // Create providers
    const providers = createProviders(config);

    const samples = benchmarkCase.samples || 1;

    // Determine if samples should run in parallel
    // Priority: options.parallelSamples > benchmarkCase.parallelSamples > default (true)
    const parallelSamples = options?.parallelSamples ?? benchmarkCase.parallelSamples ?? true;

    // Emit benchmark start event
    await emitProgress(options?.onProgress, {
      type: 'benchmark_start',
      caseId: benchmarkCase.id,
      samples
    });

    if (samples === 1) {
      // Single run - no sampling
      await emitProgress(options?.onProgress, {
        type: 'sample_start',
        caseId: benchmarkCase.id,
        sample: 1,
        totalSamples: 1
      });

      const result = await runSingleExecution(benchmarkCase, config, truthData, providers);

      await emitProgress(options?.onProgress, {
        type: 'sample_complete',
        caseId: benchmarkCase.id,
        sample: 1,
        totalSamples: 1,
        result
      });

      // Log the actual output for debugging
      console.log(`\n[${benchmarkCase.id}] Extracted output:`, JSON.stringify(result.flowResult?.output, null, 2));

      await emitProgress(options?.onProgress, {
        type: 'benchmark_complete',
        caseId: benchmarkCase.id,
        result
      });

      return result;
    }

    // Multiple samples - run multiple times and aggregate
    const mode = parallelSamples ? 'parallel' : 'sequential';
    console.log(`\nRunning ${samples} samples for ${benchmarkCase.id} (${mode})...`);
    const results: BenchmarkResult[] = [];

    if (parallelSamples) {
      // Run all samples in parallel
      const samplePromises = Array.from({ length: samples }, async (_, i) => {
        await emitProgress(options?.onProgress, {
          type: 'sample_start',
          caseId: benchmarkCase.id,
          sample: i + 1,
          totalSamples: samples
        });

        console.log(`  Sample ${i + 1}/${samples} started...`);
        const result = await runSingleExecution(benchmarkCase, config, truthData, providers);

        await emitProgress(options?.onProgress, {
          type: 'sample_complete',
          caseId: benchmarkCase.id,
          sample: i + 1,
          totalSamples: samples,
          result
        });

        console.log(`  Sample ${i + 1}/${samples} completed.`);
        return result;
      });

      results.push(...await Promise.all(samplePromises));
    } else {
      // Run samples sequentially (original behavior)
      for (let i = 0; i < samples; i++) {
        await emitProgress(options?.onProgress, {
          type: 'sample_start',
          caseId: benchmarkCase.id,
          sample: i + 1,
          totalSamples: samples
        });

        console.log(`  Sample ${i + 1}/${samples}...`);
        const result = await runSingleExecution(benchmarkCase, config, truthData, providers);
        results.push(result);

        await emitProgress(options?.onProgress, {
          type: 'sample_complete',
          caseId: benchmarkCase.id,
          sample: i + 1,
          totalSamples: samples,
          result
        });
      }
    }

    // Calculate statistics
    const accuracies = results.map(r => r.accuracy.overall);
    const costs = results.map(r => r.performance.costUSD);
    const durations = results.map(r => r.performance.durationMs);

    const accuracyStats = calculateStats(accuracies);
    const costStats = calculateStats(costs);
    const durationStats = calculateStats(durations);

    // Use the first result as the base, but update with aggregated values
    // IMPORTANT: performance.costUSD and durationMs now always represent TOTALS
    const aggregatedResult = {
      ...results[0],
      accuracy: {
        ...results[0].accuracy,
        overall: accuracyStats.mean
      },
      performance: {
        ...results[0].performance,
        costUSD: costStats.mean * samples,      // Total cost across all samples
        durationMs: durationStats.mean * samples  // Total duration across all samples
      },
      sampling: {
        runs: samples,
        accuracy: {
          mean: accuracyStats.mean,
          stdDev: accuracyStats.stdDev,
          min: accuracyStats.min,
          max: accuracyStats.max
        },
        cost: {
          perRun: costStats.mean,      // Mean cost per run
          stdDev: costStats.stdDev,
          min: costStats.min,
          max: costStats.max
        },
        duration: {
          perRun: durationStats.mean,  // Mean duration per run
          stdDev: durationStats.stdDev,
          min: durationStats.min,
          max: durationStats.max
        },
        individualRuns: results.map(r => ({
          accuracy: r.accuracy.overall,
          cost: r.performance.costUSD,
          duration: r.performance.durationMs,
          metrics: r.flowResult?.metrics || []  // Include step-by-step metrics
        }))
      }
    };

    // Log aggregated results
    console.log(`\n[${benchmarkCase.id}] Sampling results:`);
    console.log(`  Accuracy: ${accuracyStats.mean.toFixed(1)}% (±${accuracyStats.stdDev.toFixed(1)}%)`);
    console.log(`  Cost: $${costStats.mean.toFixed(4)} (±$${costStats.stdDev.toFixed(4)})`);
    console.log(`  Duration: ${(durationStats.mean / 1000).toFixed(1)}s (±${(durationStats.stdDev / 1000).toFixed(1)}s)`);

    await emitProgress(options?.onProgress, {
      type: 'benchmark_complete',
      caseId: benchmarkCase.id,
      result: aggregatedResult
    });

    return aggregatedResult;

  } catch (error) {
    errors.push((error as Error).message);

    // Return error result with 0% accuracy
    return {
      caseId: benchmarkCase.id,
      status: 'error',
      accuracy: {
        overall: 0,
        fieldLevel: {},
        required: { present: 0, total: 0, percentage: 0 },
        optional: { present: 0, total: 0, percentage: 0 }
      },
      performance: {
        durationMs: 0,
        costUSD: 0,
        providerCalls: 0
      },
      errors
    };
  }
}

/**
 * Run multiple benchmark cases
 */
export async function runBenchmarks(
  options: BenchmarkOptions
): Promise<BenchmarkResult[]> {
  // Support both new 'config' parameter and legacy 'configPath'
  const configSource = options.config || options.configPath || './benchmarks/benchmark.config.json';

  // Load config with optional basePath override
  const config = typeof configSource === 'string'
    ? loadConfig(configSource, { basePath: options.basePath })
    : loadConfig(configSource, { basePath: options.basePath });

  // Filter benchmark cases
  let cases = config.benchmarks;

  if (options.id) {
    cases = cases.filter(c => c.id === options.id);
  }

  if (options.schema) {
    cases = cases.filter(c => c.schemaName === options.schema);
  }

  if (options.flow) {
    cases = cases.filter(c => c.flow === options.flow);
  }

  if (cases.length === 0) {
    console.warn('No benchmark cases matched the filters');
    return [];
  }

  console.log(`Running ${cases.length} benchmark case(s)...\n`);

  // Emit start event
  await emitBenchmarksProgress(options.onProgress, {
    type: 'start',
    totalCases: cases.length
  });

  // Run benchmarks (sequential for now)
  const results: BenchmarkResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const benchmarkCase = cases[i];

    console.log(`Running: ${benchmarkCase.id}...`);

    // Emit case start event
    await emitBenchmarksProgress(options.onProgress, {
      type: 'case_start',
      caseId: benchmarkCase.id,
      current: i + 1,
      total: cases.length
    });

    try {
      const result = await runBenchmarkCase(benchmarkCase, config, {
        onProgress: (event) => {
          // Forward progress events from individual benchmark case
          if (options.onProgress) {
            return emitBenchmarksProgress(options.onProgress, {
              type: 'case_progress',
              caseId: benchmarkCase.id,
              event
            });
          }
        },
        parallelSamples: options.parallelSamples
      });
      results.push(result);

      const status = result.errors && result.errors.length > 0 ? '❌' : '✅';
      console.log(`${status} ${benchmarkCase.id}: ${result.accuracy.overall.toFixed(1)}% accuracy\n`);

      // Emit case complete event
      await emitBenchmarksProgress(options.onProgress, {
        type: 'case_complete',
        caseId: benchmarkCase.id,
        current: i + 1,
        total: cases.length,
        result
      });
    } catch (error) {
      console.error(`❌ ${benchmarkCase.id}: ${(error as Error).message}\n`);

      const errorResult: BenchmarkResult = {
        caseId: benchmarkCase.id,
        status: 'error',
        accuracy: {
          overall: 0,
          fieldLevel: {},
          required: { present: 0, total: 0, percentage: 0 },
          optional: { present: 0, total: 0, percentage: 0 }
        },
        performance: {
          durationMs: 0,
          costUSD: 0,
          providerCalls: 0
        },
        errors: [(error as Error).message]
      };
      results.push(errorResult);

      // Emit case complete event even for errors
      await emitBenchmarksProgress(options.onProgress, {
        type: 'case_complete',
        caseId: benchmarkCase.id,
        current: i + 1,
        total: cases.length,
        result: errorResult
      });
    }
  }

  // Emit complete event
  await emitBenchmarksProgress(options.onProgress, {
    type: 'complete',
    results
  });

  return results;
}

/**
 * Run multiple benchmark cases with streaming results
 *
 * Yields results as each benchmark completes, allowing real-time UI updates
 * without waiting for all benchmarks to finish.
 *
 * @param options - Benchmark options (same as runBenchmarks)
 * @yields BenchmarkResult for each completed benchmark case
 *
 * @example
 * ```typescript
 * // Stream results as they complete
 * for await (const result of runBenchmarksStream({ config: './config.json' })) {
 *   console.log(`✓ ${result.caseId}: ${result.accuracy.overall}%`);
 *   updateUI(result);  // Update UI immediately
 * }
 *
 * // With filtering
 * for await (const result of runBenchmarksStream({
 *   config: './config.json',
 *   schema: 'invoice'
 * })) {
 *   console.log(`Completed: ${result.caseId}`);
 * }
 * ```
 */
export async function* runBenchmarksStream(
  options: BenchmarkOptions
): AsyncGenerator<BenchmarkResult, void, unknown> {
  // Support both new 'config' parameter and legacy 'configPath'
  const configSource = options.config || options.configPath || './benchmarks/benchmark.config.json';

  // Load config with optional basePath override
  const config = typeof configSource === 'string'
    ? loadConfig(configSource, { basePath: options.basePath })
    : loadConfig(configSource, { basePath: options.basePath });

  // Filter benchmark cases
  let cases = config.benchmarks;

  if (options.id) {
    cases = cases.filter(c => c.id === options.id);
  }

  if (options.schema) {
    cases = cases.filter(c => c.schemaName === options.schema);
  }

  if (options.flow) {
    cases = cases.filter(c => c.flow === options.flow);
  }

  if (cases.length === 0) {
    console.warn('No benchmark cases matched the filters');
    return;
  }

  console.log(`Running ${cases.length} benchmark case(s) (streaming)...\n`);

  // Emit start event
  await emitBenchmarksProgress(options.onProgress, {
    type: 'start',
    totalCases: cases.length
  });

  // Run benchmarks sequentially and yield each result
  for (let i = 0; i < cases.length; i++) {
    const benchmarkCase = cases[i];

    console.log(`Running: ${benchmarkCase.id}...`);

    // Emit case start event
    await emitBenchmarksProgress(options.onProgress, {
      type: 'case_start',
      caseId: benchmarkCase.id,
      current: i + 1,
      total: cases.length
    });

    try {
      const result = await runBenchmarkCase(benchmarkCase, config, {
        onProgress: (event) => {
          // Forward progress events from individual benchmark case
          if (options.onProgress) {
            return emitBenchmarksProgress(options.onProgress, {
              type: 'case_progress',
              caseId: benchmarkCase.id,
              event
            });
          }
        },
        parallelSamples: options.parallelSamples
      });

      const status = result.status === 'error' ? '❌' : '✅';
      console.log(`${status} ${benchmarkCase.id}: ${result.accuracy.overall.toFixed(1)}% accuracy\n`);

      // Emit case complete event
      await emitBenchmarksProgress(options.onProgress, {
        type: 'case_complete',
        caseId: benchmarkCase.id,
        current: i + 1,
        total: cases.length,
        result
      });

      // Yield result immediately
      yield result;
    } catch (error) {
      console.error(`❌ ${benchmarkCase.id}: ${(error as Error).message}\n`);

      const errorResult: BenchmarkResult = {
        caseId: benchmarkCase.id,
        status: 'error',
        accuracy: {
          overall: 0,
          fieldLevel: {},
          required: { present: 0, total: 0, percentage: 0 },
          optional: { present: 0, total: 0, percentage: 0 }
        },
        performance: {
          durationMs: 0,
          costUSD: 0,
          providerCalls: 0
        },
        errors: [(error as Error).message]
      };

      // Emit case complete event even for errors
      await emitBenchmarksProgress(options.onProgress, {
        type: 'case_complete',
        caseId: benchmarkCase.id,
        current: i + 1,
        total: cases.length,
        result: errorResult
      });

      // Yield error result
      yield errorResult;
    }
  }

  // Note: We don't emit 'complete' event with all results since this is streaming
  // The consumer collects results as they're yielded
}
