/**
 * Mistral Provider Metadata
 *
 * Comprehensive metadata for Mistral AI providers including:
 * - OCR 3 (document parsing)
 * - Document AI Annotations (structured extraction)
 */

import {
  MISTRAL_SUPPORTED_MIME_TYPES,
  MISTRAL_ALL_MIME_TYPES,
  MISTRAL_DEFAULT_ENDPOINT,
  MISTRAL_PRICING,
  MISTRAL_LIMITS,
} from './types.js';

/**
 * Supported options for Mistral providers
 */
export type MistralSupportedOptions = {
  /** Table output format (html/markdown) */
  tableFormat: boolean;
  /** Extract header from document */
  extractHeader: boolean;
  /** Extract footer from document */
  extractFooter: boolean;
  /** Include base64 images in response */
  includeImageBase64: boolean;
  /** Annotation mode (document/bbox) for VLM */
  annotationMode: boolean;
  /** Page range selection (single, range "0-5", or array [0,2,5]) */
  pageRange: boolean;
};

/**
 * Input type requirements for providers
 */
export type ProviderInputType = 'raw-document' | 'parsed-text' | 'any';

/**
 * Mistral provider metadata type
 */
export type MistralProviderMetadata = {
  /** Canonical ID in "provider:model" format */
  id: string;
  /** Provider vendor */
  provider: 'mistral';
  /** Model identifier */
  model: string;
  /** Human-readable display name */
  name: string;
  /** Provider type */
  type: 'OCR' | 'VLM';
  /** Description */
  description: string;
  /** Default API endpoint */
  defaultEndpoint: string;
  /** Provider capabilities */
  capabilities: {
    supportsImages: boolean;
    supportsPDFs: boolean;
    supportsDocuments: boolean;  // DOCX, PPTX
    supportsReasoning: boolean;
    supportsStructuredOutput: boolean;
    asyncProcessing: boolean;
    outputTypes: string[];
  };
  /** Input requirements */
  inputRequirements: {
    inputType: ProviderInputType;
    acceptedMethods: readonly ('url' | 'base64' | 'fileId')[];
  };
  /** Node compatibility */
  compatibleNodes: {
    parse: boolean;
    extract: boolean;
    categorize: boolean;
    qualify: boolean;
    split: boolean;
  };
  /** Input format specifications */
  inputFormats: {
    mimeTypes: readonly string[];
    inputMethods: ('url' | 'base64' | 'fileId')[];
    maxFileSize: number;  // MB
    maxPages?: number;
  };
  /** Output format specifications */
  outputFormat: {
    type: 'DocumentIR' | 'JSON';
    features: {
      textLines?: boolean;
      boundingBoxes?: boolean;  // Text-level bounding boxes
      imageBoundingBoxes?: boolean;  // Image-level bounding boxes
      markdown?: boolean;
      htmlTables?: boolean;
      structuredJSON?: boolean;
      schemaValidation?: boolean;
      handwrittenText?: boolean;
    };
  };
  /** Pricing information */
  pricing: {
    model: 'per-page' | 'per-token';
    perPage?: number;
    currency: 'USD';
    notes: string;
  };
  /** API configuration */
  apiConfig: {
    requiresApiKey: boolean;
    timeout: number;  // ms
  };
  /** Supported options */
  supportedOptions: MistralSupportedOptions;
};

/**
 * Provider metadata for all Mistral providers
 */
export const PROVIDER_METADATA = {
  /**
   * Mistral OCR 3 - Document parsing provider
   *
   * Uses Mistral OCR 3 API to convert documents to markdown.
   * Supports PDF, images, and extensive document formats (DOCX, PPTX, TXT, EPUB, RTF, ODT, etc.)
   * Does NOT provide text-level bounding boxes (only image bboxes).
   * Does NOT support XLSX (spreadsheets).
   */
  mistralOCR: {
    id: 'mistral:ocr-2512',
    provider: 'mistral',
    model: 'ocr-2512',
    name: 'Mistral OCR 3',
    type: 'OCR',
    description: 'VLM-based document to markdown conversion with HTML table reconstruction',
    defaultEndpoint: `${MISTRAL_DEFAULT_ENDPOINT}/ocr`,
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,  // Supports DOCX, PPTX, TXT, EPUB, RTF, ODT, and more (NOT XLSX)
      supportsReasoning: false,
      supportsStructuredOutput: false,  // Use VLM for structured output
      asyncProcessing: false,  // Synchronous API
      outputTypes: ['DocumentIR', 'markdown', 'text'],
    },
    inputRequirements: {
      inputType: 'raw-document' as const,  // Always needs source document
      acceptedMethods: ['url', 'base64', 'fileId'] as const,  // Supports cloud file upload
    },
    compatibleNodes: {
      parse: true,       // Primary use case
      extract: false,    // Use mistralVLM for extraction
      categorize: false, // Use chat VLMs
      qualify: false,    // Use chat VLMs
      split: false,      // Use chat VLMs
    },
    inputFormats: {
      mimeTypes: MISTRAL_ALL_MIME_TYPES,
      inputMethods: ['url', 'base64', 'fileId'],
      maxFileSize: MISTRAL_LIMITS.MAX_FILE_SIZE_MB,
      maxPages: MISTRAL_LIMITS.MAX_PAGES,
    },
    outputFormat: {
      type: 'DocumentIR' as const,
      features: {
        textLines: true,
        boundingBoxes: false,       // NO text-level bounding boxes
        imageBoundingBoxes: true,   // YES image-level bounding boxes
        markdown: true,
        htmlTables: true,
        structuredJSON: false,
        schemaValidation: false,
        handwrittenText: true,      // Excellent handwriting support
      },
    },
    pricing: {
      model: 'per-page' as const,
      perPage: MISTRAL_PRICING.PER_PAGE_USD,
      currency: 'USD' as const,
      notes: `$${MISTRAL_PRICING.PER_PAGE_USD * 1000} per 1000 pages. Batch processing available at 50% discount.`,
    },
    apiConfig: {
      requiresApiKey: true,
      timeout: 120000,
    },
    supportedOptions: {
      tableFormat: true,         // html or markdown
      extractHeader: true,
      extractFooter: true,
      includeImageBase64: true,
      annotationMode: false,     // Not applicable for OCR
      pageRange: true,           // Supports pages param: "0-5" or [0,2,5]
    },
  },

  /**
   * Mistral VLM - Document extraction provider
   *
   * Uses Mistral OCR 3 with Document AI Annotations for
   * structured extraction directly from source documents.
   *
   * IMPORTANT: Always requires raw document input, NOT DocumentIR.
   * Cannot be used after a parse() step - needs original PDF/image.
   */
  mistralVLM: {
    id: 'mistral:ocr-2512-vlm',
    provider: 'mistral',
    model: 'ocr-2512-vlm',
    name: 'Mistral Document AI',
    type: 'VLM',
    description: 'VLM-based structured extraction from documents using JSON schema',
    defaultEndpoint: `${MISTRAL_DEFAULT_ENDPOINT}/ocr`,
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
      supportsDocuments: true,  // Supports DOCX, PPTX, TXT, EPUB, RTF, ODT, and more (NOT XLSX)
      supportsReasoning: false,
      supportsStructuredOutput: true,
      asyncProcessing: false,
      outputTypes: ['JSON', 'structuredData'],
    },
    inputRequirements: {
      inputType: 'raw-document' as const,  // CRITICAL: Only works from source
      acceptedMethods: ['url', 'base64', 'fileId'] as const,  // Supports cloud file upload
    },
    compatibleNodes: {
      parse: false,      // Returns JSON, not DocumentIR
      extract: true,     // Primary use case - extraction from source
      categorize: false, // Use chat VLMs for categorization
      qualify: false,    // Use chat VLMs for qualification
      split: false,      // Use chat VLMs for splitting
    },
    inputFormats: {
      mimeTypes: MISTRAL_ALL_MIME_TYPES,
      inputMethods: ['url', 'base64', 'fileId'],
      maxFileSize: MISTRAL_LIMITS.MAX_FILE_SIZE_MB,
      maxPages: MISTRAL_LIMITS.DOCUMENT_ANNOTATION_MAX_PAGES,  // 8 pages for document annotation
    },
    outputFormat: {
      type: 'JSON' as const,
      features: {
        textLines: false,
        boundingBoxes: false,
        imageBoundingBoxes: true,  // bbox_annotation provides this
        markdown: false,
        htmlTables: false,
        structuredJSON: true,
        schemaValidation: true,
        handwrittenText: true,
      },
    },
    pricing: {
      model: 'per-page' as const,
      perPage: MISTRAL_PRICING.PER_PAGE_USD,
      currency: 'USD' as const,
      notes: `$${MISTRAL_PRICING.PER_PAGE_USD * 1000} per 1000 pages. Same pricing as OCR 3.`,
    },
    apiConfig: {
      requiresApiKey: true,
      timeout: 120000,
    },
    supportedOptions: {
      tableFormat: false,        // Not applicable for VLM
      extractHeader: false,
      extractFooter: false,
      includeImageBase64: true,
      annotationMode: true,      // document or bbox
      pageRange: true,           // pages param works; document_annotation limited to 8 pages, bbox_annotation up to 1000
    },
  },
} as const satisfies Record<string, MistralProviderMetadata>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a MIME type is supported by Mistral providers
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return MISTRAL_ALL_MIME_TYPES.includes(mimeType as any);
}

/**
 * Estimate cost for processing a document
 *
 * @param pages - Number of pages
 * @param useBatch - Whether to apply batch discount
 * @returns Estimated cost in USD
 */
export function estimateCost(pages: number, useBatch = false): number {
  const basePrice = pages * MISTRAL_PRICING.PER_PAGE_USD;
  return useBatch ? basePrice * MISTRAL_PRICING.BATCH_DISCOUNT : basePrice;
}

/**
 * Get provider metadata by ID
 */
export function getProviderById(
  id: 'mistralOCR' | 'mistralVLM'
): MistralProviderMetadata {
  return PROVIDER_METADATA[id];
}

/**
 * Get providers compatible with a specific node type
 */
export function getProvidersForNode(
  nodeType: 'parse' | 'extract' | 'categorize' | 'qualify' | 'split'
): MistralProviderMetadata[] {
  return Object.values(PROVIDER_METADATA).filter(
    provider => provider.compatibleNodes[nodeType]
  );
}

/**
 * Check if a provider requires raw document input
 */
export function requiresRawDocument(providerId: keyof typeof PROVIDER_METADATA): boolean {
  return PROVIDER_METADATA[providerId].inputRequirements.inputType === 'raw-document';
}

// Type exports
export type MistralProviderType = keyof typeof PROVIDER_METADATA;
export type SupportedMimeType = typeof MISTRAL_ALL_MIME_TYPES[number];
export type NodeType = 'parse' | 'extract' | 'categorize' | 'qualify' | 'split';
