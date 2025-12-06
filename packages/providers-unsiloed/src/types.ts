/**
 * Unsiloed Provider Types
 *
 * Types for Unsiloed AI API integration
 * @see https://docs.unsiloed.ai/
 */

// ============================================================================
// Common Types
// ============================================================================

/**
 * Document input for Unsiloed API
 */
export type UnsiloedDocumentInput = {
  /** URL to document */
  url?: string;
  /** Base64 encoded document */
  base64?: string;
};

/**
 * Job status for async operations
 */
export type UnsiloedJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Base job response from Unsiloed API
 */
export type UnsiloedJobResponse = {
  job_id: string;
  status: UnsiloedJobStatus;
  message?: string;
  quota_remaining?: number;
};

/**
 * Job result response
 */
export type UnsiloedJobResult<T = unknown> = {
  job_id: string;
  status: UnsiloedJobStatus;
  result?: T;
  error?: string;
};

// ============================================================================
// Parse Types
// ============================================================================

/**
 * Options for the Unsiloed Parse provider
 */
export type UnsiloedParseOptions = {
  /** Unsiloed API key */
  apiKey: string;
  /** Custom API endpoint (default: https://prod.visionapi.unsiloed.ai) */
  endpoint?: string;
  /** Job polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Overall timeout in seconds (default: 300) */
  timeout?: number;
};

/**
 * Parse API response structure
 */
export type UnsiloedParseResponse = {
  job_id: string;
  status: UnsiloedJobStatus;
  result?: {
    /** Parsed content chunks */
    chunks: UnsiloedChunk[];
    /** Full markdown representation */
    markdown?: string;
    /** Page count */
    num_pages?: number;
  };
  usage?: {
    pages: number;
  };
};

/**
 * A parsed chunk from Unsiloed
 */
export type UnsiloedChunk = {
  /** Chunk content as text */
  content: string;
  /** Chunk type */
  type: UnsiloedBlockType;
  /** Page number (0-indexed) */
  page?: number;
  /** Bounding box if available */
  bbox?: UnsiloedBBox;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
};

/**
 * Block types from Unsiloed parse
 */
export type UnsiloedBlockType =
  | 'text'
  | 'title'
  | 'header'
  | 'table'
  | 'figure'
  | 'list'
  | 'code'
  | 'equation'
  | 'caption'
  | 'footnote'
  | 'unknown';

/**
 * Bounding box from Unsiloed
 */
export type UnsiloedBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

// ============================================================================
// Extract Types
// ============================================================================

/**
 * Options for the Unsiloed Extract provider
 */
export type UnsiloedExtractOptions = {
  /** Unsiloed API key */
  apiKey: string;
  /** Custom API endpoint (default: https://prod.visionapi.unsiloed.ai) */
  endpoint?: string;
  /** Job polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Overall timeout in seconds (default: 300) */
  timeout?: number;
};

/**
 * Extract API request body
 */
export type UnsiloedExtractRequest = {
  /** PDF file (multipart) */
  pdf_file: File | Blob;
  /** JSON Schema defining extraction structure */
  schema_data: string;
};

/**
 * Extract API response structure
 */
export type UnsiloedExtractResponse = {
  job_id: string;
  status: UnsiloedJobStatus;
  result?: unknown;
  citations?: UnsiloedCitation[];
  usage?: {
    pages: number;
  };
};

/**
 * Citation from Unsiloed Extract
 */
export type UnsiloedCitation = {
  /** JSON path to the extracted field */
  field_path: string;
  /** Source text */
  source_text?: string;
  /** Page number */
  page?: number;
  /** Bounding box of source */
  bbox?: UnsiloedBBox;
  /** Confidence score */
  confidence?: number;
};

// ============================================================================
// Split Types
// ============================================================================

/**
 * Options for Unsiloed Split function
 */
export type UnsiloedSplitOptions = {
  /** Unsiloed API key */
  apiKey: string;
  /** Custom API endpoint (default: https://prod.visionapi.unsiloed.ai) */
  endpoint?: string;
  /** Document categories/types to detect */
  categories: UnsiloedDocumentCategory[];
  /** Job polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Overall timeout in seconds (default: 300) */
  timeout?: number;
};

/**
 * Document category for splitting
 */
export type UnsiloedDocumentCategory = {
  /** Category name (e.g., "Invoice", "Contract") */
  name: string;
  /** Description to help identify this category */
  description?: string;
};

/**
 * Split API response structure
 */
export type UnsiloedSplitResponse = {
  job_id: string;
  status: UnsiloedJobStatus;
  result?: {
    /** Segments detected */
    segments: UnsiloedSegment[];
    /** Total pages processed */
    total_pages: number;
  };
  usage?: {
    pages: number;
  };
};

/**
 * A segment from split operation
 */
export type UnsiloedSegment = {
  /** Category/type name */
  category: string;
  /** Page numbers in this segment (0-indexed) */
  pages: number[];
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
};

// ============================================================================
// Classify Types
// ============================================================================

/**
 * Options for Unsiloed Classify function
 */
export type UnsiloedClassifyOptions = {
  /** Unsiloed API key */
  apiKey: string;
  /** Custom API endpoint (default: https://prod.visionapi.unsiloed.ai) */
  endpoint?: string;
  /** Document categories to classify into */
  categories: UnsiloedDocumentCategory[];
  /** Job polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Overall timeout in seconds (default: 300) */
  timeout?: number;
};

/**
 * Classify API response structure
 */
export type UnsiloedClassifyResponse = {
  job_id: string;
  status: UnsiloedJobStatus;
  result?: {
    /** Assigned category */
    category: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Alternative categories with scores */
    alternatives?: Array<{
      category: string;
      confidence: number;
    }>;
  };
  usage?: {
    pages: number;
  };
};

// ============================================================================
// Usage and Cost Types
// ============================================================================

/**
 * Usage with USD estimate
 */
export type UnsiloedUsage = {
  /** Number of pages processed */
  numPages: number;
  /** Estimated USD cost */
  estimatedUSD: number;
  /** Pricing tier used for calculation */
  tier: 'standard' | 'growth';
};

/**
 * USD per page by pricing tier
 */
export const USD_PER_PAGE = {
  standard: 0.01,    // $0.01/page at Standard tier ($250/25000 pages)
  growth: 0.0075,    // $0.0075/page at Growth tier ($750/100000 pages)
} as const;

/**
 * Calculate usage from page count
 */
export function calculateUsage(
  numPages: number,
  tier: 'standard' | 'growth' = 'standard'
): UnsiloedUsage {
  return {
    numPages,
    estimatedUSD: numPages * USD_PER_PAGE[tier],
    tier,
  };
}
