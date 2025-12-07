# @doclo/providers-unsiloed

Unsiloed AI provider implementations for doclo-sdk, enabling advanced document processing capabilities including semantic parsing, structured extraction, table extraction, classification, and document splitting.

## Overview

This package provides 5 provider implementations that integrate Unsiloed's document intelligence API with doclo-sdk:

| Provider | Type | Purpose | Compatible Nodes |
|----------|------|---------|------------------|
| `unsiloedParseProvider` | OCRProvider | Semantic document parsing with YOLO+VLM+OCR | `parse()` |
| `unsiloedExtractProvider` | VLMProvider | Schema-based structured data extraction | `extract()` |
| `unsiloedTablesProvider` | VLMProvider | Advanced table detection and extraction | `extract()` |
| `unsiloedClassifyProvider` | VLMProvider | Document classification with confidence scoring | `categorize()` |
| `unsiloedSplitProvider` | VLMProvider | Page-level document splitting and classification | `split()` |

## Installation

```bash
pnpm add @doclo/providers-unsiloed
```

## Setup

### API Key

Get your API key from [Unsiloed Dashboard](https://unsiloed-ai.com/dashboard).

```bash
export UNSILOED_API_KEY="your-api-key-here"
```

### Limitations

- **PDF Only**: Unsiloed providers only support PDF documents (max 100MB)
- **Credit-Based Pricing**: Usage is charged based on credits/quota
- **Async Processing**: Most operations use job-based async processing

## Usage Examples

### 1. Parse Provider - Semantic Parsing

Extract document content with intelligent semantic chunking using YOLO segmentation + VLM + OCR.

```typescript
import { unsiloedParseProvider } from '@doclo/providers-unsiloed';
import { createFlow, parse } from '@doclo/flows';

const provider = unsiloedParseProvider({
  apiKey: process.env.UNSILOED_API_KEY!,
  ocr_engine: 'UnsiloedHawk', // High accuracy (default)
  // ocr_engine: 'UnsiloedStorm', // Faster processing
  use_high_resolution: true,
  segmentation_method: 'smart_layout_detection'
});

const flow = createFlow()
  .step('parse', parse({ provider }))
  .build();

const result = await flow({ url: 'document.pdf' });

// result is DocumentIR with semantic chunks as "pages"
console.log(`Parsed ${result.pages.length} semantic chunks`);
console.log(result.pages[0].markdown); // Chunk content
console.log(result.pages[0].extras?.semanticChunkType); // Chunk metadata
```

**Output Format:**
- Each semantic chunk becomes a virtual "page" in DocumentIR
- Original YOLO segmentation metadata preserved in `extras`
- Markdown content available for each chunk

### 2. Extract Provider - Structured Data Extraction

Extract structured data from PDFs using custom schemas with citation support.

```typescript
import { unsiloedExtractProvider } from '@doclo/providers-unsiloed';
import { createFlow, extract } from '@doclo/flows';

const provider = unsiloedExtractProvider({
  apiKey: process.env.UNSILOED_API_KEY!
});

const schema = {
  type: 'object',
  properties: {
    companyName: { type: 'string' },
    registrationNumber: { type: 'string' },
    address: { type: 'string' },
    directors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          position: { type: 'string' }
        }
      }
    }
  }
};

const flow = createFlow()
  .step('extract', extract({ provider, schema }))
  .build();

const result = await flow({ url: 'company-filing.pdf' });

console.log(result);
// {
//   companyName: "Acme Corp",
//   registrationNumber: "12345678",
//   directors: [{ name: "John Doe", position: "CEO" }]
// }
```

### 3. Tables Provider - Table Extraction

Extract and structure tables from PDF documents.

```typescript
import { unsiloedTablesProvider } from '@doclo/providers-unsiloed';

const provider = unsiloedTablesProvider({
  apiKey: process.env.UNSILOED_API_KEY!
});

const result = await provider.completeJson({
  prompt: { pdfs: [{ url: 'financial-report.pdf' }] },
  schema: {
    type: 'object',
    properties: {
      tables: { type: 'array' }
    }
  }
});

console.log(result.json.tables);
```

### 4. Classify Provider - Document Classification

Classify documents into predefined categories with confidence scoring.

```typescript
import { unsiloedClassifyProvider } from '@doclo/providers-unsiloed';
import { createFlow, categorize } from '@doclo/flows';

const provider = unsiloedClassifyProvider({
  apiKey: process.env.UNSILOED_API_KEY!,
  conditions: ['invoice', 'contract', 'receipt', 'legal_document']
});

const schema = {
  type: 'object',
  properties: {
    category: {
      enum: ['invoice', 'contract', 'receipt', 'legal_document']
    },
    confidence: { type: 'number' }
  }
};

const flow = createFlow()
  .step('classify', categorize({ provider, schema }))
  .build();

const result = await flow({ url: 'document.pdf' });

console.log(result);
// { category: 'invoice', confidence: 0.95 }
```

### 5. Split Provider - Document Splitting

Split multi-document PDFs by classifying and separating pages.

```typescript
import { unsiloedSplitProvider } from '@doclo/providers-unsiloed';
import { createFlow, split } from '@doclo/flows';

const provider = unsiloedSplitProvider({
  apiKey: process.env.UNSILOED_API_KEY!,
  categories: {
    'cover_page': 'Cover or title page',
    'invoice': 'Invoice or billing document',
    'contract': 'Contract or agreement',
    'appendix': 'Appendix or supplementary material'
  }
});

const flow = createFlow()
  .step('split', split({ provider }))
  .build();

const result = await flow({ url: 'mixed-documents.pdf' });

console.log(result);
// [
//   { type: 'invoice', pages: [1, 2, 3] },
//   { type: 'contract', pages: [4, 5, 6, 7] }
// ]
```

### 6. Combined Workflows

Combine providers for complex document processing pipelines.

```typescript
import {
  unsiloedParseProvider,
  unsiloedExtractProvider,
  unsiloedClassifyProvider
} from '@doclo/providers-unsiloed';
import { createFlow, parse, categorize, extract } from '@doclo/flows';

const parseProvider = unsiloedParseProvider({
  apiKey: process.env.UNSILOED_API_KEY!
});

const classifyProvider = unsiloedClassifyProvider({
  apiKey: process.env.UNSILOED_API_KEY!,
  conditions: ['invoice', 'receipt']
});

const extractProvider = unsiloedExtractProvider({
  apiKey: process.env.UNSILOED_API_KEY!
});

const invoiceSchema = {
  type: 'object',
  properties: {
    invoiceNumber: { type: 'string' },
    total: { type: 'number' },
    date: { type: 'string' }
  }
};

const flow = createFlow()
  .step('parse', parse({ provider: parseProvider }))
  .step('classify', categorize({
    provider: classifyProvider,
    schema: { category: { enum: ['invoice', 'receipt'] } }
  }))
  .step('extract', extract({
    provider: extractProvider,
    schema: invoiceSchema
  }))
  .build();

const result = await flow({ url: 'document.pdf' });

console.log(result);
// {
//   invoiceNumber: "INV-2024-001",
//   total: 1250.00,
//   date: "2024-01-15"
// }
```

## API Reference

### `unsiloedParseProvider(options)`

Creates an OCRProvider for semantic document parsing.

**Options:**
- `apiKey` (required): Unsiloed API key
- `endpoint` (optional): API endpoint URL (default: `https://prod.visionapi.unsiloed.ai`)
- `ocr_engine` (optional): `'UnsiloedHawk'` (high accuracy) or `'UnsiloedStorm'` (faster)
- `use_high_resolution` (optional): Enable high-resolution image processing
- `segmentation_method` (optional): `'smart_layout_detection'` or `'page_by_page'`
- `ocr_mode` (optional): `'auto_ocr'` or `'full_ocr'`

**Returns:** OCRProvider compatible with `parse()` node

### `unsiloedExtractProvider(options)`

Creates a VLMProvider for schema-based extraction.

**Options:**
- `apiKey` (required): Unsiloed API key
- `endpoint` (optional): API endpoint URL

**Returns:** VLMProvider compatible with `extract()` node

### `unsiloedTablesProvider(options)`

Creates a VLMProvider for table extraction.

**Options:**
- `apiKey` (required): Unsiloed API key
- `endpoint` (optional): API endpoint URL

**Returns:** VLMProvider compatible with `extract()` node

### `unsiloedClassifyProvider(options)`

Creates a VLMProvider for document classification.

**Options:**
- `apiKey` (required): Unsiloed API key
- `endpoint` (optional): API endpoint URL
- `conditions` (optional): Default categories for classification

**Returns:** VLMProvider compatible with `categorize()` node

### `unsiloedSplitProvider(options)`

Creates a VLMProvider for document splitting.

**Options:**
- `apiKey` (required): Unsiloed API key
- `endpoint` (optional): API endpoint URL
- `categories` (optional): Category name -> description mapping

**Returns:** VLMProvider compatible with `split()` node

### `createUnsiloedProvider(options)`

Convenience factory for creating any Unsiloed provider.

```typescript
const provider = createUnsiloedProvider({
  type: 'parse' | 'extract' | 'tables' | 'classify' | 'split',
  apiKey: string,
  config?: Record<string, any>
});
```

## Provider Metadata

Access provider capabilities and metadata:

```typescript
import { PROVIDER_METADATA, getProvidersForNode } from '@doclo/providers-unsiloed';

// Get metadata for a specific provider
console.log(PROVIDER_METADATA['unsiloed-parse']);

// Find all providers compatible with a node type
const parseProviders = getProvidersForNode('parse');
console.log(parseProviders);
```

## Error Handling

All providers throw descriptive errors for common issues:

```typescript
try {
  const result = await provider.parseToIR({ url: 'document.pdf' });
} catch (error) {
  if (error.message.includes('100MB')) {
    console.error('File too large for Unsiloed API');
  } else if (error.message.includes('only support PDF')) {
    console.error('Unsiloed only supports PDF files');
  } else if (error.message.includes('failed')) {
    console.error('Processing job failed:', error.message);
  }
}
```

## Cost Tracking

All providers return cost information when available:

```typescript
const result = await provider.completeJson({
  prompt: { pdfs: [{ url: 'doc.pdf' }] },
  schema
});

console.log(`Credits used: ${result.costUSD}`);
```

## Testing

Run the test suite:

```bash
UNSILOED_API_KEY="your-key" node tests/test-unsiloed-providers.mjs
```

## License

MIT

## Support

- API Documentation: https://docs.unsiloed.ai
- Dashboard: https://unsiloed-ai.com/dashboard
- Issues: https://github.com/your-org/doclo-sdk/issues
