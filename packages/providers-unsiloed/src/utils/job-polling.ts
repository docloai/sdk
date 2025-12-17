/**
 * Job polling utilities for async Unsiloed API operations
 */

import { unsiloedFetch } from './api-client.js';
import { withRetry, createCircuitBreaker, type RetryConfig, type CircuitBreakerConfig } from '@doclo/core';

export interface JobStatus {
  job_id: string;
  status: string;
  message?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  [key: string]: any;
}

export interface PollOptions extends RetryConfig, CircuitBreakerConfig {
  apiKey: string;
  endpoint?: string;
  maxAttempts?: number;
  pollInterval?: number; // milliseconds
}

/**
 * Poll a job until it completes or fails
 */
export async function pollJobUntilComplete(
  jobId: string,
  statusPath: string,
  options: PollOptions
): Promise<any> {
  const maxAttempts = options.maxAttempts || 150; // 5 minutes at 2s intervals
  const pollInterval = options.pollInterval || 2000; // 2 seconds

  // Get circuit breaker if configured
  const circuitBreaker = options.threshold !== undefined
    ? createCircuitBreaker('unsiloed:polling', { threshold: options.threshold })
    : undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before checking (except on first attempt)
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Check job status with retry logic
    const status: JobStatus = await withRetry(
      async () => {
        const response = await unsiloedFetch(statusPath, {
          method: 'GET',
          apiKey: options.apiKey,
          endpoint: options.endpoint,
        });
        return response.json() as Promise<JobStatus>;
      },
      {
        maxRetries: options.maxRetries ?? 0,
        retryDelay: options.retryDelay ?? 1000,
        useExponentialBackoff: options.useExponentialBackoff ?? true,
        circuitBreaker,
      }
    );

    // Debug logging
    if (process.env.DEBUG_PROVIDERS) {
      console.log(`[Job Polling] Attempt ${attempt + 1}/${maxAttempts} - Status: ${status.status}`);
    }

    // Check for completion (case-insensitive)
    const statusLower = status.status?.toLowerCase() || '';
    if (
      statusLower === 'succeeded' ||
      statusLower === 'completed' ||
      statusLower === 'complete'
    ) {
      return status;
    }

    // Check for failure (case-insensitive)
    if (statusLower === 'failed') {
      throw new Error(
        `Unsiloed job ${jobId} failed: ${status.message || 'Unknown error'}`
      );
    }

    // Continue polling for other statuses (Starting, Processing, queued, etc.)
  }

  throw new Error(
    `Unsiloed job ${jobId} timed out after ${maxAttempts} attempts`
  );
}

/**
 * Get job results from a completed job
 */
export async function getJobResult(
  jobId: string,
  options: PollOptions
): Promise<any> {
  // Get circuit breaker if configured
  const circuitBreaker = options.threshold !== undefined
    ? createCircuitBreaker('unsiloed:getJobResult', { threshold: options.threshold })
    : undefined;

  return withRetry(
    async () => {
      const response = await unsiloedFetch(`/jobs/${jobId}/result`, {
        method: 'GET',
        apiKey: options.apiKey,
        endpoint: options.endpoint,
      });
      return response.json();
    },
    {
      maxRetries: options.maxRetries ?? 0,
      retryDelay: options.retryDelay ?? 1000,
      useExponentialBackoff: options.useExponentialBackoff ?? true,
      circuitBreaker,
    }
  );
}
