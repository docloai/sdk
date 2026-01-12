/**
 * @doclo/benchmark
 *
 * Benchmark utility for testing doclo-sdk extraction accuracy against ground truth
 */

// Export types
export * from './types.js';

// Export core functions
export { compareField, compareResults } from './comparator.js';
export { loadConfig, loadTruthData, runBenchmarkCase, runBenchmarks, runBenchmarksStream } from './runner.js';
export { reportConsole, reportMarkdown, generateReport } from './reporter.js';

// Re-export for convenience
export type {
  TruthData,
  BenchmarkCase,
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkOptions,
  AccuracyMetrics,
  PerformanceMetrics,
  FieldResult,
  ReportOptions,
  BenchmarkProgressEvent,
  BenchmarksProgressEvent,
  RunBenchmarkCaseOptions,
  LoadConfigOptions
} from './types.js';
