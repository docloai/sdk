# @doclo/providers-unsiloed

Unsiloed AI provider integrations for document processing.

## Installation

```bash
pnpm add @doclo/providers-unsiloed
```

## Providers

| Provider | Type | Node | Description |
|----------|------|------|-------------|
| `unsiloedParseProvider` | OCRProvider | `parse()` | Semantic parsing with YOLO+VLM+OCR |
| `unsiloedExtractProvider` | VLMProvider | `extract()` | Schema-based extraction |
| `unsiloedTablesProvider` | VLMProvider | `extract()` | Table extraction |
| `unsiloedClassifyProvider` | VLMProvider | `categorize()` | Document classification |
| `unsiloedSplitProvider` | VLMProvider | `split()` | Page-level splitting |

**Note:** Unsiloed providers only support PDF documents.

## Usage

```typescript
import {
  unsiloedParseProvider,
  unsiloedExtractProvider,
  unsiloedClassifyProvider
} from '@doclo/providers-unsiloed';

// Parse provider
const parseProvider = unsiloedParseProvider({
  apiKey: process.env.UNSILOED_API_KEY!,
  ocr_engine: 'UnsiloedHawk' // or 'UnsiloedStorm' for faster processing
});

// Extract provider
const extractProvider = unsiloedExtractProvider({
  apiKey: process.env.UNSILOED_API_KEY!
});

// Classify provider
const classifyProvider = unsiloedClassifyProvider({
  apiKey: process.env.UNSILOED_API_KEY!,
  conditions: ['invoice', 'contract', 'receipt']
});

// Use with flows
import { createFlow, parse, extract } from '@doclo/flows';

const flow = createFlow()
  .step('parse', parse({ provider: parseProvider }))
  .step('extract', extract({ provider: extractProvider, schema }))
  .build();
```

## Factory Function

```typescript
import { createUnsiloedProvider } from '@doclo/providers-unsiloed';

const provider = createUnsiloedProvider({
  type: 'parse', // 'parse' | 'extract' | 'tables' | 'classify' | 'split'
  apiKey: process.env.UNSILOED_API_KEY!
});
```

## Environment Variables

- `UNSILOED_API_KEY` - Your Unsiloed API key from [unsiloed-ai.com](https://unsiloed-ai.com/dashboard)

## License

MIT
