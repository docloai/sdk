/**
 * Observability resource for the Doclo client
 * Sends observability events to the cloud
 */

import type { DocloClient } from '../client.js';
import type {
  ObservabilityIngestRequest,
  ObservabilityIngestResponse,
  ObservabilityEvent,
} from '../types.js';

/**
 * Resource for ingesting observability events
 */
export class ObservabilityResource {
  constructor(private client: DocloClient) {}

  /**
   * Ingest observability events to the cloud
   *
   * @param request - The ingest request with events
   * @returns The ingest response with count of received events
   *
   * @example
   * ```typescript
   * await client.observability.ingest({
   *   executionId: 'exec_abc123',
   *   flowId: 'flow_abc123',
   *   sdkVersion: '0.1.5',
   *   traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
   *   events: [
   *     { type: 'flow_start', data: { ... } },
   *     { type: 'step_end', data: { ... } },
   *     { type: 'flow_end', data: { ... } },
   *   ]
   * });
   * ```
   */
  async ingest(request: ObservabilityIngestRequest): Promise<ObservabilityIngestResponse> {
    return this.client.request<ObservabilityIngestResponse>({
      method: 'POST',
      path: '/observability/ingest',
      body: request,
    });
  }

  /**
   * Helper to ingest a batch of events with minimal parameters
   *
   * @param flowId - The flow ID
   * @param executionId - The execution ID
   * @param traceId - The W3C trace ID
   * @param events - Array of events to ingest
   * @param options - Optional additional parameters
   * @returns The ingest response
   */
  async ingestEvents(
    flowId: string,
    executionId: string,
    traceId: string,
    events: ObservabilityEvent[],
    options?: {
      flowVersion?: string;
      sdkVersion?: string;
    }
  ): Promise<ObservabilityIngestResponse> {
    return this.ingest({
      flowId,
      executionId,
      traceId,
      events,
      flowVersion: options?.flowVersion,
      sdkVersion: options?.sdkVersion ?? '0.1.0',
    });
  }
}
