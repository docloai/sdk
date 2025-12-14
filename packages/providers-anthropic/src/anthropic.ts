import type {
  LLMProvider,
  ProviderConfig,
  MultimodalInput,
  UnifiedSchema,
  LLMResponse,
  ProviderCapabilities,
  JsonMode,
  ReasoningConfig
} from "@doclo/providers-llm";
import { SchemaTranslator, combineSchemaAndUserPrompt } from "@doclo/providers-llm";
import { fetchWithTimeout, DEFAULT_LIMITS, validateUrl, safeJsonParse } from "@doclo/core/security";
import { detectMimeTypeFromBase64, validateMimeType } from "@doclo/core";

/**
 * Extract base provider name from model identifier.
 * For OpenRouter models like "anthropic/claude-...", extracts "anthropic".
 * For direct models like "claude-...", returns the default provider.
 */
function extractProviderFromModel(model: string, defaultProvider: string): string {
  const slashIndex = model.indexOf('/');
  return slashIndex > 0 ? model.substring(0, slashIndex) : defaultProvider;
}

export class AnthropicProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,  // via tool calling
    supportsStreaming: true,
    supportsImages: true,
    supportsPDFs: true,
    maxPDFPages: 100,
    maxPDFSize: undefined,  // ~400k tokens with overhead
    maxContextTokens: 200000
  };

  private config: ProviderConfig;
  private translator: SchemaTranslator;
  private limits: typeof DEFAULT_LIMITS;

  constructor(config: ProviderConfig) {
    this.config = config;
    // Extract base provider from model if it's an OpenRouter model (e.g., "anthropic/claude-...")
    const baseProvider = extractProviderFromModel(config.model, 'anthropic');
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
    const messages = await this.buildMessages(enhancedInput);

    // Check if model supports new structured outputs API
    // OpenRouter now supports structured outputs for Sonnet 4.5 and Opus 4.1
    const useNewStructuredOutputs = this.supportsNewStructuredOutputs();

    // Build request body
    const requestBody: any = {
      model: this.config.model,
      max_tokens: params.max_tokens || 4096,
      messages
    };

    if (mode === 'relaxed') {
      // Relaxed mode: use prompt engineering with response prefilling
      // Anthropic doesn't have native json_object mode, so we rely on prefilling
      // Add prefill message to force JSON output
      requestBody.messages.push({
        role: "assistant",
        content: "{"
      });

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] Using relaxed JSON mode (prompt + prefilling)');
      }
    } else if (useNewStructuredOutputs) {
      // Strict mode with NEW structured outputs API (output_format)
      const jsonSchema = this.translator.convertZodIfNeeded(params.schema!);
      const fixedSchema = this.fixSchemaForStrictMode(jsonSchema);

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] Original schema:', JSON.stringify(jsonSchema, null, 2));
        console.log('[AnthropicProvider] Fixed schema:', JSON.stringify(fixedSchema, null, 2));
      }

      requestBody.output_format = {
        type: "json_schema",
        schema: fixedSchema
      };

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] Using NEW structured outputs API (strict mode)');
      }
    } else {
      // Strict mode with legacy tool calling approach
      const tool = this.translator.toClaudeToolSchema(params.schema!);
      requestBody.tools = [tool];
      requestBody.tool_choice = { type: "tool", name: "extract_data" };

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] Using legacy tool calling approach (strict mode)');
      }
    }

    // Add native thinking configuration if using native API and reasoning is enabled
    if (this.config.via !== 'openrouter' && params.reasoning) {
      const thinkingConfig = this.buildNativeThinkingConfig(params.reasoning, params.max_tokens);
      if (thinkingConfig) {
        requestBody.thinking = thinkingConfig;
      }
    }

    // Make API call - check if using OpenRouter
    let response: Response;
    let parsed: any;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let costUSD: number | undefined;

    if (this.config.via === 'openrouter') {
      // Check if model supports new structured outputs
      const useNewStructuredOutputs = this.supportsNewStructuredOutputs();

      // Use OpenRouter with OpenAI-compatible format
      const openRouterRequest = this.translateToOpenRouterFormat(messages, params.schema, mode, params.max_tokens, params.reasoning);

      // Debug: Log request body to verify cache_control is present
      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] OpenRouter request body (messages):');
        console.log(JSON.stringify(openRouterRequest.messages, null, 2));
        console.log('[AnthropicProvider] Using new structured outputs:', useNewStructuredOutputs);
      }

      response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
          "HTTP-Referer": "https://github.com/docloai/sdk",
          "X-Title": "Doclo SDK"
        },
        body: JSON.stringify(openRouterRequest)
      }, this.limits.REQUEST_TIMEOUT);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${error}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      let content = message?.content ?? (useNewStructuredOutputs ? "{}" : "}");

      // For OLDER models: we prefilled with "{", so prepend it back
      // For NEW models: content is already complete JSON
      if (!useNewStructuredOutputs) {
        content = "{" + content;
      }

      // Extract reasoning fields if present
      const reasoning = message?.reasoning;
      const reasoning_details = message?.reasoning_details;

      // Claude via OpenRouter with response prefilling should return clean JSON
      // But apply defensive parsing just in case:

      // 1. Strip markdown code blocks if present
      content = content.replace(/^```json\s*\n?/,'').replace(/\n?```\s*$/,'').trim();

      // 2. Strip markdown bold/italic formatting
      content = content.replace(/\*\*/g, '').replace(/\*/g, '');

      // 3. Extract just the JSON object (handle extra text after closing brace)
      const firstBrace = content.indexOf('{');
      if (firstBrace !== -1) {
        // Find the matching closing brace using brace counting
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = firstBrace; i < content.length; i++) {
          if (content[i] === '{') braceCount++;
          if (content[i] === '}') braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
        if (jsonEnd !== -1) {
          content = content.substring(firstBrace, jsonEnd);
        }
      } else if (!content.startsWith('[')) {
        // No JSON found at all - throw detailed error
        throw new Error(`Claude did not return JSON. Response: ${content.substring(0, 200)}`);
      }

      // 4. Remove any leading/trailing whitespace
      content = content.trim();

      parsed = safeJsonParse(content) as T;

      // Auto-wrap detection: If relaxed mode returns unwrapped properties, wrap them
      // This handles cases where the LLM returns properties directly instead of a full schema
      if (mode === 'relaxed' && this.looksLikeUnwrappedProperties(parsed)) {
        parsed = this.wrapAsSchema(parsed) as T;
      }

      inputTokens = data.usage?.prompt_tokens;
      outputTokens = data.usage?.completion_tokens;
      // Try different cost fields that OpenRouter might use
      costUSD = data.usage?.total_cost ?? data.usage?.cost;

      // Extract prompt caching metrics (OpenRouter/Anthropic)
      const cacheCreationInputTokens = data.usage?.cache_creation_input_tokens;
      const cacheReadInputTokens = data.usage?.cache_read_input_tokens;

      // Debug: Log usage fields if DEBUG_PROVIDERS is set
      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] OpenRouter usage response:', JSON.stringify(data.usage, null, 2));
        console.log('[AnthropicProvider] Extracted costUSD:', costUSD);
        console.log('[AnthropicProvider] Cache creation tokens:', cacheCreationInputTokens);
        console.log('[AnthropicProvider] Cache read tokens:', cacheReadInputTokens);
      }

      // Return with reasoning fields
      const latencyMs = Date.now() - startTime;
      // Extract base provider from model for metrics
      const baseProvider = extractProviderFromModel(this.config.model, 'anthropic');

      return {
        json: parsed as T,
        rawText: JSON.stringify(parsed),
        metrics: {
          costUSD,
          inputTokens,
          outputTokens,
          latencyMs,
          attemptNumber: 1,
          provider: baseProvider,  // Base provider (e.g., "anthropic" from "anthropic/claude-...")
          model: this.config.model,
          cacheCreationInputTokens,
          cacheReadInputTokens
        },
        reasoning,
        reasoning_details
      };
    } else {
      // Use native Anthropic API
      const endpoint = this.config.baseUrl || "https://api.anthropic.com/v1";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      };

      // Add beta header for new structured outputs API
      if (useNewStructuredOutputs) {
        headers["anthropic-beta"] = "structured-outputs-2025-11-13";
      }

      response = await fetchWithTimeout(`${endpoint}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      }, this.limits.REQUEST_TIMEOUT);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      // Extract JSON based on mode and API version
      if (mode === 'relaxed') {
        // Relaxed mode: JSON in text block with prefilling
        const textBlock = data.content?.find((block: any) => block.type === "text");
        if (!textBlock || !textBlock.text) {
          throw new Error("Claude did not return structured output (relaxed mode)");
        }

        // Prepend "{" since we used prefilling
        let content = "{" + textBlock.text;

        // Clean up: extract just the JSON object
        // Sometimes there's extra text after the closing brace
        const firstBrace = content.indexOf('{');
        if (firstBrace !== -1) {
          // Find the matching closing brace
          let braceCount = 0;
          let jsonEnd = -1;
          for (let i = firstBrace; i < content.length; i++) {
            if (content[i] === '{') braceCount++;
            if (content[i] === '}') braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
          if (jsonEnd !== -1) {
            content = content.substring(firstBrace, jsonEnd);
          }
        }

        parsed = safeJsonParse(content) as T;
      } else if (useNewStructuredOutputs) {
        // NEW API (strict mode): JSON in content text block
        const textBlock = data.content?.find((block: any) => block.type === "text");
        if (!textBlock || !textBlock.text) {
          throw new Error("Claude did not return structured output via new API");
        }

        parsed = safeJsonParse(textBlock.text) as T;
      } else {
        // OLD API (strict mode): JSON in tool_use block
        const toolUseBlock = data.content?.find((block: any) => block.type === "tool_use");
        if (!toolUseBlock || !toolUseBlock.input) {
          throw new Error("Claude did not return structured output via tool calling");
        }

        parsed = toolUseBlock.input;
      }

      inputTokens = data.usage?.input_tokens;
      outputTokens = data.usage?.output_tokens;
      costUSD = this.calculateCost(data.usage);

      // Extract thinking content if present (native API)
      const thinkingBlock = data.content?.find((block: any) => block.type === "thinking");
      const reasoning = thinkingBlock?.thinking;

      const latencyMs = Date.now() - startTime;

      // Extract base provider from model for metrics
      const baseProvider = extractProviderFromModel(this.config.model, 'anthropic');

      return {
        json: parsed as T,
        rawText: JSON.stringify(parsed),
        metrics: {
          costUSD,
          inputTokens,
          outputTokens,
          latencyMs,
          attemptNumber: 1,
          provider: baseProvider,  // Base provider (e.g., "anthropic" from "anthropic/claude-...")
          model: this.config.model
        },
        reasoning,
        reasoning_details: reasoning ? [{
          type: 'reasoning.text' as const,
          text: reasoning,
          signature: null,
          id: 'thinking-1',
          format: 'anthropic-claude-v1'
        }] : undefined
      };
    }
  }

  private buildNativeThinkingConfig(reasoning: ReasoningConfig, max_tokens?: number): any {
    // Native Anthropic uses "thinking" object with "type" and "budget_tokens"
    if (!reasoning.effort && !reasoning.enabled) {
      return undefined;
    }

    const effort = reasoning.effort || 'medium';
    const requestMaxTokens = max_tokens || 4096;

    // Convert effort to budget_tokens (minimum 1024 for Anthropic)
    const effortRatios = { low: 0.2, medium: 0.5, high: 0.8 };
    const ratio = effortRatios[effort];
    const budget_tokens = Math.max(1024, Math.min(32000, Math.floor(requestMaxTokens * ratio)));

    return {
      type: "enabled",
      budget_tokens
    };
  }

  private translateToOpenRouterFormat(
    messages: any[],
    schema: any | undefined,
    mode: JsonMode,
    max_tokens?: number,
    reasoning?: ReasoningConfig
  ): any {
    // Check if model supports new structured outputs
    const useNewStructuredOutputs = this.supportsNewStructuredOutputs();

    // Add system message for JSON enforcement
    const systemMessage = {
      role: "system",
      content: mode === 'strict'
        ? "You are a data extraction assistant. You must respond ONLY with valid JSON that matches the provided schema. Do not include any markdown formatting, explanations, or additional text."
        : "You are a data extraction assistant. You must respond ONLY with valid JSON. Do not include any markdown formatting, explanations, or additional text."
    };

    // Prepare messages array
    const messageArray = [systemMessage, ...messages];

    const requestBody: any = {
      model: this.config.model,
      messages: messageArray,
      // Enable usage tracking for OpenRouter cost info
      usage: {
        include: true
      },
      // Enable response healing plugin for better JSON reliability (OpenRouter)
      plugins: [{ id: 'response-healing' }]
    };

    if (mode === 'relaxed') {
      // Relaxed mode: use json_object without strict schema
      // Note: We don't use response prefilling here to allow more flexible JSON generation
      // (e.g., generating JSON Schemas which need the root type/properties wrapper)
      requestBody.response_format = {
        type: 'json_object'
      };
    } else {
      // Strict mode: use json_schema with strict validation
      const openRouterSchema = this.translator.toClaudeOpenRouterSchema(schema!);
      const fixedSchema = this.fixSchemaForStrictMode(openRouterSchema);

      if (process.env.DEBUG_PROVIDERS) {
        console.log('[AnthropicProvider] Original schema:', JSON.stringify(openRouterSchema, null, 2));
        console.log('[AnthropicProvider] Fixed schema:', JSON.stringify(fixedSchema, null, 2));
      }

      // Add response prefill for OLDER models (legacy workaround)
      // NEW models don't need prefilling with json_schema response_format
      if (!useNewStructuredOutputs) {
        messageArray.push({
          role: "assistant",
          content: "{"
        });
      }

      requestBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'extraction',
          strict: true,
          schema: fixedSchema
        }
      };
    }

    // Add reasoning configuration if provided (Anthropic uses max_tokens)
    if (reasoning) {
      requestBody.reasoning = this.buildReasoningConfig(reasoning, max_tokens);
    }

    // Note: We don't add require_parameters: true here because:
    // - Models like Haiku that don't support json_schema natively
    //   will still work using the prefill workaround
    // - The supportsNewStructuredOutputs() check handles routing internally

    return requestBody;
  }

  private buildReasoningConfig(reasoning: ReasoningConfig, max_tokens?: number): any {
    const config: any = {};

    // Anthropic uses max_tokens - convert effort to max_tokens
    if (reasoning.effort || reasoning.enabled) {
      const effort = reasoning.effort || 'medium';
      const requestMaxTokens = max_tokens || 4096;  // Default if not specified

      // Convert effort to percentage of max_tokens
      const effortRatios = { low: 0.2, medium: 0.5, high: 0.8 };
      const ratio = effortRatios[effort];

      // Calculate reasoning budget with Anthropic limits (1024 min, 32000 max)
      const reasoningBudget = Math.max(1024, Math.min(32000, Math.floor(requestMaxTokens * ratio)));
      config.max_tokens = reasoningBudget;
    }

    // Add exclude flag if specified
    if (reasoning.exclude !== undefined) {
      config.exclude = reasoning.exclude;
    }

    return Object.keys(config).length > 0 ? config : undefined;
  }

  private supportsNewStructuredOutputs(): boolean {
    // Check if model supports the new structured outputs API (Nov 2025)
    // Supported models: Sonnet >= 4.5, Opus >= 4.1
    // Note: Haiku does NOT support native structured outputs yet - uses tool workaround
    const model = this.config.model.toLowerCase();

    // Extract model family and version
    // Supports formats like: "claude-sonnet-4-5", "anthropic/claude-opus-4.1", "claude-opus-4-5-20251124"
    const sonnetMatch = model.match(/sonnet[_-](\d+)[._-](\d+)/);
    const opusMatch = model.match(/opus[_-](\d+)[._-](\d+)/);

    if (sonnetMatch) {
      const major = parseInt(sonnetMatch[1], 10);
      const minor = parseInt(sonnetMatch[2], 10);
      const version = major + minor / 10; // 4.5 = 4.5, 4.10 = 5.0
      return version >= 4.5;
    }

    if (opusMatch) {
      const major = parseInt(opusMatch[1], 10);
      const minor = parseInt(opusMatch[2], 10);
      const version = major + minor / 10;
      return version >= 4.1;
    }

    return false;
  }

  private fixSchemaForStrictMode(schema: any): any {
    // Recursively fix schema for strict mode requirements
    // Strict mode requires additionalProperties: false on ALL nested objects
    // STEP 1: Deep clone to prevent mutation (critical for consensus)
    const clonedSchema = JSON.parse(JSON.stringify(schema));

    // STEP 2: Ensure root has type: "object" (Anthropic requirement)
    if (!clonedSchema.type) {
      clonedSchema.type = 'object';
    }

    // STEP 3: Recursively fix all nested structures
    const fixRecursive = (obj: any): any => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }

      // Handle objects (both with and without properties)
      if (obj.type === 'object') {
        // Always add additionalProperties: false
        obj.additionalProperties = false;

        // If has properties, make all required and recurse
        if (obj.properties) {
          const allProps = Object.keys(obj.properties);
          obj.required = allProps;

          // Recursively fix nested properties
          for (const key in obj.properties) {
            obj.properties[key] = fixRecursive(obj.properties[key]);
          }
        }
      }

      // Handle arrays
      if (obj.type === 'array' && obj.items) {
        obj.items = fixRecursive(obj.items);
      }

      // Handle anyOf/oneOf/allOf (NEW - critical for nullable fields)
      ['anyOf', 'oneOf', 'allOf'].forEach(keyword => {
        if (obj[keyword] && Array.isArray(obj[keyword])) {
          obj[keyword] = obj[keyword].map((s: any) => fixRecursive(s));
        }
      });

      return obj;
    };

    return fixRecursive(clonedSchema);
  }

  private async buildMessages(input: MultimodalInput): Promise<any[]> {
    const content: any[] = [];
    const hasMedia = (input.images && input.images.length > 0) || (input.pdfs && input.pdfs.length > 0);

    // Debug: Log input state
    if (process.env.DEBUG_PROVIDERS) {
      console.log('[AnthropicProvider.buildMessages] Input state:');
      console.log('  hasMedia:', hasMedia);
      console.log('  input.images:', input.images?.length || 0);
      console.log('  input.pdfs:', input.pdfs?.length || 0);
      console.log('  input.text:', input.text ? `"${input.text.substring(0, 50)}..."` : 'undefined');
      console.log('  via:', this.config.via);
    }

    // When using OpenRouter, use OpenAI-compatible format
    if (this.config.via === 'openrouter') {
      // Add images first (before text, so they get cached)
      if (input.images && input.images.length > 0) {
        for (const image of input.images) {
          if (image.url) {
            // If it's a data URL, use directly; otherwise it's a regular URL
            content.push({
              type: "image_url",
              image_url: { url: image.url }
            });
          } else if (image.base64) {
            // Automatically detect MIME type from actual file data to prevent mismatches
            const actualMimeType = detectMimeTypeFromBase64(image.base64);

            // Warn if declared MIME type doesn't match actual data
            if (image.mimeType && image.mimeType !== actualMimeType) {
              console.warn(
                `[AnthropicProvider] MIME type mismatch detected: ` +
                `declared "${image.mimeType}", actual "${actualMimeType}". ` +
                `Using detected type "${actualMimeType}" to prevent API errors.`
              );
            }

            content.push({
              type: "image_url",
              image_url: {
                url: `data:${actualMimeType};base64,${this.extractBase64(image.base64)}`
              }
            });
          }
        }
      }

      // Add PDFs second (before text, so they get cached)
      if (input.pdfs && input.pdfs.length > 0) {
        for (const pdf of input.pdfs) {
          let fileData: string;
          if (pdf.url) {
            fileData = pdf.url;
          } else if (pdf.base64) {
            // Automatically detect MIME type for PDFs too
            const actualMimeType = detectMimeTypeFromBase64(pdf.base64);

            if (actualMimeType !== 'application/pdf') {
              console.warn(
                `[AnthropicProvider] PDF MIME type mismatch: ` +
                `expected "application/pdf", detected "${actualMimeType}". ` +
                `Using detected type.`
              );
            }

            fileData = `data:${actualMimeType};base64,${this.extractBase64(pdf.base64)}`;
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

      // Add text last with cache_control if there's media
      // According to OpenRouter docs, cache_control can only be on text blocks
      // This caches all the images/PDFs that came before it
      if (hasMedia) {
        // Always add a text block with cache_control when we have media
        // Use provided text or a default instruction
        const textContent = input.text || "Extract the requested information from the document.";

        if (process.env.DEBUG_PROVIDERS) {
          console.log('[AnthropicProvider.buildMessages] Adding text block with cache_control');
          console.log('  textContent:', textContent);
        }

        content.push({
          type: "text",
          text: textContent,
          cache_control: { type: "ephemeral" }
        });
      } else if (input.text) {
        // No media, just add text without caching
        content.push({
          type: "text",
          text: input.text
        });
      }
    } else {
      // Native Anthropic API format
      // Add text first
      if (input.text) {
        content.push({ type: "text", text: input.text });
      }
      // Native Anthropic API format
      // Add images
      if (input.images && input.images.length > 0) {
        for (const image of input.images) {
          if (image.url) {
            // Download and convert to base64 for Claude
            const base64 = await this.urlToBase64(image.url);
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: base64
              }
            });
          } else if (image.base64) {
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: this.extractBase64(image.base64)
              }
            });
          }
        }
      }

      // Add PDFs (convert to base64 or use Files API if fileId provided)
      if (input.pdfs && input.pdfs.length > 0) {
        for (const pdf of input.pdfs) {
          if (pdf.fileId) {
            // Use Files API reference
            content.push({
              type: "document",
              source: {
                type: "file",
                file_id: pdf.fileId
              }
            });
          } else if (pdf.base64) {
            content.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: this.extractBase64(pdf.base64)
              }
            });
          } else if (pdf.url) {
            const base64 = await this.urlToBase64(pdf.url);
            content.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64
              }
            });
          }
        }
      }
    }

    // Debug: Log final content array
    if (process.env.DEBUG_PROVIDERS) {
      console.log('[AnthropicProvider.buildMessages] Final content array length:', content.length);
      console.log('[AnthropicProvider.buildMessages] Final content array:', JSON.stringify(content, null, 2));
    }

    return [{ role: "user", content }];
  }

  private async urlToBase64(url: string): Promise<string> {
    validateUrl(url);  // SSRF protection
    const response = await fetchWithTimeout(url, {}, this.limits.REQUEST_TIMEOUT);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${url}`);
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
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

    // Approximate costs for Claude 3.5 Sonnet (as of 2025)
    const inputCostPer1k = 0.003;   // $0.003 per 1K input tokens
    const outputCostPer1k = 0.015;  // $0.015 per 1K output tokens

    const inputCost = (usage.input_tokens / 1000) * inputCostPer1k;
    const outputCost = (usage.output_tokens / 1000) * outputCostPer1k;

    return inputCost + outputCost;
  }

  /**
   * Detect if a parsed JSON object looks like unwrapped JSON Schema properties
   * (e.g., missing the root "type": "object" and "properties": {...} wrapper)
   */
  private looksLikeUnwrappedProperties(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }

    // If it already has "type" and "properties" at root, it's properly wrapped
    if (obj.type === 'object' && obj.properties) {
      return false;
    }

    // Check if it looks like a properties object:
    // - Has multiple keys
    // - Most/all values are objects with "type" property
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return false;
    }

    // Count how many top-level values look like schema property definitions
    let schemaPropertyCount = 0;
    for (const key of keys) {
      const value = obj[key];
      if (value && typeof value === 'object' && 'type' in value) {
        schemaPropertyCount++;
      }
    }

    // If most values look like schema properties, it's likely unwrapped
    return schemaPropertyCount / keys.length > 0.5;
  }

  /**
   * Wrap unwrapped properties into a proper JSON Schema structure
   */
  private wrapAsSchema(unwrapped: any): any {
    // Extract required fields (those that don't have optional markers)
    const required: string[] = [];
    for (const [key, value] of Object.entries(unwrapped)) {
      if (value && typeof value === 'object') {
        const propDef = value as any;
        // If the property definition has "required" array, it's a nested object
        // Otherwise, assume top-level properties are required
        if (!propDef.type || (propDef.type === 'string' || propDef.type === 'number' || propDef.type === 'boolean' || propDef.type === 'integer')) {
          required.push(key);
        } else if (propDef.type === 'object' || propDef.type === 'array') {
          required.push(key);
        }
      }
    }

    return {
      type: 'object',
      properties: unwrapped,
      required
    };
  }
}
