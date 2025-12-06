import type { UnifiedSchema } from "./types";
import { zodToJsonSchema } from "@alcyone-labs/zod-to-json-schema";

/**
 * Internal JSON Schema representation for schema translation.
 * This is more flexible than JSONSchemaNode to accommodate:
 * - Zod schema markers (~standard, _def)
 * - Provider-specific extensions (propertyOrdering)
 * - Intermediate conversion states
 */
interface FlexibleSchemaNode {
  type?: string | string[];
  properties?: Record<string, FlexibleSchemaNode>;
  items?: FlexibleSchemaNode | FlexibleSchemaNode[];
  required?: string[];
  enum?: (string | number | boolean | null)[];
  nullable?: boolean;
  anyOf?: FlexibleSchemaNode[];
  oneOf?: FlexibleSchemaNode[];
  allOf?: FlexibleSchemaNode[];
  additionalProperties?: boolean | FlexibleSchemaNode;
  description?: string;
  format?: string;
  default?: unknown;
  $schema?: string;
  $defs?: Record<string, FlexibleSchemaNode>;
  definitions?: Record<string, FlexibleSchemaNode>;
  // Zod schema markers
  '~standard'?: { vendor: string; [key: string]: unknown };
  _def?: unknown;
  // Gemini-specific
  propertyOrdering?: string[];
  [key: string]: unknown;  // Allow additional properties for extensibility
}

/**
 * Translates unified JSON Schema to provider-specific formats
 */
export class SchemaTranslator {
  /**
   * Unified → OpenAI/Grok (standard JSON Schema)
   * OpenAI strict mode doesn't support nullable: true
   * Must convert to anyOf: [{ type: "string" }, { type: "null" }]
   */
  toOpenAISchema<T>(schema: UnifiedSchema<T>): object {
    // Detect and convert Zod schemas
    const jsonSchema = this.convertZodIfNeeded(schema);
    return this.convertNullableToAnyOf(jsonSchema);
  }

  /**
   * Detect if schema is a Zod schema and convert to JSON Schema
   * Public method to allow embedding schemas in prompts
   */
  convertZodIfNeeded(schema: FlexibleSchemaNode | unknown): FlexibleSchemaNode {
    // Check for Zod schema markers
    if (schema && typeof schema === 'object') {
      const flexibleSchema = schema as FlexibleSchemaNode;
      // Zod v4 uses ~standard marker
      if (flexibleSchema['~standard']?.vendor === 'zod') {
        // Schema has Zod marker, safe to pass to zodToJsonSchema
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonSchema = zodToJsonSchema(schema as any) as FlexibleSchemaNode;
        // Remove properties not allowed in OpenAI strict mode or Gemini responseSchema
        delete jsonSchema.$schema;
        delete jsonSchema.$defs;
        delete jsonSchema.definitions;
        return jsonSchema;
      }
      // Zod v3 uses _def property
      if (flexibleSchema._def) {
        // Schema has Zod _def, safe to pass to zodToJsonSchema
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonSchema = zodToJsonSchema(schema as any) as FlexibleSchemaNode;
        // Remove properties not allowed in OpenAI strict mode or Gemini responseSchema
        delete jsonSchema.$schema;
        delete jsonSchema.$defs;
        delete jsonSchema.definitions;
        return jsonSchema;
      }
    }
    // Already JSON Schema, return as-is
    return schema as FlexibleSchemaNode;
  }

  /**
   * Convert nullable fields to anyOf format for OpenAI strict mode
   * nullable: true is not supported, must use anyOf with null type
   */
  private convertNullableToAnyOf(schema: FlexibleSchemaNode): FlexibleSchemaNode {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    const result: FlexibleSchemaNode = { ...schema };

    // Handle nullable property at current level
    if (result.nullable === true) {
      delete result.nullable;

      // Get the base type
      const baseType = result.type;

      if (baseType) {
        // Create anyOf with base type and null
        return {
          anyOf: [
            { type: baseType as string },
            { type: 'null' }
          ]
        };
      }
    }

    // Recursively handle properties
    if (result.properties) {
      result.properties = Object.fromEntries(
        Object.entries(result.properties).map(([key, value]) => {
          if (value && typeof value === 'object' && value.nullable === true) {
            const { nullable, type, ...rest } = value;
            return [key, {
              anyOf: [
                { type, ...rest },
                { type: 'null' }
              ]
            }];
          }
          return [key, this.convertNullableToAnyOf(value)];
        })
      );
    }

    // Handle items (for arrays)
    if (result.items && !Array.isArray(result.items)) {
      result.items = this.convertNullableToAnyOf(result.items);
    }

    // Handle anyOf, oneOf, allOf
    const keywords = ['anyOf', 'oneOf', 'allOf'] as const;
    keywords.forEach(keyword => {
      const schemaArray = result[keyword];
      if (schemaArray && Array.isArray(schemaArray)) {
        result[keyword] = schemaArray.map((s) => this.convertNullableToAnyOf(s));
      }
    });

    return result;
  }

  /**
   * Unified → Claude (Tool Input Schema format)
   * Claude requires tool calling with input_schema
   * Claude supports nullable: true directly
   */
  toClaudeToolSchema<T>(schema: UnifiedSchema<T>): object {
    // Detect and convert Zod schemas first
    const jsonSchema = this.convertZodIfNeeded(schema);

    // Claude uses JSON Schema but needs it wrapped in a tool definition
    // Claude DOES support nullable: true, so we keep it as-is
    return {
      name: "extract_data",
      description: "Extract structured data according to the schema",
      input_schema: jsonSchema as object
    };
  }

  /**
   * Unified → Claude for OpenRouter
   * When using Claude via OpenRouter, use anyOf format like OpenAI
   */
  toClaudeOpenRouterSchema<T>(schema: UnifiedSchema<T>): object {
    // Detect and convert Zod schemas first
    const jsonSchema = this.convertZodIfNeeded(schema);
    return this.convertNullableToAnyOf(jsonSchema);
  }

  /**
   * Unified → Gemini (OpenAPI 3.0 subset with propertyOrdering)
   * Gemini uses a subset of OpenAPI 3.0 schema
   */
  toGeminiSchema<T>(schema: UnifiedSchema<T>): object {
    // Detect and convert Zod schemas first
    const jsonSchema = this.convertZodIfNeeded(schema);

    // Convert JSON Schema to Gemini's format
    const geminiSchema: FlexibleSchemaNode = {
      type: jsonSchema.type
    };

    if (jsonSchema.properties) {
      geminiSchema.properties = {};
      // Add propertyOrdering for consistent output order
      const propertyNames = Object.keys(jsonSchema.properties);
      geminiSchema.propertyOrdering = propertyNames;

      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        geminiSchema.properties[key] = this.convertPropertyToGemini(value);
      }
    }

    if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
      geminiSchema.required = jsonSchema.required;
    }

    if (jsonSchema.additionalProperties !== undefined) {
      geminiSchema.additionalProperties = jsonSchema.additionalProperties;
    }

    return geminiSchema;
  }

  /**
   * Convert individual property to Gemini format
   */
  private convertPropertyToGemini(property: FlexibleSchemaNode): FlexibleSchemaNode {
    const geminiProp: FlexibleSchemaNode = {
      type: property.type
    };

    if (property.description) {
      geminiProp.description = property.description;
    }

    if (property.nullable !== undefined) {
      geminiProp.nullable = property.nullable;
    }

    if (property.enum) {
      geminiProp.enum = property.enum;
    }

    if (property.items) {
      // Items can be a single schema or array of schemas (tuple validation)
      if (Array.isArray(property.items)) {
        // For tuple validation, just convert the first schema
        geminiProp.items = property.items.length > 0
          ? this.convertPropertyToGemini(property.items[0])
          : undefined;
      } else {
        geminiProp.items = this.convertPropertyToGemini(property.items);
      }
    }

    if (property.properties) {
      geminiProp.properties = {};
      for (const [key, value] of Object.entries(property.properties)) {
        geminiProp.properties[key] = this.convertPropertyToGemini(value);
      }
    }

    if (property.required) {
      geminiProp.required = property.required;
    }

    return geminiProp;
  }
}
