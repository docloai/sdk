/**
 * Runs resource for the Doclo client
 */

import type { DocloClient } from '../client.js';
import type { Execution } from '../types.js';
import { TimeoutError } from '../errors.js';

/**
 * Options for waiting for execution completion
 */
export interface WaitForCompletionOptions {
  /** Polling interval in milliseconds (default: 1000) */
  interval?: number;
  /** Maximum time to wait in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

/**
 * Resource for managing execution runs
 */
export class RunsResource {
  constructor(private client: DocloClient) {}

  /**
   * Get the status and result of an execution
   *
   * @param executionId - The execution ID
   * @returns The execution with current status and output (if completed)
   *
   * @example
   * ```typescript
   * const execution = await client.runs.get('exec_abc123');
   *
   * if (execution.status === 'success') {
   *   console.log('Output:', execution.output);
   * } else if (execution.status === 'failed') {
   *   console.error('Error:', execution.error);
   * } else {
   *   console.log('Status:', execution.status);
   * }
   * ```
   */
  async get<T = unknown>(executionId: string): Promise<Execution<T>> {
    return this.client.requestConvex<Execution<T>>({
      method: 'GET',
      path: `/runs/${encodeURIComponent(executionId)}`,
    });
  }

  /**
   * Cancel a running execution
   *
   * @param executionId - The execution ID to cancel
   *
   * @example
   * ```typescript
   * await client.runs.cancel('exec_abc123');
   * ```
   */
  async cancel(executionId: string): Promise<void> {
    await this.client.requestConvex<void>({
      method: 'POST',
      path: `/runs/${encodeURIComponent(executionId)}/cancel`,
    });
  }

  /**
   * Poll until an execution completes
   *
   * @param executionId - The execution ID to wait for
   * @param options - Polling options
   * @returns The completed execution
   * @throws TimeoutError if the execution doesn't complete within the timeout
   *
   * @example
   * ```typescript
   * // Start async execution
   * const execution = await client.flows.run('flow_abc123', {
   *   input: { document: { ... } },
   *   async: true
   * });
   *
   * // Wait for completion
   * const result = await client.runs.waitForCompletion(execution.id, {
   *   interval: 2000,  // Poll every 2 seconds
   *   timeout: 60000   // Wait up to 1 minute
   * });
   *
   * console.log('Output:', result.output);
   * ```
   */
  async waitForCompletion<T = unknown>(
    executionId: string,
    options?: WaitForCompletionOptions
  ): Promise<Execution<T>> {
    const interval = options?.interval ?? 1000;
    const timeout = options?.timeout ?? 300000;

    const startTime = Date.now();
    const terminalStatuses = ['success', 'failed', 'cancelled'];

    while (true) {
      const execution = await this.get<T>(executionId);

      if (terminalStatuses.includes(execution.status)) {
        return execution;
      }

      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeout) {
        throw new TimeoutError(
          `Execution ${executionId} did not complete within ${timeout}ms`
        );
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}
