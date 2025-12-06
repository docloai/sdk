/**
 * Reducto Provider Types
 *
 * Types for Reducto API integration
 * @see https://docs.reducto.ai/
 */

import type { ProcessingMode, SegmentationResult } from "@docloai/core";

// ============================================================================
// Chunking Modes
// ============================================================================

/**
 * Reducto chunking modes for RAG-optimized output
 * - disabled: No chunking, return full document
 * - variable: RAG-optimized variable chunking
 * - section: Section-based chunking (maps to SDK section strategy)
 * - page: Page-based chunking (maps to SDK page strategy)
 * - block: Block-level chunking (Reducto-specific)
 * - page_sections: Page-aware section chunking (Reducto-specific)
 */
export type ReductoChunkMode = 'disabled' | 'variable' | 'section' | 'page' | 'block' | 'page_sections';

/**
 * Table output formats supported by Reducto
 */
export type ReductoTableFormat = 'html' | 'json' | 'md' | 'csv' | 'dynamic';

// ============================================================================
// Parse Provider Options
// ============================================================================

/**
 * Block types that can be filtered from output.
 * Based on Reducto API documentation: https://docs.reducto.ai/api-reference/parse
 */
export type ReductoBlockType =
  | 'Header' | 'Footer' | 'Title' | 'Text' | 'Table' | 'Figure'
  | 'Section Header' | 'Page Number' | 'List Item' | 'Key Value'
  | 'Comment' | 'Signature';

/**
 * Options for the Reducto Parse provider
 */
export type ReductoParseOptions = {
  /** Reducto API key */
  apiKey: string;
  /** Custom API endpoint (default: https://platform.reducto.ai) */
  endpoint?: string;

  // ============================================================================
  // Chunking (retrieval)
  // ============================================================================
  /** Chunking mode for RAG-optimized output */
  chunkMode?: ReductoChunkMode;
  /** Target chunk size (for variable mode) */
  chunkSize?: number;
  /** Filter out specific block types from content/embed fields */
  filterBlocks?: ReductoBlockType[];
  /** Optimize output for embedding models */
  embeddingOptimized?: boolean;

  // ============================================================================
  // Formatting
  // ============================================================================
  /** Table output format (html, json, md, csv, dynamic) */
  tableOutputFormat?: ReductoTableFormat;
  /** Add page markers to output (useful for page-specific extraction) */
  addPageMarkers?: boolean;
  /** Merge consecutive tables with same column count */
  mergeTables?: boolean;

  // ============================================================================
  // Enhance (VLM features)
  // ============================================================================
  /** Use agentic mode for higher accuracy (VLM-enhanced, 2x credits) */
  agentic?: boolean;
  /** Summarize figures using a small vision model (default: true) */
  summarizeFigures?: boolean;

  // ============================================================================
  // Settings
  // ============================================================================
  /** OCR system to use */
  ocrSystem?: 'standard' | 'legacy';
  /** Return embedded images for specific block types */
  returnImages?: ('figure' | 'table')[];
  /** Return raw OCR data in output */
  returnOcrData?: boolean;
  /** Force result as URL instead of inline */
  forceUrlResult?: boolean;
  /** Custom timeout in seconds (default: 900) */
  timeout?: number;

  // ============================================================================
  // Page selection
  // ============================================================================
  /** Limit to first N pages */
  maxPages?: number;
  /** Page range as object or array of page numbers (0-indexed) */
  pageRange?: { start?: number; end?: number } | number[];
};

// ============================================================================
// Extract Provider Options
// ============================================================================

/**
 * Options for the Reducto Extract provider
 */
export type ReductoExtractOptions = {
  /** Reducto API key */
  apiKey: string;
  /** Custom API endpoint (default: https://platform.reducto.ai) */
  endpoint?: string;

  // ============================================================================
  // Extraction Settings
  // ============================================================================
  /** System prompt for extraction guidance */
  systemPrompt?: string;
  /** Enable field-level citations */
  citations?: boolean;
  /** Optimize for latency over accuracy (2x credits) */
  optimizeForLatency?: boolean;
  /** Use agentic mode for higher accuracy (4x credits) */
  agentic?: boolean;
  /** Include extracted images as URLs or base64 in output */
  includeImages?: boolean;
  /** Array extraction mode for processing repeated structures */
  arrayExtract?: boolean;

  // ============================================================================
  // Page selection (inherited from parse)
  // ============================================================================
  /** Limit to first N pages */
  maxPages?: number;
  /** Page range as object or array of page numbers (0-indexed) */
  pageRange?: { start?: number; end?: number } | number[];
};

// ============================================================================
// Split Options
// ============================================================================

/**
 * Document type descriptor for splitting
 */
export type ReductoDocumentType = {
  /** Name of the document type (e.g., "Invoice", "Contract") */
  name: string;
  /** Description to help identify this document type */
  description: string;
};

/**
 * Options for Reducto Split function
 */
export type ReductoSplitOptions = {
  /** Reducto API key */
  apiKey: string;
  /** Custom API endpoint (default: https://platform.reducto.ai) */
  endpoint?: string;
  /** Document types to detect and split by */
  splitDescription: ReductoDocumentType[];
};

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Bounding box coordinates from Reducto
 */
export type ReductoBBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  page: number;
  original_page?: number;
};

/**
 * Confidence level for block detection
 */
export type ReductoConfidence = 'low' | 'medium' | 'high';

/**
 * A single block from Reducto Parse response
 */
export type ReductoBlock = {
  type: ReductoBlockType;
  content: string;
  bbox: ReductoBBox;
  confidence: ReductoConfidence;
  /** URL to extracted image (for figures/tables when return_images enabled) */
  image_url?: string;
};

/**
 * A chunk from Reducto Parse response
 */
export type ReductoChunk = {
  content: string;
  blocks: ReductoBlock[];
};

/**
 * Reducto Parse API response
 */
export type ReductoParseResponse = {
  job_id: string;
  duration: number;
  usage: {
    num_pages: number;
    credits: number;
  };
  result: {
    chunks: ReductoChunk[];
  };
};

/**
 * Reducto Extract API response
 */
export type ReductoExtractResponse = {
  job_id: string;
  duration: number;
  usage: {
    num_pages: number;
    num_fields: number;
    credits: number;
  };
  result: unknown;
  citations?: Array<{
    field_path: string;
    block_ids: string[];
    confidence?: number;
  }>;
};

/**
 * Reducto Split API response
 */
export type ReductoSplitResponse = {
  job_id: string;
  duration: number;
  usage: {
    num_pages: number;
    credits: number;
  };
  result: {
    section_mapping: Record<string, number[]>;
    splits: Array<{
      name: string;
      pages: number[];
      conf: 'high' | 'low';
      partitions?: Array<{
        name: string;
        pages: number[];
        conf: 'high' | 'low';
      }>;
    }>;
  };
};

/**
 * Reducto Upload API response
 */
export type ReductoUploadResponse = {
  file_id: string;
  presigned_url?: string;
};

/**
 * Job status for async operations
 */
export type ReductoJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Async job response
 */
export type ReductoJobResponse<T = unknown> = {
  job_id: string;
  status: ReductoJobStatus;
  result?: T;
  error?: string;
};

// ============================================================================
// Usage and Cost Types
// ============================================================================

/**
 * Credit usage with USD estimate
 */
export type ReductoUsage = {
  /** Credits consumed */
  credits: number;
  /** Estimated USD cost (credits × $0.004) */
  estimatedUSD: number;
  /** Number of pages processed */
  numPages: number;
};

/**
 * Credit rates per operation
 */
export const REDUCTO_CREDIT_RATES = {
  parse: { standard: 1, agentic: 2 },
  extract: { standard: 2, agentic: 4 },
  split: { standard: 2, agentic: 2 },
  text_formats: 0.5,  // HTML, TXT
} as const;

/**
 * USD per credit (based on $20 for 5000 credits)
 */
export const USD_PER_CREDIT = 0.004;
