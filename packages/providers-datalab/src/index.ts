/**
 * @docloai/providers-datalab
 *
 * Providers for Datalab services (https://www.datalab.to/)
 *
 * - Surya: OCR with text + bounding boxes ($0.01/page)
 * - Marker OCR: PDF/Image → Markdown conversion ($0.002-$0.006/page based on mode)
 * - Marker VLM: PDF/Image → Structured JSON extraction ($0.002-$0.006/page based on mode)
 */

// Shared types
export type { OCRPollingConfig } from './types.js';

// Surya OCR Provider
export { suryaProvider, createOCRProvider } from './surya.js';
export type { SuryaOCROptions } from './surya.js';

// Marker OCR Provider (returns DocumentIR with markdown)
export { markerOCRProvider } from './marker-ocr.js';
export type { MarkerOCROptions } from './marker-ocr.js';

// Marker VLM Provider (structured extraction)
export { markerVLMProvider, segmentDocument } from './marker-vlm.js';
export type { MarkerVLMOptions, MarkerVLMCompleteInput, MarkerVLMResult } from './marker-vlm.js';

// Provider capabilities metadata for documentation
export const PROVIDER_CAPABILITIES = {
  surya: {
    type: 'OCRProvider' as const,
    cost_per_page: 0.01,
    formats: { images: true, pdfs: true },
    outputs: { documentIR: true, plainText: true }
  },
  markerOCR: {
    type: 'OCRProvider' as const,
    cost_per_page: 0.02,
    formats: { images: true, pdfs: true },
    outputs: { documentIR: true, markdown: true, plainText: true }
  },
  markerVLM: {
    type: 'VLMProvider' as const,
    cost_per_page: 0.02,
    formats: { images: true, pdfs: true },
    outputs: { json: true, markdown: true }
  }
} as const;

// Export comprehensive metadata (MIME types, capabilities, helpers)
export * from './metadata.js';
