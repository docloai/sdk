/**
 * Reducto Provider Metadata
 *
 * Comprehensive metadata for all Reducto providers including:
 * - Supported file types
 * - Input/output formats
 * - Pricing (credits and USD)
 * - Capabilities
 */

import { USD_PER_CREDIT, REDUCTO_CREDIT_RATES } from "./types.js";

// ============================================================================
// Supported MIME Types
// ============================================================================

/**
 * Supported MIME types by category (from Reducto documentation)
 * @see https://docs.reducto.ai/file-formats
 */
export const SUPPORTED_MIME_TYPES = {
  // Images
  IMAGE: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/webp',
    'image/x-photoshop',  // PSD
  ] as const,

  // Documents
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf',
  ] as const,

  // Spreadsheets
  SPREADSHEET: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ] as const,

  // Presentations
  PRESENTATION: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ] as const,
} as const;

/**
 * All supported MIME types (flat array)
 */
export const ALL_SUPPORTED_MIME_TYPES = [
  ...SUPPORTED_MIME_TYPES.IMAGE,
  ...SUPPORTED_MIME_TYPES.DOCUMENT,
  ...SUPPORTED_MIME_TYPES.SPREADSHEET,
  ...SUPPORTED_MIME_TYPES.PRESENTATION,
] as const;

/**
 * File extension to MIME type mapping
 */
export const FILE_EXTENSIONS: Record<string, string> = {
  // Images
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',
  'heic': 'image/heic',
  'psd': 'image/x-photoshop',
  // Documents
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'txt': 'text/plain',
  'rtf': 'application/rtf',
  // Spreadsheets
  'csv': 'text/csv',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Presentations
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ============================================================================
// Supported Options Type
// ============================================================================

/**
 * Supported options for a Reducto provider
 */
export type ReductoSupportedOptions = {
  mode: boolean;              // Agentic mode (quality boost)
  maxPages: boolean;          // Limit pages
  pageRange: boolean;         // Specific page range
  langs: boolean;             // Language hints (NOT supported)
  extractImages: boolean;     // Return images for figures/tables
  segmentation: boolean;      // Split endpoint
  citations: boolean;         // Field-level citations
  additionalPrompt: boolean;  // System prompt
  chunking: boolean;          // Chunking modes
  tableOutputFormat: boolean; // Table format
  confidence: boolean;        // Block confidence scores
};

// ============================================================================
// Provider Metadata Type
// ============================================================================

/**
 * Input type requirements for providers.
 * - 'raw-document': Needs FlowInput with base64/url (all Reducto providers)
 * - 'parsed-text': Needs DocumentIR text output
 * - 'any': Can work with either
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

/**
 * Metadata structure for a Reducto provider
 */
export type ReductoProviderMetadata = {
  /** Canonical ID in "provider:model" format */
  id: string;
  /** Provider vendor (company) */
  provider: 'reducto';
  /** Model identifier */
  model: string;
  /** Human-readable display name */
  name: string;
  type: 'OCR' | 'VLM' | 'Split';
  description: string;
  defaultEndpoint: string;
  capabilities: {
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsDocuments: boolean;
    supportsSpreadsheets: boolean;
    supportsPresentations: boolean;
    asyncProcessing: boolean;
    outputTypes: string[];
  };
  /**
   * Input requirements for this provider.
   * All Reducto providers require raw document input.
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
    maxFileSize: number;  // MB
  };
  outputFormat: {
    type: 'DocumentIR' | 'JSON' | 'SegmentationResult';
    features: {
      textLines?: boolean;
      boundingBoxes?: boolean;
      markdown?: boolean;
      structuredJSON?: boolean;
      schemaValidation?: boolean;
      confidence?: boolean;
      chunking?: boolean;
    };
  };
  pricing: {
    model: 'per-page';
    standard: number;     // Credits per page
    agentic: number;      // Credits per page (agentic mode)
    usdPerCredit: number;
    currency: 'credits';
    notes: string;
  };
  apiConfig: {
    requiresApiKey: boolean;
    pollingInterval: number;
    maxPollingAttempts: number;
  };
  supportedOptions: ReductoSupportedOptions;
};

// ============================================================================
// Provider Metadata
// ============================================================================

export const PROVIDER_METADATA = {
  reductoParse: {
    id: 'reducto:v1',
    provider: 'reducto',
    model: 'v1',
    name: 'Reducto Parse',
    type: 'OCR',
    description: 'Document parsing with bounding boxes, confidence scores, and RAG-optimized chunking',
    defaultEndpoint: 'https://platform.reducto.ai',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsSpreadsheets: true,
      supportsPresentations: true,
      asyncProcessing: true,
      outputTypes: ['DocumentIR', 'chunks', 'markdown'],
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: true,
      extract: false,
      categorize: false,
      qualify: false,
      split: false,
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 500,  // 500 MB per Reducto docs
    },
    outputFormat: {
      type: 'DocumentIR',
      features: {
        textLines: true,
        boundingBoxes: true,
        markdown: true,
        structuredJSON: false,
        schemaValidation: false,
        confidence: true,
        chunking: true,
      },
    },
    pricing: {
      model: 'per-page',
      standard: REDUCTO_CREDIT_RATES.parse.standard,
      agentic: REDUCTO_CREDIT_RATES.parse.agentic,
      usdPerCredit: USD_PER_CREDIT,
      currency: 'credits',
      notes: 'Standard: 1 credit/page (~$0.004), Agentic: 2 credits/page (~$0.008)',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 120,
    },
    supportedOptions: {
      mode: true,               // Agentic mode
      maxPages: true,
      pageRange: true,
      langs: false,             // Not supported by Reducto
      extractImages: true,      // return_images
      segmentation: false,      // Use Split endpoint instead
      citations: false,         // Parse doesn't have citations
      additionalPrompt: false,  // Parse doesn't use prompts
      chunking: true,           // RAG chunking modes
      tableOutputFormat: true,  // html/json/md/csv
      confidence: true,         // Block-level confidence
    },
  },

  reductoExtract: {
    id: 'reducto:v1',
    provider: 'reducto',
    model: 'v1',
    name: 'Reducto Extract',
    type: 'VLM',
    description: 'Schema-based structured extraction with field-level citations',
    defaultEndpoint: 'https://platform.reducto.ai',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsSpreadsheets: true,
      supportsPresentations: true,
      asyncProcessing: true,
      outputTypes: ['JSON', 'structuredData'],
    },
    // IMPORTANT: Reducto Extract requires raw document input, NOT parsed text.
    // Using parse() before extract(reducto-extract) is wasteful.
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: false,
      extract: true,
      categorize: false,  // Could be extended
      qualify: false,     // Could be extended
      split: false,
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 500,
    },
    outputFormat: {
      type: 'JSON',
      features: {
        textLines: false,
        boundingBoxes: false,
        markdown: false,
        structuredJSON: true,
        schemaValidation: true,
        confidence: false,
        chunking: false,
      },
    },
    pricing: {
      model: 'per-page',
      standard: REDUCTO_CREDIT_RATES.extract.standard,
      agentic: REDUCTO_CREDIT_RATES.extract.agentic,
      usdPerCredit: USD_PER_CREDIT,
      currency: 'credits',
      notes: 'Standard: 2 credits/page (~$0.008), Agentic: 4 credits/page (~$0.016)',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 120,
    },
    supportedOptions: {
      mode: true,               // Agentic mode
      maxPages: true,
      pageRange: true,
      langs: false,
      extractImages: false,
      segmentation: false,
      citations: true,          // Field-level citations
      additionalPrompt: true,   // System prompt
      chunking: false,
      tableOutputFormat: false,
      confidence: false,
    },
  },

  reductoSplit: {
    id: 'reducto:v1',
    provider: 'reducto',
    model: 'v1',
    name: 'Reducto Split',
    type: 'Split',
    description: 'Split multi-document files into individual document segments',
    defaultEndpoint: 'https://platform.reducto.ai',
    capabilities: {
      supportsImages: false,    // Splitting makes sense for multi-page docs
      supportsPDFs: true,
      supportsDocuments: true,
      supportsSpreadsheets: false,
      supportsPresentations: true,
      asyncProcessing: true,
      outputTypes: ['SegmentationResult'],
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
      split: true,
    },
    inputFormats: {
      mimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      inputMethods: ['url', 'base64'],
      maxFileSize: 500,
    },
    outputFormat: {
      type: 'SegmentationResult',
      features: {
        textLines: false,
        boundingBoxes: false,
        markdown: false,
        structuredJSON: false,
        schemaValidation: false,
        confidence: true,  // Segment confidence
        chunking: false,
      },
    },
    pricing: {
      model: 'per-page',
      standard: REDUCTO_CREDIT_RATES.split.standard,
      agentic: REDUCTO_CREDIT_RATES.split.agentic,
      usdPerCredit: USD_PER_CREDIT,
      currency: 'credits',
      notes: '2 credits/page (~$0.008)',
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 120,
    },
    supportedOptions: {
      mode: false,
      maxPages: false,
      pageRange: false,
      langs: false,
      extractImages: false,
      segmentation: true,  // This IS segmentation
      citations: false,
      additionalPrompt: false,
      chunking: false,
      tableOutputFormat: false,
      confidence: true,
    },
  },
} as const satisfies Record<string, ReductoProviderMetadata>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a MIME type is supported
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return ALL_SUPPORTED_MIME_TYPES.includes(mimeType as any);
}

/**
 * Get MIME type from filename
 */
export function getMimeTypeFromFilename(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  return FILE_EXTENSIONS[ext];
}

/**
 * Estimate cost for an operation
 *
 * @param operation - Operation type
 * @param pages - Number of pages
 * @param agentic - Whether agentic mode is used
 * @returns Cost estimate in both credits and USD
 */
export function estimateCost(
  operation: 'parse' | 'extract' | 'split',
  pages: number,
  agentic: boolean = false
): { credits: number; usd: number } {
  const metadata = operation === 'parse' ? PROVIDER_METADATA.reductoParse
    : operation === 'extract' ? PROVIDER_METADATA.reductoExtract
    : PROVIDER_METADATA.reductoSplit;

  const creditsPerPage = agentic ? metadata.pricing.agentic : metadata.pricing.standard;
  const credits = pages * creditsPerPage;
  const usd = credits * USD_PER_CREDIT;

  return { credits, usd };
}

/**
 * Get providers compatible with a node type
 */
export function getProvidersForNode(
  nodeType: 'parse' | 'extract' | 'categorize' | 'qualify' | 'split'
): ReductoProviderMetadata[] {
  return Object.values(PROVIDER_METADATA).filter(
    provider => provider.compatibleNodes[nodeType]
  );
}

// ============================================================================
// Type Exports
// ============================================================================

export type ReductoProviderType = keyof typeof PROVIDER_METADATA;
export type SupportedMimeType = typeof ALL_SUPPORTED_MIME_TYPES[number];
