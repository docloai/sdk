/**
 * Utility for converting JSON Schema to human-readable prompt text
 * that emphasizes exact field name requirements for structured extraction.
 */

/**
 * JSON Schema type used for prompt formatting.
 * Uses a recursive structure to support nested schemas.
 */
export interface JSONSchema {
  type?: string | string[];  // Can be array for union types (e.g., ["string", "null"])
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];  // Can be array for tuple validation
  description?: string;
  required?: string[];
  enum?: (string | number | boolean | null)[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  format?: string;
  [key: string]: unknown;  // Allow additional properties
}

/**
 * Formats a JSON Schema into prompt text that emphasizes exact field names.
 * This helps LLMs understand they must use the exact field names specified
 * in the schema, not invent their own based on document content.
 */
export function formatSchemaForPrompt(schema: JSONSchema, indent: number = 0): string {
  if (!schema || typeof schema !== 'object') {
    return '';
  }

  const indentStr = '  '.repeat(indent);
  let result = '';

  // Handle object type with properties
  if (schema.type === 'object' && schema.properties) {
    const properties = schema.properties;
    const required = schema.required || [];

    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      const isRequired = required.includes(fieldName);
      const requiredMarker = isRequired ? ' (REQUIRED)' : ' (optional)';

      // Field name in backticks to emphasize exactness
      result += `${indentStr}- \`${fieldName}\`${requiredMarker}`;

      // Type information
      const type = getTypeDescription(fieldSchema);
      if (type) {
        result += `: ${type}`;
      }

      // Description if available
      if (fieldSchema.description) {
        result += `\n${indentStr}  ${fieldSchema.description}`;
      }

      // Enum values if specified
      if (fieldSchema.enum) {
        result += `\n${indentStr}  Allowed values: ${fieldSchema.enum.map((v) => JSON.stringify(v)).join(', ')}`;
      }

      result += '\n';

      // Nested object properties
      if (fieldSchema.type === 'object' && fieldSchema.properties) {
        result += formatSchemaForPrompt(fieldSchema, indent + 1);
      }

      // Array item schema
      if (fieldSchema.type === 'array' && fieldSchema.items) {
        result += `${indentStr}  Array items:\n`;
        // Handle both single schema and tuple schemas (array of schemas)
        const itemSchema = Array.isArray(fieldSchema.items)
          ? fieldSchema.items[0]  // For tuple validation, describe first item type
          : fieldSchema.items;
        if (itemSchema && itemSchema.type === 'object' && itemSchema.properties) {
          result += formatSchemaForPrompt(itemSchema, indent + 2);
        } else if (itemSchema) {
          const itemType = getTypeDescription(itemSchema);
          result += `${indentStr}    ${itemType}\n`;
        }
      }
    }
  }

  return result;
}

/**
 * Gets a human-readable type description from a schema property
 */
function getTypeDescription(schema: JSONSchema): string {
  if (!schema) return 'any';

  if (schema.type) {
    // Handle array of types (e.g., ["string", "null"])
    const typeStr = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;

    if (typeStr === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
      if (schema.items && !Array.isArray(schema.items) && schema.items.type) {
        const itemType = Array.isArray(schema.items.type)
          ? schema.items.type.join(' | ')
          : schema.items.type;
        return `array of ${itemType}`;
      }
      return 'array';
    }
    // Include format information for strings (e.g., date, time, date-time, email, uri)
    if ((typeStr === 'string' || (Array.isArray(schema.type) && schema.type.includes('string'))) && schema.format) {
      const formatHints: Record<string, string> = {
        'date': 'YYYY-MM-DD',
        'time': 'HH:MM or HH:MM:SS',
        'date-time': 'YYYY-MM-DDTHH:MM:SS (ISO 8601)',
      };
      const hint = formatHints[schema.format];
      if (hint) {
        return `string (format: ${schema.format}, use ${hint})`;
      }
      return `string (format: ${schema.format})`;
    }
    return typeStr;
  }

  // Handle anyOf, oneOf, allOf
  if (schema.anyOf) {
    return schema.anyOf.map((s) => getTypeDescription(s)).join(' OR ');
  }
  if (schema.oneOf) {
    return schema.oneOf.map((s) => getTypeDescription(s)).join(' OR ');
  }

  return 'any';
}

/**
 * Generates a complete prompt section with schema information and
 * strict field name instructions.
 */
export function buildSchemaPromptSection(schema: JSONSchema): string {
  const schemaFields = formatSchemaForPrompt(schema);

  return `
==================================================
CRITICAL: OUTPUT STRUCTURE REQUIREMENTS
==================================================

YOU MUST RETURN JSON MATCHING THIS EXACT STRUCTURE:

${schemaFields}

CRITICAL FIELD NAME REQUIREMENTS:
✓ Use EXACTLY the field names shown above (character-for-character match)
✓ Preserve the exact casing (e.g., "fullName", not "full_name" or "FullName")
✓ Do NOT abbreviate field names (e.g., "dob" instead of "dateOfBirth")
✓ Do NOT invent alternative names (e.g., "directorName" instead of "fullName")
✓ Do NOT use snake_case if the schema uses camelCase
✓ Do NOT flatten nested structures or rename nested fields
✓ The schema above is the SINGLE SOURCE OF TRUTH for field naming

MISSING DATA:
- If a required field has no data in the document, use null
- If an optional field has no data, you may omit it or use null
- Do NOT invent data that isn't in the document

==================================================
`.trim();
}

/**
 * Combines schema prompt section with user's custom prompt
 */
export function combineSchemaAndUserPrompt(
  schema: JSONSchema,
  userPrompt: string
): string {
  const schemaSection = buildSchemaPromptSection(schema);

  if (!userPrompt || userPrompt.trim() === '') {
    return schemaSection + '\n\nTASK: Extract structured data from the provided document.';
  }

  return schemaSection + '\n\n' + userPrompt;
}

// ============================================================================
// LLM-Derived Feature Prompts
// ============================================================================

/**
 * Output format types for LLM text generation
 */
export type OutputFormat = 'markdown' | 'html' | 'json' | 'text';
export type TableFormat = 'markdown' | 'html' | 'csv';
export type ChunkingStrategy = 'page' | 'section' | 'paragraph' | 'semantic';

/**
 * Options for LLM-derived features that are implemented via prompting
 */
export interface LLMDerivedPromptOptions {
  outputFormat?: OutputFormat;
  tableFormat?: TableFormat;
  pageMarkers?: boolean;
  includeConfidence?: boolean;
  includeSources?: boolean;
  includeBlockTypes?: boolean;
  extractHeaders?: boolean;
  extractFooters?: boolean;
  chunkingStrategy?: ChunkingStrategy;
  maxChunkSize?: number;
  languageHints?: string[];
}

/**
 * Builds prompt additions for output format options
 */
export function buildOutputFormatPrompt(options: LLMDerivedPromptOptions): string {
  const parts: string[] = [];

  // Output format
  if (options.outputFormat) {
    switch (options.outputFormat) {
      case 'markdown':
        parts.push('Format all text content using markdown syntax. Use proper headings (#, ##, ###), lists (-, *), bold (**text**), and other markdown formatting where appropriate.');
        break;
      case 'html':
        parts.push('Format all text content as valid HTML. Use semantic tags like <p>, <h1>-<h6>, <ul>, <ol>, <strong>, <em> where appropriate.');
        break;
      case 'json':
        parts.push('For text fields that contain structured data, format them as embedded JSON strings where appropriate.');
        break;
      case 'text':
        parts.push('Return plain text without any formatting. No markdown, HTML, or other markup.');
        break;
    }
  }

  // Table format
  if (options.tableFormat) {
    switch (options.tableFormat) {
      case 'markdown':
        parts.push('Format all tables using markdown table syntax with | column separators and header row with ---.');
        break;
      case 'html':
        parts.push('Format all tables as HTML <table> elements with <thead>, <tbody>, <tr>, <th>, and <td> tags.');
        break;
      case 'csv':
        parts.push('Format all tables as CSV with headers in the first row and comma-separated values.');
        break;
    }
  }

  // Page markers
  if (options.pageMarkers) {
    parts.push('Insert "---" page break markers between content from different pages of the document.');
  }

  return parts.join('\n');
}

/**
 * Builds prompt additions for language hints
 */
export function buildLanguageHintsPrompt(languages: string[]): string {
  if (!languages || languages.length === 0) {
    return '';
  }
  return `The document is written in ${languages.join(', ')}. Extract and preserve text in the original language(s).`;
}

/**
 * Builds prompt additions for confidence scoring
 */
export function buildConfidencePrompt(): string {
  return `
For each extracted field, assess your confidence level and include it in the "_confidence" object:
- Use a number from 0.0 to 1.0 where:
  - 0.9-1.0: Very high confidence - text is clear and unambiguous
  - 0.7-0.9: High confidence - minor ambiguity but likely correct
  - 0.5-0.7: Medium confidence - some uncertainty or partial visibility
  - 0.3-0.5: Low confidence - significant uncertainty
  - 0.0-0.3: Very low confidence - guessing or text was unclear

Include "_confidence" as a sibling object mapping field paths to their scores.
Example: "_confidence": { "invoiceNumber": 0.95, "amount": 0.82 }
`.trim();
}

/**
 * Builds prompt additions for source citations with bounding boxes
 */
export function buildSourcesPrompt(): string {
  return `
For each extracted field, identify the source location in the document and include it in the "_sources" array:
Each source entry should contain:
- "field": The field name/path that was extracted
- "text": The exact text from the document used for extraction
- "bbox": Bounding box as [y_min, x_min, y_max, x_max] normalized to 0-1000 scale
- "page": Page number (0-indexed) where the text appears

Include "_sources" as a sibling array to your extracted data.
Example: "_sources": [{ "field": "invoiceNumber", "text": "INV-001", "bbox": [100, 50, 120, 150], "page": 0 }]
`.trim();
}

/**
 * Builds prompt additions for block type classification
 */
export function buildBlockClassificationPrompt(): string {
  return `
For each extracted element or text block, classify its type in a "_blockTypes" object:
- "title": Main document title or major section headers
- "heading": Section headings and subheadings
- "paragraph": Body text paragraphs
- "table": Tabular data
- "list": Bulleted or numbered lists
- "header": Page headers (repeated at top of pages)
- "footer": Page footers (repeated at bottom of pages)
- "caption": Image or figure captions
- "code": Code blocks or preformatted text

Include "_blockTypes" mapping field paths to their block type.
Example: "_blockTypes": { "summary": "paragraph", "items": "list" }
`.trim();
}

/**
 * Builds prompt additions for header/footer extraction
 */
export function buildHeaderFooterPrompt(options: { extractHeaders?: boolean; extractFooters?: boolean }): string {
  const parts: string[] = [];

  if (options.extractHeaders) {
    parts.push('Identify and extract document headers (repeated content at the top of pages) into a "_headers" array.');
  }

  if (options.extractFooters) {
    parts.push('Identify and extract document footers (repeated content at the bottom of pages, like page numbers) into a "_footers" array.');
  }

  if (parts.length > 0) {
    parts.push('Each header/footer entry should include: { "text": "...", "pages": [0, 1, 2] } listing which pages contain it.');
  }

  return parts.join('\n');
}

/**
 * Builds prompt additions for semantic chunking
 */
export function buildChunkingPrompt(strategy: ChunkingStrategy, maxChunkSize?: number): string {
  const sizeNote = maxChunkSize
    ? ` Keep chunks under ${maxChunkSize} characters when possible.`
    : '';

  switch (strategy) {
    case 'page':
      return `Organize the extracted content by page. Include page number for each chunk.${sizeNote}`;
    case 'section':
      return `Divide the document into logical sections based on headings and structure. Each section should be a coherent unit.${sizeNote}`;
    case 'paragraph':
      return `Divide the content into individual paragraphs, preserving the natural paragraph breaks from the document.${sizeNote}`;
    case 'semantic':
      return `Divide the document into semantically coherent chunks. Each chunk should be a self-contained unit of meaning that could stand alone.${sizeNote}`;
    default:
      return '';
  }
}

/**
 * Combines all LLM-derived feature prompts into a single prompt section
 */
export function buildLLMDerivedFeaturesPrompt(options: LLMDerivedPromptOptions): string {
  const parts: string[] = [];

  // Output format options
  const formatPrompt = buildOutputFormatPrompt(options);
  if (formatPrompt) {
    parts.push(formatPrompt);
  }

  // Language hints
  if (options.languageHints && options.languageHints.length > 0) {
    parts.push(buildLanguageHintsPrompt(options.languageHints));
  }

  // Metadata features (confidence, sources, block types)
  if (options.includeConfidence) {
    parts.push(buildConfidencePrompt());
  }

  if (options.includeSources) {
    parts.push(buildSourcesPrompt());
  }

  if (options.includeBlockTypes) {
    parts.push(buildBlockClassificationPrompt());
  }

  // Header/footer extraction
  if (options.extractHeaders || options.extractFooters) {
    parts.push(buildHeaderFooterPrompt(options));
  }

  // Chunking strategy
  if (options.chunkingStrategy) {
    parts.push(buildChunkingPrompt(options.chunkingStrategy, options.maxChunkSize));
  }

  if (parts.length === 0) {
    return '';
  }

  return `
==================================================
ADDITIONAL OUTPUT REQUIREMENTS
==================================================

${parts.join('\n\n')}

==================================================
`.trim();
}

/**
 * Combines schema prompt with user prompt and LLM-derived features
 */
export function combineSchemaUserAndDerivedPrompts(
  schema: JSONSchema,
  userPrompt: string,
  derivedOptions?: LLMDerivedPromptOptions
): string {
  let result = combineSchemaAndUserPrompt(schema, userPrompt);

  if (derivedOptions) {
    const derivedPrompt = buildLLMDerivedFeaturesPrompt(derivedOptions);
    if (derivedPrompt) {
      result = result + '\n\n' + derivedPrompt;
    }
  }

  return result;
}
