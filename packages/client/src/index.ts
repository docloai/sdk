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
 * @example Hybrid execution (local execution with cloud observability)
 * ```typescript
 * import { DocloHybridClient } from '@doclo/client';
 * import { createGeminiProvider } from '@doclo/providers-google';
 *
 * const client = new DocloHybridClient({
 *   apiKey: process.env.DOCLO_API_KEY!,
 *   providers: {
 *     vlm: createGeminiProvider({ apiKey: process.env.GOOGLE_API_KEY! })
 *   }
 * });
 *
 * // Pull flow from cloud, execute locally
 * const result = await client.runHybrid('flow_abc123', { base64: '...' });
 * ```
 *
 * @packageDocumentation
 */

// Main clients
export { DocloClient } from './client.js';
export { DocloHybridClient } from './hybrid.js';
export type {
  HybridClientConfig,
  HybridRunOptions,
  LocalRunOptions,
  FlowProvider,
  ProviderRegistry,
} from './hybrid.js';

// Cloud observability transport
export { createCloudObservability } from './observability/cloud-transport.js';
export type {
  CloudObservabilityOptions,
  CloudObservability,
  CloudObservabilityTransport,
} from './observability/cloud-transport.js';

// Remote registries
export { RemotePromptRegistry } from './registry/remote-prompt-registry.js';
export type { RemotePromptRegistryOptions } from './registry/remote-prompt-registry.js';
export { RemoteSchemaRegistry } from './registry/remote-schema-registry.js';
export type { RemoteSchemaRegistryOptions } from './registry/remote-schema-registry.js';

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
  // Flow definition types
  FlowDefinitionResponse,
  // Prompt types
  PromptAssetResponse,
  PromptVersionsResponse,
  PromptMessage,
  PromptSections,
  PromptVariable,
  // Schema types
  SchemaAssetResponse,
  SchemaVersionsResponse,
  // Assets bundle types
  FlowAssetsResponse,
  // Observability types
  ObservabilityIngestRequest,
  ObservabilityIngestResponse,
  ObservabilityEvent,
  TraceContextData,
  FlowStartEventData,
  FlowEndEventData,
  FlowErrorEventData,
  FlowStatsData,
  StepStartEventData,
  StepEndEventData,
  StepErrorEventData,
  TokenUsageData,
  ConsensusStartEventData,
  ConsensusRunEventData,
  ConsensusCompleteEventData,
  BatchStartEventData,
  BatchItemEndEventData,
  BatchEndEventData,
  ProviderRequestEventData,
  ProviderResponseEventData,
  ProviderRetryEventData,
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
