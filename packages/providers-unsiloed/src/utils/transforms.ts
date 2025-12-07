/**
 * Transform utilities for converting Unsiloed API responses to doclo-sdk formats
 */

import type { DocumentIR, IRPage, IRLine, MultimodalInput } from '@doclo/core';

export interface UnsiloedSegment {
  segment_type: string;
  content: string;
  markdown?: string;
  html?: string;
  page_number?: number;
  confidence?: number;
  bbox?: any;
  [key: string]: any;
}

export interface UnsiloedChunk {
  segments?: UnsiloedSegment[];
  // Legacy fields (for backwards compatibility)
  text?: string;
  markdown?: string;
  type?: string;
  confidence?: number;
  bounding_boxes?: any[];
  page_numbers?: number[];
  [key: string]: any;
}

/**
 * Convert Unsiloed semantic chunks to DocumentIR format
 * Each chunk becomes a virtual "page" in the DocumentIR
 */
export function chunksToDocumentIR(chunks: UnsiloedChunk[]): DocumentIR {
  const pages: IRPage[] = chunks.map((chunk, index) => {
    // Extract text from segments or use legacy text field
    let text = '';
    let markdown = '';
    let pageNumber = index + 1;

    if (chunk.segments && chunk.segments.length > 0) {
      // New format: concatenate segment content
      text = chunk.segments.map(s => s.content || '').join('\n');
      markdown = chunk.segments.map(s => s.markdown || s.content || '').join('\n');
      // Use page number from first segment if available
      if (chunk.segments[0].page_number) {
        pageNumber = chunk.segments[0].page_number;
      }
    } else {
      // Legacy format
      text = chunk.text || '';
      markdown = chunk.markdown || text;
    }

    // Convert chunk text into lines (split by newline)
    const lines: IRLine[] = parseTextToLines(text);

    return {
      pageNumber,
      width: 612, // Standard PDF page width (8.5" at 72 DPI)
      height: 792, // Standard PDF page height (11" at 72 DPI)
      lines,
      markdown,
      extras: {
        // Preserve Unsiloed's semantic metadata
        semanticChunkType: chunk.type || (chunk.segments?.[0]?.segment_type),
        confidence: chunk.confidence || (chunk.segments?.[0]?.confidence),
        boundingBoxes: chunk.bounding_boxes,
        originalPageNumbers: chunk.page_numbers,
        chunkIndex: index,
        isUnsiloedSemanticChunk: true,
        segmentCount: chunk.segments?.length,
      },
    };
  });

  return {
    pages,
    extras: {
      totalSemanticChunks: chunks.length,
      provider: 'unsiloed-parse',
    },
  };
}

/**
 * Parse text into IRLine array
 */
function parseTextToLines(text: string | undefined): IRLine[] {
  if (!text) {
    return [];
  }

  const lines = text.split('\n');
  let currentChar = 0;

  return lines.map((lineText, index) => {
    const startChar = currentChar;
    const endChar = currentChar + lineText.length;
    currentChar = endChar + 1; // +1 for newline character

    return {
      text: lineText,
      startChar,
      endChar,
      lineId: `line-${index}`,
    };
  });
}

/**
 * Extract PDF input from MultimodalInput
 * Unsiloed only supports PDFs, not images (legacy - kept for backwards compatibility)
 */
export function extractPDFFromMultimodal(input: {
  prompt: string | MultimodalInput;
}): { url?: string; base64?: string } {
  const result = extractDocumentFromMultimodal(input);

  // For backwards compatibility, reject images if PDF-only
  if (result.type === 'image') {
    throw new Error(
      'Unsiloed providers only support PDF documents, not images. Please convert images to PDF first or use a different provider.'
    );
  }

  return {
    url: result.url,
    base64: result.base64,
  };
}

/**
 * Extract document (PDF or image) from MultimodalInput
 * Returns the document along with its type for proper handling
 */
export function extractDocumentFromMultimodal(input: {
  prompt: string | MultimodalInput;
}): { url?: string; base64?: string; type: 'pdf' | 'image'; mimeType?: string } {
  if (typeof input.prompt === 'string') {
    throw new Error(
      'Unsiloed providers require multimodal input with PDF or image document'
    );
  }

  const multimodal = input.prompt;

  // Check for PDFs first
  if (multimodal.pdfs && multimodal.pdfs.length > 0) {
    const pdf = multimodal.pdfs[0];
    return {
      url: pdf.url,
      base64: pdf.base64,
      type: 'pdf',
      mimeType: 'application/pdf',
    };
  }

  // Check for images
  if (multimodal.images && multimodal.images.length > 0) {
    const image = multimodal.images[0];

    // Try to detect MIME type from base64 data URI or URL extension
    let mimeType = 'image/png'; // default
    if (image.base64) {
      const match = image.base64.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
      }
    } else if (image.url) {
      const ext = image.url.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') {
        mimeType = 'image/jpeg';
      } else if (ext === 'png') {
        mimeType = 'image/png';
      } else if (ext === 'gif') {
        mimeType = 'image/gif';
      } else if (ext === 'webp') {
        mimeType = 'image/webp';
      }
    }

    return {
      url: image.url,
      base64: image.base64,
      type: 'image',
      mimeType,
    };
  }

  throw new Error('No document (PDF or image) found in multimodal input');
}

/**
 * Calculate approximate cost based on quota remaining delta
 */
export function calculateCostFromQuota(
  quotaBefore: number | undefined,
  quotaAfter: number | undefined
): number | undefined {
  if (quotaBefore === undefined || quotaAfter === undefined) {
    return undefined;
  }

  const creditsUsed = quotaBefore - quotaAfter;
  // Unsiloed uses credit-based pricing; exact USD conversion unknown
  // Return credits used as proxy for cost
  return creditsUsed > 0 ? creditsUsed : undefined;
}
