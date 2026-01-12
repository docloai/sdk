/**
 * JSX Value Extractor
 *
 * Extracts field values from LLM-generated JSX to build accurate ground truth
 * that matches what is actually rendered in the document image.
 */

import type { DocumentGenerationConfig, FieldType } from '../document-config';

/**
 * A field extracted from JSX
 */
export interface ExtractedField {
  /** The field identifier (from data-field-id attribute) */
  fieldId: string;
  /** The label text (from label attribute) */
  label: string;
  /** The raw string value extracted from the JSX */
  value: string;
}

/**
 * Extract field values from LLM-generated JSX
 *
 * Parses the JSX looking for Field components with data-field-id attributes
 * and extracts their values.
 *
 * Supports patterns like:
 * - <Field data-field-id="supplier_name" label="Supplier Name"><Value>Acme Corp</Value></Field>
 * - <Field label="Amount" data-field-id="amount"><Value>1234.56</Value></Field>
 * - Nested values within Field components
 *
 * @param jsx - The JSX string to parse
 * @returns Array of extracted fields
 */
export function extractValuesFromJSX(jsx: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const seenFieldIds = new Set<string>();

  // Pattern for Field with data-field-id (order-independent attribute matching)
  // This pattern captures the entire Field component including its content
  const fieldPattern = /<Field\s+([^>]*?)>([\s\S]*?)<\/Field>/g;

  let match;
  while ((match = fieldPattern.exec(jsx)) !== null) {
    const attributes = match[1];
    const content = match[2];

    // Extract data-field-id attribute
    const fieldIdMatch = attributes.match(/data-field-id="([^"]+)"/);
    if (!fieldIdMatch) continue;

    const fieldId = fieldIdMatch[1];

    // Skip duplicates (use first occurrence)
    if (seenFieldIds.has(fieldId)) continue;
    seenFieldIds.add(fieldId);

    // Extract label attribute
    const labelMatch = attributes.match(/label="([^"]+)"/);
    const label = labelMatch ? labelMatch[1] : fieldId;

    // Extract value from <Value> component(s)
    const value = extractValueFromContent(content);

    if (value !== null) {
      fields.push({ fieldId, label, value });
    }
  }

  return fields;
}

/**
 * Extract the value from Field component content
 *
 * Handles various patterns:
 * - <Value>text</Value>
 * - <Value mono>text</Value>
 * - Multiple <Value> components (concatenates them)
 * - Nested components with Value inside
 */
function extractValueFromContent(content: string): string | null {
  // Try to find <Value> components
  const valuePattern = /<Value[^>]*>([^<]*)<\/Value>/g;
  const values: string[] = [];

  let match;
  while ((match = valuePattern.exec(content)) !== null) {
    const value = match[1].trim();
    if (value) {
      values.push(value);
    }
  }

  if (values.length > 0) {
    return values.join(' ').trim();
  }

  // Fallback: if no <Value> component, try to get text content directly
  // This handles cases where the value is just text inside the Field
  const textContent = content
    .replace(/<[^>]+>/g, ' ') // Remove all tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  return textContent || null;
}

/**
 * Coerce a string value to the appropriate type based on field definition
 *
 * @param value - The raw string value
 * @param fieldType - The expected field type
 * @returns The coerced value
 */
export function coerceValue(value: string, fieldType: FieldType): unknown {
  switch (fieldType) {
    case 'number':
    case 'currency': {
      // Remove currency symbols, thousand separators, and other non-numeric chars
      // Keep decimal point and minus sign
      const cleaned = value
        .replace(/[^0-9.\-]/g, '')
        .replace(/\.(?=.*\.)/g, ''); // Keep only last decimal point

      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? value : parsed;
    }

    case 'boolean': {
      const lower = value.toLowerCase();
      if (['yes', 'true', '1', 'checked', 'on'].includes(lower)) return true;
      if (['no', 'false', '0', 'unchecked', 'off'].includes(lower)) return false;
      return value;
    }

    case 'date':
    case 'time':
    case 'datetime': {
      // Return as string - date parsing is complex and locale-dependent
      return value;
    }

    default:
      return value;
  }
}

/**
 * Build ground truth from extracted fields
 *
 * Converts extracted field values to the appropriate types based on
 * the document configuration.
 *
 * @param extracted - Array of extracted fields from JSX
 * @param config - The document generation config
 * @returns Ground truth object with typed values
 */
export function buildGroundTruthFromExtracted(
  extracted: ExtractedField[],
  config: DocumentGenerationConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of extracted) {
    const fieldDef = config.fields[field.fieldId];

    if (fieldDef) {
      // Coerce to the correct type based on field definition
      result[field.fieldId] = coerceValue(field.value, fieldDef.type);
    } else {
      // Field not in config - keep as string
      result[field.fieldId] = field.value;
    }
  }

  return result;
}

/**
 * Create a label-to-fieldId mapping from config
 *
 * Useful for fallback matching when data-field-id is not present.
 * Creates a normalized (lowercase, trimmed) mapping.
 *
 * @param config - The document generation config
 * @returns Map of normalized labels to field IDs
 */
export function createLabelToFieldIdMap(config: DocumentGenerationConfig): Map<string, string> {
  const map = new Map<string, string>();

  for (const [fieldId, field] of Object.entries(config.fields)) {
    const normalizedLabel = field.label.toLowerCase().trim();
    map.set(normalizedLabel, fieldId);
  }

  return map;
}

/**
 * Extract values with label-based fallback matching
 *
 * First extracts using data-field-id, then attempts to match remaining
 * labels to field IDs using the config.
 *
 * @param jsx - The JSX string to parse
 * @param config - The document generation config (for label matching)
 * @returns Array of extracted fields
 */
export function extractValuesWithLabelFallback(
  jsx: string,
  config: DocumentGenerationConfig
): ExtractedField[] {
  // First, extract using data-field-id
  const extracted = extractValuesFromJSX(jsx);
  const seenFieldIds = new Set(extracted.map((f) => f.fieldId));

  // Create label mapping for fallback
  const labelMap = createLabelToFieldIdMap(config);

  // Pattern for Field without data-field-id but with label
  const fieldWithLabelPattern = /<Field\s+([^>]*?)>([\s\S]*?)<\/Field>/g;

  let match;
  while ((match = fieldWithLabelPattern.exec(jsx)) !== null) {
    const attributes = match[1];
    const content = match[2];

    // Skip if has data-field-id (already processed)
    if (attributes.includes('data-field-id=')) continue;

    // Extract label
    const labelMatch = attributes.match(/label="([^"]+)"/);
    if (!labelMatch) continue;

    const label = labelMatch[1];
    const normalizedLabel = label.toLowerCase().trim();

    // Try to match to a field ID
    const fieldId = labelMap.get(normalizedLabel);
    if (!fieldId || seenFieldIds.has(fieldId)) continue;

    seenFieldIds.add(fieldId);

    // Extract value
    const value = extractValueFromContent(content);
    if (value !== null) {
      extracted.push({ fieldId, label, value });
    }
  }

  return extracted;
}
