# @doclo/prompts

Prompt templates and registry for document extraction.

## Installation

```bash
pnpm add @doclo/prompts
```

## Usage

```typescript
import { PROMPT_REGISTRY, renderPrompt, registerPrompt } from '@doclo/prompts';

// Get a registered prompt
const extractPrompt = PROMPT_REGISTRY.get('extract');

// Render a prompt with variables
const rendered = renderPrompt('extract', {
  schema: mySchema,
  customInstructions: 'Be precise with dates'
});

// Register a custom prompt
registerPrompt({
  id: 'my-prompt',
  version: '1.0.0',
  messages: [
    { role: 'system', content: 'You are a document processor.' },
    { role: 'user', content: 'Extract: {{schema}}' }
  ]
});
```

## Built-in Prompts

- `default-extraction` - Structured data extraction
- `default-categorize` - Document classification
- `default-parse` - Text extraction

## License

MIT
