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
