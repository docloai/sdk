/**
 * Reducto Split Function
 *
 * Split multi-document files into individual segments
 *
 * @see https://docs.reducto.ai/api-reference/split
 */

import type { SegmentationResult } from "@docloai/core";
import { fetchWithTimeout } from "@docloai/core/security";
import type {
  ReductoSplitOptions,
  ReductoDocumentType,
  ReductoSplitResponse,
} from "./types.js";
import {
  getFileBuffer,
  uploadFile,
  pollJob,
  formatUsage,
  createHeaders,
  REDUCTO_REQUEST_TIMEOUT,
} from "./utils.js";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_ENDPOINT = 'https://platform.reducto.ai';

// ============================================================================
// Split Function
// ============================================================================

/**
 * Split a multi-document file into individual document segments
 *
 * This function is useful for processing "stapled" PDFs that contain
 * multiple documents (e.g., a stack of invoices, mixed contracts, etc.)
 *
 * @param input - Document input (URL or base64)
 * @param opts - Split options including document type descriptions
 * @returns Segmentation result with page ranges per document type
 *
 * @example
 * ```typescript
 * const result = await splitDocument(
 *   { base64: stackedPdfData },
 *   {
 *     apiKey: process.env.REDUCTO_API_KEY!,
 *     splitDescription: [
 *       { name: 'Invoice', description: 'Contains invoice number, line items, totals' },
 *       { name: 'Contract', description: 'Legal agreement with terms and signatures' },
 *       { name: 'Receipt', description: 'Payment confirmation with transaction ID' }
 *     ]
 *   }
 * );
 *
 * for (const segment of result.segments) {
 *   console.log(`${segment.name}: pages ${segment.pages.join(',')}`);
 * }
 * ```
 */
export async function splitDocument(
  input: { url?: string; base64?: string },
  opts: ReductoSplitOptions
): Promise<SegmentationResult & { extras?: { credits: number; estimatedUSD: number; jobId: string } }> {
  const endpoint = opts.endpoint || DEFAULT_ENDPOINT;

  // Get file buffer
  const { buffer, filename } = await getFileBuffer(input);

  // Upload file
  const uploadResult = await uploadFile(buffer, filename, opts.apiKey, endpoint);

  // Build split request
  // Use file_id directly - check if it already has the reducto:// prefix
  const documentRef = uploadResult.file_id.startsWith('reducto://')
    ? uploadResult.file_id
    : `reducto://${uploadResult.file_id}`;

  const splitRequest: Record<string, unknown> = {
    input: uploadResult.presigned_url || documentRef,
    split_description: opts.splitDescription.map(doc => ({
      name: doc.name,
      description: doc.description,
    })),
  };

  // Submit split request - use extended timeout for document processing
  const resp = await fetchWithTimeout(`${endpoint}/split`, {
    method: 'POST',
    headers: createHeaders(opts.apiKey),
    body: JSON.stringify(splitRequest),
  }, REDUCTO_REQUEST_TIMEOUT);

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(`Reducto split failed: ${resp.status} ${errorText}`);
  }

  const splitResponse = await resp.json() as ReductoSplitResponse | { job_id: string; status: string };

  // Handle async response
  let result: ReductoSplitResponse;
  if ('status' in splitResponse && splitResponse.status !== 'completed') {
    result = await pollJob<ReductoSplitResponse>(
      splitResponse.job_id,
      opts.apiKey,
      endpoint
    );
  } else {
    result = splitResponse as ReductoSplitResponse;
  }

  // Format usage
  const usage = formatUsage(result.usage);

  // Convert to SDK SegmentationResult format
  // API returns result.splits with name, pages, and conf
  return {
    segments: result.result.splits.map(split => ({
      name: split.name,
      pages: split.pages,
      confidence: split.conf === 'high' ? 'high' as const : 'medium' as const,
    })),
    metadata: {
      totalPages: result.usage.num_pages,
      segmentationMethod: 'schema' as const,
    },
    extras: {
      credits: usage.credits,
      estimatedUSD: usage.estimatedUSD,
      jobId: result.job_id,
    },
  };
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Common document type presets for splitting
 */
export const COMMON_DOCUMENT_TYPES: Record<string, ReductoDocumentType> = {
  invoice: {
    name: 'Invoice',
    description: 'Commercial invoice with invoice number, line items, totals, and payment terms',
  },
  receipt: {
    name: 'Receipt',
    description: 'Payment receipt or transaction confirmation with date, amount, and merchant info',
  },
  contract: {
    name: 'Contract',
    description: 'Legal agreement with terms, conditions, parties, and signature blocks',
  },
  bankStatement: {
    name: 'Bank Statement',
    description: 'Bank account statement with transactions, balances, and account information',
  },
  taxForm: {
    name: 'Tax Form',
    description: 'Tax document like W-2, 1099, or tax return with tax year and amounts',
  },
  idDocument: {
    name: 'ID Document',
    description: 'Identity document like passport, drivers license, or national ID',
  },
  medicalRecord: {
    name: 'Medical Record',
    description: 'Healthcare document with patient info, diagnoses, or treatment details',
  },
  shippingDocument: {
    name: 'Shipping Document',
    description: 'Bill of lading, packing slip, or delivery note with shipment details',
  },
} as const;

// ============================================================================
// Exports
// ============================================================================

export type { ReductoSplitOptions, ReductoDocumentType };
