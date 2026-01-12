import type { DocumentIR, OCRProvider, ProviderIdentity, ExtractedImage } from "@doclo/core";
import { isLocalEndpoint, withRetry, createCircuitBreaker } from "@doclo/core";
import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize } from "@doclo/core/security";
import type {
  MistralOCRRequest,
  MistralOCRResponse,
  MistralDocumentInput,
  MistralTableFormat,
  MistralAPIError,
} from "./types.js";
import {
  MISTRAL_DEFAULT_ENDPOINT,
  MISTRAL_OCR_MODELS,
  MISTRAL_PRICING,
  MISTRAL_LIMITS,
} from "./types.js";

/**
 * Options for the Mistral OCR provider
 */
export type MistralOCROptions = {
  /** Mistral API key */
  apiKey: string;
  /** Custom API endpoint (default: https://api.mistral.ai/v1) */
  endpoint?: string;
  /** Model to use (default: mistral-ocr-latest) */
  model?: string;
  /**
   * Specific pages to process. Supports various formats:
   * - Single page: "3" or 3
   * - Range: "0-5"
   * - Array: [0, 2, 5]
   * Page numbering starts from 0.
   */
  pages?: string | number | number[];
  /** Table output format: 'html' or 'markdown' (default: html) */
  tableFormat?: MistralTableFormat;
  /** Extract document header into separate field */
  extractHeader?: boolean;
  /** Extract document footer into separate field */
  extractFooter?: boolean;
  /** Include base64 encoded images in response */
  includeImageBase64?: boolean;
  /** Request timeout in ms (default: 120000) */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxRetries?: number;
    retryDelay?: number;
    useExponentialBackoff?: boolean;
    threshold?: number;
  };
};

/**
 * Create an OCR provider using Mistral OCR 3
 *
 * Mistral OCR 3 is a VLM-based document understanding model that outputs
 * markdown with HTML table reconstruction. It does NOT provide text-level
 * bounding boxes (only image bounding boxes).
 *
 * Cost: $0.002 per page ($2 per 1000 pages)
 *
 * @example
 * ```typescript
 * const provider = mistralOCRProvider({
 *   apiKey: process.env.MISTRAL_API_KEY!,
 *   tableFormat: 'markdown'
 * });
 *
 * const ir = await provider.parseToIR({
 *   base64: 'data:application/pdf;base64,...'
 * });
 * ```
 */
export function mistralOCRProvider(opts: MistralOCROptions): OCRProvider {
  const baseEndpoint = opts.endpoint || MISTRAL_DEFAULT_ENDPOINT;
  const ocrEndpoint = `${baseEndpoint}/ocr`;

  // Determine method based on endpoint (self-hosted vs native API)
  const method = isLocalEndpoint(baseEndpoint) ? 'self-hosted' : 'native';

  const identity: ProviderIdentity = {
    provider: 'mistral',
    model: 'ocr-2512',
    method
  };

  return {
    identity,
    name: "mistral:ocr-2512",
    async parseToIR(input) {
      // Build document input
      const document = await buildDocumentInput(input);

      // Build request body
      const requestBody: MistralOCRRequest = {
        model: opts.model || MISTRAL_OCR_MODELS.LATEST,
        document,
        pages: opts.pages,
        table_format: opts.tableFormat ?? 'html',
        extract_header: opts.extractHeader,
        extract_footer: opts.extractFooter,
        include_image_base64: opts.includeImageBase64,
      };

      // Get circuit breaker if configured
      const circuitBreaker = opts.retry?.threshold !== undefined
        ? createCircuitBreaker('mistral:ocr-2512', { threshold: opts.retry.threshold })
        : undefined;

      // Make API request with retry logic
      const response = await withRetry(
        async () => {
          const resp = await fetchWithTimeout(ocrEndpoint, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${opts.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }, opts.timeout ?? DEFAULT_LIMITS.REQUEST_TIMEOUT);

          if (!resp.ok) {
            const errorBody = await resp.text().catch(() => '');
            let errorMessage = `Mistral OCR API request failed: ${resp.status}`;

            try {
              const errorJson = JSON.parse(errorBody) as MistralAPIError;
              if (errorJson.error?.message) {
                errorMessage = `Mistral OCR API error: ${errorJson.error.message}`;
              }
            } catch {
              if (errorBody) {
                errorMessage += ` ${errorBody}`;
              }
            }

            throw new Error(errorMessage);
          }

          return resp.json() as Promise<MistralOCRResponse>;
        },
        {
          maxRetries: opts.retry?.maxRetries ?? 0,
          retryDelay: opts.retry?.retryDelay ?? 1000,
          useExponentialBackoff: opts.retry?.useExponentialBackoff ?? true,
          circuitBreaker,
        }
      );

      // Parse response to DocumentIR
      return parseMistralResponse(response, opts);
    }
  };
}

/**
 * Build Mistral document input from provider input
 *
 * Mistral OCR API expects:
 * - Images: { type: 'image_url', image_url: 'data:image/jpeg;base64,...' }
 * - PDFs: { type: 'document_url', document_url: 'data:application/pdf;base64,...' }
 */
async function buildDocumentInput(
  input: { url?: string; base64?: string }
): Promise<MistralDocumentInput> {
  if (input.url) {
    validateUrl(input.url);  // SSRF protection

    // Determine if it's an image or document URL
    const isImage = /\.(png|jpg|jpeg|gif|webp|avif)$/i.test(input.url);
    if (isImage) {
      return { type: 'image_url', image_url: input.url };
    }
    return { type: 'document_url', document_url: input.url };
  }

  if (input.base64) {
    // Extract mime type from data URL
    const dataUrlMatch = input.base64.match(/^data:([^;]+);base64,(.+)$/);

    if (dataUrlMatch) {
      const mimeType = dataUrlMatch[1];
      const base64Data = dataUrlMatch[2];

      // Validate size
      const estimatedSize = (base64Data.length * 3) / 4;
      validateFileSize(estimatedSize, MISTRAL_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024);

      // Mistral expects the full data URL in image_url or document_url field
      const isImage = mimeType.startsWith('image/');
      if (isImage) {
        return { type: 'image_url', image_url: input.base64 };
      }
      return { type: 'document_url', document_url: input.base64 };
    }

    // Raw base64 without data URL prefix - assume PDF
    const estimatedSize = (input.base64.length * 3) / 4;
    validateFileSize(estimatedSize, MISTRAL_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024);

    // Create data URL for raw base64 (assume PDF)
    const dataUrl = `data:application/pdf;base64,${input.base64}`;
    return { type: 'document_url', document_url: dataUrl };
  }

  throw new Error('Either url or base64 must be provided');
}

/**
 * Inline table content into markdown by replacing placeholder references.
 * Mistral OCR uses placeholders like [tbl-0.html](tbl-0.html) or [tbl-0.md](tbl-0.md)
 * depending on the table_format option.
 */
function inlineTablesIntoMarkdown(
  markdown: string,
  tables: string[] | undefined,
  tableFormat: MistralTableFormat
): string {
  if (!tables || tables.length === 0) {
    return markdown;
  }

  let result = markdown;
  const ext = tableFormat === 'html' ? 'html' : 'md';

  tables.forEach((tableContent, idx) => {
    // Match both link formats: [tbl-N.ext](tbl-N.ext) and bare [tbl-N.ext]
    const patterns = [
      new RegExp(`\\[tbl-${idx}\\.${ext}\\]\\(tbl-${idx}\\.${ext}\\)`, 'g'),
      new RegExp(`\\[tbl-${idx}\\.${ext}\\]`, 'g'),
    ];

    let replaced = false;
    for (const pattern of patterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, tableContent);
        replaced = true;
        break;
      }
    }

    // Fallback: append table if no reference found
    if (!replaced && tableContent.trim()) {
      result += `\n\n<!-- Table ${idx} -->\n${tableContent}`;
    }
  });

  return result;
}

/**
 * Parse Mistral OCR response to DocumentIR
 */
function parseMistralResponse(
  response: MistralOCRResponse,
  opts: MistralOCROptions
): DocumentIR {
  const pageCount = response.usage_info?.pages_processed ?? response.pages.length;
  const costUSD = pageCount * MISTRAL_PRICING.PER_PAGE_USD;

  // Convert pages to DocumentIR format
  const pages = response.pages.map((page) => {
    // Inline tables into markdown before further processing
    // Mistral stores tables separately in page.tables[] with placeholder refs in markdown
    const markdown = inlineTablesIntoMarkdown(
      page.markdown || '',
      page.tables,
      opts.tableFormat ?? 'html'
    );

    // Split markdown into lines for the lines array
    const lines = markdown
      ? markdown.split('\n').map(text => ({
          text,
          bbox: undefined as undefined, // Mistral doesn't provide text bboxes
        })).filter(l => l.text.trim())
      : [];

    return {
      width: page.dimensions?.width ?? 612,
      height: page.dimensions?.height ?? 792,
      markdown,
      lines,
      // Include header/footer if extracted
      ...(page.header && { header: page.header }),
      ...(page.footer && { footer: page.footer }),
    };
  });

  // Extract images if included
  const images: ExtractedImage[] = [];
  if (opts.includeImageBase64) {
    for (const page of response.pages) {
      for (const img of page.images) {
        if (img.image_base64) {
          images.push({
            id: img.id,
            pageNumber: page.index,
            base64: img.image_base64,
            mimeType: 'image/jpeg', // Mistral returns JPEG
            bbox: {
              x: img.top_left_x,
              y: img.top_left_y,
              w: img.bottom_right_x - img.top_left_x,
              h: img.bottom_right_y - img.top_left_y,
            },
          });
        }
      }
    }
  }

  return {
    pages,
    extras: {
      raw: response,
      costUSD,
      pageCount,
      model: response.model,
      images: images.length > 0 ? images : undefined,
    },
  };
}
