/**
 * Unsiloed Provider Metadata
 *
 * Comprehensive metadata for all Unsiloed providers including:
 * - Supported file types
 * - Input/output formats
 * - Pricing ($0.01/page Standard, $0.0075/page Growth)
 * - Capabilities
 *
 * IMPORTANT: Unsiloed /parse endpoint supports PDF, PNG, JPEG, TIFF, and Office formats.
 * It does NOT support WebP, GIF, or BMP - attempting to use these will throw a helpful error.
 *
 * @see https://www.unsiloed.ai/pricing
 * @see https://docs.unsiloed.ai
 */

import { USD_PER_PAGE } from './types.js';

// MIME types supported by Unsiloed /parse endpoint
// From docs: "PDFs, images (PNG, JPEG, TIFF), and office files (PPT, DOCX, XLSX)"
// NOTE: WebP, GIF, BMP are NOT supported - will throw helpful error
export const PARSE_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  // Office formats
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
] as const;

// MIME types for /cite (extract) endpoint - wider format support
export const EXTRACT_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp', // Extract/cite supports more formats than parse
  'image/gif',
] as const;

// Legacy exports for backwards compatibility
export const SUPPORTED_MIME_TYPES = {
  PDF: ['application/pdf'] as const,
  IMAGE: [
    'image/png',
    'image/jpeg',
    'image/tiff',
  ] as const,
  // Unsupported by /parse - will throw error
  UNSUPPORTED_IMAGES: [
    'image/webp',
    'image/gif',
    'image/bmp',
  ] as const,
} as const;

export const ALL_SUPPORTED_MIME_TYPES = [
  ...SUPPORTED_MIME_TYPES.PDF,
  ...SUPPORTED_MIME_TYPES.IMAGE,
] as const;

/**
 * Input type requirements for providers.
 * - 'raw-document': Needs FlowInput with base64/url (all Unsiloed providers)
 * - 'parsed-text': Needs DocumentIR text output
 * - 'any': Can work with either
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

// Provider metadata type
export type UnsiloedProviderMetadata = {
  /** Canonical ID in "provider:model" format */
  id: string;
  /** Provider vendor (company) */
  provider: 'unsiloed';
  /** Model identifier */
  model: string;
  /** Human-readable display name */
  name: string;
  type: 'OCR' | 'VLM';
  description: string;
  defaultEndpoint: string;
  apiEndpoint: string; // The specific API path
  capabilities: {
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsDocuments: boolean;
    asyncProcessing: boolean;
    outputTypes: string[];
    specialFeatures?: string[];
  };
  /**
   * Input requirements for this provider.
   * All Unsiloed providers require raw document input.
   */
  inputRequirements?: {
    inputType: ProviderInputType;
    acceptedMethods?: readonly ('url' | 'base64')[];
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
    inputMethods: ('url' | 'base64')[];
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
      semanticChunking?: boolean;
      citations?: boolean;
    };
  };
  pricing: {
    model: 'per-page';
    standardUSD: number;    // $0.01/page at Standard tier
    growthUSD: number;      // $0.0075/page at Growth tier
    currency: 'USD';
    notes: string;
  };
  apiConfig: {
    requiresApiKey: boolean;
    pollingInterval: number; // ms
    maxPollingAttempts: number;
  };
};

// Provider metadata
export const PROVIDER_METADATA = {
  'unsiloed-parse': {
    id: 'unsiloed:v1',
    provider: 'unsiloed',
    model: 'v1',
    name: 'Unsiloed Parse',
    type: 'OCR',
    description: 'Semantic document parsing with YOLO segmentation + VLM + OCR',
    defaultEndpoint: 'https://prod.visionapi.unsiloed.ai',
    apiEndpoint: '/parse',
    capabilities: {
      supportsImages: false, // /parse endpoint only supports PDFs (use /cite for images)
      supportsPDFs: true,
      supportsDocuments: false,
      asyncProcessing: true,
      outputTypes: ['DocumentIR', 'semanticChunks'],
      specialFeatures: ['YOLO segmentation', 'semantic chunking', 'high accuracy OCR', 'handwritten text'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: true, // ✅ OCRProvider accepted by parse()
      extract: false,
      categorize: false,
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: SUPPORTED_MIME_TYPES.PDF, // Parse only supports PDFs
      inputMethods: ['url', 'base64'],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxPages: undefined, // No documented limit
    },
    outputFormat: {
      type: 'DocumentIR',
      features: {
        textLines: true,
        boundingBoxes: true,
        markdown: true,
        semanticChunking: true,
      },
    },
    pricing: {
      model: 'per-page',
      standardUSD: USD_PER_PAGE.standard,  // $0.01/page
      growthUSD: USD_PER_PAGE.growth,      // $0.0075/page
      currency: 'USD',
      notes: 'Standard: $0.01/page, Growth: $0.0075/page',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000, // 2 seconds
      maxPollingAttempts: 150, // 5 minutes total
    },
  } as UnsiloedProviderMetadata,

  'unsiloed-extract': {
    id: 'unsiloed:v1',
    provider: 'unsiloed',
    model: 'v1',
    name: 'Unsiloed Extract',
    type: 'VLM',
    description: 'Schema-based structured data extraction with citations',
    defaultEndpoint: 'https://prod.visionapi.unsiloed.ai',
    apiEndpoint: '/cite',
    capabilities: {
      supportsImages: true, // API accepts images too
      supportsPDFs: true,
      supportsDocuments: false,
      asyncProcessing: true,
      outputTypes: ['JSON'],
      specialFeatures: ['citation generation', 'schema validation', 'domain ontologies'],
    },
    // IMPORTANT: Unsiloed Extract requires raw document input, NOT parsed text.
    // Using parse() before extract(unsiloed-extract) is wasteful.
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: false,
      extract: true, // ✅ VLMProvider accepted by extract()
      categorize: false,
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
        schemaValidation: true,
        citations: true,
      },
    },
    pricing: {
      model: 'per-page',
      standardUSD: USD_PER_PAGE.standard,
      growthUSD: USD_PER_PAGE.growth,
      currency: 'USD',
      notes: 'Standard: $0.01/page, Growth: $0.0075/page',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 150,
    },
  } as UnsiloedProviderMetadata,

  'unsiloed-tables': {
    id: 'unsiloed:v1',
    provider: 'unsiloed',
    model: 'v1',
    name: 'Unsiloed Tables',
    type: 'VLM',
    description: 'Advanced table extraction and structuring from PDFs',
    defaultEndpoint: 'https://prod.visionapi.unsiloed.ai',
    apiEndpoint: '/tables',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: false,
      asyncProcessing: true,
      outputTypes: ['JSON'],
      specialFeatures: ['table detection', 'complex table parsing', 'multi-page tables'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: false,
      extract: true, // ✅ VLMProvider accepted by extract()
      categorize: false,
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
      },
    },
    pricing: {
      model: 'per-page',
      standardUSD: USD_PER_PAGE.standard,
      growthUSD: USD_PER_PAGE.growth,
      currency: 'USD',
      notes: 'Standard: $0.01/page, Growth: $0.0075/page',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 150,
    },
  } as UnsiloedProviderMetadata,

  'unsiloed-classify': {
    id: 'unsiloed:v1',
    provider: 'unsiloed',
    model: 'v1',
    name: 'Unsiloed Classify',
    type: 'VLM',
    description: 'Document classification with confidence scoring',
    defaultEndpoint: 'https://prod.visionapi.unsiloed.ai',
    apiEndpoint: '/classify',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: false,
      asyncProcessing: true,
      outputTypes: ['JSON'],
      specialFeatures: ['confidence scoring', 'multi-class classification'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: false,
      extract: false,
      categorize: true, // ✅ VLMProvider accepted by categorize()
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
      },
    },
    pricing: {
      model: 'per-page',
      standardUSD: USD_PER_PAGE.standard,
      growthUSD: USD_PER_PAGE.growth,
      currency: 'USD',
      notes: 'Standard: $0.01/page, Growth: $0.0075/page',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 150,
    },
  } as UnsiloedProviderMetadata,

  'unsiloed-split': {
    id: 'unsiloed:v1',
    provider: 'unsiloed',
    model: 'v1',
    name: 'Unsiloed Split',
    type: 'VLM',
    description: 'Page classification and document splitting',
    defaultEndpoint: 'https://prod.visionapi.unsiloed.ai',
    apiEndpoint: '/splitter/split-pdf-v1',
    capabilities: {
      supportsImages: true, // VLMProvider type requirement
      supportsPDFs: true,
      supportsDocuments: false,
      asyncProcessing: false, // Synchronous per API docs
      outputTypes: ['JSON'],
      specialFeatures: ['page-level classification', 'document segmentation'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: false,
      extract: false,
      categorize: false,
      qualify: false,
      split: true, // ✅ VLMProvider accepted by split()
    },
    inputFormats: {
      mimeTypes: SUPPORTED_MIME_TYPES.PDF, // Split only works with PDFs
      inputMethods: ['url', 'base64'],
      maxFileSize: 100 * 1024 * 1024,
      maxPages: undefined,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        structuredJSON: true,
      },
    },
    pricing: {
      model: 'per-page',
      standardUSD: USD_PER_PAGE.standard,
      growthUSD: USD_PER_PAGE.growth,
      currency: 'USD',
      notes: 'Standard: $0.01/page, Growth: $0.0075/page',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 0, // Synchronous, no polling needed
    },
  } as UnsiloedProviderMetadata,
} as const;

// Utility functions

/**
 * Check if a MIME type is supported by Unsiloed providers
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return ALL_SUPPORTED_MIME_TYPES.includes(mimeType as any);
}

/**
 * Get provider metadata by ID
 */
export function getProviderMetadata(
  providerId: keyof typeof PROVIDER_METADATA
): UnsiloedProviderMetadata {
  return PROVIDER_METADATA[providerId];
}

/**
 * Get all providers compatible with a specific node type
 */
export function getProvidersForNode(
  nodeType: keyof UnsiloedProviderMetadata['compatibleNodes']
): UnsiloedProviderMetadata[] {
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
  return metadata.inputFormats.mimeTypes.includes(mimeType as any);
}
