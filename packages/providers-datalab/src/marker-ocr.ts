import type { DocumentIR, OCRProvider, ProcessingMode, ExtractedImage, NormalizedBBox, ProviderIdentity } from "@doclo/core";
import { isLocalEndpoint, withRetry, createCircuitBreaker } from "@doclo/core";
import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize } from "@doclo/core/security";
import { base64ToArrayBuffer } from "@doclo/core/runtime/base64";
import type { OCRPollingConfig } from "./types.js";

/**
 * Options for the Marker OCR provider
 */
export type MarkerOCROptions = {
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
  /** Extract embedded images (figures/tables/charts). Set to false to disable. Default: true */
  extractImages?: boolean;
  /** Add page delimiters to markdown output */
  paginate?: boolean;
  /** Remove and redo existing OCR from scratch */
  stripExistingOCR?: boolean;
  /** Format lines in output */
  formatLines?: boolean;
  /** Polling configuration for async OCR jobs */
  polling?: OCRPollingConfig;
};

/**
 * Create an OCR provider using Datalab Marker (markdown conversion without LLM extraction)
 * Cost: $0.02 per page (fast), $0.04 per page (balanced), $0.06 per page (high_accuracy)
 */
export function markerOCRProvider(opts: MarkerOCROptions): OCRProvider {
  const endpoint = opts.endpoint || 'https://www.datalab.to/api/v1/marker';

  // Determine method based on endpoint (self-hosted vs native API)
  const method = isLocalEndpoint(endpoint) ? 'self-hosted' : 'native';

  const identity: ProviderIdentity = {
    provider: 'datalab',
    model: 'marker-ocr',
    method
  };

  return {
    identity,
    name: "datalab:marker-ocr",
    async parseToIR(input) {
      // Fetch the file from URL or decode base64
      let fileBuffer: ArrayBuffer;
      let filename: string;

      if (input.url) {
        validateUrl(input.url);  // SSRF protection
        const fileResp = await fetchWithTimeout(input.url, {}, DEFAULT_LIMITS.REQUEST_TIMEOUT);
        if (!fileResp.ok) throw new Error(`Failed to fetch file from URL: ${fileResp.status}`);
        fileBuffer = await fileResp.arrayBuffer();
        filename = input.url.split('/').pop() || 'document.pdf';
      } else if (input.base64) {
        const base64Data = input.base64.replace(/^data:[^;]+;base64,/, '');
        // Validate base64 size before decoding
        const estimatedSize = (base64Data.length * 3) / 4;
        validateFileSize(estimatedSize, DEFAULT_LIMITS.MAX_FILE_SIZE);
        fileBuffer = base64ToArrayBuffer(base64Data);

        // Detect filename from MIME type in data URL
        const mimeMatch = input.base64.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch?.[1] || 'application/pdf';
        filename = mimeType.includes('pdf') ? 'document.pdf' : 'document.jpg';
      } else {
        throw new Error('Either url or base64 must be provided');
      }

      // Determine MIME type from filename
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

      // Marker-specific parameters
      // Request both JSON (for structure) and markdown (for text)
      formData.append('output_format', 'json,markdown');
      formData.append('force_ocr', String(opts.force_ocr ?? true));
      formData.append('use_llm', 'false');  // OCR only, no extraction

      // New options - High Priority
      // Map normalized mode to Datalab API mode (high_accuracy -> accurate)
      if (opts.mode) {
        const datalabMode = opts.mode === 'high_accuracy' ? 'accurate' : opts.mode;
        formData.append('mode', datalabMode);
      }
      if (opts.maxPages !== undefined) {
        formData.append('max_pages', String(opts.maxPages));
      }
      if (opts.pageRange) {
        formData.append('page_range', opts.pageRange);
      }

      // New options - Medium Priority
      if (opts.langs && opts.langs.length > 0) {
        formData.append('langs', opts.langs.join(','));
      }
      if (opts.extractImages === false) {
        formData.append('disable_image_extraction', 'true');
      }
      if (opts.paginate) {
        formData.append('paginate', 'true');
      }
      if (opts.stripExistingOCR) {
        formData.append('strip_existing_ocr', 'true');
      }
      if (opts.formatLines) {
        formData.append('format_lines', 'true');
      }

      // Get circuit breaker for this provider
      const circuitBreaker = opts.polling?.threshold !== undefined
        ? createCircuitBreaker('datalab:marker-ocr', { threshold: opts.polling.threshold })
        : undefined;

      // Submit request with retry logic
      const result = await withRetry(
        async () => {
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

          return resp.json() as Promise<{
            request_id?: string;
            request_check_url?: string;
            status?: string;
            [key: string]: any;
          }>;
        },
        {
          maxRetries: opts.polling?.maxRetries ?? 0,
          retryDelay: opts.polling?.retryDelay ?? 1000,
          useExponentialBackoff: opts.polling?.useExponentialBackoff ?? true,
          circuitBreaker,
        }
      );

      // Poll for completion
      if (result.request_check_url) {
        const finalResult = await pollForCompletion(result.request_check_url, opts.apiKey, opts.polling);
        return parseMarkerResponse(finalResult, opts);
      }

      // If synchronous response
      return parseMarkerResponse(result, opts);
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

  // Get circuit breaker if configured
  const circuitBreaker = polling?.threshold !== undefined
    ? createCircuitBreaker('datalab:marker-ocr:polling', { threshold: polling.threshold })
    : undefined;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollingInterval));

    // Use retry for each polling request
    const data = await withRetry(
      async () => {
        const resp = await fetchWithTimeout(checkUrl, {
          headers: { "X-API-Key": apiKey }
        }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

        if (!resp.ok) {
          throw new Error(`Polling failed: ${resp.status}`);
        }

        return resp.json();
      },
      {
        maxRetries: polling?.maxRetries ?? 0,
        retryDelay: polling?.retryDelay ?? 1000,
        useExponentialBackoff: polling?.useExponentialBackoff ?? true,
        circuitBreaker,
      }
    );

    if (data.status === 'complete' || data.status === 'completed') {
      return data;
    }

    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(`Marker processing failed: ${data.error || 'Unknown error'}`);
    }
  }

  throw new Error('Marker processing timeout - exceeded maximum polling attempts');
}

function parseMarkerResponse(data: any, opts: MarkerOCROptions): DocumentIR {
  // Marker response format per https://documentation.datalab.to/docs/recipes/structured-extraction/api-overview
  const pageCount = data.page_count || 0;

  // Cost depends on mode: fast=$0.002, balanced=$0.004, high_accuracy=$0.006 per page
  const costPerPage = opts.mode === 'fast' ? 0.002
    : opts.mode === 'high_accuracy' ? 0.006
    : 0.004;  // balanced is default
  const markerCostUSD = pageCount * costPerPage;

  // Get markdown content - Marker returns full document markdown
  const fullMarkdown: string = data.markdown || '';

  // Get JSON structure with blocks for more detailed parsing
  const jsonData = data.json || {};
  const children = jsonData.children || [];

  // Try to split markdown by pages if possible
  // Marker doesn't always provide per-page markdown, so we'll do our best
  const pages: any[] = [];

  // Use the top-level fullMarkdown (Marker provides this, not per-block markdown)
  // Split into pages if we have page structure, otherwise use as single page
  if (fullMarkdown) {
    // Try to detect page breaks in markdown
    const pageBreakPattern = /\n---\n|\f/g;  // Common markdown page separators
    const markdownPages = fullMarkdown.split(pageBreakPattern);

    if (markdownPages.length > 1 && children.length > 0) {
      // We have multiple pages in markdown AND structured data
      // Try to align them
      for (let i = 0; i < markdownPages.length; i++) {
        const pageMarkdown = markdownPages[i].trim();
        if (!pageMarkdown) continue;

        const lines = pageMarkdown.split('\n').map(text => ({
          text,
          bbox: undefined
        }));

        pages.push({
          width: 612,
          height: 792,
          markdown: pageMarkdown,
          lines: lines.filter(l => l.text.trim())
        });
      }
    } else {
      // Single page or no clear page breaks - use full markdown as one page
      const lines = fullMarkdown.split('\n').map(text => ({
        text,
        bbox: undefined
      }));

      pages.push({
        width: 612,
        height: 792,
        markdown: fullMarkdown,
        lines: lines.filter(l => l.text.trim())
      });
    }
  } else if (children.length > 0) {
    // No markdown available, extract text from HTML blocks
    const lines = children.flatMap((block: any) => {
      const extractText = (b: any): string => {
        if (b.html) {
          // Strip HTML tags to get plain text
          return b.html.replace(/<[^>]*>/g, '');
        }
        return '';
      };

      const text = extractText(block);
      return text.split('\n').map((line: string) => ({
        text: line,
        bbox: block.bbox ? {
          x: block.bbox[0],
          y: block.bbox[1],
          w: block.bbox[2] - block.bbox[0],
          h: block.bbox[3] - block.bbox[1]
        } : undefined
      }));
    });

    pages.push({
      width: 612,
      height: 792,
      markdown: undefined,
      lines: lines.filter((l: any) => l.text.trim())
    });
  }

  // Parse extracted images (if not disabled)
  const images: ExtractedImage[] = [];
  if (data.images && opts.extractImages !== false) {
    for (const [id, base64Data] of Object.entries(data.images)) {
      // ID format: "/page/0/Figure/9" or similar
      const match = id.match(/\/page\/(\d+)\//);
      const pageNumber = match ? parseInt(match[1], 10) : 0;

      // Try to extract block type from ID (e.g., "Figure", "Table")
      const typeMatch = id.match(/\/page\/\d+\/(\w+)\//);
      const blockType = typeMatch?.[1] || 'Image';

      images.push({
        id,
        pageNumber,
        base64: base64Data as string,
        mimeType: 'image/png',  // Datalab returns PNG
        caption: blockType !== 'Image' ? blockType : undefined
      });
    }
  }

  const ir: DocumentIR = {
    pages,
    extras: {
      raw: data,
      costUSD: markerCostUSD,
      pageCount,
      status: data.status,
      success: data.success,
      images: images.length > 0 ? images : undefined
    }
  };

  return ir;
}
