# @docloai/flows

Flow orchestration and execution engine for document processing pipelines in the Doclo SDK.

## Installation

```bash
npm install @docloai/flows
# or
pnpm add @docloai/flows
```

## Features

- **FlowBuilder** - Declarative API for building document processing flows
- **FlowExecutor** - Execute flows with automatic dependency resolution
- **Composite Nodes** - Combine multiple nodes (sequence, parallel, forEach, conditional)
- **Metrics Aggregation** - Automatic cost and token tracking across flow execution

## Usage

```typescript
import { FlowBuilder, FlowExecutor } from '@docloai/flows';

// Build a flow
const flow = new FlowBuilder()
  .addStep('categorize', categorizeNode)
  .addStep('extract', extractNode, { dependsOn: ['categorize'] })
  .build();

// Execute the flow
const executor = new FlowExecutor(flow);
const result = await executor.execute({
  text: "Document content...",
  images: [{ base64: "...", mimeType: "image/jpeg" }]
});
```

## License

MIT
