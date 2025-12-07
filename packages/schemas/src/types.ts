/**
 * Schema Asset Types
 *
 * Types for versioned schema assets
 */

/**
 * A versioned schema asset
 */
export type SchemaAsset = {
  // Identity
  id: string;              // "invoice-schema"
  version: string;         // "2.1.0" (semver)

  // Content
  schema: JSONSchemaObject;  // Standard JSON Schema

  // Metadata
  description?: string;
  tags?: string[];
  changelog?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
};

/**
 * JSON Schema object (simplified type)
 */
export interface JSONSchemaObject {
  $schema?: string;
  type?: string;
  properties?: Record<string, any>;
  items?: any;
  required?: string[];
  description?: string;
  title?: string;
  [key: string]: any;
}

/**
 * Schema reference format for node configs
 */
export type SchemaRef = {
  ref: string;  // "schema-id@version" format
};
