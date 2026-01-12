# @doclo/providers-extend

Extend.ai provider integrations for document processing.

## Installation

```bash
pnpm add @doclo/providers-extend
```

## Providers

| Provider | Type | Node | Description |
|----------|------|------|-------------|
| `extendParseProvider` | OCRProvider | `parse()` | Document parsing to markdown |
| `extendExtractProvider` | VLMProvider | `extract()` | Schema-based extraction |
| `extendClassifyProvider` | VLMProvider | `categorize()` | Document classification |
| `extendSplitProvider` | VLMProvider | `split()` | Multi-page splitting |

## Usage

```typescript
import { extendParseProvider, extendExtractProvider } from '@doclo/providers-extend';

// Parse provider
const parseProvider = extendParseProvider({
  apiKey: process.env.EXTEND_API_KEY!
});

// Extract provider (requires processor ID from Extend dashboard)
const extractProvider = extendExtractProvider({
  apiKey: process.env.EXTEND_API_KEY!,
  processorId: 'your-processor-id'
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
import { createExtendProvider } from '@doclo/providers-extend';

const provider = createExtendProvider({
  type: 'parse', // 'parse' | 'extract' | 'classify' | 'split'
  apiKey: process.env.EXTEND_API_KEY!,
  processorId: 'your-processor-id' // required for extract/classify/split
});
```

## Environment Variables

- `EXTEND_API_KEY` - Your Extend.ai API key

## License

MIT
