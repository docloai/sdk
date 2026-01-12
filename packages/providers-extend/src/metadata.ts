/**
 * Extend.ai Provider Metadata
 *
 * Comprehensive metadata for all Extend.ai providers including:
 * - Supported file types
 * - Input/output formats
 * - Pricing (credit-based: $0.01/credit Starter, $0.008/credit Scale)
 * - Capabilities
 *
 * @see https://docs.extend.ai
 * @see https://www.extend.ai/pricing
 */

// MIME types supported by Extend.ai
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/gif',
  'image/webp',
  // Office formats
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
] as const;

export const ALL_SUPPORTED_MIME_TYPES = [...SUPPORTED_MIME_TYPES] as const;

/**
 * Input type requirements for providers.
 * - 'raw-document': Needs FlowInput with base64/url (all Extend providers)
 * - 'parsed-text': Needs DocumentIR text output
 * - 'any': Can work with either
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

/** Extend pricing tiers in USD per credit */
export const USD_PER_CREDIT = {
  starter: 0.01,    // Starter tier: $300+/month
  scale: 0.008,     // Scale tier: $800+/month (100k credits included)
} as const;

// Provider metadata type
export type ExtendProviderMetadata = {
  /** Canonical ID in "provider:model" format */
  id: string;
  /** Provider vendor (company) */
  provider: 'extend';
  /** Model identifier */
  model: string;
  /** Human-readable display name */
  name: string;
  type: 'OCR' | 'VLM';
  description: string;
  defaultEndpoint: string;
  apiEndpoint: string;
  capabilities: {
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsDocuments: boolean;
    supportsReasoning: boolean;
    supportsStructuredOutput: boolean;
    asyncProcessing: boolean;
    outputTypes: string[];
    specialFeatures?: string[];
  };
  /**
   * Input requirements for this provider.
   * All Extend providers require raw document input.
   */
  inputRequirements?: {
    inputType: ProviderInputType;
    acceptedMethods?: readonly ('url' | 'base64' | 'fileId')[];
  };
  compatibleNodes: {
    parse: boolean;
    extract: boolean;
    categorize: boolean;
    qualify: boolean;
    split: boolean;
  };
  inputFormats: {
    mimeTypes: readonly string[];
    inputMethods: ('url' | 'base64' | 'fileId')[];
    maxFileSize?: number; // bytes
    maxPages?: number;
  };
  outputFormat: {
    type: 'DocumentIR' | 'JSON';
    features: {
      textLines?: boolean;
      boundingBoxes?: boolean;
      markdown?: boolean;
      structuredJSON?: boolean;
      schemaValidation?: boolean;
      citations?: boolean;
      confidence?: boolean;
      extendTypes?: boolean; // Supports extend:type annotations
    };
  };
  pricing: {
    model: 'per-credit';
    starterUSD: number;     // $0.01/credit at Starter tier
    scaleUSD: number;       // $0.008/credit at Scale tier
    currency: 'USD';
    notes: string;
  };
  apiConfig: {
    requiresApiKey: boolean;
    requiresProcessorId: boolean;
    pollingInterval: number; // ms
    maxPollingAttempts: number;
    apiVersionRequired: boolean;
  };
};

// Provider metadata
export const PROVIDER_METADATA = {
  'extend-parse': {
    id: 'extend:parser',
    provider: 'extend',
    model: 'parser',
    name: 'Extend Parse',
    type: 'OCR',
    description: 'Document parsing to markdown/text using Extend.ai',
    defaultEndpoint: 'https://api.extend.ai',
    apiEndpoint: '/v1/parse',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true, // DOCX, XLSX, PPTX
      supportsReasoning: false,
      supportsStructuredOutput: false,
      asyncProcessing: true,
      outputTypes: ['DocumentIR', 'markdown'],
      specialFeatures: ['page-level output', 'async polling'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64', 'fileId'],
    },
    compatibleNodes: {
      parse: true,    // ✅ OCRProvider accepted by parse()
      extract: false,
      categorize: false,
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64', 'fileId'],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxPages: undefined,
    },
    outputFormat: {
      type: 'DocumentIR',
      features: {
        textLines: true,
        markdown: true,
      },
    },
    pricing: {
      model: 'per-credit',
      starterUSD: USD_PER_CREDIT.starter,
      scaleUSD: USD_PER_CREDIT.scale,
      currency: 'USD',
      notes: 'Starter: $0.01/credit, Scale: $0.008/credit',
    },
    apiConfig: {
      requiresApiKey: true,
      requiresProcessorId: false, // Parse doesn't require processor ID
      pollingInterval: 2000,
      maxPollingAttempts: 150, // 5 minutes total
      apiVersionRequired: true,
    },
  } as ExtendProviderMetadata,

  'extend-extract': {
    id: 'extend:extractor',
    provider: 'extend',
    model: 'extractor',
    name: 'Extend Extract',
    type: 'VLM',
    description: 'Schema-based structured data extraction with citations and confidence',
    defaultEndpoint: 'https://api.extend.ai',
    apiEndpoint: '/v1/processor_runs',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsReasoning: false,
      supportsStructuredOutput: true,
      asyncProcessing: true,
      outputTypes: ['JSON'],
      specialFeatures: [
        'extend:type annotations',
        'date normalization',
        'currency normalization',
        'signature detection',
        'citations with bounding polygons',
        'field confidence scores',
      ],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64', 'fileId'],
    },
    compatibleNodes: {
      parse: false,
      extract: true,  // ✅ VLMProvider accepted by extract()
      categorize: false,
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64', 'fileId'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
        schemaValidation: true,
        citations: true,
        confidence: true,
        extendTypes: true,
      },
    },
    pricing: {
      model: 'per-credit',
      starterUSD: USD_PER_CREDIT.starter,
      scaleUSD: USD_PER_CREDIT.scale,
      currency: 'USD',
      notes: 'Starter: $0.01/credit, Scale: $0.008/credit',
    },
    apiConfig: {
      requiresApiKey: true,
      requiresProcessorId: true,
      pollingInterval: 2000,
      maxPollingAttempts: 150,
      apiVersionRequired: true,
    },
  } as ExtendProviderMetadata,

  'extend-classify': {
    id: 'extend:classifier',
    provider: 'extend',
    model: 'classifier',
    name: 'Extend Classify',
    type: 'VLM',
    description: 'Document classification with confidence scoring',
    defaultEndpoint: 'https://api.extend.ai',
    apiEndpoint: '/v1/processor_runs',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsReasoning: false,
      supportsStructuredOutput: true,
      asyncProcessing: true,
      outputTypes: ['JSON'],
      specialFeatures: ['confidence scoring', 'multi-class classification', 'custom prompts'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64', 'fileId'],
    },
    compatibleNodes: {
      parse: false,
      extract: false,
      categorize: true, // ✅ VLMProvider accepted by categorize()
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64', 'fileId'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
        confidence: true,
      },
    },
    pricing: {
      model: 'per-credit',
      starterUSD: USD_PER_CREDIT.starter,
      scaleUSD: USD_PER_CREDIT.scale,
      currency: 'USD',
      notes: 'Starter: $0.01/credit, Scale: $0.008/credit',
    },
    apiConfig: {
      requiresApiKey: true,
      requiresProcessorId: true,
      pollingInterval: 2000,
      maxPollingAttempts: 150,
      apiVersionRequired: true,
    },
  } as ExtendProviderMetadata,

  'extend-split': {
    id: 'extend:splitter',
    provider: 'extend',
    model: 'splitter',
    name: 'Extend Split',
    type: 'VLM',
    description: 'Document splitting with page-level classification',
    defaultEndpoint: 'https://api.extend.ai',
    apiEndpoint: '/v1/processor_runs',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsReasoning: false,
      supportsStructuredOutput: true,
      asyncProcessing: true,
      outputTypes: ['JSON'],
      specialFeatures: [
        'split classifications',
        'page range detection',
        'high_precision mode',
        'custom prompts',
      ],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64', 'fileId'],
    },
    compatibleNodes: {
      parse: false,
      extract: false,
      categorize: false,
      qualify: false,
      split: true,  // ✅ VLMProvider accepted by split()
    },
    inputFormats: {
      mimeTypes: SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64', 'fileId'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
        confidence: true,
      },
    },
    pricing: {
      model: 'per-credit',
      starterUSD: USD_PER_CREDIT.starter,
      scaleUSD: USD_PER_CREDIT.scale,
      currency: 'USD',
      notes: 'Starter: $0.01/credit, Scale: $0.008/credit',
    },
    apiConfig: {
      requiresApiKey: true,
      requiresProcessorId: true,
      pollingInterval: 2000,
      maxPollingAttempts: 150,
      apiVersionRequired: true,
    },
  } as ExtendProviderMetadata,
} as const;

// Utility functions

/**
 * Check if a MIME type is supported by Extend providers
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return ALL_SUPPORTED_MIME_TYPES.includes(mimeType as typeof ALL_SUPPORTED_MIME_TYPES[number]);
}

/**
 * Get provider metadata by ID
 */
export function getProviderMetadata(
  providerId: keyof typeof PROVIDER_METADATA
): ExtendProviderMetadata {
  return PROVIDER_METADATA[providerId];
}

/**
 * Get all providers compatible with a specific node type
 */
export function getProvidersForNode(
  nodeType: keyof ExtendProviderMetadata['compatibleNodes']
): ExtendProviderMetadata[] {
  return Object.values(PROVIDER_METADATA).filter(
    (provider) => provider.compatibleNodes[nodeType]
  );
}

/**
 * Check if a provider can handle a specific file type
 */
export function canProviderHandleFile(
  providerId: keyof typeof PROVIDER_METADATA,
  mimeType: string
): boolean {
  const metadata = PROVIDER_METADATA[providerId];
  return metadata.inputFormats.mimeTypes.includes(mimeType as typeof metadata.inputFormats.mimeTypes[number]);
}
