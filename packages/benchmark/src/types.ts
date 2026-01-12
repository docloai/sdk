import type { FlowResult, StepMetric } from '@doclo/core';

/**
 * Represents any valid JSON value. Used for comparing ground truth data
 * against extracted results where the exact type is determined by the schema.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Represents any valid JSON object (not array or primitive).
 */
export type JsonObject = { [key: string]: JsonValue };

/** Ground truth data with accuracy configuration */
export type TruthData = {
  /** Expected output values */
  expected: JsonObject;

  /** Accuracy configuration (optional) */
  config?: {
    /** Fields to fuzzy match (e.g., vessel names with slight variations) */
    fuzzyFields?: string[];

    /** Fields that must be present */
    requiredFields?: string[];

    /** Fields that are optional (won't penalize if missing) */
    optionalFields?: string[];

    /** Per-field numeric tolerance */
    numericTolerance?: {
      [fieldPath: string]: number;  // e.g., "bunkering.deliveredQuantityMT": 0.01
    };

    /** Default tolerance for all numeric fields */
    defaultTolerance?: number;  // Default: 0.001

    /** Fuzzy match threshold (0-100, default: 80) */
    fuzzyThreshold?: number;
  };
};

/** A single benchmark test case */
export type BenchmarkCase = {
  /** Unique test case ID */
  id: string;

  /** Path to document file */
  documentPath: string;

  /** Schema name from @doclo/schemas */
  schemaName: string;

  /** Path to truth data JSON file */
  truthPath: string;

  /** Flow type to execute */
  flow: string;

  /** Number of times to run this test (for sampling variance) */
  samples?: number;

  /** Run samples in parallel (default: true). Set to false for sequential execution. */
  parallelSamples?: boolean;

  /** Reasoning configuration for LLM providers */
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    exclude?: boolean;
    enabled?: boolean;
  };

  /** Optional provider overrides */
  providers?: {
    parse?: string;
    extract?: string;
  };
};

/** Field-level accuracy result */
export type FieldResult = {
  /** Expected value from ground truth (can be undefined if field doesn't exist) */
  expected: JsonValue | undefined;
  /** Actual extracted value (can be undefined if field wasn't extracted) */
  actual: JsonValue | undefined;
  match: boolean;
  score: number;  // 0-100
  reason?: string;
};

/** Benchmark accuracy metrics */
export type AccuracyMetrics = {
  /** Overall accuracy percentage (0-100) */
  overall: number;

  /** Field-level results */
  fieldLevel: {
    [fieldPath: string]: FieldResult;
  };

  /** Required fields presence */
  required: {
    present: number;
    total: number;
    percentage: number;
  };

  /** Optional fields presence */
  optional: {
    present: number;
    total: number;
    percentage: number;
  };
};

/** Performance metrics */
export type PerformanceMetrics = {
  durationMs: number;
  costUSD: number;
  providerCalls: number;
};

/** Complete benchmark result */
export type BenchmarkResult = {
  caseId: string;
  /** Result status: 'success' if flow completed, 'error' if system/runtime error occurred */
  status: 'success' | 'error';
  accuracy: AccuracyMetrics;
  performance: PerformanceMetrics;
  errors?: string[];
  flowResult?: FlowResult;

  /** Sampling statistics (when samples > 1) */
  sampling?: {
    runs: number;

    /** Accuracy statistics across samples */
    accuracy: {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
    };

    /** Cost statistics (per-run basis) */
    cost: {
      perRun: number;      // Mean cost per run
      stdDev: number;
      min: number;
      max: number;
    };

    /** Duration statistics (per-run basis) */
    duration: {
      perRun: number;      // Mean duration per run (ms)
      stdDev: number;
      min: number;
      max: number;
    };

    /** Individual run details */
    individualRuns: Array<{
      accuracy: number;
      cost: number;
      duration: number;
      metrics: StepMetric[];  // Step-by-step metrics for each individual run
    }>;
  };
};

/** Benchmark configuration file */
export type BenchmarkConfig = {
  /** Array of test cases */
  benchmarks: BenchmarkCase[];

  /** Flow definitions */
  flows: {
    [flowName: string]: FlowDefinition;
  };

  /** Global provider configuration */
  providers?: {
    [providerName: string]:
      | {
          provider: 'openai' | 'anthropic' | 'google' | 'xai';
          model: string;
          apiKey: string;
          via?: 'openrouter';
        }
      | {
          provider: 'marker';
          apiKey: string;
          force_ocr?: boolean;
          use_llm?: boolean;
        }
      | {
          provider: 'surya';
          endpoint: string;
          apiKey: string;
        };
  };

  /** Internal: Base path for resolving relative paths (set automatically) */
  _basePath?: string;
};

/** Flow step configuration value */
export type FlowStepConfigValue = JsonValue | undefined;

/** Flow step definition */
export type FlowStep = {
  type: 'parse' | 'extract' | 'split' | 'qualify' | 'categorize';
  provider: string;
  config?: Record<string, FlowStepConfigValue>;
};

/** Flow definition */
export type FlowDefinition = {
  steps: FlowStep[];
};

/** Benchmark run options */
export type BenchmarkOptions = {
  /** Path to config file OR config object */
  config?: string | BenchmarkConfig;

  /** Legacy: Path to config file (deprecated, use 'config' instead) */
  configPath?: string;

  /** Base path for resolving relative paths in config (defaults to config file directory or cwd) */
  basePath?: string;

  /** Filter by test case ID */
  id?: string;

  /** Filter by schema name */
  schema?: string;

  /** Filter by flow type */
  flow?: string;

  /** Run benchmark cases in parallel */
  parallel?: boolean;

  /** Run samples within each case in parallel (default: true). Set to false for sequential execution. */
  parallelSamples?: boolean;

  /** Progress callback - receives events during benchmark execution */
  onProgress?: (event: BenchmarksProgressEvent) => void | Promise<void>;
};

/** Options for loading config */
export type LoadConfigOptions = {
  /** Base path for resolving relative paths (defaults to config file directory) */
  basePath?: string;
};

/** Progress events for a single benchmark case */
export type BenchmarkProgressEvent =
  | { type: 'benchmark_start'; caseId: string; samples: number }
  | { type: 'sample_start'; caseId: string; sample: number; totalSamples: number }
  | { type: 'sample_complete'; caseId: string; sample: number; totalSamples: number; result: BenchmarkResult }
  | { type: 'benchmark_complete'; caseId: string; result: BenchmarkResult };

/** Progress events for multiple benchmark cases */
export type BenchmarksProgressEvent =
  | { type: 'start'; totalCases: number }
  | { type: 'case_start'; caseId: string; current: number; total: number }
  | { type: 'case_progress'; caseId: string; event: BenchmarkProgressEvent }
  | { type: 'case_complete'; caseId: string; current: number; total: number; result: BenchmarkResult }
  | { type: 'complete'; results: BenchmarkResult[] };

/** Options for running a single benchmark case */
export interface RunBenchmarkCaseOptions {
  /** Progress callback - receives events during benchmark execution */
  onProgress?: (event: BenchmarkProgressEvent) => void | Promise<void>;

  /** Run samples in parallel (default: true). Overrides per-case setting. */
  parallelSamples?: boolean;
}

/** Report format options */
export type ReportFormat = 'console' | 'markdown' | 'json';

/** Report options */
export type ReportOptions = {
  format: ReportFormat;
  outputPath?: string;
};
