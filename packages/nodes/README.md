# @doclo/nodes

Processing nodes for document extraction and transformation in the Doclo SDK.

## Installation

```bash
npm install @doclo/nodes
# or
pnpm add @doclo/nodes
```

## Features

- **ExtractNode** - Extract structured data from documents using LLM providers
- **CategorizeNode** - Classify documents into predefined categories
- **SplitNode** - Split multi-page documents into logical sections
- **ConsensusNode** - Run multiple extractions and merge results for higher accuracy

## Usage

```typescript
import { ExtractNode, CategorizeNode } from '@doclo/nodes';

// Create an extraction node
const extractNode = new ExtractNode({
  provider: myLLMProvider,
  schema: mySchema
});

// Execute extraction
const result = await extractNode.execute({
  text: "Document content...",
  images: [{ base64: "...", mimeType: "image/jpeg" }]
});
```

## License

MIT
