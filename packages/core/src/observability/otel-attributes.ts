/**
 * OpenTelemetry Semantic Conventions for Gen AI
 *
 * Implements Gen AI semantic conventions (v1.29.0) for observability.
 * Maps SDK data to standard OpenTelemetry attributes.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 * @module @doclo/core/observability/otel-attributes
 */

/**
 * Gen AI system names (standardized)
 */
const GEN_AI_SYSTEMS: Record<string, string> = {
  openai: 'openai',
  'openai-compatible': 'openai',
  anthropic: 'anthropic',
  google: 'vertex_ai', // Google uses Vertex AI
  'google-ai': 'vertex_ai',
  cohere: 'cohere',
  huggingface: 'huggingface',
  openrouter: 'openrouter', // Custom system
  ollama: 'ollama', // Custom system
};

/**
 * Map provider name to Gen AI system identifier
 */
function mapProviderToSystem(provider: string): string {
  const normalized = provider.toLowerCase();
  return GEN_AI_SYSTEMS[normalized] ?? normalized;
}

/**
 * Build OpenTelemetry attributes for LLM operations
 *
 * @param data - Step execution data
 * @returns OpenTelemetry attributes object
 */
export function buildOtelAttributes(data: {
  provider?: string;
  model?: string;
  modelUsed?: string;
  stepType?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};

  // Gen AI system (required)
  if (data.provider) {
    attributes['gen_ai.system'] = mapProviderToSystem(data.provider);
  }

  // Operation name (what type of operation)
  if (data.stepType) {
    attributes['gen_ai.operation.name'] = data.stepType;
  }

  // Request model (requested model name)
  if (data.model) {
    attributes['gen_ai.request.model'] = data.model;
  }

  // Response model (actual model used, may differ from requested)
  if (data.modelUsed) {
    attributes['gen_ai.response.model'] = data.modelUsed;
  }

  // Token usage
  if (data.inputTokens !== undefined) {
    attributes['gen_ai.usage.input_tokens'] = data.inputTokens;
  }

  if (data.outputTokens !== undefined) {
    attributes['gen_ai.usage.output_tokens'] = data.outputTokens;
  }

  // Finish reason (simplified as single string, not array)
  if (data.finishReason) {
    attributes['gen_ai.response.finish_reason'] = data.finishReason;
  }

  // Request parameters
  if (data.temperature !== undefined) {
    attributes['gen_ai.request.temperature'] = data.temperature;
  }

  if (data.maxTokens !== undefined) {
    attributes['gen_ai.request.max_tokens'] = data.maxTokens;
  }

  if (data.topP !== undefined) {
    attributes['gen_ai.request.top_p'] = data.topP;
  }

  if (data.topK !== undefined) {
    attributes['gen_ai.request.top_k'] = data.topK;
  }

  return attributes;
}

/**
 * Build OpenTelemetry attributes for provider requests
 *
 * Used for onProviderRequest hooks
 */
export function buildProviderRequestAttributes(data: {
  provider: string;
  model: string;
  config?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
  };
}): Record<string, string | number | boolean> {
  return buildOtelAttributes({
    provider: data.provider,
    model: data.model,
    temperature: data.config?.temperature,
    maxTokens: data.config?.maxTokens,
    topP: data.config?.topP,
    topK: data.config?.topK,
  });
}

/**
 * Build OpenTelemetry attributes for provider responses
 *
 * Used for onProviderResponse hooks
 */
export function buildProviderResponseAttributes(data: {
  provider: string;
  model: string;
  modelUsed?: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
}): Record<string, string | number | boolean> {
  return buildOtelAttributes({
    provider: data.provider,
    model: data.model,
    modelUsed: data.modelUsed,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    finishReason: data.finishReason,
  });
}

/**
 * Build OpenTelemetry attributes for step execution
 *
 * Used for onStepEnd hooks
 */
export function buildStepAttributes(data: {
  stepType: string;
  provider?: string;
  model?: string;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  config?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
  };
}): Record<string, string | number | boolean> {
  return buildOtelAttributes({
    stepType: data.stepType,
    provider: data.provider,
    model: data.model,
    modelUsed: data.modelUsed,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    finishReason: data.finishReason,
    temperature: data.config?.temperature,
    maxTokens: data.config?.maxTokens,
    topP: data.config?.topP,
    topK: data.config?.topK,
  });
}

/**
 * Standard finish reason mappings
 *
 * Maps provider-specific finish reasons to standard values
 */
export const FINISH_REASON_MAPPING: Record<string, string> = {
  // OpenAI
  stop: 'stop',
  length: 'length',
  content_filter: 'content_filter',
  tool_calls: 'tool_calls',
  function_call: 'function_call',

  // Anthropic
  end_turn: 'stop',
  max_tokens: 'length',
  stop_sequence: 'stop',

  // Google
  STOP: 'stop',
  MAX_TOKENS: 'length',
  SAFETY: 'content_filter',
  RECITATION: 'content_filter',

  // Generic
  complete: 'stop',
  truncated: 'length',
  filtered: 'content_filter',
};

/**
 * Normalize finish reason to standard value
 */
export function normalizeFinishReason(reason: string | undefined): string | undefined {
  if (!reason) {
    return undefined;
  }

  return FINISH_REASON_MAPPING[reason] ?? reason;
}

/**
 * Add standard OpenTelemetry span attributes
 *
 * These are generic attributes that apply to all spans
 */
export function addStandardSpanAttributes(attributes: Record<string, string | number | boolean>, data: {
  spanKind?: 'client' | 'server' | 'internal';
  serviceName?: string;
  serviceVersion?: string;
}): void {
  if (data.spanKind) {
    attributes['span.kind'] = data.spanKind;
  }

  if (data.serviceName) {
    attributes['service.name'] = data.serviceName;
  }

  if (data.serviceVersion) {
    attributes['service.version'] = data.serviceVersion;
  }
}

/**
 * Build full OpenTelemetry context for export
 *
 * Combines Gen AI attributes with standard span attributes
 */
export function buildFullOtelContext(data: {
  // Gen AI attributes
  stepType?: string;
  provider?: string;
  model?: string;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  config?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
  };

  // Standard span attributes
  spanKind?: 'client' | 'server' | 'internal';
  serviceName?: string;
  serviceVersion?: string;
}): Record<string, string | number | boolean> {
  const attributes = buildOtelAttributes({
    stepType: data.stepType,
    provider: data.provider,
    model: data.model,
    modelUsed: data.modelUsed,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    finishReason: data.finishReason,
    temperature: data.config?.temperature,
    maxTokens: data.config?.maxTokens,
    topP: data.config?.topP,
    topK: data.config?.topK,
  });

  addStandardSpanAttributes(attributes, {
    spanKind: data.spanKind,
    serviceName: data.serviceName,
    serviceVersion: data.serviceVersion,
  });

  return attributes;
}
