/**
 * LLM Provider Metadata
 *
 * Comprehensive metadata for all LLM/VLM providers including:
 * - Supported file types (inline/base64 encoded)
 * - Input/output formats
 * - Pricing
 * - Capabilities
 * - Native API vs OpenRouter differences
 */

// Supported image MIME types (common across providers)
export const SUPPORTED_IMAGE_TYPES = {
  COMMON: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  EXTENDED: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/heif'] as const
} as const;

/**
 * Input type requirements for providers.
 * - 'raw-document': Needs FlowInput with base64/url
 * - 'parsed-text': Needs DocumentIR text output
 * - 'any': Can work with either (LLM providers with vision)
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

/**
 * Model-level metadata for per-model capability overrides
 */
export type LLMModelMetadata = {
  /** Model ID as used in API calls */
  id: string;

  /** Human-readable name */
  name?: string;

  /** OpenRouter model ID (e.g., 'openai/gpt-4.1') */
  openRouterId: string;

  /** Capability overrides (inherit from provider if unset) */
  capabilities?: {
    supportsReasoning?: boolean;
    supportsImages?: boolean;
    supportsPDFs?: boolean;
    supportsStructuredOutput?: boolean;
  };

  /** Model-specific limits */
  limits?: {
    maxContextTokens?: number;
    maxOutputTokens?: number;
  };

  /** Model-specific pricing (USD per 1k tokens) */
  pricing?: {
    inputPer1k?: number;
    outputPer1k?: number;
  };
};

// Provider metadata type
export type LLMProviderMetadata = {
  id: string;
  name: string;
  vendor: 'openai' | 'anthropic' | 'google' | 'xai';
  models: string[];  // Legacy: list of model IDs
  /**
   * Detailed per-model metadata with capability overrides.
   * Use this for model-specific reasoning, pricing, and limits.
   */
  detailedModels?: LLMModelMetadata[];
  accessMethods: {
    native: {
      available: boolean;
      endpoint: string;
      requiresApiKey: boolean;
    };
    openrouter: {
      available: boolean;
      modelPrefix: string;  // e.g., 'openai/', 'anthropic/'
    };
  };
  capabilities: {
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsReasoning: boolean;
    supportsStreaming: boolean;
    supportsStructuredOutput: boolean;
  };
  /**
   * Input requirements for this provider.
   * LLM providers with vision can accept either raw documents OR parsed text.
   */
  inputRequirements?: {
    inputType: ProviderInputType;
    acceptedMethods?: readonly ('url' | 'base64')[];
  };
  compatibleNodes: {
    parse: boolean;      // Can be used in parse() node
    extract: boolean;    // Can be used in extract() node
    categorize: boolean; // Can be used in categorize() node
    qualify: boolean;    // Can be used in qualify() node
    split: boolean;      // Can be used in split() node
  };
  inputFormats: {
    images: {
      mimeTypes: readonly string[];
      methods: ('url' | 'base64')[];
      maxSize?: number;  // MB
      maxDimensions?: { width: number; height: number };
      notes?: string;
    };
    pdfs: {
      supported: boolean;
      methods: ('url' | 'base64' | 'fileId')[];
      maxSize?: number;  // MB
      maxPages?: number;
      notes?: string;
    };
  };
  outputFormat: {
    supportsJSON: boolean;
    supportsReasoning: boolean;
    tokenTracking: boolean;
    costTracking: boolean;
  };
  pricing: {
    model: 'per-token';
    inputPer1k: number;   // USD - used for native API cost calculation
    outputPer1k: number;  // USD - used for native API cost calculation
    currency: 'USD';
    notes?: string;       // OpenRouter returns cost; native APIs require calculation
  };
  limits: {
    maxContextTokens: number;
    maxOutputTokens?: number;
    requestsPerMinute?: number;
  };
  nativeAPI: {
    imageFormat: string;     // e.g., 'type: image, source: base64'
    pdfFormat: string;       // e.g., 'type: document, source: base64'
    reasoningConfig: string; // e.g., 'thinking: { type: enabled }'
  };
  openRouterAPI: {
    imageFormat: string;     // e.g., 'type: image_url'
    pdfFormat: string;       // e.g., 'type: file'
    reasoningConfig: string; // e.g., 'reasoning: { max_tokens }'
    differences: string[];   // Key differences from native
  };
};

// Provider metadata
export const PROVIDER_METADATA = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    vendor: 'openai',
    models: ['gpt-5.1', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o3-mini', 'o4-mini'],
    detailedModels: [
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        openRouterId: 'openai/gpt-4.1',
        capabilities: { supportsReasoning: false },
        limits: { maxContextTokens: 128000, maxOutputTokens: 16384 },
        pricing: { inputPer1k: 0.002, outputPer1k: 0.008 },
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        openRouterId: 'openai/gpt-4.1-mini',
        capabilities: { supportsReasoning: false },
        limits: { maxContextTokens: 128000, maxOutputTokens: 16384 },
        pricing: { inputPer1k: 0.0004, outputPer1k: 0.0016 },
      },
      {
        id: 'o3',
        name: 'o3',
        openRouterId: 'openai/o3',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 100000 },
        pricing: { inputPer1k: 0.010, outputPer1k: 0.040 },
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        openRouterId: 'openai/o3-mini',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 100000 },
        pricing: { inputPer1k: 0.0011, outputPer1k: 0.0044 },
      },
      {
        id: 'o4-mini',
        name: 'o4-mini',
        openRouterId: 'openai/o4-mini',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 100000 },
        pricing: { inputPer1k: 0.0011, outputPer1k: 0.0044 },
      },
      {
        id: 'gpt-5.1',
        name: 'GPT-5.1',
        openRouterId: 'openai/gpt-5.1',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 256000, maxOutputTokens: 32768 },
        pricing: { inputPer1k: 0.005, outputPer1k: 0.015 },
      },
    ],
    accessMethods: {
      native: {
        available: true,
        endpoint: 'https://api.openai.com/v1',
        requiresApiKey: true
      },
      openrouter: {
        available: true,
        modelPrefix: 'openai/'
      }
    },
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsReasoning: true,
      supportsStreaming: true,
      supportsStructuredOutput: true
    },
    // LLM with vision - can work with raw documents OR parsed text
    inputRequirements: {
      inputType: 'any',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: true,      // ✅ VLMProvider - can convert images/PDFs to text
      extract: true,    // ✅ VLMProvider - can extract structured data
      categorize: true, // ✅ VLMProvider - can classify documents
      qualify: true,    // ✅ VLMProvider - can assess quality
      split: true       // ✅ VLMProvider - can detect document boundaries
    },
    inputFormats: {
      images: {
        mimeTypes: SUPPORTED_IMAGE_TYPES.COMMON,
        methods: ['url', 'base64'],
        maxSize: 20,  // 20 MB per image
        maxDimensions: undefined,  // Images resized server-side
        notes: 'Inline via image_url with data URL or HTTP URL. Large images auto-resized.'
      },
      pdfs: {
        supported: true,
        methods: ['base64', 'fileId'],
        maxSize: 50,  // 50 MB per file, 50 MB total per request
        maxPages: 100,
        notes: 'Inline via type: file with base64, or via Files API. Extracts text + images of each page. File URLs NOT supported for chat completions.'
      }
    },
    outputFormat: {
      supportsJSON: true,
      supportsReasoning: true,
      tokenTracking: true,
      costTracking: true
    },
    pricing: {
      model: 'per-token',
      inputPer1k: 0.005,
      outputPer1k: 0.015,
      currency: 'USD',
      notes: 'Cost calculated from tokens. OpenRouter may include cost in response. GPT-4.1 baseline.'
    },
    limits: {
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
      requestsPerMinute: undefined
    },
    nativeAPI: {
      imageFormat: 'type: "image_url", image_url: { url: "data:image/jpeg;base64,..." }',
      pdfFormat: 'type: "file", file: { file_id: "..." } OR file: { filename: "...", file_data: "data:application/pdf;base64,..." }',
      reasoningConfig: 'reasoning: { effort: "low"|"medium"|"high", exclude?: boolean }'
    },
    openRouterAPI: {
      imageFormat: 'Same as native (OpenAI-compatible)',
      pdfFormat: 'Same as native (OpenAI-compatible)',
      reasoningConfig: 'Same as native (OpenAI-compatible)',
      differences: [
        'File URLs not supported (base64 only)',
        'Cost may be available via usage.total_cost or generation endpoint'
      ]
    }
  },

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    vendor: 'anthropic',
    models: ['claude-opus-4.5', 'claude-sonnet-4.5', 'claude-haiku-4.5', 'claude-opus-4', 'claude-sonnet-4'],
    detailedModels: [
      {
        id: 'claude-opus-4.5',
        name: 'Claude Opus 4.5',
        openRouterId: 'anthropic/claude-opus-4.5',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 32000 },
        pricing: { inputPer1k: 0.015, outputPer1k: 0.075 },
      },
      {
        id: 'claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        openRouterId: 'anthropic/claude-sonnet-4.5',
        // Reasoning available via toggle (extended thinking)
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 16000 },
        pricing: { inputPer1k: 0.003, outputPer1k: 0.015 },
      },
      {
        id: 'claude-haiku-4.5',
        name: 'Claude Haiku 4.5',
        openRouterId: 'anthropic/claude-haiku-4.5',
        // Reasoning available via toggle (extended thinking)
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 8192 },
        pricing: { inputPer1k: 0.0008, outputPer1k: 0.004 },
      },
      {
        id: 'claude-opus-4',
        name: 'Claude Opus 4',
        openRouterId: 'anthropic/claude-opus-4',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 32000 },
        pricing: { inputPer1k: 0.015, outputPer1k: 0.075 },
      },
      {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        openRouterId: 'anthropic/claude-sonnet-4',
        // Reasoning available via toggle (extended thinking)
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 200000, maxOutputTokens: 16000 },
        pricing: { inputPer1k: 0.003, outputPer1k: 0.015 },
      },
    ],
    accessMethods: {
      native: {
        available: true,
        endpoint: 'https://api.anthropic.com/v1',
        requiresApiKey: true
      },
      openrouter: {
        available: true,
        modelPrefix: 'anthropic/'
      }
    },
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsReasoning: true,
      supportsStreaming: true,
      supportsStructuredOutput: true
    },
    // LLM with vision - can work with raw documents OR parsed text
    inputRequirements: {
      inputType: 'any',
      acceptedMethods: ['base64']  // URLs must be downloaded and converted
    },
    compatibleNodes: {
      parse: true,
      extract: true,
      categorize: true,
      qualify: true,
      split: true
    },
    inputFormats: {
      images: {
        mimeTypes: SUPPORTED_IMAGE_TYPES.COMMON,
        methods: ['base64'],  // URLs must be downloaded and converted
        maxSize: 5,  // 5 MB per image (API), 10 MB (claude.ai)
        maxDimensions: { width: 8000, height: 8000 },  // Standard limit, 2000x2000 for 20+ images
        notes: 'Native API requires base64. Max 100 images/request. Optimal at 1568px max dimension.'
      },
      pdfs: {
        supported: true,
        methods: ['base64', 'fileId'],
        maxSize: 32,  // 32 MB per file
        maxPages: 100,  // 100 pages for full visual analysis
        notes: 'Inline via type: document with base64, or via Files API (beta). PDFs over 100 pages: text-only processing.'
      }
    },
    outputFormat: {
      supportsJSON: true,
      supportsReasoning: true,
      tokenTracking: true,
      costTracking: true
    },
    pricing: {
      model: 'per-token',
      inputPer1k: 0.003,
      outputPer1k: 0.015,
      currency: 'USD',
      notes: 'Cost calculated from tokens. OpenRouter may include cost in response. Claude 3.5 Sonnet baseline.'
    },
    limits: {
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
      requestsPerMinute: undefined
    },
    nativeAPI: {
      imageFormat: 'type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." }',
      pdfFormat: 'type: "document", source: { type: "base64"|"file", media_type: "application/pdf", data: "..." | file_id: "..." }',
      reasoningConfig: 'thinking: { type: "enabled", budget_tokens: 1024-32000 }'
    },
    openRouterAPI: {
      imageFormat: 'type: "image_url", image_url: { url: "data:image/jpeg;base64,..." }',
      pdfFormat: 'type: "file", file: { filename: "...", file_data: "data:application/pdf;base64,..." }',
      reasoningConfig: 'reasoning: { max_tokens: number, exclude?: boolean }',
      differences: [
        'Uses OpenAI-compatible format (image_url, file types)',
        'Reasoning uses max_tokens instead of budget_tokens',
        'Response prefill trick ({ role: "assistant", content: "{" }) for strict JSON',
        'Tool calling instead of native structured output'
      ]
    }
  },

  google: {
    id: 'google',
    name: 'Google (Gemini)',
    vendor: 'google',
    models: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    detailedModels: [
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        openRouterId: 'google/gemini-3-pro',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 1000000, maxOutputTokens: 65536 },
        pricing: { inputPer1k: 0.00125, outputPer1k: 0.005 },
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        openRouterId: 'google/gemini-2.5-pro-preview-06-05',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 1000000, maxOutputTokens: 65536 },
        pricing: { inputPer1k: 0.00125, outputPer1k: 0.005 },
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        openRouterId: 'google/gemini-2.5-flash-preview-09-2025',
        capabilities: { supportsReasoning: false },
        limits: { maxContextTokens: 1000000, maxOutputTokens: 8192 },
        pricing: { inputPer1k: 0.00015, outputPer1k: 0.0006 },
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        openRouterId: 'google/gemini-2.5-flash-lite',
        capabilities: { supportsReasoning: false },
        limits: { maxContextTokens: 1000000, maxOutputTokens: 8192 },
        pricing: { inputPer1k: 0.000075, outputPer1k: 0.0003 },
      },
    ],
    accessMethods: {
      native: {
        available: true,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        requiresApiKey: true
      },
      openrouter: {
        available: true,
        modelPrefix: 'google/'
      }
    },
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsReasoning: true,
      supportsStreaming: true,
      supportsStructuredOutput: true
    },
    // LLM with vision - can work with raw documents OR parsed text
    inputRequirements: {
      inputType: 'any',
      acceptedMethods: ['base64']  // URLs are downloaded and converted
    },
    compatibleNodes: {
      parse: true,
      extract: true,
      categorize: true,
      qualify: true,
      split: true
    },
    inputFormats: {
      images: {
        mimeTypes: [...SUPPORTED_IMAGE_TYPES.COMMON, 'image/bmp', 'image/tiff', 'image/heif'],
        methods: ['base64'],  // URLs are downloaded and converted
        maxSize: 20,  // 20 MB inline data limit (File API: 2GB for Gemini 2.0)
        maxDimensions: { width: 3072, height: 3072 },  // Images scaled to fit, padded to preserve ratio
        notes: 'Inline via inlineData. Max 3000 images/request. File API supports larger files (stored 48 hours).'
      },
      pdfs: {
        supported: true,
        methods: ['base64', 'fileId'],
        maxSize: 50,  // 50 MB limit (inline & File API)
        maxPages: 1000,  // 1000 pages max, each page = 258 tokens
        notes: 'Inline via inlineData OR File API. Pages scaled to 3072x3072 max. Native text not charged.'
      }
    },
    outputFormat: {
      supportsJSON: true,
      supportsReasoning: true,
      tokenTracking: true,
      costTracking: true
    },
    pricing: {
      model: 'per-token',
      inputPer1k: 0.00025,
      outputPer1k: 0.001,
      currency: 'USD',
      notes: 'Cost calculated from tokens. OpenRouter may include cost in response. Gemini 2.5 Flash baseline.'
    },
    limits: {
      maxContextTokens: 1000000,  // 1M tokens
      maxOutputTokens: 8192,
      requestsPerMinute: undefined
    },
    nativeAPI: {
      imageFormat: 'inlineData: { mimeType: "image/jpeg", data: "..." }',
      pdfFormat: 'inlineData: { mimeType: "application/pdf", data: "..." } OR fileData: { fileUri: "...", mimeType: "application/pdf" }',
      reasoningConfig: 'generationConfig.thinking_config: { thinking_budget: number } (max 24576)'
    },
    openRouterAPI: {
      imageFormat: 'type: "image_url", image_url: { url: "data:image/jpeg;base64,..." }',
      pdfFormat: 'type: "file", file: { filename: "...", file_data: "data:application/pdf;base64,..." }',
      reasoningConfig: 'reasoning: { max_tokens: number, exclude?: boolean }',
      differences: [
        'Uses OpenAI-compatible format instead of parts/inlineData',
        'Reasoning uses max_tokens instead of thinking_budget',
        'Different content structure (messages vs contents.parts)'
      ]
    }
  },

  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    vendor: 'xai',
    models: ['grok-4.1', 'grok-4.1-fast', 'grok-4', 'grok-4-fast'],
    detailedModels: [
      {
        id: 'grok-4.1',
        name: 'Grok 4.1',
        openRouterId: 'x-ai/grok-4.1',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 256000, maxOutputTokens: 32768 },
        pricing: { inputPer1k: 0.003, outputPer1k: 0.015 },
      },
      {
        id: 'grok-4.1-fast',
        name: 'Grok 4.1 Fast',
        openRouterId: 'x-ai/grok-4.1-fast',
        capabilities: { supportsReasoning: false },
        limits: { maxContextTokens: 2000000, maxOutputTokens: 32768 },
        pricing: { inputPer1k: 0.005, outputPer1k: 0.025 },
      },
      {
        id: 'grok-4',
        name: 'Grok 4',
        openRouterId: 'x-ai/grok-4',
        capabilities: { supportsReasoning: true },
        limits: { maxContextTokens: 256000, maxOutputTokens: 32768 },
        pricing: { inputPer1k: 0.003, outputPer1k: 0.015 },
      },
      {
        id: 'grok-4-fast',
        name: 'Grok 4 Fast',
        openRouterId: 'x-ai/grok-4-fast',
        capabilities: { supportsReasoning: false },
        limits: { maxContextTokens: 2000000, maxOutputTokens: 32768 },
        pricing: { inputPer1k: 0.005, outputPer1k: 0.025 },
      },
    ],
    accessMethods: {
      native: {
        available: true,
        endpoint: 'https://api.x.ai/v1',
        requiresApiKey: true
      },
      openrouter: {
        available: true,
        modelPrefix: 'xai/'
      }
    },
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsReasoning: true,
      supportsStreaming: false,  // Not with structured outputs
      supportsStructuredOutput: true
    },
    // LLM with vision - can work with raw documents OR parsed text
    inputRequirements: {
      inputType: 'any',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: true,
      extract: true,
      categorize: true,
      qualify: true,
      split: true
    },
    inputFormats: {
      images: {
        mimeTypes: ['image/jpeg', 'image/png'],  // Only jpg/jpeg and png supported
        methods: ['url', 'base64'],
        maxSize: 30,  // 30 MB per file (API), 25 MB (chat)
        maxDimensions: undefined,
        notes: 'OpenAI-compatible format. Max 10 images via API. Only JPEG/PNG supported.'
      },
      pdfs: {
        supported: true,
        methods: ['url', 'base64'],
        maxSize: 30,  // 30 MB per file
        maxPages: undefined,
        notes: 'OpenAI-compatible format. Inline via type: file. Also supports DOCX, TXT, MD, CSV.'
      }
    },
    outputFormat: {
      supportsJSON: true,
      supportsReasoning: true,
      tokenTracking: true,
      costTracking: true
    },
    pricing: {
      model: 'per-token',
      inputPer1k: 0.005,
      outputPer1k: 0.015,
      currency: 'USD',
      notes: 'Cost calculated from tokens. OpenRouter may include cost in response. Grok-4 baseline.'
    },
    limits: {
      maxContextTokens: 131072,
      maxOutputTokens: undefined,
      requestsPerMinute: undefined
    },
    nativeAPI: {
      imageFormat: 'type: "image_url", image_url: { url: "data:image/jpeg;base64,..." }',
      pdfFormat: 'type: "file", file: { filename: "...", file_data: "data:application/pdf;base64,..." }',
      reasoningConfig: 'reasoning: { effort: "low"|"medium"|"high", exclude?: boolean }'
    },
    openRouterAPI: {
      imageFormat: 'Same as native (OpenAI-compatible)',
      pdfFormat: 'Same as native (OpenAI-compatible)',
      reasoningConfig: 'Same as native (OpenAI-compatible)',
      differences: [
        'Minimal differences - xAI uses OpenAI-compatible format',
        'Cost tracking via usage.total_cost field in OpenRouter'
      ]
    }
  }
} as const satisfies Record<string, LLMProviderMetadata>;

// Helper functions

/**
 * Check if an image MIME type is supported by a provider
 *
 * @param providerId - Provider ID
 * @param mimeType - MIME type to check
 * @returns True if supported
 *
 * @example
 * ```typescript
 * isImageTypeSupported('openai', 'image/png')  // true
 * isImageTypeSupported('openai', 'image/bmp')  // false
 * isImageTypeSupported('google', 'image/bmp')  // true
 * ```
 */
export function isImageTypeSupported(
  providerId: keyof typeof PROVIDER_METADATA,
  mimeType: string
): boolean {
  const provider = PROVIDER_METADATA[providerId];
  return provider.inputFormats.images.mimeTypes.includes(mimeType as any);
}

/**
 * Check if a provider supports PDFs inline (base64)
 *
 * @param providerId - Provider ID
 * @returns True if inline PDFs are supported
 *
 * @example
 * ```typescript
 * supportsPDFsInline('openai')     // true
 * supportsPDFsInline('anthropic')  // true
 * supportsPDFsInline('google')     // true
 * ```
 */
export function supportsPDFsInline(
  providerId: keyof typeof PROVIDER_METADATA
): boolean {
  const provider = PROVIDER_METADATA[providerId];
  return provider.inputFormats.pdfs.supported &&
         provider.inputFormats.pdfs.methods.includes('base64');
}

/**
 * Get providers compatible with a specific node type
 *
 * @param nodeType - Node type to check
 * @returns Array of compatible provider metadata
 *
 * @example
 * ```typescript
 * // Get providers that work with parse()
 * const parseProviders = getProvidersForNode('parse');
 * // Returns: [openai, anthropic, google, xai] (all VLM providers)
 *
 * // Get providers that work with extract()
 * const extractProviders = getProvidersForNode('extract');
 * // Returns: [openai, anthropic, google, xai] (all VLM providers)
 * ```
 */
export function getProvidersForNode(
  nodeType: 'parse' | 'extract' | 'categorize' | 'qualify' | 'split'
): LLMProviderMetadata[] {
  return Object.values(PROVIDER_METADATA).filter(
    provider => provider.compatibleNodes[nodeType]
  );
}

/**
 * Check if a provider is compatible with a node type
 *
 * @param providerId - Provider ID
 * @param nodeType - Node type to check
 * @returns True if compatible
 *
 * @example
 * ```typescript
 * isProviderCompatibleWithNode('openai', 'parse');      // true
 * isProviderCompatibleWithNode('openai', 'extract');    // true
 * isProviderCompatibleWithNode('anthropic', 'qualify'); // true
 * ```
 */
export function isProviderCompatibleWithNode(
  providerId: keyof typeof PROVIDER_METADATA,
  nodeType: 'parse' | 'extract' | 'categorize' | 'qualify' | 'split'
): boolean {
  return PROVIDER_METADATA[providerId].compatibleNodes[nodeType];
}

/**
 * Estimate cost for a request
 *
 * @param providerId - Provider ID
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const cost = estimateCost('openai', 1000, 500);
 * console.log(`$${cost.toFixed(4)}`); // "$0.0125"
 *
 * const cost = estimateCost('google', 10000, 1000);
 * console.log(`$${cost.toFixed(4)}`); // "$0.0035"
 * ```
 */
export function estimateCost(
  providerId: keyof typeof PROVIDER_METADATA,
  inputTokens: number,
  outputTokens: number
): number {
  const provider = PROVIDER_METADATA[providerId];
  const inputCost = (inputTokens / 1000) * provider.pricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * provider.pricing.outputPer1k;
  return inputCost + outputCost;
}

/**
 * Get the cheapest provider for a given workload
 *
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cheapest provider metadata
 *
 * @example
 * ```typescript
 * const cheapest = getCheapestProvider(10000, 1000);
 * console.log(cheapest.name); // "Google (Gemini)"
 * ```
 */
export function getCheapestProvider(
  inputTokens: number,
  outputTokens: number
): LLMProviderMetadata {
  const providers = Object.values(PROVIDER_METADATA);
  return providers.reduce((cheapest, current) => {
    const cheapestCost = estimateCost(cheapest.id as LLMProviderType, inputTokens, outputTokens);
    const currentCost = estimateCost(current.id as LLMProviderType, inputTokens, outputTokens);
    return currentCost < cheapestCost ? current : cheapest;
  });
}

/**
 * Compare native vs OpenRouter for a provider
 *
 * @param providerId - Provider ID
 * @returns Comparison object with key differences
 *
 * @example
 * ```typescript
 * const comparison = compareNativeVsOpenRouter('anthropic');
 * console.log(comparison.differences);
 * // ['Uses OpenAI-compatible format...', 'Response prefill trick...']
 * ```
 */
export function compareNativeVsOpenRouter(
  providerId: keyof typeof PROVIDER_METADATA
): {
  provider: string;
  nativeAvailable: boolean;
  openRouterAvailable: boolean;
  differences: string[];
} {
  const provider = PROVIDER_METADATA[providerId];
  return {
    provider: provider.name,
    nativeAvailable: provider.accessMethods.native.available,
    openRouterAvailable: provider.accessMethods.openrouter.available,
    differences: provider.openRouterAPI.differences
  };
}

// Type exports
export type LLMProviderType = keyof typeof PROVIDER_METADATA;
export type SupportedImageMimeType = typeof SUPPORTED_IMAGE_TYPES.COMMON[number];
export type NodeType = 'parse' | 'extract' | 'categorize' | 'qualify' | 'split';
