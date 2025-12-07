# @doclo/schemas

JSON Schema definitions for document extraction types in the Doclo SDK.

## Installation

```bash
npm install @doclo/schemas
# or
pnpm add @doclo/schemas
```

## Features

- Pre-built JSON Schemas for common document types
- Schema loading and validation utilities
- TypeScript type generation from schemas

## Included Schemas

- **BDN (Bunker Delivery Note)** - Maritime fuel delivery documents
- **Companies House** - UK company registration documents
- Additional schemas for common document types

## Usage

```typescript
import { loadSchema, getSchemaPath } from '@doclo/schemas';

// Load a pre-built schema
const bdnSchema = await loadSchema('bdn');

// Get path to schema file
const schemaPath = getSchemaPath('bdn');
```

## Exports

- `.` - Main entry point with schema utilities
- `./schemas/*` - Direct access to JSON schema files

## License

MIT
