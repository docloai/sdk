/**
 * Extend.ai Provider Types
 *
 * Types and interfaces for the Extend.ai document processing API.
 */

// =============================================================================
// API Configuration
// =============================================================================

/** Extend API version - required for all requests */
export const EXTEND_API_VERSION = '2025-04-21';

/** Default API endpoint */
export const EXTEND_API_ENDPOINT = 'https://api.extend.ai';

/** Base options for all Extend providers */
export interface ExtendBaseOptions {
  /** Extend API key */
  apiKey: string;
  /** Custom API endpoint (optional, defaults to https://api.extend.ai) */
  endpoint?: string;
  /** API version (optional, defaults to latest) */
  apiVersion?: string;
  /** Request timeout in ms (optional, defaults to 120000) */
  timeout?: number;
}

// =============================================================================
// Parse Provider
// =============================================================================

export interface ExtendParseOptions extends ExtendBaseOptions {
  /** Processor ID for the parser */
  processorId?: string;
  /** Run synchronously (only for small documents <5min processing time) */
  sync?: boolean;
}

// =============================================================================
// Extract Provider
// =============================================================================

export interface ExtendExtractOptions extends ExtendBaseOptions {
  /** Processor ID for the extractor */
  processorId: string;
  /** Enable citations with bounding boxes */
  citationsEnabled?: boolean;
  /** Run synchronously (only for small documents <5min processing time) */
  sync?: boolean;
}

/** Extend-specific schema extensions */
export interface ExtendSchemaField {
  /** Custom type annotation for special handling */
  'extend:type'?: 'date' | 'currency' | 'signature';
  /** Descriptions for enum options (improves extraction accuracy) */
  'extend:descriptions'?: string[];
}

/** Currency value structure returned by Extend */
export interface ExtendCurrencyValue {
  amount: number;
  currency: string;  // ISO 4217 currency code
}

/** Signature detection result */
export interface ExtendSignatureValue {
  detected: boolean;
  confidence?: number;
}

// =============================================================================
// Classify Provider
// =============================================================================

export interface ExtendClassifyOptions extends ExtendBaseOptions {
  /** Processor ID for the classifier */
  processorId: string;
  /** Custom prompt for classification guidance */
  prompt?: string;
  /** Run synchronously (only for small documents <5min processing time) */
  sync?: boolean;
}

/** Classification definition */
export interface ExtendClassification {
  /** Unique identifier for this classification */
  id: string;
  /** Classification type/category */
  type: string;
  /** Human-readable label */
  label: string;
  /** Optional description for better classification */
  description?: string;
}

// =============================================================================
// Split Provider
// =============================================================================

export interface ExtendSplitOptions extends ExtendBaseOptions {
  /** Processor ID for the splitter */
  processorId: string;
  /** Split classifications (sub-document types) */
  classifications?: ExtendSplitClassification[];
  /** Split method - tradeoff between accuracy and speed */
  splitMethod?: 'high_precision' | 'fast';
  /** Custom prompt for splitting guidance */
  prompt?: string;
  /** Run synchronously (only for small documents <5min processing time) */
  sync?: boolean;
}

/** Split classification for sub-document types */
export interface ExtendSplitClassification {
  /** Unique identifier */
  id: string;
  /** Classification type */
  type: string;
  /** Human-readable label */
  label: string;
  /** Optional description */
  description?: string;
}

// =============================================================================
// Processor Types
// =============================================================================

/** Processor type (API uses uppercase) */
export type ExtendProcessorTypeAPI = 'EXTRACT' | 'CLASSIFY' | 'SPLITTER';

/** Processor type (normalized lowercase) */
export type ExtendProcessorType = 'extractor' | 'classifier' | 'splitter';

/** Options for creating a new processor */
export interface CreateProcessorOptions {
  /** Processor name */
  name: string;
  /** Processor type */
  type: ExtendProcessorTypeAPI;
  /** Processor configuration (required unless cloning) */
  config?: ExtractorConfig | ClassifierConfig | SplitterConfig;
  /** Clone from existing processor ID (alternative to config) */
  cloneProcessorId?: string;
}

/** Configuration for extraction processors */
export interface ExtractorConfig {
  /** Must be 'EXTRACT' - API requires type in config */
  type: 'EXTRACT';
  /** Base processor model */
  baseProcessor?: 'extraction_performance' | 'extraction_light';
  /** JSON Schema for extraction */
  schema?: Record<string, unknown>;
  /** Array of field definitions (alternative to schema) */
  fields?: ExtractorField[];
  /** Custom extraction rules/instructions */
  extractionRules?: string;
  /** Advanced options */
  advancedOptions?: Record<string, unknown>;
}

/** Field definition for extraction */
export interface ExtractorField {
  /** Field name */
  name: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'date' | 'currency' | 'signature' | 'array' | 'object';
  /** Field description */
  description?: string;
  /** Whether field is required */
  required?: boolean;
  /** Nested fields (for object/array types) */
  fields?: ExtractorField[];
}

/** Configuration for classification processors */
export interface ClassifierConfig {
  /** Must be 'CLASSIFY' - API requires type in config */
  type: 'CLASSIFY';
  /** Classification categories */
  classifications: ClassificationDefinition[];
  /** Base processor model */
  baseProcessor?: 'classification_performance' | string;
  /** Custom classification rules/instructions */
  classificationRules?: string;
  /** Advanced options */
  advancedOptions?: Record<string, unknown>;
}

/** Classification definition for classifier/splitter */
export interface ClassificationDefinition {
  /** Unique identifier */
  id: string;
  /** Classification type */
  type: string;
  /** Description to help the model */
  description: string;
}

/** Configuration for splitter processors */
export interface SplitterConfig {
  /** Must be 'SPLITTER' - API requires type in config */
  type: 'SPLITTER';
  /** Split classifications (document section types) */
  splitClassifications: ClassificationDefinition[];
  /** Split method */
  splitMethod?: 'high_precision' | 'fast';
  /** Custom split rules/instructions */
  splitRules?: string;
  /** Advanced options */
  advancedOptions?: Record<string, unknown>;
}

/** Processor definition returned from API */
export interface ExtendProcessor {
  /** Processor ID */
  id: string;
  /** Object type */
  object: 'processor';
  /** Processor name */
  name: string;
  /** Processor type */
  type: ExtendProcessorType;
  /** Optional description */
  description?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Published version ID (if published) */
  publishedVersionId?: string;
  /** Schema for extraction (for extractors) */
  schema?: Record<string, unknown>;
  /** Classifications (for classifiers and splitters) */
  classifications?: ExtendClassification[];
}

// =============================================================================
// API Response Types
// =============================================================================

/** Processor run status */
export type ExtendRunStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'REJECTED'
  | 'PROCESSED'
  | 'FAILED';

/** Base response for all Extend API calls */
export interface ExtendApiResponse {
  success: boolean;
  error?: string;
}

/** File upload response */
export interface ExtendFileUploadResponse extends ExtendApiResponse {
  fileId: string;
}

/** Processor run response */
export interface ExtendProcessorRunResponse extends ExtendApiResponse {
  /** Run ID - API may return as 'id' or 'runId' */
  id: string;
  /** Alias for id for backward compatibility */
  runId: string;
  status: ExtendRunStatus;
  processorId: string;
}

/** Get processor run response */
export interface ExtendProcessorRunResult<T = unknown> extends ExtendApiResponse {
  runId: string;
  status: ExtendRunStatus;
  processorId: string;
  /** Extracted value (when status is PROCESSED) */
  value?: T;
  /** Metadata including citations and confidence */
  metadata?: ExtendOutputMetadata;
  /** Error message (when status is FAILED) */
  error?: string;
}

/** Output metadata structure */
export interface ExtendOutputMetadata {
  /** Per-field confidence scores (0-1) */
  confidence?: Record<string, number>;
  /** Citations with bounding polygons */
  citations?: ExtendCitation[];
}

/** Citation with bounding polygon */
export interface ExtendCitation {
  /** Field path in the extracted JSON */
  fieldPath: string;
  /** Reference text from the document */
  referenceText: string;
  /** Bounding polygon coordinates [[x,y], ...] */
  polygon?: Array<[number, number]>;
  /** Page number (1-indexed) */
  page?: number;
}

// =============================================================================
// Parse-specific Types
// =============================================================================

/** Parse result from the /parse endpoint (synchronous) */
export interface ExtendParseResult {
  /** Object type */
  object: 'parser_run';
  /** Parser run ID */
  id: string;
  /** File ID */
  fileId: string;
  /** Run status */
  status: ExtendRunStatus;
  /** Processing metrics */
  metrics: {
    pageCount: number;
    processingTimeMs: number;
  };
  /** Usage/credits consumed */
  usage?: {
    credits: number;
  };
  /** Parsed chunks */
  chunks: ExtendParseChunk[];
}

/** Parse chunk structure */
export interface ExtendParseChunk {
  /** Chunk ID */
  id: string;
  /** Object type */
  object: 'chunk';
  /** Chunk type (e.g., 'page') */
  type: string;
  /** Markdown content */
  content: string;
  /** Chunk metadata */
  metadata: {
    pageRange?: {
      start: number;
      end: number;
    };
  };
  /** Blocks within this chunk */
  blocks?: ExtendParseBlock[];
}

/** Parse block structure */
export interface ExtendParseBlock {
  /** Block ID */
  id: string;
  /** Object type */
  object: 'block';
  /** Block type (heading, text, table, etc.) */
  type: 'heading' | 'section_heading' | 'text' | 'table' | string;
  /** Block content */
  content: string;
  /** Bounding polygon */
  polygon?: Array<{ x: number; y: number }>;
  /** Bounding box */
  boundingBox?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  /** Metadata */
  metadata?: {
    page?: {
      number: number;
      width: number;
      height: number;
    };
  };
  /** Table details (for table blocks) */
  details?: {
    type?: 'table_details';
    rowCount?: number;
    columnCount?: number;
  };
}

/** Parse output structure (legacy/simplified) */
export interface ExtendParseOutput {
  /** Extracted markdown content */
  markdown: string;
  /** Page-level content */
  pages?: Array<{
    pageNumber: number;
    markdown: string;
  }>;
}

// =============================================================================
// Classify-specific Types
// =============================================================================

/** Classification output structure */
export interface ExtendClassifyOutput {
  /** Detected category/classification */
  classification: string;
  /** Classification ID */
  classificationId: string;
  /** Confidence score (0-1) */
  confidence: number;
}

// =============================================================================
// Split-specific Types
// =============================================================================

/** Split output structure */
export interface ExtendSplitOutput {
  /** Split segments */
  segments: ExtendSplitSegment[];
  /** Total pages in original document */
  totalPages: number;
}

/** Individual split segment */
export interface ExtendSplitSegment {
  /** Segment classification ID */
  classificationId: string;
  /** Segment classification type */
  classificationType: string;
  /** Page range [start, end] (1-indexed, inclusive) */
  pageRange: [number, number];
  /** Confidence score (0-1) */
  confidence: number;
}

// =============================================================================
// Workflow Types
// =============================================================================

export interface ExtendWorkflowOptions extends ExtendBaseOptions {
  /** Workflow ID */
  workflowId: string;
}

/** Workflow run status */
export type ExtendWorkflowStatus = ExtendRunStatus;

/** Workflow run result */
export interface ExtendWorkflowRunResult extends ExtendApiResponse {
  workflowRunId: string;
  status: ExtendWorkflowStatus;
  /** Outputs from each processor in the workflow */
  outputs?: Record<string, unknown>;
}

// =============================================================================
// Webhook Types
// =============================================================================

/** Webhook event types */
export type ExtendWebhookEventType =
  | 'processor.run.completed'
  | 'processor.run.failed'
  | 'processor.run.needs_review'
  | 'workflow.run.completed'
  | 'workflow.run.failed';

/** Webhook payload format */
export type ExtendWebhookPayloadFormat = 'json' | 'signed_download_url';

/** Webhook event payload */
export interface ExtendWebhookEvent {
  eventType: ExtendWebhookEventType;
  timestamp: string;
  data: {
    runId: string;
    status: ExtendRunStatus;
    processorId?: string;
    workflowId?: string;
  };
}
