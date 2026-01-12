# @doclo/nodes

Processing nodes for document extraction and transformation.

## Installation

```bash
pnpm add @doclo/nodes
```

## Available Nodes

| Node | Purpose | Input | Output |
|------|---------|-------|--------|
| `parse` | Extract text from documents | FlowInput | DocumentIR |
| `split` | Split multi-doc PDFs | FlowInput | SplitDocument[] |
| `categorize` | Classify documents | FlowInput/DocumentIR | { input, category } |
| `extract` | Extract structured data | DocumentIR/FlowInput | Schema-typed object |
| `chunk` | Split text into chunks | DocumentIR | ChunkOutput[] |
| `combine` | Merge results | Array | Combined result |
| `output` | Mark explicit output | Any | Passed through |
| `trigger` | Execute another flow | Any | Child flow output |

## Usage

```typescript
import { parse, extract, categorize } from '@doclo/nodes';
import { createVLMProvider } from '@doclo/providers-llm';

const provider = createVLMProvider({
  provider: 'google',
  model: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY!
});

// Create nodes
const parseNode = parse({ provider });
const extractNode = extract({ provider, schema: mySchema });
const categorizeNode = categorize({ provider, categories: ['invoice', 'receipt'] });
```

## License

MIT
