import type {
  LLMProvider,
  ProviderConfig,
  MultimodalInput,
  UnifiedSchema,
  LLMResponse,
  ProviderCapabilities,
  ResourceLimits,
  JsonMode,
  ReasoningConfig
} from "../types";
import { SchemaTranslator } from "../schema-translator";
import { combineSchemaAndUserPrompt } from "../schema-prompt-formatter";
import { fetchWithTimeout, validateUrl, DEFAULT_LIMITS, safeJsonParse } from "@docloai/core/security";

/** Internal types for Google API structures */

/** Inline data for multimodal content (images/PDFs) */
interface GeminiInlineData {
  mimeType: string;
  data: string;
}

/** File data for Gemini Files API */
interface GeminiFileData {
  fileUri: string;
  mimeType: string;
}

/** A part of Gemini content */
interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
  fileData?: GeminiFileData;
  thought?: boolean;
}

/** Gemini content structure */
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Gemini generation config */
interface GeminiGenerationConfig {
  responseMimeType?: string;
  responseSchema?: object;
  thinking_config?: {
    thinking_budget: number;
  };
}

/** Gemini request body */
interface GeminiRequestBody {
  contents: GeminiContent[];
  generationConfig: GeminiGenerationConfig;
}

/** OpenRouter message content */
type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

/** OpenRouter message */
interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenRouterContentPart[];
}

/** OpenRouter request format */
interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  response_format?: { type: string };
  max_tokens?: number;
  reasoning?: { effort?: string; max_tokens?: number; exclude?: boolean };
  usage?: { include: boolean };
}

/** Reasoning config for OpenRouter */
interface OpenRouterReasoningConfig {
  effort?: string;
  max_tokens?: number;
  exclude?: boolean;
}

/**
 * Extract base provider name from model identifier.
 * For OpenRouter models like "google/gemini-...", extracts "google".
 * For direct models like "gemini-...", returns the default provider.
 */
function extractProviderFromModel(model: string, defaultProvider: string): string {
  const slashIndex = model.indexOf('/');
  return slashIndex > 0 ? model.substring(0, slashIndex) : defaultProvider;
}

export class GoogleProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsImages: true,
    supportsPDFs: true,
    maxPDFPages: 1000,  // 1 page = 1 image
    maxPDFSize: 50,
    maxContextTokens: 1000000  // 1M tokens
  };

  private config: ProviderConfig;
  private translator: SchemaTranslator;
  private limits: typeof DEFAULT_LIMITS;

  constructor(config: ProviderConfig) {
    this.config = config;
    // Extract base provider from model if it's an OpenRouter model (e.g., "google/gemini-...")
    const baseProvider = extractProviderFromModel(config.model, 'google');
    this.name = `${baseProvider}:${config.model}`;
    this.translator = new SchemaTranslator();

    // Merge custom limits with defaults (custom limits override defaults)
    this.limits = {
      ...DEFAULT_LIMITS,
      ...(config.limits || {})
    };

    // Debug logging
    if (process.env.DEBUG_PROVIDERS) {
      console.log('[GoogleProvider] Config:', JSON.stringify({
        provider: config.provider,
        model: config.model,
        via: config.via,
        hasApiKey: !!config.apiKey
      }));
    }
  }

  async completeJson<T>(params: {
    input: MultimodalInput;
    schema?: UnifiedSchema<T>;
    mode?: import("../types").JsonMode;
    max_tokens?: number;
    reasoning?: import("../types").ReasoningConfig;
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

    // Build contents with multimodal parts (using enhanced input)
    const contents = await this.buildContents(enhancedInput);

    // Build request
    const requestBody: GeminiRequestBody = {
      contents,
      generationConfig: {
        // Google's native responseSchema has strict validation issues with complex schemas.
        // Use JSON mode without responseSchema - schema is already in the prompt via combineSchemaAndUserPrompt.
        // See: https://ubaidullahmomer.medium.com/why-google-geminis-response-schema-isn-t-ready-for-complex-json-46f35c3aaaea
        responseMimeType: "application/json"
      }
    };

    if (process.env.DEBUG_PROVIDERS) {
      console.log(`[GoogleProvider] Using ${mode} JSON mode (schema in prompt, no responseSchema)`);
    }

    // Add native thinking configuration if using native API and reasoning is enabled
    if (this.config.via !== 'openrouter' && params.reasoning) {
      const thinkingConfig = this.buildNativeThinkingConfig(params.reasoning, params.max_tokens);
      if (thinkingConfig) {
        requestBody.generationConfig.thinking_config = thinkingConfig;
      }
    }

    // Make API call - check if using OpenRouter
    let response: Response;

    if (process.env.DEBUG_PROVIDERS) {
      console.log('[GoogleProvider] Using via:', this.config.via, 'Checking:', this.config.via === 'openrouter');
    }

    if (this.config.via === 'openrouter') {
      // Use OpenRouter endpoint with OpenAI-compatible format
      const openRouterRequest = this.translateToOpenRouterFormat(contents, mode, params.max_tokens, params.reasoning);
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
    } else {
      // Use native Google API
      // Note: Google's native API doesn't support Authorization headers,
      // so we must use the API key in the query parameter for authentication.
      // This is a documented limitation of Google's REST API.
      const endpoint = this.config.baseUrl ||
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`;

      // Validate the endpoint URL for SSRF attacks
      validateUrl(endpoint);

      response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey  // Use header instead of query param
        },
        body: JSON.stringify(requestBody)
      }, this.limits.REQUEST_TIMEOUT);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    // Parse response based on via parameter
    let content: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let costUSD: number | undefined;

    if (this.config.via === 'openrouter') {
      // OpenRouter format (OpenAI-compatible)
      const message = data.choices?.[0]?.message;
      content = message?.content?.trim() || "{}";
      inputTokens = data.usage?.prompt_tokens;
      outputTokens = data.usage?.completion_tokens;

      // Try different cost fields that OpenRouter might use
      costUSD = data.usage?.total_cost ?? data.usage?.cost;

      // Extract reasoning fields if present
      const reasoning = message?.reasoning;
      const reasoning_details = message?.reasoning_details;

      // Clean up markdown code blocks if present
      content = content.replace(/^```json\s*\n?/,'').replace(/\n?```\s*$/,'').trim();

      const parsed = safeJsonParse(content) as T;

      // Extract base provider from model for metrics
      const baseProvider = extractProviderFromModel(this.config.model, 'google');

      return {
        json: parsed as T,
        rawText: content,
        metrics: {
          costUSD,
          inputTokens,
          outputTokens,
          latencyMs,
          attemptNumber: 1,
          provider: baseProvider,  // Base provider (e.g., "google" from "google/gemini-...")
          model: this.config.model
        },
        reasoning,
        reasoning_details
      };
    } else {
      // Native Google format
      const candidate = data.candidates?.[0];
      content = candidate?.content?.parts?.[0]?.text?.trim() || "{}";
      inputTokens = data.usageMetadata?.promptTokenCount;
      outputTokens = data.usageMetadata?.candidatesTokenCount;
      costUSD = this.calculateCost(data.usageMetadata);

      // Extract thinking content if present (native API)
      const thinkingPart = candidate?.content?.parts?.find((part: GeminiPart) => part.thought === true);
      const reasoning = thinkingPart?.text;

      const parsed = safeJsonParse(content) as T;

      // Extract base provider from model for metrics
      const baseProvider = extractProviderFromModel(this.config.model, 'google');

      return {
        json: parsed as T,
        rawText: content,
        metrics: {
          costUSD,
          inputTokens,
          outputTokens,
          latencyMs,
          attemptNumber: 1,
          provider: baseProvider,  // Base provider (e.g., "google" from "google/gemini-...")
          model: this.config.model
        },
        reasoning,
        reasoning_details: reasoning ? [{
          type: 'reasoning.text' as const,
          text: reasoning,
          signature: null,
          id: 'thinking-1',
          format: 'google-gemini-v1'
        }] : undefined
      };
    }
  }

  private buildNativeThinkingConfig(reasoning: ReasoningConfig, max_tokens?: number): GeminiGenerationConfig['thinking_config'] | undefined {
    // Native Google uses "thinking_budget" parameter
    if (!reasoning.effort && !reasoning.enabled) {
      return undefined;
    }

    const effort = reasoning.effort || 'medium';
    const requestMaxTokens = max_tokens || 8192;

    // Convert effort to thinking_budget
    // Gemini 2.5 Flash supports 0-24576 tokens, default auto max is 8192
    const effortRatios = { low: 0.2, medium: 0.5, high: 0.8 };
    const ratio = effortRatios[effort];
    const thinking_budget = Math.min(24576, Math.floor(requestMaxTokens * ratio));

    return {
      thinking_budget
    };
  }

  private translateToOpenRouterFormat(
    contents: GeminiContent[],
    mode: JsonMode,
    max_tokens?: number,
    reasoning?: ReasoningConfig
  ): OpenRouterRequest {
    // Convert Gemini contents format to OpenAI messages format
    const messages: OpenRouterMessage[] = [];

    for (const content of contents) {
      if (content.role === 'user') {
        const messageContent: OpenRouterContentPart[] = [];

        for (const part of content.parts) {
          if (!part) continue; // Skip undefined/null parts
          if (part.text) {
            messageContent.push({ type: 'text', text: part.text });
          } else if (part.inlineData) {
            // Check if it's a PDF or image based on MIME type
            if (part.inlineData.mimeType === 'application/pdf') {
              // PDF - use file format
              messageContent.push({
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                }
              });
            } else {
              // Image - use image_url format
              messageContent.push({
                type: 'image_url',
                image_url: {
                  url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                }
              });
            }
          }
        }

        messages.push({
          role: 'user',
          content: messageContent.length === 1 && messageContent[0].type === 'text'
            ? messageContent[0].text
            : messageContent
        });
      }
    }

    const requestBody: OpenRouterRequest = {
      model: this.config.model,
      messages,
      // Enable usage tracking for OpenRouter cost info
      usage: {
        include: true
      },
      // Both relaxed and strict modes use json_object for Google via OpenRouter
      // Schema is already in the prompt via combineSchemaAndUserPrompt
      response_format: {
        type: 'json_object'
      }
    };

    // Add reasoning configuration if provided (Google uses max_tokens like Anthropic)
    if (reasoning) {
      requestBody.reasoning = this.buildReasoningConfig(reasoning, max_tokens);
    }

    return requestBody;
  }

  private buildReasoningConfig(reasoning: ReasoningConfig, max_tokens?: number): OpenRouterReasoningConfig | undefined {
    const config: OpenRouterReasoningConfig = {};

    // Google uses max_tokens - convert effort to max_tokens
    if (reasoning.effort || reasoning.enabled) {
      const effort = reasoning.effort || 'medium';
      const requestMaxTokens = max_tokens || 8192;  // Default for Gemini

      // Convert effort to percentage of max_tokens
      const effortRatios = { low: 0.2, medium: 0.5, high: 0.8 };
      const ratio = effortRatios[effort];

      // Calculate reasoning budget
      const reasoningBudget = Math.floor(requestMaxTokens * ratio);
      config.max_tokens = reasoningBudget;
    }

    // Add exclude flag if specified
    if (reasoning.exclude !== undefined) {
      config.exclude = reasoning.exclude;
    }

    return Object.keys(config).length > 0 ? config : undefined;
  }

  private async buildContents(input: MultimodalInput): Promise<GeminiContent[]> {
    const parts: GeminiPart[] = [];

    // Add text
    if (input.text) {
      parts.push({ text: input.text });
    }

    // Add images
    if (input.images && input.images.length > 0) {
      for (const image of input.images) {
        if (image.url) {
          const base64 = await this.urlToBase64(image.url);
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: base64
            }
          });
        } else if (image.base64) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: this.extractBase64(image.base64)
            }
          });
        }
      }
    }

    // Add PDFs (treated as images, 1 page = 1 image)
    if (input.pdfs && input.pdfs.length > 0) {
      for (const pdf of input.pdfs) {
        if (pdf.fileId) {
          // Use File API reference
          parts.push({
            fileData: {
              fileUri: `https://generativelanguage.googleapis.com/v1beta/files/${pdf.fileId}`,
              mimeType: "application/pdf"
            }
          });
        } else if (pdf.base64) {
          parts.push({
            inlineData: {
              mimeType: "application/pdf",
              data: this.extractBase64(pdf.base64)
            }
          });
        } else if (pdf.url) {
          const base64 = await this.urlToBase64(pdf.url);
          parts.push({
            inlineData: {
              mimeType: "application/pdf",
              data: base64
            }
          });
        }
      }
    }

    return [{ role: "user", parts }];
  }

  private async urlToBase64(url: string): Promise<string> {
    // Validate URL for SSRF attacks
    validateUrl(url);

    // Fetch with timeout protection (using instance-configured timeout)
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

    // Approximate costs for Gemini 2.5 Flash (as of 2025)
    const inputCostPer1k = 0.00025;   // $0.00025 per 1K input tokens
    const outputCostPer1k = 0.001;    // $0.001 per 1K output tokens

    const inputCost = (usage.promptTokenCount / 1000) * inputCostPer1k;
    const outputCost = (usage.candidatesTokenCount / 1000) * outputCostPer1k;

    return inputCost + outputCost;
  }
}
