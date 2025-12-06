import type { VLMProvider, MultimodalInput, ProcessingMode, ProviderCitation, SegmentationResult, ProviderIdentity, ReasoningConfig } from "@docloai/core";
import { isLocalEndpoint } from "@docloai/core";
import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize, safeJsonParse } from "@docloai/core/security";
import { base64ToArrayBuffer } from "@docloai/core/runtime/base64";
import type { OCRPollingConfig } from "./types.js";

/**
 * Options for the Marker VLM provider
 */
export type MarkerVLMOptions = {
  apiKey: string;
  endpoint?: string;
  // Existing
  force_ocr?: boolean;
  // New - High Priority
  /** Processing quality/speed tradeoff: 'fast', 'balanced', or 'high_accuracy' */
  mode?: ProcessingMode;
  /** Process only the first N pages */
  maxPages?: number;
  /** Specific page range (0-indexed), e.g., "0,2-4,10" */
  pageRange?: string;
  // New - Medium Priority
  /** ISO language codes for OCR, e.g., ['en', 'de', 'fr'] */
  langs?: string[];
  /** Additional instructions for block correction (prompt) */
  blockCorrectionPrompt?: string;
  /** Polling configuration for async OCR jobs */
  polling?: OCRPollingConfig;
};

/**
 * Extended completeJson input with VLM-specific options
 */
export type MarkerVLMCompleteInput = {
  prompt: string | MultimodalInput;
  schema: object;
  max_tokens?: number;
  reasoning?: ReasoningConfig;
  // Pass-through options (override provider-level defaults)
  mode?: ProcessingMode;
  maxPages?: number;
  pageRange?: string;
  langs?: string[];
  /** Additional prompt/instructions for extraction */
  additionalPrompt?: string;
  /** Schema for auto-segmentation of multi-document PDFs */
  segmentationSchema?: object;
};

/**
 * Extended response with citations and segmentation
 */
export type MarkerVLMResult = {
  json: unknown;
  rawText?: string;
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /** Field-level citations from Datalab */
  citations?: ProviderCitation[];
  /** Segmentation results for multi-document PDFs */
  segmentation?: SegmentationResult;
};

/**
 * Create a VLM provider using Datalab Marker (with LLM-powered structured extraction)
 * Cost: $0.006 per page (high_accuracy mode)
 */
export function markerVLMProvider(opts: MarkerVLMOptions): VLMProvider {
  const endpoint = opts.endpoint || 'https://www.datalab.to/api/v1/marker';

  // Determine method based on endpoint (self-hosted vs native API)
  const method = isLocalEndpoint(endpoint) ? 'self-hosted' : 'native';

  const identity: ProviderIdentity = {
    provider: 'datalab',
    model: 'marker-vlm',
    method
  };

  return {
    identity,
    name: "datalab:marker-vlm",
    capabilities: {
      supportsImages: true,
      supportsPDFs: true
    },
    async completeJson(input: MarkerVLMCompleteInput): Promise<MarkerVLMResult> {
      // Extract document from multimodal input
      let fileBuffer: ArrayBuffer;
      let filename: string;

      if (typeof input.prompt === 'string') {
        throw new Error('Marker VLM requires image/PDF input, not text prompt');
      }

      const multimodal = input.prompt as MultimodalInput;

      // Get file from images or PDFs
      let dataUrl: string | undefined;

      if (multimodal.images && multimodal.images.length > 0) {
        dataUrl = multimodal.images[0].base64 || multimodal.images[0].url;
      } else if (multimodal.pdfs && multimodal.pdfs.length > 0) {
        dataUrl = multimodal.pdfs[0].base64 || multimodal.pdfs[0].url;
      }

      if (!dataUrl) {
        throw new Error('Marker VLM requires image or PDF input');
      }

      // Fetch or decode the file
      if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        validateUrl(dataUrl);  // SSRF protection
        const fileResp = await fetchWithTimeout(dataUrl, {}, DEFAULT_LIMITS.REQUEST_TIMEOUT);
        if (!fileResp.ok) throw new Error(`Failed to fetch file from URL: ${fileResp.status}`);
        fileBuffer = await fileResp.arrayBuffer();
        filename = dataUrl.split('/').pop() || 'document.pdf';
      } else {
        // Base64 data URL
        const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '');
        // Validate base64 size before decoding
        const estimatedSize = (base64Data.length * 3) / 4;
        validateFileSize(estimatedSize, DEFAULT_LIMITS.MAX_FILE_SIZE);
        fileBuffer = base64ToArrayBuffer(base64Data);

        // Detect filename from MIME type
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch?.[1] || 'application/pdf';
        filename = mimeType.includes('pdf') ? 'document.pdf' : 'document.jpg';
      }

      // Determine MIME type
      const getMimeType = (name: string): string => {
        if (name.endsWith('.pdf')) return 'application/pdf';
        if (name.endsWith('.png')) return 'image/png';
        if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
        if (name.endsWith('.webp')) return 'image/webp';
        return 'application/pdf';
      };

      // Create multipart form data
      const formData = new FormData();
      const mimeType = getMimeType(filename);
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('file', blob, filename);

      // Marker-specific parameters for structured extraction
      formData.append('output_format', 'json');
      formData.append('force_ocr', String(opts.force_ocr ?? true));
      formData.append('use_llm', 'true');  // Enable LLM extraction

      // Add schema as page_schema parameter
      formData.append('page_schema', JSON.stringify(input.schema));

      // New options - High Priority (input options override provider-level opts)
      // Map normalized mode to Datalab API mode (high_accuracy -> accurate)
      const mode = input.mode || opts.mode;
      if (mode) {
        const datalabMode = mode === 'high_accuracy' ? 'accurate' : mode;
        formData.append('mode', datalabMode);
      }
      const maxPages = input.maxPages ?? opts.maxPages;
      if (maxPages !== undefined) {
        formData.append('max_pages', String(maxPages));
      }
      const pageRange = input.pageRange || opts.pageRange;
      if (pageRange) {
        formData.append('page_range', pageRange);
      }

      // New options - Medium Priority
      const langs = input.langs || opts.langs;
      if (langs && langs.length > 0) {
        formData.append('langs', langs.join(','));
      }

      // Block correction prompt (additional instructions)
      const blockPrompt = input.additionalPrompt || opts.blockCorrectionPrompt;
      if (blockPrompt) {
        formData.append('block_correction_prompt', blockPrompt);
      }

      // Segmentation schema for multi-document PDFs
      if (input.segmentationSchema) {
        formData.append('segmentation_schema', JSON.stringify(input.segmentationSchema));
      }

      // Submit request
      const startTime = Date.now();
      const resp = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "X-API-Key": opts.apiKey
        },
        body: formData
      }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '');
        throw new Error(`Marker API request failed: ${resp.status} ${errorText}`);
      }

      const result = await resp.json() as {
        request_id?: string;
        request_check_url?: string;
        status?: string;
        [key: string]: any;
      };

      // Poll for completion
      let finalResult = result;
      if (result.request_check_url) {
        finalResult = await pollForCompletion(result.request_check_url, opts.apiKey, opts.polling);
      }

      const durationMs = Date.now() - startTime;

      // Extract structured data from response
      const pageCount = finalResult.page_count || 0;

      // Cost depends on mode: fast=$0.002, balanced=$0.004, high_accuracy=$0.006 per page
      const effectiveMode = input.mode || opts.mode || 'high_accuracy';  // VLM defaults to high_accuracy
      const costPerPage = effectiveMode === 'fast' ? 0.002
        : effectiveMode === 'high_accuracy' ? 0.006
        : 0.004;  // balanced
      const costUSD = pageCount * costPerPage;

      // Get extraction_schema_json (returned as string)
      const extractionSchemaStr = finalResult.extraction_schema_json;
      if (!extractionSchemaStr) {
        throw new Error('Marker did not return extraction_schema_json');
      }

      // Parse the JSON string safely
      const extractedData = typeof extractionSchemaStr === 'string'
        ? safeJsonParse(extractionSchemaStr)
        : extractionSchemaStr;

      // Parse citations from response (Datalab returns [field]_citations arrays)
      const citations: ProviderCitation[] = [];
      if (extractedData && typeof extractedData === 'object') {
        for (const [key, value] of Object.entries(extractedData as Record<string, unknown>)) {
          if (key.endsWith('_citations') && Array.isArray(value)) {
            const fieldPath = key.replace('_citations', '');
            citations.push({
              fieldPath,
              blockIds: value as string[]
            });
          }
        }
      }

      // Parse segmentation results if present
      let segmentation: SegmentationResult | undefined;
      if (finalResult.segmentation_results && Array.isArray(finalResult.segmentation_results)) {
        segmentation = {
          segments: finalResult.segmentation_results.map((seg: any) => ({
            name: seg.document_type || seg.name || 'unknown',
            pages: seg.pages || [],
            confidence: seg.confidence || 'medium'
          })),
          metadata: {
            totalPages: pageCount,
            segmentationMethod: input.segmentationSchema ? 'schema' : 'auto'
          }
        };
      }

      return {
        json: extractedData,
        costUSD,
        inputTokens: undefined,  // Marker doesn't provide token counts
        outputTokens: undefined,
        citations: citations.length > 0 ? citations : undefined,
        segmentation
      };
    }
  };
}

/**
 * Segment a "stapled" PDF into individual documents
 * Returns page boundaries for each detected document type
 *
 * @example
 * ```typescript
 * // Auto-detect document types
 * const result = await segmentDocument(
 *   { base64: pdfData },
 *   { apiKey: process.env.DATALAB_API_KEY! }
 * );
 *
 * // Process each segment separately
 * for (const segment of result.segments) {
 *   console.log(`${segment.name}: pages ${segment.pages.join(',')}`);
 * }
 * ```
 */
export async function segmentDocument(
  input: { url?: string; base64?: string },
  opts: {
    apiKey: string;
    endpoint?: string;
    /** Custom segmentation schema or {} for auto-detect */
    segmentationSchema?: object;
    /** Processing mode */
    mode?: ProcessingMode;
    /** Polling configuration for async OCR jobs */
    polling?: OCRPollingConfig;
  }
): Promise<SegmentationResult> {
  const endpoint = opts.endpoint || 'https://www.datalab.to/api/v1/marker';

  // Fetch or decode the file
  let fileBuffer: ArrayBuffer;
  let filename: string;

  if (input.url) {
    validateUrl(input.url);
    const fileResp = await fetchWithTimeout(input.url, {}, DEFAULT_LIMITS.REQUEST_TIMEOUT);
    if (!fileResp.ok) throw new Error(`Failed to fetch file from URL: ${fileResp.status}`);
    fileBuffer = await fileResp.arrayBuffer();
    filename = input.url.split('/').pop() || 'document.pdf';
  } else if (input.base64) {
    const base64Data = input.base64.replace(/^data:[^;]+;base64,/, '');
    const estimatedSize = (base64Data.length * 3) / 4;
    validateFileSize(estimatedSize, DEFAULT_LIMITS.MAX_FILE_SIZE);
    fileBuffer = base64ToArrayBuffer(base64Data);
    filename = 'document.pdf';
  } else {
    throw new Error('Either url or base64 must be provided');
  }

  // Create multipart form data
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('file', blob, filename);

  // Segmentation-specific parameters
  formData.append('output_format', 'json');
  formData.append('use_llm', 'true');

  // Add segmentation schema (empty object triggers auto-detection)
  const schema = opts.segmentationSchema || {};
  formData.append('segmentation_schema', JSON.stringify(schema));

  // Map normalized mode to Datalab API mode (high_accuracy -> accurate)
  if (opts.mode) {
    const datalabMode = opts.mode === 'high_accuracy' ? 'accurate' : opts.mode;
    formData.append('mode', datalabMode);
  }

  // Submit request
  const resp = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'X-API-Key': opts.apiKey },
    body: formData
  }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(`Marker API request failed: ${resp.status} ${errorText}`);
  }

  const result = await resp.json() as {
    request_check_url?: string;
    [key: string]: any;
  };

  // Poll for completion
  let finalResult = result;
  if (result.request_check_url) {
    finalResult = await pollForCompletion(result.request_check_url, opts.apiKey, opts.polling);
  }

  // Parse segmentation results
  const pageCount = finalResult.page_count || 0;

  if (!finalResult.segmentation_results || !Array.isArray(finalResult.segmentation_results)) {
    // Return single segment covering all pages if no segmentation detected
    return {
      segments: [{
        name: 'document',
        pages: Array.from({ length: pageCount }, (_, i) => i),
        confidence: 'high'
      }],
      metadata: {
        totalPages: pageCount,
        segmentationMethod: opts.segmentationSchema ? 'schema' : 'auto'
      }
    };
  }

  return {
    segments: finalResult.segmentation_results.map((seg: any) => ({
      name: seg.document_type || seg.name || 'unknown',
      pages: seg.pages || [],
      confidence: seg.confidence || 'medium'
    })),
    metadata: {
      totalPages: pageCount,
      segmentationMethod: opts.segmentationSchema ? 'schema' : 'auto'
    }
  };
}

async function pollForCompletion(
  checkUrl: string,
  apiKey: string,
  polling?: OCRPollingConfig
): Promise<any> {
  const maxAttempts = polling?.maxAttempts ?? 60;
  const pollingInterval = polling?.pollingInterval ?? 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollingInterval));

    const resp = await fetchWithTimeout(checkUrl, {
      headers: { "X-API-Key": apiKey }
    }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

    if (!resp.ok) throw new Error(`Polling failed: ${resp.status}`);

    const data = await resp.json();

    if (data.status === 'complete' || data.status === 'completed') {
      return data;
    }

    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(`Marker processing failed: ${data.error || 'Unknown error'}`);
    }
  }

  throw new Error('Marker processing timeout - exceeded maximum polling attempts');
}
