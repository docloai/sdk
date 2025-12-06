import type {
  LLMProvider,
  ProviderConfig,
  MultimodalInput,
  UnifiedSchema,
  LLMResponse,
  ProviderCapabilities,
  JsonMode,
  ReasoningConfig
} from "@docloai/providers-llm";
import { SchemaTranslator, combineSchemaAndUserPrompt } from "@docloai/providers-llm";
import { fetchWithTimeout, DEFAULT_LIMITS, safeJsonParse } from "@docloai/core/security";

/**
 * Extract base provider name from model identifier.
 * For OpenRouter models like "openai/gpt-4...", extracts "openai".
 * For direct models like "gpt-4...", returns the default provider.
 */
function extractProviderFromModel(model: string, defaultProvider: string): string {
  const slashIndex = model.indexOf('/');
  return slashIndex > 0 ? model.substring(0, slashIndex) : defaultProvider;
}

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsImages: true,
    supportsPDFs: true,
    maxPDFPages: 100,
    maxPDFSize: 32,
    maxContextTokens: 128000
  };

  private config: ProviderConfig;
  private translator: SchemaTranslator;
  private limits: typeof DEFAULT_LIMITS;

  constructor(config: ProviderConfig) {
    this.config = config;
    // Extract base provider from model if it's an OpenRouter model (e.g., "openai/gpt-4...")
    const baseProvider = extractProviderFromModel(config.model, 'openai');
    this.name = `${baseProvider}:${config.model}`;
    this.translator = new SchemaTranslator();

    // Merge custom limits with defaults
    this.limits = {
      ...DEFAULT_LIMITS,
      ...(config.limits || {})
    };
  }

  async completeJson<T>(params: {
    input: MultimodalInput;
    schema?: UnifiedSchema<T>;
    mode?: JsonMode;
    max_tokens?: number;
    reasoning?: ReasoningConfig;
    embedSchemaInPrompt?: boolean;
  }): Promise<LLMResponse<T>> {
    const startTime = Date.now();

    // Determine mode: default to 'strict', auto-relaxed if schema omitted
    const mode = params.mode || (params.schema ? 'strict' : 'relaxed');

    // Validate: strict mode requires schema
    if (mode === 'strict' && !params.schema) {
      throw new Error('schema is required when mode is "strict"');
    }

    // Embed schema in prompt if enabled (default: true) and schema exists
    const shouldEmbedSchema = params.embedSchemaInPrompt !== false && params.schema;
    let enhancedInput = params.input;

    if (shouldEmbedSchema) {
      // Convert schema to JSON Schema format
      const jsonSchema = this.translator.convertZodIfNeeded(params.schema!);

      // Combine schema prompt with user's text
      const enhancedText = combineSchemaAndUserPrompt(
        jsonSchema,
        params.input.text || ''
      );

      enhancedInput = {
        ...params.input,
        text: enhancedText
      };
    }

    // Build messages with multimodal content (using enhanced input)
    const messages = this.buildMessages(enhancedInput);

    // Build request body
    const requestBody: any = {
      model: this.config.model,
      messages,
      max_tokens: params.max_tokens || 4096,  // Set reasonable default to avoid massive token requests
      // Enable usage tracking for OpenRouter cost info
      usage: {
        include: true
      }
    };

    // Set response_format based on mode
    if (mode === 'relaxed') {
      // Relaxed mode: just request valid JSON without strict schema validation
      requestBody.response_format = {
        type: "json_object"
      };

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[OpenAIProvider] Using relaxed JSON mode (json_object)');
      }
    } else {
      // Strict mode: use json_schema with strict validation
      const schema: any = this.translator.toOpenAISchema(params.schema!);

      // Recursively fix schema for Azure strict mode requirements
      // Azure requires additionalProperties: false on ALL nested objects
      const fixSchemaForAzure = (obj: any): any => {
        if (obj && typeof obj === 'object') {
          if (obj.type === 'object' && obj.properties) {
            const allProps = Object.keys(obj.properties);
            obj.required = allProps;
            obj.additionalProperties = false;

            // Recursively fix nested properties
            for (const key in obj.properties) {
              obj.properties[key] = fixSchemaForAzure(obj.properties[key]);
            }
          } else if (obj.type === 'array' && obj.items) {
            // Recursively fix array items schema
            obj.items = fixSchemaForAzure(obj.items);
          }
        }
        return obj;
      };

      fixSchemaForAzure(schema);

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[OpenAIProvider] Using strict JSON mode (json_schema)');
        console.log('[OpenAIProvider] Fixed schema:', JSON.stringify(schema, null, 2));
      }

      requestBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: "extraction",
          strict: true,
          schema
        }
      };
    }

    // Add reasoning configuration if provided (OpenAI uses effort directly)
    if (params.reasoning) {
      requestBody.reasoning = this.buildReasoningConfig(params.reasoning);
    }

    // Add OpenRouter model filtering for strict mode
    if (this.config.via === 'openrouter' && mode === 'strict') {
      requestBody.provider = {
        require_parameters: true  // Only route to models supporting json_schema
      };
    }

    // Make API call - check if using OpenRouter
    const endpoint = this.config.via === 'openrouter'
      ? "https://openrouter.ai/api/v1"
      : (this.config.baseUrl || "https://api.openai.com/v1");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`
    };

    // Add OpenRouter-specific headers
    if (this.config.via === 'openrouter') {
      headers["HTTP-Referer"] = "https://github.com/docloai/sdk";
      headers["X-Title"] = "Doclo SDK";
    }

    const response = await fetchWithTimeout(`${endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    }, this.limits.REQUEST_TIMEOUT);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    // Parse response
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse(content) as T;

    // Extract reasoning fields if present
    const message = data.choices?.[0]?.message;
    const reasoning = message?.reasoning;
    const reasoning_details = message?.reasoning_details;

    // Extract cost from OpenRouter or calculate locally
    let costUSD: number | undefined;
    if (this.config.via === 'openrouter') {
      // Read cost from OpenRouter response (more accurate than local calculation)
      costUSD = data.usage?.total_cost ?? data.usage?.cost;
    } else {
      // Calculate cost locally for native OpenAI API
      costUSD = this.calculateCost(data.usage);
    }

    // Extract base provider from model for metrics
    const baseProvider = extractProviderFromModel(this.config.model, 'openai');

    return {
      json: parsed as T,
      rawText: content,
      metrics: {
        costUSD,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        latencyMs,
        attemptNumber: 1,
        provider: baseProvider,  // Base provider (e.g., "openai" from "openai/gpt-4...")
        model: this.config.model
      },
      reasoning,
      reasoning_details
    };
  }

  private buildReasoningConfig(reasoning: ReasoningConfig): any {
    const config: any = {};

    // OpenAI uses effort directly
    if (reasoning.effort) {
      config.effort = reasoning.effort;
    } else if (reasoning.enabled) {
      config.effort = 'medium';  // Default to medium
    }

    // Add exclude flag if specified
    if (reasoning.exclude !== undefined) {
      config.exclude = reasoning.exclude;
    }

    return Object.keys(config).length > 0 ? config : undefined;
  }

  private buildMessages(input: MultimodalInput): any[] {
    const content: any[] = [];

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

    // Add PDFs - OpenRouter requires type: "file" format
    if (input.pdfs && input.pdfs.length > 0) {
      for (const pdf of input.pdfs) {
        let fileData: string;
        if (pdf.url) {
          fileData = pdf.url;
        } else if (pdf.base64) {
          fileData = `data:application/pdf;base64,${this.extractBase64(pdf.base64)}`;
        } else {
          continue;
        }

        content.push({
          type: "file",
          file: {
            filename: "document.pdf",
            file_data: fileData
          }
        });
      }
    }

    return [{ role: "user", content }];
  }

  /**
   * Extract base64 data from a data URL or return as-is if already raw base64
   */
  private extractBase64(input: string): string {
    if (input.startsWith('data:')) {
      // Extract base64 part from data URL: data:image/jpeg;base64,XXXXX -> XXXXX
      const base64Part = input.split(',')[1];
      if (!base64Part) {
        throw new Error(`Invalid data URL format: ${input.substring(0, 50)}`);
      }
      return base64Part;
    }
    return input;
  }

  private calculateCost(usage: any): number | undefined {
    if (!usage) return undefined;

    // Approximate costs for GPT-4o (as of 2025)
    // These should be updated based on current pricing
    const inputCostPer1k = 0.005;   // $0.005 per 1K input tokens
    const outputCostPer1k = 0.015;  // $0.015 per 1K output tokens

    const inputCost = (usage.prompt_tokens / 1000) * inputCostPer1k;
    const outputCost = (usage.completion_tokens / 1000) * outputCostPer1k;

    return inputCost + outputCost;
  }
}
