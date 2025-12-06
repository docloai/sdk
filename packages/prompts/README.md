# @docloai/prompts

Prompt templates and utilities for document extraction in the Doclo SDK.

## Installation

```bash
npm install @docloai/prompts
# or
pnpm add @docloai/prompts
```

## Features

- Pre-built prompt templates for common extraction tasks
- Prompt composition utilities
- Schema-to-prompt conversion helpers

## Usage

```typescript
import { getPromptTemplate, composePrompt } from '@docloai/prompts';

// Get a pre-built template
const template = getPromptTemplate('extract');

// Compose a prompt with schema context
const prompt = composePrompt(template, {
  schema: mySchema,
  context: "Additional instructions..."
});
```

## License

MIT
