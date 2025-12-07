/**
 * PDF Utilities
 *
 * Edge Runtime compatible PDF manipulation utilities using pdf-lib.
 * These functions work in Node.js, Vercel Edge Functions, Cloudflare Workers, and browsers.
 */

import { PDFDocument } from 'pdf-lib';
import { base64ToArrayBuffer, uint8ArrayToBase64 } from './runtime/base64.js';
import type { DocumentIR } from './internal/validation-utils.js';

/**
 * Get the total number of pages in a PDF document
 *
 * @param dataUrl - PDF data URI in format: data:application/pdf;base64,{base64data}
 * @returns Total page count
 * @throws {Error} If the input is not a valid PDF data URL
 *
 * @example
 * ```typescript
 * const pageCount = await getPDFPageCount('data:application/pdf;base64,JVBERi0...');
 * console.log(`PDF has ${pageCount} pages`);
 * ```
 */
export async function getPDFPageCount(dataUrl: string): Promise<number> {
  const base64Match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!base64Match) {
    throw new Error('Invalid PDF data URL format. Expected: data:application/pdf;base64,{base64data}');
  }

  const base64Data = base64Match[1];
  const pdfBytes = base64ToArrayBuffer(base64Data);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return pdfDoc.getPageCount();
}

/**
 * Split a PDF into multiple smaller PDFs based on page ranges
 *
 * @param dataUrl - PDF data URI in format: data:application/pdf;base64,{base64data}
 * @param pageRanges - Array of [startPage, endPage] tuples (1-indexed, inclusive)
 * @returns Array of PDF data URLs, one for each page range
 * @throws {Error} If the input is not a valid PDF data URL or page ranges are invalid
 *
 * @example
 * ```typescript
 * // Split a 10-page PDF into three chunks
 * const chunks = await splitPDFIntoChunks(pdfDataUrl, [
 *   [1, 3],   // Pages 1-3
 *   [4, 7],   // Pages 4-7
 *   [8, 10]   // Pages 8-10
 * ]);
 * console.log(`Created ${chunks.length} PDF chunks`);
 * ```
 */
export async function splitPDFIntoChunks(
  dataUrl: string,
  pageRanges: Array<[number, number]>
): Promise<string[]> {
  // Extract base64 data from data URL
  const base64Match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!base64Match) {
    throw new Error('Invalid PDF data URL format. Expected: data:application/pdf;base64,{base64data}');
  }

  const base64Data = base64Match[1];
  const pdfBytes = base64ToArrayBuffer(base64Data);

  // Load the PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  const chunks: string[] = [];

  for (const [startPage, endPage] of pageRanges) {
    // Validate page range
    if (startPage < 1 || endPage > totalPages || startPage > endPage) {
      throw new Error(
        `Invalid page range [${startPage}, ${endPage}] for PDF with ${totalPages} pages. ` +
        `Page numbers must be 1-indexed and within bounds.`
      );
    }

    // Create new PDF with only these pages
    const chunkDoc = await PDFDocument.create();
    const pagesToCopy = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage - 1 + i  // Convert to 0-indexed
    );

    const copiedPages = await chunkDoc.copyPages(pdfDoc, pagesToCopy);
    copiedPages.forEach(page => chunkDoc.addPage(page));

    // Serialize to base64 using Edge Runtime compatible adapter
    const chunkBytes = await chunkDoc.save();
    const chunkBase64 = uint8ArrayToBase64(chunkBytes);
    chunks.push(`data:application/pdf;base64,${chunkBase64}`);
  }

  return chunks;
}

/**
 * Get the page count from a DocumentIR, with fallback logic
 *
 * This helper function checks multiple sources for page count:
 * 1. `extras.pageCount` (explicit page count from provider or PDF analysis)
 * 2. `pages.length` (fallback - number of pages in the IR)
 *
 * Note: For Unsiloed provider, `pages.length` represents semantic chunks,
 * not traditional pages. Use `extras.totalSemanticChunks` to distinguish.
 *
 * @param ir - DocumentIR to get page count from
 * @returns Page count (or chunk count for Unsiloed)
 *
 * @example
 * ```typescript
 * const ir = await parseNode.run(pdfUrl, { provider: ocrProvider });
 * const pageCount = getDocumentPageCount(ir);
 * console.log(`Document has ${pageCount} pages`);
 * ```
 */
export function getDocumentPageCount(ir: DocumentIR): number {
  // Prefer explicit pageCount from extras
  if (ir.extras?.pageCount !== undefined) {
    return ir.extras.pageCount;
  }

  // Fallback to pages array length
  return ir.pages.length;
}

/**
 * Get total page count across multiple DocumentIR objects (chunked results)
 *
 * For chunked parsing results, this sums up the page counts across all chunks.
 * It respects `extras.pageCount` if available, otherwise uses `pages.length`.
 *
 * @param irArray - Array of DocumentIR objects from chunked parsing
 * @returns Total page count across all chunks
 *
 * @example
 * ```typescript
 * const chunks = await parseNode.run(largePdfUrl, {
 *   provider: ocrProvider,
 *   chunked: { maxPagesPerChunk: 10 }
 * });
 * const totalPages = getTotalPageCount(chunks);
 * console.log(`Total pages across ${chunks.length} chunks: ${totalPages}`);
 * ```
 */
export function getTotalPageCount(irArray: DocumentIR[]): number {
  return irArray.reduce((sum, ir) => sum + getDocumentPageCount(ir), 0);
}

/**
 * Get comprehensive page-related metadata from a DocumentIR
 *
 * Returns detailed information about page counts, chunk information,
 * and whether the result is chunked or a complete document.
 *
 * @param ir - DocumentIR to analyze
 * @returns Metadata object with page count details
 *
 * @example
 * ```typescript
 * const metadata = getPageCountMetadata(ir);
 * console.log(`Document has ${metadata.pageCount} pages`);
 * if (metadata.isChunked) {
 *   console.log(`This is chunk ${metadata.chunkIndex + 1} of ${metadata.totalChunks}`);
 *   console.log(`Contains pages ${metadata.pageRange[0]} to ${metadata.pageRange[1]}`);
 * }
 * ```
 */
export function getPageCountMetadata(ir: DocumentIR): {
  /** Total page count (or chunk count for Unsiloed) */
  pageCount: number;
  /** Number of pages in the IR (may differ from pageCount for chunked docs) */
  pagesInIR: number;
  /** Whether this is a chunked result */
  isChunked: boolean;
  /** For chunked results: which chunk this is (0-indexed) */
  chunkIndex?: number;
  /** For chunked results: total number of chunks */
  totalChunks?: number;
  /** For chunked results: page range [start, end] (1-indexed, inclusive) */
  pageRange?: [number, number];
  /** For Unsiloed: total semantic chunks */
  totalSemanticChunks?: number;
  /** Whether this is from Unsiloed (semantic chunking, not traditional pages) */
  isSemanticChunking: boolean;
} {
  const pagesInIR = ir.pages.length;
  const pageCount = ir.extras?.pageCount ?? pagesInIR;
  const isSemanticChunking = ir.extras?.totalSemanticChunks !== undefined;
  const isChunked = ir.extras?.chunkIndex !== undefined && ir.extras?.totalChunks !== undefined;

  return {
    pageCount,
    pagesInIR,
    isChunked,
    chunkIndex: ir.extras?.chunkIndex as number | undefined,
    totalChunks: ir.extras?.totalChunks as number | undefined,
    pageRange: ir.extras?.pageRange as [number, number] | undefined,
    totalSemanticChunks: ir.extras?.totalSemanticChunks as number | undefined,
    isSemanticChunking
  };
}
