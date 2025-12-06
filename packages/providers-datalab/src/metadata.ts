/**
 * Datalab Provider Metadata
 *
 * Comprehensive metadata for all Datalab providers including:
 * - Supported file types (from official Datalab docs)
 * - Input/output formats
 * - Pricing
 * - Capabilities
 */

// Supported MIME types (from Datalab documentation)
export const SUPPORTED_MIME_TYPES = {
  // PDF
  PDF: ['application/pdf'] as const,

  // Spreadsheet
  SPREADSHEET: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet'
  ] as const,

  // Word documents
  WORD: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text'
  ] as const,

  // Powerpoint
  POWERPOINT: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation'
  ] as const,

  // HTML
  HTML: ['text/html'] as const,

  // EPUB
  EPUB: ['application/epub+zip'] as const,

  // Images
  IMAGE: [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/tiff'
  ] as const
} as const;

// All supported MIME types (flat array)
export const ALL_SUPPORTED_MIME_TYPES = Object.values(SUPPORTED_MIME_TYPES).flat();

// File extensions mapping
export const FILE_EXTENSIONS = {
  'pdf': 'application/pdf',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ods': 'application/vnd.oasis.opendocument.spreadsheet',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'odt': 'application/vnd.oasis.opendocument.text',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'odp': 'application/vnd.oasis.opendocument.presentation',
  'html': 'text/html',
  'epub': 'application/epub+zip',
  'png': 'image/png',
  'jpeg': 'image/jpeg',
  'jpg': 'image/jpg',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'tiff': 'image/tiff'
} as const;

/**
 * Processing modes and their costs (from Datalab pricing page)
 * https://www.datalab.to/pricing
 */
export const PROCESSING_MODES = {
  fast: { costPer1000Pages: 2.00, description: 'Quick processing, lower accuracy' },
  balanced: { costPer1000Pages: 4.00, description: 'Balanced speed and accuracy' },
  high_accuracy: { costPer1000Pages: 6.00, description: 'Highest accuracy, slower' },
  structured_extraction: { costPer1000Pages: 6.00, description: 'LLM-powered extraction (use_llm=true)' }
} as const;

/**
 * Supported options for a Datalab provider
 * These map to our normalized types in @docloai/core
 */
export type DatalabSupportedOptions = {
  /** Processing mode (fast/balanced/high_accuracy) */
  mode: boolean;
  /** Limit to first N pages */
  maxPages: boolean;
  /** Specific page range (0-indexed) */
  pageRange: boolean;
  /** Language hints for OCR */
  langs: boolean;
  /** Extract embedded images */
  extractImages: boolean;
  /** Auto-segmentation of multi-document PDFs */
  segmentation: boolean;
  /** Field-level citations */
  citations: boolean;
  /** Additional prompt/instructions */
  blockCorrectionPrompt: boolean;
  /** Paginate output with page delimiters */
  paginate: boolean;
  /** Strip existing OCR and redo */
  stripExistingOCR: boolean;
  /** Format lines in output */
  formatLines: boolean;
};

/**
 * Input type requirements for providers.
 * - 'raw-document': Needs FlowInput with base64/url (all Datalab providers)
 * - 'parsed-text': Needs DocumentIR text output
 * - 'any': Can work with either
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

// Provider metadata type
export type DatalabProviderMetadata = {
  /** Canonical ID in "provider:model" format */
  id: string;
  /** Provider vendor (company) */
  provider: 'datalab';
  /** Model identifier */
  model: string;
  /** Human-readable display name */
  name: string;
  type: 'OCR' | 'VLM';
  description: string;
  defaultEndpoint: string;
  capabilities: {
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsDocuments: boolean;
    supportsSpreadsheets: boolean;
    supportsSlides: boolean;
    asyncProcessing: boolean;
    outputTypes: string[];
  };
  /**
   * Input requirements for this provider.
   * All Datalab providers require raw document input.
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
    mimeTypes: readonly string[];
    inputMethods: ('url' | 'base64')[];
    maxFileSize: number;  // MB - 200 MB limit per Datalab docs
    maxPages?: number;    // No documented page limit
  };
  outputFormat: {
    type: 'DocumentIR' | 'JSON';
    features: {
      textLines?: boolean;
      boundingBoxes?: boolean;
      markdown?: boolean;
      structuredJSON?: boolean;
      schemaValidation?: boolean;
    };
  };
  pricing: {
    model: 'per-page';
    perPage: number;      // Calculated estimate - API does NOT return cost info
    currency: 'USD';
    notes: string;        // Always includes note about estimated costs
    modes?: typeof PROCESSING_MODES;
  };
  apiConfig: {
    requiresApiKey: boolean;
    pollingInterval: number; // ms
    maxPollingAttempts: number;
    rateLimit: {
      docsPerMinute: number;  // 200 docs/min default
      retryAfterSeconds: number;  // 60 seconds on 429
    };
  };
  /** Supported normalized options for this provider */
  supportedOptions: DatalabSupportedOptions;
};

// Provider metadata
export const PROVIDER_METADATA = {
  surya: {
    id: 'datalab:surya',
    provider: 'datalab',
    model: 'surya',
    name: 'Surya OCR',
    type: 'OCR',
    description: 'OCR with text extraction and bounding boxes',
    defaultEndpoint: 'https://www.datalab.to/api/v1/ocr',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsSpreadsheets: true,
      supportsSlides: true,
      asyncProcessing: true,
      outputTypes: ['DocumentIR', 'text', 'boundingBoxes']
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: true,      // ✅ OCRProvider accepted by parse()
      extract: false,   // ❌ Requires LLMProvider or VLMProvider
      categorize: false, // ❌ Requires LLMProvider or VLMProvider
      qualify: false,   // ❌ Requires VLMProvider (needs reasoning)
      split: false      // ❌ Requires VLMProvider (needs reasoning)
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 200,  // 200 MB per Datalab docs
      maxPages: undefined  // No documented page limit
    },
    outputFormat: {
      type: 'DocumentIR',
      features: {
        textLines: true,
        boundingBoxes: true,
        markdown: false,
        structuredJSON: false,
        schemaValidation: false
      }
    },
    pricing: {
      model: 'per-page',
      perPage: 0.01,
      currency: 'USD',
      notes: 'Calculated estimate - API does not return cost. Based on Datalab published pricing.'
    },
    apiConfig: {
      requiresApiKey: false, // Optional per code
      pollingInterval: 2000,
      maxPollingAttempts: 30,
      rateLimit: {
        docsPerMinute: 200,
        retryAfterSeconds: 60
      }
    },
    supportedOptions: {
      mode: false,              // Surya doesn't support mode
      maxPages: false,
      pageRange: false,
      langs: false,
      extractImages: false,
      segmentation: false,
      citations: false,
      blockCorrectionPrompt: false,
      paginate: false,
      stripExistingOCR: false,
      formatLines: false
    }
  },

  markerOCR: {
    id: 'datalab:marker-ocr',
    provider: 'datalab',
    model: 'marker-ocr',
    name: 'Marker OCR',
    type: 'OCR',
    description: 'PDF/Image to Markdown conversion (OCR only, no LLM extraction)',
    defaultEndpoint: 'https://www.datalab.to/api/v1/marker',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsSpreadsheets: true,
      supportsSlides: true,
      asyncProcessing: true,
      outputTypes: ['DocumentIR', 'markdown', 'text']
    },
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: true,      // ✅ OCRProvider accepted by parse()
      extract: false,   // ❌ Requires LLMProvider or VLMProvider
      categorize: false, // ❌ Requires LLMProvider or VLMProvider
      qualify: false,   // ❌ Requires VLMProvider (needs reasoning)
      split: false      // ❌ Requires VLMProvider (needs reasoning)
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 200,  // 200 MB per Datalab docs
      maxPages: undefined  // No documented page limit
    },
    outputFormat: {
      type: 'DocumentIR',
      features: {
        textLines: true,
        boundingBoxes: false,
        markdown: true,
        structuredJSON: false,
        schemaValidation: false
      }
    },
    pricing: {
      model: 'per-page',
      perPage: 0.02,
      currency: 'USD',
      notes: 'Calculated estimate - API does not return cost. Based on Datalab published pricing.'
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 60,
      rateLimit: {
        docsPerMinute: 200,
        retryAfterSeconds: 60
      }
    },
    supportedOptions: {
      mode: true,               // ✅ fast/balanced/high_accuracy
      maxPages: true,           // ✅ max_pages parameter
      pageRange: true,          // ✅ page_range parameter
      langs: true,              // ✅ langs parameter
      extractImages: true,      // ✅ disable_image_extraction parameter
      segmentation: false,      // ❌ OCR only, no segmentation
      citations: false,         // ❌ OCR only, no citations
      blockCorrectionPrompt: false, // ❌ OCR only, no LLM prompting
      paginate: true,           // ✅ paginate parameter
      stripExistingOCR: true,   // ✅ strip_existing_ocr parameter
      formatLines: true         // ✅ format_lines parameter
    }
  },

  markerVLM: {
    id: 'datalab:marker-vlm',
    provider: 'datalab',
    model: 'marker-vlm',
    name: 'Marker VLM',
    type: 'VLM',
    description: 'PDF/Image to structured JSON extraction (LLM-powered, schema-based)',
    defaultEndpoint: 'https://www.datalab.to/api/v1/marker',
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,
      supportsSpreadsheets: true,
      supportsSlides: true,
      asyncProcessing: true,
      outputTypes: ['JSON', 'structuredData']
    },
    // IMPORTANT: Marker VLM requires raw document input, NOT parsed text.
    // Using parse() before extract(marker-vlm) is wasteful - the parsed output is ignored.
    inputRequirements: {
      inputType: 'raw-document',
      acceptedMethods: ['url', 'base64']
    },
    compatibleNodes: {
      parse: false,     // ❌ Returns JSON, not DocumentIR
      extract: true,    // ✅ Designed for schema-based extraction
      categorize: false, // ❌ Specialized for extraction, not general reasoning
      qualify: false,   // ❌ Specialized for extraction, not quality assessment
      split: false      // ❌ Specialized for single documents, not multi-doc splitting
    },
    inputFormats: {
      mimeTypes: ALL_SUPPORTED_MIME_TYPES,
      inputMethods: ['url', 'base64'],
      maxFileSize: 200,  // 200 MB per Datalab docs
      maxPages: undefined  // No documented page limit
    },
    outputFormat: {
      type: 'JSON',
      features: {
        textLines: false,
        boundingBoxes: false,
        markdown: false,
        structuredJSON: true,
        schemaValidation: true
      }
    },
    pricing: {
      model: 'per-page',
      perPage: 0.02,
      currency: 'USD',
      notes: 'Calculated estimate - API does not return cost. Based on Datalab published pricing.'
    },
    apiConfig: {
      requiresApiKey: true,
      pollingInterval: 2000,
      maxPollingAttempts: 60,
      rateLimit: {
        docsPerMinute: 200,
        retryAfterSeconds: 60
      }
    },
    supportedOptions: {
      mode: true,               // ✅ fast/balanced/high_accuracy
      maxPages: true,           // ✅ max_pages parameter
      pageRange: true,          // ✅ page_range parameter
      langs: true,              // ✅ langs parameter
      extractImages: false,     // ❌ VLM focuses on extraction, not image output
      segmentation: true,       // ✅ segmentation_schema parameter
      citations: true,          // ✅ Returns [field]_citations
      blockCorrectionPrompt: true, // ✅ block_correction_prompt parameter
      paginate: false,          // ❌ Not relevant for JSON output
      stripExistingOCR: false,  // ❌ Not exposed in VLM API
      formatLines: false        // ❌ Not relevant for JSON output
    }
  }
} as const satisfies Record<string, DatalabProviderMetadata>;

// Helper functions

/**
 * Check if a MIME type is supported by Datalab providers
 *
 * @param mimeType - MIME type to check (e.g., 'application/pdf')
 * @returns True if supported
 *
 * @example
 * ```typescript
 * isMimeTypeSupported('application/pdf') // true
 * isMimeTypeSupported('video/mp4') // false
 * ```
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return ALL_SUPPORTED_MIME_TYPES.includes(mimeType as any);
}

/**
 * Get the most appropriate provider based on capability requirements
 *
 * @param capability - Desired capabilities
 * @returns Provider metadata
 *
 * @example
 * ```typescript
 * // Need markdown output
 * const provider = getProviderByCapability({ needsMarkdown: true });
 * console.log(provider.name); // "Marker OCR"
 *
 * // Need structured JSON
 * const provider = getProviderByCapability({ needsStructuredJSON: true });
 * console.log(provider.name); // "Marker VLM"
 *
 * // Need bounding boxes
 * const provider = getProviderByCapability({ needsBoundingBoxes: true });
 * console.log(provider.name); // "Surya OCR"
 *
 * // Default to cheapest
 * const provider = getProviderByCapability({ preferCheap: true });
 * console.log(provider.name); // "Surya OCR"
 * ```
 */
export function getProviderByCapability(capability: {
  needsMarkdown?: boolean;
  needsStructuredJSON?: boolean;
  needsBoundingBoxes?: boolean;
  preferCheap?: boolean;
}): DatalabProviderMetadata {
  if (capability.needsStructuredJSON) {
    return PROVIDER_METADATA.markerVLM;
  }
  if (capability.needsMarkdown) {
    return PROVIDER_METADATA.markerOCR;
  }
  if (capability.needsBoundingBoxes) {
    return PROVIDER_METADATA.surya;
  }
  // Default: cheapest
  return PROVIDER_METADATA.surya;
}

/**
 * Estimate cost for processing a document
 *
 * @param provider - Provider ID
 * @param pages - Number of pages
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const cost = estimateCost('surya', 10);
 * console.log(`$${cost}`); // "$0.10"
 *
 * const cost = estimateCost('markerOCR', 10);
 * console.log(`$${cost}`); // "$0.20"
 * ```
 */
export function estimateCost(provider: keyof typeof PROVIDER_METADATA, pages: number): number {
  return PROVIDER_METADATA[provider].pricing.perPage * pages;
}

/**
 * Check if a provider can handle a specific MIME type
 *
 * @param provider - Provider ID
 * @param mimeType - MIME type to check
 * @returns Object with canHandle boolean and optional reason
 *
 * @example
 * ```typescript
 * const result = canProviderHandleFile('surya', 'application/pdf');
 * if (!result.canHandle) {
 *   console.error(result.reason);
 * }
 * ```
 */
export function canProviderHandleFile(
  provider: keyof typeof PROVIDER_METADATA,
  mimeType: string
): { canHandle: boolean; reason?: string } {
  const metadata = PROVIDER_METADATA[provider];

  if (!metadata.inputFormats.mimeTypes.includes(mimeType as any)) {
    return {
      canHandle: false,
      reason: `MIME type ${mimeType} not supported by ${metadata.name}. Supported types: ${metadata.inputFormats.mimeTypes.join(', ')}`
    };
  }

  return { canHandle: true };
}

/**
 * Get MIME type from file extension
 *
 * @param filename - Filename or path
 * @returns MIME type or undefined if not supported
 *
 * @example
 * ```typescript
 * getMimeTypeFromFilename('document.pdf') // 'application/pdf'
 * getMimeTypeFromFilename('image.jpg') // 'image/jpg'
 * getMimeTypeFromFilename('unknown.xyz') // undefined
 * ```
 */
export function getMimeTypeFromFilename(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  return FILE_EXTENSIONS[ext as keyof typeof FILE_EXTENSIONS];
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
 * // Returns: [surya, markerOCR] (OCR providers)
 *
 * // Get providers that work with extract()
 * const extractProviders = getProvidersForNode('extract');
 * // Returns: [markerVLM] (specialized extraction)
 *
 * // Get providers that work with qualify()
 * const qualifyProviders = getProvidersForNode('qualify');
 * // Returns: [] (no Datalab providers support this)
 * ```
 */
export function getProvidersForNode(
  nodeType: 'parse' | 'extract' | 'categorize' | 'qualify' | 'split'
): DatalabProviderMetadata[] {
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
 * isProviderCompatibleWithNode('surya', 'parse');      // true
 * isProviderCompatibleWithNode('surya', 'extract');    // false
 * isProviderCompatibleWithNode('markerVLM', 'extract'); // true
 * ```
 */
export function isProviderCompatibleWithNode(
  providerId: keyof typeof PROVIDER_METADATA,
  nodeType: 'parse' | 'extract' | 'categorize' | 'qualify' | 'split'
): boolean {
  return PROVIDER_METADATA[providerId].compatibleNodes[nodeType];
}

// Type exports
export type DatalabProviderType = keyof typeof PROVIDER_METADATA;
export type SupportedMimeType = typeof ALL_SUPPORTED_MIME_TYPES[number];
export type NodeType = 'parse' | 'extract' | 'categorize' | 'qualify' | 'split';
