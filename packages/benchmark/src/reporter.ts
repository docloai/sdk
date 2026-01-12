import fs from 'fs';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { BenchmarkResult, ReportOptions } from './types.js';

/**
 * Generate console report
 */
export function reportConsole(results: BenchmarkResult[]): void {
  console.log(chalk.bold('\n' + '='.repeat(70)));
  console.log(chalk.bold.cyan('  BENCHMARK RESULTS'));
  console.log(chalk.bold('='.repeat(70) + '\n'));

  for (const result of results) {
    // Header
    const statusIcon = result.status === 'success' ? '✅' : '❌';
    console.log(chalk.bold(`${statusIcon} Test: ${result.caseId}`));

    if (result.status === 'error') {
      console.log(chalk.red(`Status: ERROR`));
      if (result.errors && result.errors.length > 0) {
        console.log(chalk.red(`Errors: ${result.errors.join(', ')}\n`));
      }
      continue;
    }

    console.log(chalk.green(`Status: SUCCESS`));

    // Overall accuracy
    const accuracyColor = result.accuracy.overall >= 90 ? chalk.green :
                          result.accuracy.overall >= 70 ? chalk.yellow :
                          chalk.red;
    console.log(accuracyColor(`Overall Accuracy: ${result.accuracy.overall.toFixed(1)}%`));

    // Required/Optional fields
    if (result.accuracy.required.total > 0) {
      console.log(`Required Fields: ${result.accuracy.required.present}/${result.accuracy.required.total} (${result.accuracy.required.percentage.toFixed(0)}%)`);
    }

    if (result.accuracy.optional.total > 0) {
      console.log(`Optional Fields: ${result.accuracy.optional.present}/${result.accuracy.optional.total} (${result.accuracy.optional.percentage.toFixed(0)}%)`);
    }

    // Field-level results (top failures)
    const fields = Object.entries(result.accuracy.fieldLevel);
    const failures = fields.filter(([_, f]) => !f.match).slice(0, 5);

    if (failures.length > 0) {
      console.log(chalk.yellow(`\nTop Field Failures:`));

      for (const [path, field] of failures) {
        console.log(chalk.red(`  ✗ ${path}`));
        console.log(`    Expected: ${JSON.stringify(field.expected)}`);
        console.log(`    Actual:   ${JSON.stringify(field.actual)}`);
        if (field.reason) {
          console.log(chalk.gray(`    Reason: ${field.reason}`));
        }
      }
    }

    // Performance
    console.log(`\nPerformance:`);
    console.log(`  Duration: ${(result.performance.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Cost: $${result.performance.costUSD.toFixed(4)}`);
    console.log(`  Provider Calls: ${result.performance.providerCalls}`);

    // Sampling statistics (if applicable)
    if (result.sampling) {
      console.log(`\nSampling Statistics (${result.sampling.runs} runs):`);
      console.log(`  Accuracy: ${result.sampling.accuracy.mean.toFixed(1)}% (±${result.sampling.accuracy.stdDev.toFixed(1)}%)`);
      console.log(`    Range: ${result.sampling.accuracy.min.toFixed(1)}% - ${result.sampling.accuracy.max.toFixed(1)}%`);
      console.log(`  Cost per Run: $${result.sampling.cost.perRun.toFixed(4)} (±$${result.sampling.cost.stdDev.toFixed(4)})`);
      console.log(`    Range: $${result.sampling.cost.min.toFixed(4)} - $${result.sampling.cost.max.toFixed(4)}`);
      console.log(`  Duration per Run: ${(result.sampling.duration.perRun / 1000).toFixed(1)}s (±${(result.sampling.duration.stdDev / 1000).toFixed(1)}s)`);
      console.log(`    Range: ${(result.sampling.duration.min / 1000).toFixed(1)}s - ${(result.sampling.duration.max / 1000).toFixed(1)}s`);
    }

    console.log(chalk.gray('\n' + '-'.repeat(70) + '\n'));
  }

  // Summary table
  const table = new Table({
    head: [
      chalk.bold('Test Case'),
      chalk.bold('Accuracy'),
      chalk.bold('Required'),
      chalk.bold('Duration'),
      chalk.bold('Cost')
    ],
    style: { head: [], border: [] }
  });

  for (const result of results) {
    const accuracyStr = result.accuracy.overall.toFixed(1) + '%';
    const accuracyColored = result.accuracy.overall >= 90 ? chalk.green(accuracyStr) :
                            result.accuracy.overall >= 70 ? chalk.yellow(accuracyStr) :
                            chalk.red(accuracyStr);

    const requiredStr = result.accuracy.required.total > 0
      ? `${result.accuracy.required.present}/${result.accuracy.required.total}`
      : '-';

    table.push([
      result.caseId,
      accuracyColored,
      requiredStr,
      `${(result.performance.durationMs / 1000).toFixed(1)}s`,
      `$${result.performance.costUSD.toFixed(4)}`
    ]);
  }

  console.log(table.toString());

  // Overall stats
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy.overall, 0) / results.length;
  const avgCost = results.reduce((sum, r) => sum + r.performance.costUSD, 0) / results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.performance.durationMs, 0) / results.length;

  console.log(chalk.bold('\nSummary:'));
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  Average Accuracy: ${avgAccuracy.toFixed(1)}%`);
  console.log(`  Average Cost: $${avgCost.toFixed(4)}`);
  console.log(`  Average Duration: ${(avgDuration / 1000).toFixed(1)}s`);
  console.log('');
}

/**
 * Generate markdown report
 */
export function reportMarkdown(results: BenchmarkResult[]): string {
  const date = new Date().toISOString().split('T')[0];

  let md = '# Benchmark Results\n\n';
  md += `**Date**: ${date}\n`;
  md += `**Total Tests**: ${results.length}\n\n`;

  // Summary stats
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy.overall, 0) / results.length;
  const avgCost = results.reduce((sum, r) => sum + r.performance.costUSD, 0) / results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.performance.durationMs, 0) / results.length;
  const passed = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;

  md += '## Summary\n\n';
  md += `- **Average Accuracy**: ${avgAccuracy.toFixed(1)}%\n`;
  md += `- **Average Cost**: $${avgCost.toFixed(4)}\n`;
  md += `- **Average Duration**: ${(avgDuration / 1000).toFixed(1)}s\n`;
  md += `- **Passed**: ${passed}/${results.length}\n`;
  md += `- **Failed**: ${failed}/${results.length}\n\n`;

  // Summary table
  md += '## Results\n\n';
  md += '| Test Case | Accuracy | Required | Optional | Duration | Cost |\n';
  md += '|-----------|----------|----------|----------|----------|------|\n';

  for (const result of results) {
    const icon = result.status === 'success' ? '✅' : '❌';
    const requiredStr = result.accuracy.required.total > 0
      ? `${result.accuracy.required.present}/${result.accuracy.required.total}`
      : '-';
    const optionalStr = result.accuracy.optional.total > 0
      ? `${result.accuracy.optional.present}/${result.accuracy.optional.total}`
      : '-';

    md += `| ${icon} ${result.caseId} | ${result.accuracy.overall.toFixed(1)}% | ${requiredStr} | ${optionalStr} | ${(result.performance.durationMs / 1000).toFixed(1)}s | $${result.performance.costUSD.toFixed(4)} |\n`;
  }

  md += '\n';

  // Detailed results
  md += '## Detailed Results\n\n';

  for (const result of results) {
    md += `### ${result.caseId}\n\n`;

    if (result.status === 'error') {
      md += `**Status**: ❌ ERROR\n\n`;
      if (result.errors && result.errors.length > 0) {
        md += `**Errors**:\n`;
        for (const error of result.errors) {
          md += `- ${error}\n`;
        }
      }
      md += '\n';
      continue;
    }

    md += `**Status**: ✅ SUCCESS\n\n`;
    md += `**Accuracy**: ${result.accuracy.overall.toFixed(1)}%\n\n`;

    if (result.accuracy.required.total > 0) {
      md += `**Required Fields**: ${result.accuracy.required.present}/${result.accuracy.required.total} (${result.accuracy.required.percentage.toFixed(0)}%)\n\n`;
    }

    if (result.accuracy.optional.total > 0) {
      md += `**Optional Fields**: ${result.accuracy.optional.present}/${result.accuracy.optional.total} (${result.accuracy.optional.percentage.toFixed(0)}%)\n\n`;
    }

    // Field failures
    const fields = Object.entries(result.accuracy.fieldLevel);
    const failures = fields.filter(([_, f]) => !f.match);

    if (failures.length > 0) {
      md += `**Field Failures** (${failures.length}):\n\n`;

      for (const [path, field] of failures) {
        md += `- \`${path}\`: Expected \`${JSON.stringify(field.expected)}\`, got \`${JSON.stringify(field.actual)}\`\n`;
        if (field.reason) {
          md += `  - ${field.reason}\n`;
        }
      }

      md += '\n';
    }

    // Performance
    md += `**Performance**:\n`;
    md += `- Duration: ${(result.performance.durationMs / 1000).toFixed(1)}s\n`;
    md += `- Cost: $${result.performance.costUSD.toFixed(4)}\n`;
    md += `- Provider Calls: ${result.performance.providerCalls}\n\n`;

    // Sampling statistics
    if (result.sampling) {
      md += `**Sampling Statistics** (${result.sampling.runs} runs):\n`;
      md += `- Accuracy: ${result.sampling.accuracy.mean.toFixed(1)}% (±${result.sampling.accuracy.stdDev.toFixed(1)}%)\n`;
      md += `  - Range: ${result.sampling.accuracy.min.toFixed(1)}% - ${result.sampling.accuracy.max.toFixed(1)}%\n`;
      md += `- Cost per Run: $${result.sampling.cost.perRun.toFixed(4)} (±$${result.sampling.cost.stdDev.toFixed(4)})\n`;
      md += `  - Range: $${result.sampling.cost.min.toFixed(4)} - $${result.sampling.cost.max.toFixed(4)}\n`;
      md += `- Duration per Run: ${(result.sampling.duration.perRun / 1000).toFixed(1)}s (±${(result.sampling.duration.stdDev / 1000).toFixed(1)}s)\n`;
      md += `  - Range: ${(result.sampling.duration.min / 1000).toFixed(1)}s - ${(result.sampling.duration.max / 1000).toFixed(1)}s\n\n`;
    }

    md += '---\n\n';
  }

  return md;
}

/**
 * Generate and save report
 */
export function generateReport(results: BenchmarkResult[], options: ReportOptions): void {
  if (options.format === 'console') {
    reportConsole(results);
  } else if (options.format === 'markdown') {
    const md = reportMarkdown(results);

    if (options.outputPath) {
      fs.writeFileSync(options.outputPath, md);
      console.log(chalk.green(`✅ Report written to ${options.outputPath}`));
    } else {
      console.log(md);
    }
  } else if (options.format === 'json') {
    const json = JSON.stringify(results, null, 2);

    if (options.outputPath) {
      fs.writeFileSync(options.outputPath, json);
      console.log(chalk.green(`✅ Report written to ${options.outputPath}`));
    } else {
      console.log(json);
    }
  }
}
