/**
 * Logging Utility for Observability
 *
 * Provides a logger that integrates with the observability system.
 * Logs are sent to the onLog hook with fire-and-forget execution.
 *
 * @module @doclo/core/observability/logger
 */

import type { ObservabilityConfig, LogContext, TraceContext } from './types.js';
import { executeHook } from './hook-executor.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  observability?: ObservabilityConfig;
  flowId?: string;
  executionId?: string;
  stepId?: string;
  traceContext?: TraceContext;
  metadata?: Record<string, unknown>;
}

/**
 * Logger class that integrates with observability hooks
 */
export class Logger {
  private options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.options = options;
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, data?: unknown): void {
    this.log('error', message, data, error instanceof Error ? error : undefined);
  }

  /**
   * Internal log method that sends to onLog hook
   */
  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    const timestamp = Date.now();

    // Always output to console as fallback
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (error) {
      consoleMethod(`[${level.toUpperCase()}] ${message}`, data, error);
    } else if (data !== undefined) {
      consoleMethod(`[${level.toUpperCase()}] ${message}`, data);
    } else {
      consoleMethod(`[${level.toUpperCase()}] ${message}`);
    }

    // Send to onLog hook (fire-and-forget)
    if (this.options.observability?.onLog && this.options.traceContext) {
      // Combine data and error into metadata
      const combinedMetadata: Record<string, unknown> = {
        ...(this.options.metadata || {}),
      };
      if (data !== undefined) {
        combinedMetadata.data = data;
      }
      if (error) {
        combinedMetadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      }

      const logContext: LogContext = {
        flowId: this.options.flowId ?? 'unknown',
        executionId: this.options.executionId ?? 'unknown',
        stepId: this.options.stepId,
        timestamp,
        level,
        message,
        metadata: combinedMetadata,
        traceContext: this.options.traceContext,
      };

      // Fire-and-forget execution (don't await)
      executeHook(this.options.observability.onLog, {
        hookName: 'onLog',
        config: this.options.observability,
        context: logContext,
        fireAndForget: true, // Special handling for onLog
      }).catch(() => {
        // Silently ignore onLog errors
      });
    }
  }
}

/**
 * Create a logger instance with observability integration
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}
