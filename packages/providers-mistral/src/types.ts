/**
 * Mistral AI API Types
 *
 * Types for OCR 3 API (document processing) and Document AI Annotations (structured extraction)
 */

// =============================================================================
// Document Input Types
// =============================================================================

/**
 * Document input via URL or data URL
 * Used for: PDF, DOCX, PPTX, and other non-image documents
 *
 * Supports both HTTP URLs and data URLs (base64):
 * - URL: "https://example.com/doc.pdf"
 * - Data URL: "data:application/pdf;base64,..."
 */
export type MistralDocumentURL = {
  type: 'document_url';
  document_url: string;
};

/**
 * Image input via URL or data URL
 * Used for: PNG, JPEG, WebP, GIF, AVIF
 *
 * Supports both HTTP URLs and data URLs (base64):
 * - URL: "https://example.com/image.jpg"
 * - Data URL: "data:image/jpeg;base64,..."
 */
export type MistralImageURL = {
  type: 'image_url';
  image_url: string;
};

/**
 * Union of all document input types
 *
 * Note: Mistral OCR API does NOT have a separate 'base64' type.
 * Base64 data is passed as data URLs in image_url or document_url fields.
 */
export type MistralDocumentInput =
  | MistralDocumentURL
  | MistralImageURL;

// =============================================================================
// OCR 3 Request Types
// =============================================================================

/**
 * Table output format options
 */
export type MistralTableFormat = 'html' | 'markdown';

/**
 * OCR 3 API request body
 */
export type MistralOCRRequest = {
  /** Model ID - use 'mistral-ocr-latest' or 'mistral-ocr-2512' */
  model: string;
  /** Document to process */
  document: MistralDocumentInput;
  /**
   * Specific pages to process. Supports various formats:
   * - Single page: "3" or 3
   * - Range: "0-5"
   * - Array: [0, 2, 5]
   * Page numbering starts from 0.
   */
  pages?: string | number | number[];
  /** Table output format (default: html) */
  table_format?: MistralTableFormat;
  /** Extract document header into separate field */
  extract_header?: boolean;
  /** Extract document footer into separate field */
  extract_footer?: boolean;
  /** Include base64 encoded images in response */
  include_image_base64?: boolean;
};

/**
 * OCR 3 API request with Document AI Annotations
 */
export type MistralOCRWithAnnotationsRequest = MistralOCRRequest & {
  /** Schema for document-level annotation extraction */
  document_annotation_format?: MistralAnnotationFormat;
  /** Schema for bounding-box level annotation extraction */
  bbox_annotation_format?: MistralAnnotationFormat;
};

// =============================================================================
// Annotation Format Types (for structured extraction)
// =============================================================================

/**
 * JSON Schema annotation format
 */
export type MistralAnnotationFormat = {
  type: 'json_schema';
  json_schema: {
    /** Name of the schema */
    name: string;
    /** JSON Schema definition */
    schema: Record<string, unknown>;
    /** Whether to enforce strict validation */
    strict?: boolean;
  };
};

// =============================================================================
// OCR 3 Response Types
// =============================================================================

/**
 * Image bounding box in OCR response
 */
export type MistralImageBBox = {
  /** Image identifier (e.g., 'img-0.jpeg') */
  id: string;
  /** Top-left X coordinate */
  top_left_x: number;
  /** Top-left Y coordinate */
  top_left_y: number;
  /** Bottom-right X coordinate */
  bottom_right_x: number;
  /** Bottom-right Y coordinate */
  bottom_right_y: number;
  /** Base64 encoded image data (if include_image_base64 was true) */
  image_base64?: string;
  /** Annotation for this image (if bbox_annotation_format was provided) */
  image_annotation?: unknown;
};

/**
 * Page dimensions
 */
export type MistralPageDimensions = {
  /** Page width in pixels */
  width: number;
  /** Page height in pixels */
  height: number;
};

/**
 * Single page in OCR response
 */
export type MistralOCRPage = {
  /** Page index (0-based) */
  index: number;
  /** Extracted markdown content */
  markdown: string;
  /** Extracted images with bounding boxes */
  images: MistralImageBBox[];
  /** Extracted tables (as HTML or markdown based on table_format) */
  tables?: string[];
  /** Hyperlinks found on the page */
  hyperlinks?: { text: string; url: string }[];
  /** Page header (if extract_header was true) */
  header?: string;
  /** Page footer (if extract_footer was true) */
  footer?: string;
  /** Page dimensions */
  dimensions?: MistralPageDimensions;
};

/**
 * Usage information in OCR response
 */
export type MistralUsageInfo = {
  /** Number of pages processed */
  pages_processed: number;
};

/**
 * OCR 3 API response
 */
export type MistralOCRResponse = {
  /** Array of processed pages */
  pages: MistralOCRPage[];
  /** Model used for processing */
  model: string;
  /** Document-level annotation (if document_annotation_format was provided) */
  document_annotation?: unknown;
  /** Usage information */
  usage_info: MistralUsageInfo;
};

// =============================================================================
// Error Types
// =============================================================================

/**
 * Mistral API error response
 */
export type MistralAPIError = {
  error: {
    message: string;
    type: string;
    code?: string;
  };
};

// =============================================================================
// Provider Configuration Types
// =============================================================================

/**
 * Supported MIME types for Mistral OCR 3
 *
 * Per official FAQ (December 2025):
 * - Documents: PDF, DOCX, PPTX, TXT, EPUB, XML/DocBook, RTF, ODT, BibTeX, FictionBook, Jupyter Notebooks, JATS XML, LaTeX, OPML, Troff
 * - Images: JPEG, PNG, AVIF, TIFF, GIF, HEIC/HEIF, BMP, WebP
 * - NOT supported: XLSX (spreadsheets)
 */
export const MISTRAL_SUPPORTED_MIME_TYPES = {
  PDF: ['application/pdf'] as const,
  IMAGE: [
    'image/jpeg',
    'image/png',
    'image/avif',
    'image/tiff',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/webp',
  ] as const,
  // Full document format support per FAQ
  DOCUMENT: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'text/plain', // TXT
    'application/epub+zip', // EPUB
    'application/xml', // XML/DocBook
    'application/rtf', // RTF
    'application/vnd.oasis.opendocument.text', // ODT
    'application/x-bibtex', // BibTeX
    'application/x-fictionbook+xml', // FictionBook
    'application/x-ipynb+json', // Jupyter Notebooks
    'application/jats+xml', // JATS XML
    'application/x-latex', // LaTeX
    'text/x-opml', // OPML
  ] as const,
} as const;

/**
 * All supported MIME types combined
 */
export const MISTRAL_ALL_MIME_TYPES = [
  ...MISTRAL_SUPPORTED_MIME_TYPES.PDF,
  ...MISTRAL_SUPPORTED_MIME_TYPES.IMAGE,
  ...MISTRAL_SUPPORTED_MIME_TYPES.DOCUMENT,
] as const;

/**
 * Default Mistral API endpoint
 */
export const MISTRAL_DEFAULT_ENDPOINT = 'https://api.mistral.ai/v1';

/**
 * Mistral OCR 3 model identifiers
 */
export const MISTRAL_OCR_MODELS = {
  LATEST: 'mistral-ocr-latest',
  V2512: 'mistral-ocr-2512',
} as const;

/**
 * Mistral pricing constants
 */
export const MISTRAL_PRICING = {
  /** Cost per page in USD */
  PER_PAGE_USD: 0.002,
  /** Batch discount multiplier */
  BATCH_DISCOUNT: 0.5,
} as const;

/**
 * Mistral API limits
 */
export const MISTRAL_LIMITS = {
  /** Maximum file size in MB */
  MAX_FILE_SIZE_MB: 50,
  /** Maximum pages per document */
  MAX_PAGES: 1000,
  /** Document annotation page limit */
  DOCUMENT_ANNOTATION_MAX_PAGES: 8,
} as const;
