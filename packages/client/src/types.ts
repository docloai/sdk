/**
 * Doclo Client Type Definitions
 */

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Configuration options for the Doclo client
 */
export interface DocloClientConfig {
  /** API key for authentication (dc_live_... or dc_test_...) */
  apiKey: string;
  /** Base URL for the app API - used for running flows (default: https://api.doclo.cloud) */
  baseUrl?: string;
  /** Convex URL for data endpoints - used for runs status/cancel (defaults to baseUrl) */
  convexUrl?: string;
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Document input for flow execution
 */
export interface DocumentInput {
  /** Base64-encoded document content */
  base64: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'application/pdf', 'image/png') */
  mimeType: string;
}

/**
 * Input for a flow run
 */
export interface FlowRunInput {
  /** The document to process */
  document: DocumentInput;
  /** Optional variables to pass to the flow */
  variables?: Record<string, unknown>;
}

/**
 * Options for running a flow
 */
export interface FlowRunOptions {
  /** Input data for the flow */
  input: FlowRunInput;
  /** Webhook URL to receive completion notification */
  webhookUrl?: string;
  /** Custom metadata to attach to the execution */
  metadata?: Record<string, unknown>;
  /** Idempotency key to prevent duplicate executions */
  idempotencyKey?: string;
  /** If true, wait for completion before returning (sync mode) */
  wait?: boolean;
  /** Timeout in ms for sync mode (default: 30000) */
  timeout?: number;
  /** Specific flow version to run */
  version?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Possible execution statuses
 */
export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  /** Total tokens used across all steps */
  tokensUsed: number;
  /** Total cost in USD */
  cost: number;
  /** Number of steps completed */
  stepsRun: number;
  /** Total number of steps in the flow */
  stepsTotal: number;
}

/**
 * A flow execution result
 */
export interface Execution<T = unknown> {
  /** Unique execution ID */
  id: string;
  /** ID of the flow that was executed */
  flowId: string;
  /** Current status of the execution */
  status: ExecutionStatus;
  /** When the execution was created */
  createdAt: string;
  /** When the execution completed (if finished) */
  completedAt?: string;
  /** Duration in milliseconds (if finished) */
  duration?: number;
  /** Extracted output data (if successful) */
  output?: T;
  /** Execution metrics (if available) */
  metrics?: ExecutionMetrics;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Custom metadata attached to the execution */
  metadata?: Record<string, unknown>;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Information about a flow
 */
export interface FlowInfo {
  /** Unique flow ID */
  id: string;
  /** Display name */
  name: string;
  /** Flow description */
  description?: string;
  /** JSON Schema for required input variables */
  inputSchema?: object;
  /** Current version */
  version: string;
  /** When the flow was created */
  createdAt: string;
  /** When the flow was last updated */
  updatedAt: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** Array of items */
  data: T[];
  /** Whether there are more items */
  hasMore: boolean;
  /** Cursor for fetching next page */
  nextCursor?: string;
}

/**
 * Pagination options for list requests
 */
export interface PaginationOptions {
  /** Maximum number of items to return (default: 20, max: 100) */
  limit?: number;
  /** Cursor from previous response */
  cursor?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

/**
 * Webhook event payload
 */
export interface WebhookEvent<T = unknown> {
  /** Event type */
  event: WebhookEventType;
  /** When the event occurred */
  timestamp: string;
  /** Event data */
  data: Execution<T>;
}

// ============================================================================
// Rate Limit Types
// ============================================================================

/**
 * Rate limit information from response headers
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp when the window resets */
  reset: number;
  /** Seconds to wait before retrying (when rate limited) */
  retryAfter?: number;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * HTTP request options (internal)
 */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeout?: number;
}

/**
 * API error response format
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
