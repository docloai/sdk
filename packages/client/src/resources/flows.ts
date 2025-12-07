/**
 * Flows resource for the Doclo client
 */

import type { DocloClient } from '../client.js';
import type {
  Execution,
  FlowInfo,
  FlowRunOptions,
  PaginatedResponse,
  PaginationOptions,
} from '../types.js';

/**
 * Resource for managing and executing flows
 */
export class FlowsResource {
  constructor(private client: DocloClient) {}

  /**
   * Execute a flow
   *
   * @param flowId - The flow ID to execute
   * @param options - Execution options including input data
   * @returns The execution result (immediately if async: true, after completion if async: false)
   *
   * @example
   * ```typescript
   * // Synchronous execution (default) - waits for completion
   * const result = await client.flows.run('flow_abc123', {
   *   input: {
   *     document: {
   *       base64: '...',
   *       filename: 'invoice.pdf',
   *       mimeType: 'application/pdf'
   *     }
   *   }
   * });
   * console.log(result.output);
   *
   * // Sync execution - waits for result
   * const result = await client.flows.run('flow_abc123', {
   *   input: { document: { ... } },
   *   wait: true,
   *   timeout: 60000
   * });
   * console.log(result.output);
   *
   * // Async execution - returns immediately
   * const execution = await client.flows.run('flow_abc123', {
   *   input: { document: { ... } },
   *   webhookUrl: 'https://your-app.com/webhook'
   * });
   * console.log(`Execution ${execution.id} started`);
   * ```
   */
  async run<T = unknown>(
    flowId: string,
    options: FlowRunOptions
  ): Promise<Execution<T>> {
    const body: Record<string, unknown> = {
      input: options.input,
    };

    if (options.webhookUrl) body.webhookUrl = options.webhookUrl;
    if (options.metadata) body.metadata = options.metadata;
    if (options.idempotencyKey) body.idempotencyKey = options.idempotencyKey;
    if (options.wait) body.wait = options.wait;
    if (options.timeout) body.timeout = options.timeout;
    if (options.version) body.version = options.version;

    return this.client.request<Execution<T>>({
      method: 'POST',
      path: `/flows/${encodeURIComponent(flowId)}/run`,
      body,
    });
  }

  /**
   * List flows available in your organization
   *
   * @param options - Pagination options
   * @returns Paginated list of flows
   *
   * @example
   * ```typescript
   * // Get first page
   * const flows = await client.flows.list({ limit: 20 });
   *
   * // Iterate through all pages
   * let cursor: string | undefined;
   * do {
   *   const page = await client.flows.list({ cursor });
   *   for (const flow of page.data) {
   *     console.log(flow.name);
   *   }
   *   cursor = page.nextCursor;
   * } while (page.hasMore);
   * ```
   */
  async list(options?: PaginationOptions): Promise<PaginatedResponse<FlowInfo>> {
    return this.client.request<PaginatedResponse<FlowInfo>>({
      method: 'GET',
      path: '/flows',
      query: {
        limit: options?.limit,
        cursor: options?.cursor,
      },
    });
  }

  /**
   * Get information about a specific flow
   *
   * @param flowId - The flow ID
   * @param version - Optional specific version (defaults to latest)
   * @returns Flow information including input schema
   *
   * @example
   * ```typescript
   * const flow = await client.flows.get('flow_abc123');
   * console.log(flow.name);
   * console.log(flow.inputSchema);
   * ```
   */
  async get(flowId: string, version?: string): Promise<FlowInfo> {
    return this.client.request<FlowInfo>({
      method: 'GET',
      path: `/flows/${encodeURIComponent(flowId)}`,
      query: version ? { version } : undefined,
    });
  }
}
