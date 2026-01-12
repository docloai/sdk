import type { VLMProvider, MultimodalInput, ProviderIdentity, ReasoningConfig } from "@doclo/core";
import { isLocalEndpoint, withRetry, createCircuitBreaker } from "@doclo/core";
import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize, safeJsonParse } from "@doclo/core/security";
import type {
  MistralOCRWithAnnotationsRequest,
  MistralOCRResponse,
  MistralDocumentInput,
  MistralAnnotationFormat,
  MistralAPIError,
} from "./types.js";
import {
  MISTRAL_DEFAULT_ENDPOINT,
  MISTRAL_OCR_MODELS,
  MISTRAL_PRICING,
  MISTRAL_LIMITS,
} from "./types.js";

/**
 * Options for the Mistral VLM provider
 */
export type MistralVLMOptions = {
  /** Mistral API key */
  apiKey: string;
  /** Custom API endpoint (default: https://api.mistral.ai/v1) */
  endpoint?: string;
  /** Model to use (default: mistral-ocr-latest) */
  model?: string;
  /**
   * Annotation mode for extraction:
   * - 'document': Extract from entire document (max 8 pages)
   * - 'bbox': Extract from image/chart bounding boxes
   */
  annotationMode?: 'document' | 'bbox';
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
 * Input for completeJson method
 */
export type MistralVLMCompleteInput = {
  /** Document input (must be raw document - image or PDF) */
  prompt: string | MultimodalInput;
  /** JSON schema for extraction */
  schema: object;
  /** Max tokens (not used by Mistral OCR, included for interface compatibility) */
  max_tokens?: number;
  /** Reasoning config (not used by Mistral OCR) */
  reasoning?: ReasoningConfig;
  /** Annotation mode override */
  annotationMode?: 'document' | 'bbox';
};

/**
 * Result from completeJson method
 */
export type MistralVLMResult = {
  /** Extracted JSON matching the schema */
  json: unknown;
  /** Raw response text (not applicable for Mistral) */
  rawText?: string;
  /** Cost in USD */
  costUSD?: number;
  /** Input tokens (not provided by Mistral OCR) */
  inputTokens?: number;
  /** Output tokens (not provided by Mistral OCR) */
  outputTokens?: number;
};

/**
 * Create a VLM provider using Mistral Document AI Annotations
 *
 * This provider uses Mistral OCR 3 with Document AI Annotations for
 * structured extraction directly from source documents. It does NOT
 * work with DocumentIR - always requires raw document input.
 *
 * Cost: $0.002 per page ($2 per 1000 pages)
 *
 * @example
 * ```typescript
 * const provider = mistralVLMProvider({
 *   apiKey: process.env.MISTRAL_API_KEY!,
 *   annotationMode: 'document'
 * });
 *
 * const result = await provider.completeJson({
 *   prompt: {
 *     images: [{ base64: 'data:image/jpeg;base64,...', mimeType: 'image/jpeg' }]
 *   },
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       invoiceNumber: { type: 'string' },
 *       totalAmount: { type: 'number' }
 *     }
 *   }
 * });
 * ```
 */
export function mistralVLMProvider(opts: MistralVLMOptions): VLMProvider {
  const baseEndpoint = opts.endpoint || MISTRAL_DEFAULT_ENDPOINT;
  const ocrEndpoint = `${baseEndpoint}/ocr`;

  // Determine method based on endpoint
  const method = isLocalEndpoint(baseEndpoint) ? 'self-hosted' : 'native';

  const identity: ProviderIdentity = {
    provider: 'mistral',
    model: 'ocr-2512-vlm',
    method
  };

  return {
    identity,
    name: "mistral:ocr-2512-vlm",
    capabilities: {
      supportsImages: true,
      supportsPDFs: true,
    },
    async completeJson(input: MistralVLMCompleteInput): Promise<MistralVLMResult> {
      // Extract document from multimodal input
      const document = await extractDocumentFromInput(input.prompt);

      // Build annotation format from schema
      const annotationFormat: MistralAnnotationFormat = {
        type: 'json_schema',
        json_schema: {
          name: 'extraction',
          schema: input.schema as Record<string, unknown>,
          strict: true,
        },
      };

      // Determine annotation mode
      const annotationMode = input.annotationMode || opts.annotationMode || 'document';

      // Build request body with annotation format
      const requestBody: MistralOCRWithAnnotationsRequest = {
        model: opts.model || MISTRAL_OCR_MODELS.LATEST,
        document,
        include_image_base64: opts.includeImageBase64,
        // Add appropriate annotation format based on mode
        ...(annotationMode === 'document'
          ? { document_annotation_format: annotationFormat }
          : { bbox_annotation_format: annotationFormat }),
      };

      // Get circuit breaker if configured
      const circuitBreaker = opts.retry?.threshold !== undefined
        ? createCircuitBreaker('mistral:ocr-2512-vlm', { threshold: opts.retry.threshold })
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

      // Calculate cost
      const pageCount = response.usage_info?.pages_processed ?? response.pages.length;
      const costUSD = pageCount * MISTRAL_PRICING.PER_PAGE_USD;

      // Extract annotation result
      let extractedData: unknown;

      if (annotationMode === 'document' && response.document_annotation) {
        // Document-level annotation
        extractedData = typeof response.document_annotation === 'string'
          ? safeJsonParse(response.document_annotation)
          : response.document_annotation;
      } else if (annotationMode === 'bbox') {
        // BBox annotations - collect from all pages/images
        const bboxAnnotations: unknown[] = [];
        for (const page of response.pages) {
          for (const img of page.images) {
            if (img.image_annotation) {
              const annotation = typeof img.image_annotation === 'string'
                ? safeJsonParse(img.image_annotation)
                : img.image_annotation;
              bboxAnnotations.push(annotation);
            }
          }
        }
        extractedData = bboxAnnotations.length === 1
          ? bboxAnnotations[0]
          : bboxAnnotations;
      }

      if (extractedData === undefined) {
        throw new Error('Mistral OCR did not return annotation data');
      }

      return {
        json: extractedData,
        costUSD,
        inputTokens: undefined,  // Mistral OCR doesn't provide token counts
        outputTokens: undefined,
      };
    },
  };
}

/**
 * Extract document input from multimodal prompt
 */
async function extractDocumentFromInput(
  prompt: string | MultimodalInput
): Promise<MistralDocumentInput> {
  if (typeof prompt === 'string') {
    throw new Error('Mistral VLM requires image/PDF input, not text prompt. Use images or pdfs in MultimodalInput.');
  }

  const multimodal = prompt as MultimodalInput;

  // Get document from images or PDFs
  let dataUrl: string | undefined;
  let mimeType: string | undefined;

  if (multimodal.images && multimodal.images.length > 0) {
    const img = multimodal.images[0];
    dataUrl = img.base64 || img.url;
    mimeType = img.mimeType;
  } else if (multimodal.pdfs && multimodal.pdfs.length > 0) {
    const pdf = multimodal.pdfs[0];
    dataUrl = pdf.base64 || pdf.url;
    mimeType = 'application/pdf';
  }

  if (!dataUrl) {
    throw new Error('Mistral VLM requires image or PDF input');
  }

  // Build document input
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    validateUrl(dataUrl);  // SSRF protection

    const isImage = mimeType?.startsWith('image/') ||
      /\.(png|jpg|jpeg|gif|webp|avif)$/i.test(dataUrl);
    if (isImage) {
      return { type: 'image_url', image_url: dataUrl };
    }
    return { type: 'document_url', document_url: dataUrl };
  }

  // Base64 data URL - Mistral expects full data URL in image_url or document_url
  const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (dataUrlMatch) {
    const detectedMimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];

    // Validate size
    const estimatedSize = (base64Data.length * 3) / 4;
    validateFileSize(estimatedSize, MISTRAL_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024);

    // Mistral expects full data URL in the appropriate field
    const isImage = detectedMimeType.startsWith('image/');
    if (isImage) {
      return { type: 'image_url', image_url: dataUrl };
    }
    return { type: 'document_url', document_url: dataUrl };
  }

  // Raw base64 without data URL prefix - construct data URL
  const estimatedSize = (dataUrl.length * 3) / 4;
  validateFileSize(estimatedSize, MISTRAL_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024);

  // Use provided mimeType or default to PDF
  const effectiveMimeType = mimeType || 'application/pdf';
  const fullDataUrl = `data:${effectiveMimeType};base64,${dataUrl}`;

  const isImage = effectiveMimeType.startsWith('image/');
  if (isImage) {
    return { type: 'image_url', image_url: fullDataUrl };
  }
  return { type: 'document_url', document_url: fullDataUrl };
}
