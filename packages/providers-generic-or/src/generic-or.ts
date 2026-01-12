import type {
  LLMProvider,
  ProviderConfig,
  MultimodalInput,
  UnifiedSchema,
  LLMResponse,
  ProviderCapabilities,
  JsonMode,
  ReasoningConfig,
  ImageInput,
  PDFInput,
  ReasoningDetail
} from "@doclo/providers-llm";
import { SchemaTranslator, combineSchemaAndUserPrompt, calculateCacheSavings } from "@doclo/providers-llm";
import { fetchWithTimeout, DEFAULT_LIMITS, safeJsonParse } from "@doclo/core/security";
import { getModelInfo, type KnownModelInfo } from "./known-models.js";

/**
 * Extract vendor name from OpenRouter model identifier.
 * Example: "qwen/qwen3-235b-a22b" -> "qwen"
 */
function extractVendorFromModel(model: string): string {
  const slashIndex = model.indexOf('/');
  return slashIndex > 0 ? model.substring(0, slashIndex) : 'generic';
}

/**
 * GenericORProvider - A universal provider for any OpenRouter model.
 *
 * Works with all OpenRouter models using OpenAI-compatible API format.
 * Supports Qwen, Llama, DeepSeek, GLM, Kimi, Mistral, and any other model
 * available through OpenRouter.
 *
 * Features:
 * - Automatic capability detection for known model families
 * - Response healing plugin for better JSON reliability
 * - PDF-to-image conversion for VLM models
 * - Reasoning token extraction for supported models
 *
 * @example
 * ```typescript
 * const provider = new GenericORProvider({
 *   provider: 'generic-or',
 *   model: 'qwen/qwen3-235b-a22b',
 *   apiKey: process.env.OPENROUTER_API_KEY!,
 * });
 *
 * const result = await provider.completeJson({
 *   input: { text: "Extract the main topics from this text..." },
 *   schema: TopicsSchema,
 *   mode: 'strict',
 * });
 * ```
 */
export class GenericORProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  private config: ProviderConfig;
  private translator: SchemaTranslator;
  private limits: typeof DEFAULT_LIMITS;
  private modelInfo: KnownModelInfo;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.modelInfo = getModelInfo(config.model);

    const vendor = extractVendorFromModel(config.model);
    this.name = `${vendor}:${config.model}`;
    this.translator = new SchemaTranslator();

    this.capabilities = {
      supportsStructuredOutput: true,  // All OpenRouter models support this via response_format
      supportsStreaming: false,        // Not with structured outputs
      supportsImages: this.modelInfo.supportsVision,
      supportsPDFs: this.modelInfo.supportsVision,  // Via image conversion
      maxPDFPages: undefined,
      maxPDFSize: undefined,
      maxContextTokens: this.modelInfo.maxContextTokens || 32768
    };

    // Merge custom limits with defaults
    this.limits = {
      ...DEFAULT_LIMITS,
      ...(config.limits || {})
    };
  }

  async completeJson<T>(params: {
    // Support both interfaces:
    // - Internal: input: MultimodalInput
    // - Node/CoreVLM: prompt: string | MultimodalInput
    input?: MultimodalInput;
    prompt?: string | MultimodalInput;
    schema?: UnifiedSchema<T>;
    mode?: JsonMode;
    max_tokens?: number;
    reasoning?: ReasoningConfig;
    embedSchemaInPrompt?: boolean;
  }): Promise<LLMResponse<T>> {
    const startTime = Date.now();

    // Normalize input: handle both 'input' and 'prompt' parameters
    let rawInput: MultimodalInput;
    if (params.input) {
      rawInput = params.input;
    } else if (params.prompt) {
      if (typeof params.prompt === 'string') {
        rawInput = { text: params.prompt };
      } else {
        rawInput = params.prompt as MultimodalInput;
      }
    } else {
      rawInput = { text: '' };
    }

    // Determine mode: default to 'strict', auto-relaxed if schema omitted
    const mode = params.mode || (params.schema ? 'strict' : 'relaxed');

    // Validate: strict mode requires schema
    if (mode === 'strict' && !params.schema) {
      throw new Error('schema is required when mode is "strict"');
    }

    // Convert PDFs to images if model supports vision
    const processedInput = await this.preprocessInput(rawInput);

    // Embed schema in prompt if enabled (default: true) and schema exists
    const shouldEmbedSchema = params.embedSchemaInPrompt !== false && params.schema;
    let enhancedInput = processedInput;

    if (shouldEmbedSchema) {
      const jsonSchema = this.translator.convertZodIfNeeded(params.schema!);
      const enhancedText = combineSchemaAndUserPrompt(
        jsonSchema,
        processedInput.text || ''
      );
      enhancedInput = {
        ...processedInput,
        text: enhancedText
      };
    } else if (mode === 'relaxed') {
      // In relaxed mode without schema, we still need to mention "JSON" in the prompt
      // because some providers (e.g., Alibaba/Qwen) require the word "json" in messages
      // when using response_format: { type: "json_object" }
      const text = processedInput.text || '';
      const needsJsonHint = !text.toLowerCase().includes('json');
      if (needsJsonHint) {
        enhancedInput = {
          ...processedInput,
          text: `${text}\n\nRespond with valid JSON.`
        };
      }
    }

    // Build messages with multimodal content
    const messages = await this.buildMessages(enhancedInput);

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens: params.max_tokens || 4096,
      stream: false,
      // Enable usage tracking for OpenRouter cost info
      usage: { include: true },
      // Enable response healing plugin for better JSON reliability
      plugins: [{ id: 'response-healing' }]
    };

    if (mode === 'relaxed') {
      // Relaxed mode: just request valid JSON without strict schema
      requestBody.response_format = { type: "json_object" };

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[GenericORProvider] Using relaxed JSON mode (json_object)');
      }
    } else {
      // Strict mode: use json_schema with strict validation
      // Note: Not all models support json_schema natively, but response-healing
      // plugin will extract JSON from models that only support instruction-following.
      // We don't use require_parameters: true to allow broader model compatibility.
      const schema = this.translator.toOpenAISchema(params.schema!);

      // Recursively fix schema for strict mode requirements
      this.fixSchemaRecursive(schema as Record<string, unknown>);

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[GenericORProvider] Using strict JSON mode (json_schema)');
      }

      requestBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: "extraction",
          schema
        }
      };
    }

    // Add reasoning configuration if provided and model supports it
    if (params.reasoning && this.modelInfo.supportsReasoning) {
      requestBody.reasoning = this.buildReasoningConfig(params.reasoning);
    }

    // Make API call to OpenRouter
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
      "HTTP-Referer": "https://github.com/docloai/sdk",
      "X-Title": "Doclo SDK"
    };

    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      },
      this.limits.REQUEST_TIMEOUT
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${error}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning?: string;
          reasoning_details?: Array<{ type: string; summary?: string; text?: string; data?: string; id: string | null; format: string; index?: number }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_cost?: number;
        cost?: number;
        // Cache metrics - different providers use different field names
        prompt_tokens_details?: {
          cached_tokens?: number;
          cache_write_tokens?: number;
        };
        cached_tokens?: number;  // Google
        cache_read_input_tokens?: number;  // Anthropic native
        cache_creation_input_tokens?: number;  // Anthropic native
      };
      id?: string;
      model?: string;
    };
    const latencyMs = Date.now() - startTime;

    // Parse response
    const message = data.choices?.[0]?.message;
    const content = message?.content ?? "{}";
    const parsed = safeJsonParse(content) as T;

    // Extract reasoning fields if present
    const reasoning = message?.reasoning;
    const reasoning_details = message?.reasoning_details as ReasoningDetail[] | undefined;

    // Get cost from OpenRouter response
    const costUSD = data.usage?.total_cost ?? data.usage?.cost;

    const vendor = extractVendorFromModel(this.config.model);

    // Extract cache metrics (OpenRouter returns these for providers with caching)
    // Different providers use different field names:
    // - OpenAI/XAI: prompt_tokens_details.cached_tokens
    // - Anthropic: prompt_tokens_details.cached_tokens (via OR) or cache_read_input_tokens (native)
    // - Google: cached_tokens
    const cacheReadInputTokens =
      data.usage?.prompt_tokens_details?.cached_tokens ??
      data.usage?.cached_tokens ??
      data.usage?.cache_read_input_tokens;
    const cacheCreationInputTokens =
      data.usage?.prompt_tokens_details?.cache_write_tokens ??
      data.usage?.cache_creation_input_tokens;
    const inputTokens = data.usage?.prompt_tokens;
    const cacheSavingsPercent = calculateCacheSavings(vendor, inputTokens, cacheReadInputTokens);

    return {
      json: parsed as T,
      rawText: content,
      metrics: {
        costUSD,
        inputTokens,
        outputTokens: data.usage?.completion_tokens,
        latencyMs,
        attemptNumber: 1,
        provider: vendor,
        model: this.config.model,
        responseId: data.id,
        modelUsed: data.model,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        cacheSavingsPercent
      },
      reasoning,
      reasoning_details
    };
  }

  /**
   * Preprocess input to convert PDFs to images for VLM models.
   */
  private async preprocessInput(input: MultimodalInput): Promise<MultimodalInput> {
    // Handle undefined/null input
    if (!input) {
      return { text: '' };
    }

    if (!input.pdfs?.length || !this.modelInfo.supportsVision) {
      return input;
    }

    // Convert PDFs to images
    const pdfImages = await this.convertPDFsToImages(input.pdfs);

    return {
      ...input,
      images: [...(input.images || []), ...pdfImages],
      pdfs: undefined  // Consumed
    };
  }

  /**
   * Convert PDFs to images using pdf-to-img.
   */
  private async convertPDFsToImages(pdfs: PDFInput[]): Promise<ImageInput[]> {
    const images: ImageInput[] = [];

    // Dynamically import pdf-to-img to avoid bundling issues
    const { pdf } = await import('pdf-to-img');

    for (const pdfInput of pdfs) {
      let pdfBuffer: Buffer;

      if (pdfInput.base64) {
        // Extract raw base64 from data URL if needed
        const base64Data = this.extractBase64(pdfInput.base64);
        pdfBuffer = Buffer.from(base64Data, 'base64');
      } else if (pdfInput.url) {
        // Fetch PDF from URL
        const response = await fetchWithTimeout(pdfInput.url, {}, this.limits.REQUEST_TIMEOUT);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF from ${pdfInput.url}: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        pdfBuffer = Buffer.from(arrayBuffer);
      } else {
        continue;  // Skip invalid entries
      }

      // Convert PDF pages to images
      const pages = await pdf(pdfBuffer, { scale: 2 });

      for await (const page of pages) {
        images.push({
          base64: page.toString('base64'),
          mimeType: 'image/png'
        });
      }
    }

    return images;
  }

  /**
   * Build OpenAI-compatible message format.
   */
  private async buildMessages(input: MultimodalInput): Promise<Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>> {
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];

    // Add system message if provided
    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }

    // Build user message content array
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Add text
    if (input.text) {
      content.push({ type: "text", text: input.text });
    }

    // Add images
    if (input.images && input.images.length > 0) {
      for (const image of input.images) {
        if (image.url) {
          content.push({
            type: "image_url",
            image_url: { url: image.url }
          });
        } else if (image.base64) {
          content.push({
            type: "image_url",
            image_url: {
              url: `data:${image.mimeType};base64,${this.extractBase64(image.base64)}`
            }
          });
        }
      }
    }

    messages.push({ role: "user", content });
    return messages;
  }

  /**
   * Build reasoning configuration for models that support it.
   */
  private buildReasoningConfig(reasoning: ReasoningConfig): Record<string, unknown> | undefined {
    // Handle explicit disable - return undefined so no reasoning param is sent
    // OpenRouter treats absence of reasoning param as "no reasoning"
    if (reasoning.enabled === false || reasoning.effort === 'none') {
      return undefined;
    }

    const config: Record<string, unknown> = {};

    // Pass through effort or max_tokens based on what's provided
    if (reasoning.effort) {
      config.effort = reasoning.effort;
    } else if (reasoning.max_tokens) {
      // Some models support direct max_tokens
      config.max_tokens = reasoning.max_tokens;
    } else if (reasoning.enabled) {
      config.effort = 'medium';  // Default to medium
    }

    // Add exclude flag if specified
    if (reasoning.exclude !== undefined) {
      config.exclude = reasoning.exclude;
    }

    return Object.keys(config).length > 0 ? config : {};
  }

  /**
   * Recursively fix schema for strict mode requirements.
   * - All properties must be required
   * - additionalProperties must be false
   */
  private fixSchemaRecursive(obj: Record<string, unknown>): void {
    if (obj && typeof obj === 'object') {
      if (obj.type === 'object' && obj.properties) {
        const properties = obj.properties as Record<string, unknown>;
        const allProps = Object.keys(properties);
        obj.required = allProps;
        obj.additionalProperties = false;

        // Recursively fix nested properties
        for (const key of allProps) {
          this.fixSchemaRecursive(properties[key] as Record<string, unknown>);
        }
      } else if (obj.type === 'array' && obj.items) {
        this.fixSchemaRecursive(obj.items as Record<string, unknown>);
      }
    }
  }

  /**
   * Extract base64 data from a data URL or return as-is if already raw base64.
   */
  private extractBase64(input: string): string {
    if (input.startsWith('data:')) {
      const base64Part = input.split(',')[1];
      if (!base64Part) {
        throw new Error(`Invalid data URL format: ${input.substring(0, 50)}`);
      }
      return base64Part;
    }
    return input;
  }
}
