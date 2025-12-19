/**
 * Schema for Gemini bounding box detection
 * Used for OCR-style parsing with spatial information
 *
 * Note: Gemini uses [y_min, x_min, y_max, x_max] coordinate order (Y first, not X!)
 * Coordinates are normalized to 0-1000 (divide by 1000, multiply by image dimensions)
 */

import type { UnifiedSchema } from "./types";

/**
 * Block types for document structure classification
 */
export const BLOCK_TYPES = [
  'title',      // Main document title or section headers
  'paragraph',  // Body text paragraphs
  'table',      // Tabular data
  'list',       // Bulleted or numbered lists
  'header',     // Page headers (repeated at top of pages)
  'footer',     // Page footers (repeated at bottom of pages)
  'caption',    // Image or figure captions
  'code',       // Code blocks or preformatted text
  'image',      // Image/figure placeholder
  'form',       // Form fields
  'signature',  // Signatures
  'handwriting' // Handwritten text
] as const;

export type BlockType = typeof BLOCK_TYPES[number];

/**
 * Single text block with bounding box
 */
export interface GeminiBoundingBoxBlock {
  /**
   * Bounding box coordinates: [y_min, x_min, y_max, x_max]
   * Normalized to 0-1000 (Gemini format)
   */
  box_2d: [number, number, number, number];

  /**
   * Text content within the bounding box
   */
  text: string;

  /**
   * Block type classification
   */
  type: BlockType;

  /**
   * Confidence level (optional)
   */
  confidence?: 'high' | 'medium' | 'low';

  /**
   * Page number (0-indexed, for multi-page documents)
   */
  page?: number;
}

/**
 * JSON Schema for Gemini bounding box extraction
 * This schema is used with Gemini models to extract text with spatial information
 */
export const geminiBoundingBoxSchema: UnifiedSchema<GeminiBoundingBoxBlock[]> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      box_2d: {
        type: 'array',
        items: { type: 'number' },
        minItems: 4,
        maxItems: 4,
        description: 'Bounding box coordinates [y_min, x_min, y_max, x_max] normalized 0-1000'
      } as any,
      text: {
        type: 'string',
        description: 'Text content within the bounding box'
      },
      type: {
        type: 'string',
        enum: [...BLOCK_TYPES],
        description: 'Block type classification'
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        nullable: true,
        description: 'Confidence level of extraction'
      } as any,
      page: {
        type: 'integer',
        nullable: true,
        description: 'Page number (0-indexed)'
      } as any
    },
    required: ['box_2d', 'text', 'type'],
    additionalProperties: false
  }
} as any;

/**
 * Prompt for Gemini bounding box extraction
 * This activates Gemini's spatial understanding capabilities
 */
export const GEMINI_BBOX_EXTRACTION_PROMPT = `Analyze this document and extract all text with precise bounding box locations.

For each text block, provide:
- box_2d: Bounding box as [y_min, x_min, y_max, x_max] normalized to 0-1000
- text: The exact text content
- type: Block classification (title, paragraph, table, list, header, footer, caption, code, image, form, signature, handwriting)
- confidence: Your confidence level (high, medium, low)
- page: Page number (0-indexed) for multi-page documents

IMPORTANT coordinate format:
- Use [y_min, x_min, y_max, x_max] order (Y coordinate first, then X)
- Normalize all values to 0-1000 range (top-left is [0, 0], bottom-right is [1000, 1000])

Return ONLY a valid JSON array, no other text.`;

/**
 * Normalized bounding box format (0-1 range)
 * This is the SDK's standard format after conversion from Gemini's 0-1000 format
 */
export interface NormalizedBBox {
  x: number;      // Left edge (0-1)
  y: number;      // Top edge (0-1)
  width: number;  // Width (0-1)
  height: number; // Height (0-1)
}

/**
 * Convert Gemini 0-1000 coordinates to normalized 0-1 format
 * Note: Gemini uses [y_min, x_min, y_max, x_max] order
 *
 * @param geminiBBox - Bounding box from Gemini [y_min, x_min, y_max, x_max] (0-1000)
 * @returns Normalized bounding box with x, y, width, height (0-1)
 */
export function normalizeGeminiBBox(
  geminiBBox: [number, number, number, number]
): NormalizedBBox {
  const [yMin, xMin, yMax, xMax] = geminiBBox;
  return {
    x: xMin / 1000,
    y: yMin / 1000,
    width: (xMax - xMin) / 1000,
    height: (yMax - yMin) / 1000
  };
}

/**
 * Convert normalized 0-1 format back to Gemini 0-1000 coordinates
 *
 * @param bbox - Normalized bounding box (0-1)
 * @returns Gemini format [y_min, x_min, y_max, x_max] (0-1000)
 */
export function toGeminiBBox(
  bbox: NormalizedBBox
): [number, number, number, number] {
  return [
    Math.round(bbox.y * 1000),            // y_min
    Math.round(bbox.x * 1000),            // x_min
    Math.round((bbox.y + bbox.height) * 1000), // y_max
    Math.round((bbox.x + bbox.width) * 1000)   // x_max
  ];
}

/**
 * Convert Gemini bounding box block to DocumentIR-compatible format
 */
export interface DocumentBlock {
  text: string;
  bbox: NormalizedBBox;
  type: BlockType;
  confidence?: number;
  page?: number;
}

/**
 * Convert Gemini extraction result to DocumentIR blocks
 *
 * @param geminiBlocks - Raw blocks from Gemini extraction
 * @returns Document blocks with normalized coordinates
 */
export function convertGeminiBlocksToDocumentBlocks(
  geminiBlocks: GeminiBoundingBoxBlock[]
): DocumentBlock[] {
  return geminiBlocks.map(block => ({
    text: block.text,
    bbox: normalizeGeminiBBox(block.box_2d),
    type: block.type,
    confidence: block.confidence === 'high' ? 0.9
      : block.confidence === 'medium' ? 0.7
      : block.confidence === 'low' ? 0.5
      : undefined,
    page: block.page
  }));
}
