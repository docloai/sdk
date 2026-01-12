# @doclo/schemas

JSON Schema definitions and registry for document extraction.

## Installation

```bash
pnpm add @doclo/schemas
```

## Usage

```typescript
import { SCHEMA_REGISTRY, registerSchema, getSchema, bdnSchema } from '@doclo/schemas';

// Use a built-in schema directly
const result = await extract({ provider, schema: bdnSchema });

// Get schema from registry
const schema = SCHEMA_REGISTRY.get('bdn');

// Register a custom schema
registerSchema({
  id: 'my-invoice',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      invoiceNumber: { type: 'string' },
      total: { type: 'number' }
    }
  }
});
```

## Built-in Schemas

- `bdn` - Bunker Delivery Note (maritime fuel delivery)

## License

MIT
