import type { DocumentIR, OCRProvider, ProviderIdentity } from "@doclo/core";
import { isLocalEndpoint } from "@doclo/core";
import { validateUrl, fetchWithTimeout, DEFAULT_LIMITS, validateFileSize } from "@doclo/core/security";
import { base64ToArrayBuffer } from "@doclo/core/runtime/base64";
import type { OCRPollingConfig } from "./types.js";

/**
 * Options for the Surya OCR provider
 */
export type SuryaOCROptions = {
  apiKey?: string;
  endpoint: string;
  /** Polling configuration for async OCR jobs */
  polling?: OCRPollingConfig;
};

/**
 * Create an OCR provider using Datalab Surya (primary API)
 */
export function createOCRProvider(opts: SuryaOCROptions): OCRProvider {
  return suryaProvider(opts);
}

/**
 * Legacy function - use createOCRProvider instead
 */
export function suryaProvider(opts: SuryaOCROptions): OCRProvider {
  // Determine method based on endpoint (self-hosted vs native API)
  const method = isLocalEndpoint(opts.endpoint) ? 'self-hosted' : 'native';

  const identity: ProviderIdentity = {
    provider: 'datalab',
    model: 'surya',
    method
  };

  return {
    identity,
    name: "datalab:surya",
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
        filename = 'document.pdf';
      } else {
        throw new Error('Either url or base64 must be provided');
      }

      // Determine MIME type from filename
      const getMimeType = (name: string): string => {
        if (name.endsWith('.pdf')) return 'application/pdf';
        if (name.endsWith('.png')) return 'image/png';
        if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
        if (name.endsWith('.gif')) return 'image/gif';
        if (name.endsWith('.tiff') || name.endsWith('.tif')) return 'image/tiff';
        if (name.endsWith('.webp')) return 'image/webp';
        if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (name.endsWith('.doc')) return 'application/msword';
        return 'application/pdf'; // default to PDF
      };

      // Create multipart form data
      const formData = new FormData();
      const mimeType = getMimeType(filename);
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('file', blob, filename);

      // Submit OCR request
      const resp = await fetchWithTimeout(opts.endpoint, {
        method: "POST",
        headers: {
          ...(opts.apiKey ? { "X-API-Key": opts.apiKey } : {})
        },
        body: formData
      }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '');
        throw new Error(`Surya OCR request failed: ${resp.status} ${errorText}`);
      }

      const result = await resp.json() as {
        request_id?: string;
        request_check_url?: string;
        status?: string;
        [key: string]: any;
      };

      // If async response, poll for completion
      if (result.request_check_url) {
        const finalResult = await pollForCompletion(result.request_check_url, opts.apiKey, opts.polling);
        return parseDatalabResponse(finalResult);
      }

      // If synchronous response
      return parseDatalabResponse(result);
    }
  };
}

async function pollForCompletion(
  checkUrl: string,
  apiKey?: string,
  polling?: OCRPollingConfig
): Promise<any> {
  const maxAttempts = polling?.maxAttempts ?? 30;
  const pollingInterval = polling?.pollingInterval ?? 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollingInterval));

    const resp = await fetchWithTimeout(checkUrl, {
      headers: apiKey ? { "X-API-Key": apiKey } : {}
    }, DEFAULT_LIMITS.REQUEST_TIMEOUT);

    if (!resp.ok) throw new Error(`Polling failed: ${resp.status}`);

    const data = await resp.json();

    if (data.status === 'complete' || data.status === 'completed') {
      return data;
    }

    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(`OCR processing failed: ${data.error || 'Unknown error'}`);
    }
  }

  throw new Error('OCR processing timeout - exceeded maximum polling attempts');
}

function parseDatalabResponse(data: any): DocumentIR {
  // Datalab OCR response format per https://documentation.datalab.to/docs/welcome/api
  const pages: any[] = data.pages || [];

  // Calculate cost: Surya costs 1 cent ($0.01) per page
  const pageCount = data.page_count || pages.length;
  const suryaCostUSD = pageCount * 0.01;

  const ir: DocumentIR = {
    pages: pages.map((p: any) => {
      // Page dimensions from image_bbox field: [x1, y1, x2, y2]
      const imageBbox = p.image_bbox || [0, 0, 0, 0];
      const width = imageBbox[2] - imageBbox[0];
      const height = imageBbox[3] - imageBbox[1];

      // Text lines with proper bbox conversion
      const textLines = p.text_lines || [];

      return {
        width,
        height,
        lines: textLines.map((l: any) => {
          // Bbox is in [x1, y1, x2, y2] format, convert to {x, y, w, h}
          const bbox = l.bbox ? {
            x: l.bbox[0],
            y: l.bbox[1],
            w: l.bbox[2] - l.bbox[0],  // width = x2 - x1
            h: l.bbox[3] - l.bbox[1]   // height = y2 - y1
          } : undefined;

          return {
            text: l.text || '',
            bbox
          };
        })
      };
    }),
    extras: {
      raw: data,
      costUSD: suryaCostUSD,
      pageCount: pageCount,
      status: data.status,
      success: data.success
    }
  };

  return ir;
}
