/**
 * @doclo/schemas
 *
 * Schema definitions and versioned schema registry
 */

// Import JSON schemas with type assertion (backward compatible)
import bdnSchemaJSON from '../schemas/bdn.json' with { type: 'json' };

// Export raw schemas for backward compatibility
export const bdnSchema = bdnSchemaJSON;

// Export TypeScript type inferred from schema (optional - users can generate their own)
export type BDNData = {
  reference: {
    refNumber: string;
  };
  supplier: {
    supplierName: string;
    supplierLegalName?: string;
    supplierLicenseNumber?: string;
    supplierAddress?: string;
    supplierPhoneNumber1?: string;
    supplierEmail1?: string;
    // ... full type would be much longer
  };
  vessels: {
    receivingVessel: {
      vesselName: string;
      imoNumber?: string;
    };
    // ... etc
  };
  bunkering: {
    deliveredQuantityMT: number;
    // ... etc
  };
  product: {
    productName?: string;
    // ... etc
  };
};

// Export versioned schema types
export type {
  SchemaAsset,
  JSONSchemaObject,
  SchemaRef
} from './types.js';

// Export schema registry
export {
  SchemaRegistry,
  SCHEMA_REGISTRY,
  registerSchema,
  getSchema,
  getSchemaByRef,
  getLatestSchema
} from './schema-registry.js';

// Auto-register default schemas
import './default-schemas.js';
