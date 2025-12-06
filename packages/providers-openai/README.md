# @docloai/providers-openai

OpenAI provider for the Doclo SDK. Supports GPT-4, GPT-4o, and GPT-4.1 models.

## Installation

```bash
npm install @docloai/providers-openai
# or
pnpm add @docloai/providers-openai
```

## Usage

```typescript
import { OpenAIProvider } from '@docloai/providers-openai';

// Direct usage with OpenAI API
const provider = new OpenAIProvider({
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY
});

// Via OpenRouter (recommended)
const provider = new OpenAIProvider({
  provider: 'openai',
  model: 'openai/gpt-4.1',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});

// Extract structured data
const result = await provider.completeJson({
  input: {
    text: 'Extract the invoice details',
    images: [{ base64: '...', mimeType: 'image/jpeg' }]
  },
  schema: myZodSchema
});

console.log(result.json);
```

## Features

- GPT-4 Vision support for images and PDFs
- Structured output with JSON Schema validation
- Automatic MIME type detection
- Cost and token tracking
- OpenRouter integration

## Auto-Registration

This package auto-registers with `@docloai/providers-llm` when imported:

```typescript
import '@docloai/providers-openai';
import { createVLMProvider } from '@docloai/providers-llm';

// Now 'openai' provider is available
const provider = createVLMProvider({
  provider: 'openai',
  model: 'openai/gpt-4.1',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});
```

## License

MIT
