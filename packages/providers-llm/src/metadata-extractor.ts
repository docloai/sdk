/**
 * Utility for extracting metadata from LLM responses
 * Handles the `_` prefixed fields that contain confidence, sources, etc.
 */

import type { LLMExtractedMetadata } from "./types";

/**
 * Reserved metadata field prefixes that are extracted and removed from JSON
 */
const METADATA_FIELDS = [
  '_confidence',
  '_sources',
  '_blockTypes',
  '_headers',
  '_footers'
] as const;

/**
 * Extracts metadata fields from a JSON response and returns clean JSON + metadata
 *
 * @param json - The raw JSON response from the LLM (may contain _ prefixed fields)
 * @returns Object with clean JSON (metadata removed) and extracted metadata
 */
export function extractMetadataFromResponse<T>(
  json: unknown
): { json: T; metadata?: LLMExtractedMetadata } {
  if (!json || typeof json !== 'object') {
    return { json: json as T };
  }

  const rawJson = json as Record<string, unknown>;
  const metadata: LLMExtractedMetadata = {};
  let hasMetadata = false;

  // Extract _confidence
  if ('_confidence' in rawJson && rawJson._confidence) {
    const confidence = rawJson._confidence;
    if (typeof confidence === 'object' && !Array.isArray(confidence)) {
      metadata.confidence = confidence as Record<string, number>;
      hasMetadata = true;
    }
  }

  // Extract _sources
  if ('_sources' in rawJson && Array.isArray(rawJson._sources)) {
    metadata.sources = rawJson._sources.map((source: any) => ({
      field: source.field || source.fieldPath || '',
      text: source.text || source.sourceText || '',
      bbox: source.bbox || source.box_2d,
      page: source.page
    }));
    hasMetadata = true;
  }

  // Extract _blockTypes
  if ('_blockTypes' in rawJson && rawJson._blockTypes) {
    const blockTypes = rawJson._blockTypes;
    if (typeof blockTypes === 'object' && !Array.isArray(blockTypes)) {
      metadata.blockTypes = blockTypes as Record<string, string>;
      hasMetadata = true;
    }
  }

  // Extract _headers
  if ('_headers' in rawJson && Array.isArray(rawJson._headers)) {
    metadata.headers = rawJson._headers.map((header: any) => ({
      text: header.text || '',
      pages: Array.isArray(header.pages) ? header.pages : []
    }));
    hasMetadata = true;
  }

  // Extract _footers
  if ('_footers' in rawJson && Array.isArray(rawJson._footers)) {
    metadata.footers = rawJson._footers.map((footer: any) => ({
      text: footer.text || '',
      pages: Array.isArray(footer.pages) ? footer.pages : []
    }));
    hasMetadata = true;
  }

  // Create clean JSON without metadata fields
  const cleanJson: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawJson)) {
    if (!METADATA_FIELDS.includes(key as any)) {
      cleanJson[key] = value;
    }
  }

  return {
    json: cleanJson as T,
    metadata: hasMetadata ? metadata : undefined
  };
}

/**
 * Checks if derived options require metadata extraction
 */
export function shouldExtractMetadata(derivedOptions?: {
  includeConfidence?: boolean;
  includeSources?: boolean;
  includeBlockTypes?: boolean;
  extractHeaders?: boolean;
  extractFooters?: boolean;
}): boolean {
  if (!derivedOptions) return false;

  return !!(
    derivedOptions.includeConfidence ||
    derivedOptions.includeSources ||
    derivedOptions.includeBlockTypes ||
    derivedOptions.extractHeaders ||
    derivedOptions.extractFooters
  );
}
