/**
 * Example JSON Schema for documentation purposes
 *
 * Note: Converted from AJV's JSONSchemaType to plain JSON Schema format
 * for Edge Runtime compatibility.
 */

export type SimpleOut = { vessel?: string; port?: string; quantity_mt?: number };

export const simpleSchema = {
  type: "object",
  properties: {
    vessel: { type: "string", nullable: true },
    port: { type: "string", nullable: true },
    quantity_mt: { type: "number", nullable: true }
  },
  required: [],
  additionalProperties: false
} as const;
