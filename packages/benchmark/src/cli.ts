#!/usr/bin/env node

import { Command } from 'commander';
import { safeJsonParse } from '@doclo/core/security';
import { runBenchmarks } from './runner.js';
import { generateReport } from './reporter.js';
import type { BenchmarkOptions, ReportOptions, BenchmarkResult } from './types.js';

/**
 * Validates that the parsed JSON is an array of BenchmarkResult objects.
 * Performs basic shape validation to ensure the data can be used for report generation.
 */
function validateBenchmarkResults(data: unknown): BenchmarkResult[] {
  if (!Array.isArray(data)) {
    throw new Error('Results file must contain an array');
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Result at index ${i} is not an object`);
    }

    const result = item as Record<string, unknown>;
    if (typeof result.caseId !== 'string') {
      throw new Error(`Result at index ${i} missing 'caseId' string field`);
    }
    if (result.status !== 'success' && result.status !== 'error') {
      throw new Error(`Result at index ${i} has invalid 'status' field (must be 'success' or 'error')`);
    }
    if (typeof result.accuracy !== 'object' || result.accuracy === null) {
      throw new Error(`Result at index ${i} missing 'accuracy' object field`);
    }
    if (typeof result.performance !== 'object' || result.performance === null) {
      throw new Error(`Result at index ${i} missing 'performance' object field`);
    }
  }

  return data as BenchmarkResult[];
}

const program = new Command();

program
  .name('doclo-benchmark')
  .description('Benchmark utility for testing Doclo extraction accuracy')
  .version('0.1.0');

program
  .command('run')
  .description('Run benchmarks')
  .option('-c, --config <path>', 'Path to benchmark config file', './benchmarks/benchmark.config.json')
  .option('-i, --id <id>', 'Run specific test case by ID')
  .option('-s, --schema <schema>', 'Run tests for specific schema (e.g., bdn)')
  .option('-f, --flow <flow>', 'Run tests for specific flow type (e.g., vlm-direct)')
  .option('-o, --output <path>', 'Output report file path')
  .option('--format <format>', 'Report format: console, markdown, json', 'console')
  .action(async (options) => {
    try {
      const benchmarkOptions: BenchmarkOptions = {
        config: options.config, // Now uses 'config' instead of 'configPath'
        id: options.id,
        schema: options.schema,
        flow: options.flow
      };

      console.log('Starting benchmark run...\n');

      const results = await runBenchmarks(benchmarkOptions);

      if (results.length === 0) {
        console.log('No results to report');
        return;
      }

      const reportOptions: ReportOptions = {
        format: options.format as 'console' | 'markdown' | 'json',
        outputPath: options.output
      };

      generateReport(results, reportOptions);

    } catch (error) {
      console.error('Error running benchmarks:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate report from previous results')
  .option('-i, --input <path>', 'Path to results JSON file')
  .option('-f, --format <format>', 'Report format: console, markdown, json', 'markdown')
  .option('-o, --output <path>', 'Output file path')
  .action(async (options) => {
    try {
      if (!options.input) {
        console.error('Error: --input is required for report command');
        process.exit(1);
      }

      const fs = await import('fs');
      const resultsJSON = fs.readFileSync(options.input, 'utf-8');
      const parsedData = safeJsonParse(resultsJSON);
      const results = validateBenchmarkResults(parsedData);

      const reportOptions: ReportOptions = {
        format: options.format as 'console' | 'markdown' | 'json',
        outputPath: options.output
      };

      generateReport(results, reportOptions);

    } catch (error) {
      console.error('Error generating report:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
