# @doclo/flows

Flow builder and execution engine for document processing pipelines.

## Installation

```bash
pnpm add @doclo/flows
```

## Usage

```typescript
import { createFlow, parse, extract } from '@doclo/flows';
import { createVLMProvider } from '@doclo/providers-llm';

const provider = createVLMProvider({
  provider: 'google',
  model: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY!
});

const schema = {
  type: 'object',
  properties: {
    invoiceNumber: { type: 'string' },
    total: { type: 'number' }
  }
};

const flow = createFlow()
  .step('parse', parse({ provider }))
  .step('extract', extract({ provider, schema }))
  .build();

const result = await flow.run({ base64: documentBase64 });
console.log(result.output);
```

## Flow Methods

```typescript
createFlow()
  .step(id, node)           // Add a sequential step
  .conditional(id, fn)      // Add conditional branching
  .forEach(id, childFlowFn) // Process arrays in parallel
  .output({ name, source }) // Mark explicit output
  .build()                  // Build executable flow
```

## Available Nodes

Re-exported from `@doclo/nodes`:

- `parse` - Extract text from documents
- `split` - Split multi-doc PDFs into segments
- `categorize` - Classify documents into categories
- `extract` - Extract structured data using schema
- `chunk` - Split text into chunks
- `combine` - Merge results
- `trigger` - Execute another flow

## License

MIT
