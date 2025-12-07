/**
 * @doclo/client - Doclo cloud client for executing flows via API
 *
 * @example
 * ```typescript
 * import { DocloClient } from '@doclo/client';
 *
 * const client = new DocloClient({
 *   apiKey: process.env.DOCLO_API_KEY!
 * });
 *
 * const result = await client.flows.run('flow_abc123', {
 *   input: {
 *     document: {
 *       base64: '...',
 *       filename: 'invoice.pdf',
 *       mimeType: 'application/pdf'
 *     }
 *   }
 * });
 *
 * console.log(result.output);
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { DocloClient } from './client.js';

// Types
export type {
  // Client config
  DocloClientConfig,
  // Input types
  DocumentInput,
  FlowRunInput,
  FlowRunOptions,
  // Response types
  ExecutionStatus,
  ExecutionMetrics,
  Execution,
  FlowInfo,
  PaginatedResponse,
  PaginationOptions,
  // Webhook types
  WebhookEventType,
  WebhookEvent,
  // Rate limit types
  RateLimitInfo,
} from './types.js';

// Errors
export {
  DocloError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ExecutionError,
  TimeoutError,
  NetworkError,
  InvalidApiKeyError,
  ErrorCodes,
} from './errors.js';

export type { ErrorCode } from './errors.js';

// Webhook utilities
export {
  verifyWebhookSignature,
  parseWebhookEvent,
  WEBHOOK_SIGNATURE_HEADER,
} from './utils/webhook.js';

// Resource types (for advanced usage)
export type { WaitForCompletionOptions } from './resources/runs.js';

// Constants
export { DEFAULT_BASE_URL, DEFAULT_TIMEOUT } from './utils/fetch.js';
