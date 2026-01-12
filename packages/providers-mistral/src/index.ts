/**
 * @doclo/providers-mistral
 *
 * Mistral AI provider integration for:
 * - OCR 3: Document parsing (parse node) - outputs markdown/DocumentIR
 * - Document AI Annotations: Structured extraction (extract node) - outputs JSON
 *
 * Key characteristics:
 * - OCR 3 is a VLM under the hood, not traditional OCR
 * - Both providers use raw-document input (not DocumentIR)
 * - Extract only works from source documents, not from parsed IR
 * - No text-level bounding boxes (only image bounding boxes)
 * - $0.002 per page pricing
 */

// Provider functions
export { mistralOCRProvider } from './mistral-ocr.js';
export type { MistralOCROptions } from './mistral-ocr.js';

export { mistralVLMProvider } from './mistral-vlm.js';
export type { MistralVLMOptions, MistralVLMCompleteInput, MistralVLMResult } from './mistral-vlm.js';

// Metadata
export { PROVIDER_METADATA } from './metadata.js';

// Types
export * from './types.js';
