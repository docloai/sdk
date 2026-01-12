/**
 * Extend.ai API Client
 *
 * HTTP client for interacting with the Extend.ai API.
 * Handles authentication, API versioning, and async job polling.
 */

import {
  EXTEND_API_ENDPOINT,
  EXTEND_API_VERSION,
  type CreateProcessorOptions,
  type ExtendApiResponse,
  type ExtendFileUploadResponse,
  type ExtendProcessor,
  type ExtendProcessorRunResponse,
  type ExtendProcessorRunResult,
  type ExtendRunStatus,
  type ExtendParseResult,
} from './types.js';

const DEBUG = process.env.DEBUG_PROVIDERS === 'true';

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[extend]', ...args);
  }
}

export interface ExtendClientOptions {
  apiKey: string;
  endpoint?: string;
  apiVersion?: string;
  timeout?: number;
}

export class ExtendApiClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly timeout: number;

  constructor(options: ExtendClientOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? EXTEND_API_ENDPOINT;
    this.apiVersion = options.apiVersion ?? EXTEND_API_VERSION;
    this.timeout = options.timeout ?? 120000;
  }

  /**
   * Make an authenticated request to the Extend API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown> | FormData
  ): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'x-extend-api-version': this.apiVersion,
    };

    // Don't set Content-Type for FormData (browser/node will set it with boundary)
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      debug(`${method} ${path}`);

      const response = await fetch(url, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }
        throw new Error(`Extend API error (${response.status}): ${errorMessage}`);
      }

      const data = await response.json();
      debug('Response:', JSON.stringify(data).slice(0, 200));
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Extend API request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  // ===========================================================================
  // File Operations
  // ===========================================================================

  /**
   * Upload a file to Extend
   * Uses JSON body with name, base64, and mediaType
   */
  async uploadFile(
    content: Buffer | Blob,
    filename: string,
    mimeType: string
  ): Promise<ExtendFileUploadResponse> {
    let base64Data: string;

    if (Buffer.isBuffer(content)) {
      base64Data = content.toString('base64');
    } else {
      // Convert Blob to base64
      const arrayBuffer = await content.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
    }

    const body = {
      name: filename,
      base64: base64Data,
      mediaType: mimeType,
    };

    const response = await this.request<{ file: { id: string } }>('POST', '/files', body);
    return { fileId: response.file.id, success: true };
  }

  /**
   * Upload a file from base64
   */
  async uploadFileFromBase64(
    base64: string,
    filename: string,
    mimeType: string
  ): Promise<ExtendFileUploadResponse> {
    const buffer = Buffer.from(base64, 'base64');
    return this.uploadFile(buffer, filename, mimeType);
  }

  // ===========================================================================
  // Processor Management
  // ===========================================================================

  /**
   * List all processors in the workspace
   */
  async listProcessors(): Promise<ExtendProcessor[]> {
    const response = await this.request<{ processors: ExtendProcessor[] }>('GET', '/processors');
    return response.processors;
  }

  /**
   * Get a specific processor by ID
   */
  async getProcessor(processorId: string): Promise<ExtendProcessor> {
    const response = await this.request<{ processor: ExtendProcessor }>('GET', `/processors/${processorId}`);
    return response.processor;
  }

  /**
   * Create a new processor
   *
   * @example
   * ```typescript
   * // Create an extractor with JSON schema
   * const extractor = await client.createProcessor({
   *   name: 'Invoice Extractor',
   *   type: 'EXTRACT',
   *   config: {
   *     baseProcessor: 'extraction_performance',
   *     schema: {
   *       type: 'object',
   *       properties: {
   *         invoice_number: { type: 'string' },
   *         total: { type: 'number' },
   *         date: { type: 'string', 'extend:type': 'date' }
   *       }
   *     }
   *   }
   * });
   *
   * // Create a classifier
   * const classifier = await client.createProcessor({
   *   name: 'Document Classifier',
   *   type: 'CLASSIFY',
   *   config: {
   *     classifications: [
   *       { id: 'invoice', type: 'invoice', description: 'Invoice documents' },
   *       { id: 'receipt', type: 'receipt', description: 'Receipt documents' }
   *     ]
   *   }
   * });
   *
   * // Create a splitter
   * const splitter = await client.createProcessor({
   *   name: 'Document Splitter',
   *   type: 'SPLITTER',
   *   config: {
   *     splitClassifications: [
   *       { id: 'invoice', type: 'invoice', description: 'Invoice section' },
   *       { id: 'contract', type: 'contract', description: 'Contract section' }
   *     ]
   *   }
   * });
   *
   * // Clone an existing processor
   * const cloned = await client.createProcessor({
   *   name: 'My Cloned Processor',
   *   type: 'EXTRACT',
   *   cloneProcessorId: 'dp_existing_processor_id'
   * });
   * ```
   */
  async createProcessor(options: CreateProcessorOptions): Promise<ExtendProcessor> {
    const body: Record<string, unknown> = {
      name: options.name,
      type: options.type,
    };

    if (options.cloneProcessorId) {
      body.cloneProcessorId = options.cloneProcessorId;
    } else if (options.config) {
      body.config = options.config;
    } else {
      throw new Error('Either config or cloneProcessorId must be provided');
    }

    const response = await this.request<{ processor: ExtendProcessor }>('POST', '/processors', body);
    return response.processor;
  }

  /**
   * Delete a processor
   */
  async deleteProcessor(processorId: string): Promise<void> {
    await this.request<{ success: boolean }>('DELETE', `/processors/${processorId}`);
  }

  // ===========================================================================
  // Processor Execution
  // ===========================================================================

  /**
   * Run a processor on a file
   */
  async runProcessor(
    processorId: string,
    options: {
      fileId?: string;
      fileUrl?: string;
      sync?: boolean;
      config?: Record<string, unknown>;
    }
  ): Promise<ExtendProcessorRunResponse> {
    // Build file object - Extend API expects file: { fileId } or file: { fileUrl }
    const file: Record<string, string> = {};
    if (options.fileId) {
      file.fileId = options.fileId;
    } else if (options.fileUrl) {
      file.fileUrl = options.fileUrl;
    } else {
      throw new Error('Either fileId or fileUrl must be provided');
    }

    const body: Record<string, unknown> = {
      processorId,
      file,
    };

    if (options.config) {
      body.config = options.config;
    }

    // Response is wrapped in processorRun object
    const response = await this.request<{ processorRun: ExtendProcessorRunResponse & { id?: string } }>('POST', '/processor_runs', body);
    const run = response.processorRun;
    // Normalize: API may return 'id' instead of 'runId'
    return {
      ...run,
      id: run.id || run.runId,
      runId: run.runId || run.id,
    };
  }

  /**
   * Get processor run status and result
   */
  async getProcessorRun<T = unknown>(runId: string): Promise<ExtendProcessorRunResult<T>> {
    // Response is wrapped in processorRun object, similar to runProcessor
    const response = await this.request<{
      success?: boolean;
      processorRun: ExtendProcessorRunResult<T> & { id?: string; output?: T };
    }>('GET', `/processor_runs/${runId}`);
    const run = response.processorRun;
    // Normalize: API may return 'id' instead of 'runId', and 'output' instead of 'value'
    return {
      ...run,
      runId: run.runId || run.id || runId,
      value: run.value ?? run.output,
    };
  }

  /**
   * Poll for processor run completion
   */
  async pollProcessorRun<T = unknown>(
    runId: string,
    options?: {
      pollInterval?: number;
      maxAttempts?: number;
    }
  ): Promise<ExtendProcessorRunResult<T>> {
    const pollInterval = options?.pollInterval ?? 2000;
    const maxAttempts = options?.maxAttempts ?? 150; // 5 minutes at 2s intervals

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await this.getProcessorRun<T>(runId);

      debug(`Poll attempt ${attempt + 1}: status=${result.status}`);

      // Terminal states
      if (result.status === 'PROCESSED' || result.status === 'FAILED' || result.status === 'REJECTED') {
        return result;
      }

      // Non-terminal but actionable
      if (result.status === 'NEEDS_REVIEW') {
        // For SDK purposes, treat NEEDS_REVIEW as a terminal state
        // The application can decide how to handle this
        return result;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Processor run ${runId} did not complete within ${maxAttempts * pollInterval}ms`);
  }

  // ===========================================================================
  // Parse Operations
  // ===========================================================================

  /**
   * Parse a file to extract text/markdown
   * Returns a sync response with chunks when parsing completes
   */
  async parse(options: {
    fileId?: string;
    fileUrl?: string;
    sync?: boolean;
  }): Promise<ExtendParseResult> {
    // Build file object - Extend API expects file: { fileId } or file: { fileUrl }
    const file: Record<string, string> = {};
    if (options.fileId) {
      file.fileId = options.fileId;
    } else if (options.fileUrl) {
      file.fileUrl = options.fileUrl;
    } else {
      throw new Error('Either fileId or fileUrl must be provided');
    }

    const body: Record<string, unknown> = { file };

    return this.request<ExtendParseResult>('POST', '/parse', body);
  }

  /**
   * Parse a file asynchronously and get the result
   */
  async parseAsync(options: {
    fileId?: string;
    fileUrl?: string;
  }): Promise<{ runId: string }> {
    return this.request<{ runId: string }>('POST', '/parse/async', options);
  }

  /**
   * Get parse run result
   */
  async getParseRun<T = unknown>(runId: string): Promise<ExtendProcessorRunResult<T>> {
    return this.request<ExtendProcessorRunResult<T>>('GET', `/parse/${runId}`);
  }

  // ===========================================================================
  // Workflow Operations
  // ===========================================================================

  /**
   * Run a workflow on a file
   */
  async runWorkflow(
    workflowId: string,
    options: {
      fileId?: string;
      fileUrl?: string;
      sync?: boolean;
    }
  ): Promise<{ workflowRunId: string; status: ExtendRunStatus }> {
    const body: Record<string, unknown> = {
      workflowId,
      sync: options.sync ?? false,
    };

    if (options.fileId) {
      body.fileId = options.fileId;
    } else if (options.fileUrl) {
      body.fileUrl = options.fileUrl;
    }

    return this.request('POST', '/workflow_runs', body);
  }

  /**
   * Get workflow run status and outputs
   */
  async getWorkflowRun(workflowRunId: string): Promise<{
    workflowRunId: string;
    status: ExtendRunStatus;
    outputs?: Record<string, unknown>;
  }> {
    return this.request('GET', `/workflow_runs/${workflowRunId}`);
  }

  /**
   * Submit corrections for a workflow run output
   */
  async correctWorkflowOutput(
    workflowRunId: string,
    outputId: string,
    correctedOutput: Record<string, unknown>
  ): Promise<ExtendApiResponse> {
    return this.request('POST', `/workflow_runs/${workflowRunId}/outputs/${outputId}`, {
      correctedOutput,
    });
  }
}

/**
 * Helper to determine MIME type from filename extension
 */
export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    gif: 'image/gif',
    webp: 'image/webp',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Detect MIME type from file magic bytes (first few bytes of file)
 * Falls back to extension-based detection if magic bytes don't match
 */
export function detectMimeType(buffer: Buffer, filename: string): string {
  // Check magic bytes for common formats
  if (buffer.length >= 4) {
    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // GIF: GIF8
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return 'image/gif';
    }
    // RIFF/WebP: RIFF....WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'image/webp';
      }
    }
    // TIFF: 49 49 2A 00 (little-endian) or 4D 4D 00 2A (big-endian)
    if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
        (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)) {
      return 'image/tiff';
    }
  }

  // Fall back to extension-based detection
  return getMimeTypeFromFilename(filename);
}
