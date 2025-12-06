# @docloai/providers-google

Google Gemini provider for the Doclo SDK. Supports Gemini 2.0 and 2.5 models.

## Installation

```bash
npm install @docloai/providers-google
# or
pnpm add @docloai/providers-google
```

## Usage

```typescript
import { GoogleProvider } from '@docloai/providers-google';

// Direct usage with Google AI API
const provider = new GoogleProvider({
  provider: 'google',
  model: 'gemini-2.0-flash',
  apiKey: process.env.GOOGLE_API_KEY
});

// Via OpenRouter (recommended)
const provider = new GoogleProvider({
  provider: 'google',
  model: 'google/gemini-2.5-flash-preview-05-20',
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

- Gemini Vision support for images and PDFs
- Thinking mode support for complex reasoning
- Structured output with JSON Schema validation
- Automatic MIME type detection
- Cost and token tracking
- OpenRouter integration

## Thinking Mode

Enable Gemini's thinking mode for complex reasoning:

```typescript
const result = await provider.completeJson({
  input: { text: 'Analyze this complex document...' },
  schema: mySchema,
  reasoning: {
    enabled: true,
    budget_tokens: 8192
  }
});

// Access thinking output
console.log(result.reasoning);
```

## Auto-Registration

This package auto-registers with `@docloai/providers-llm` when imported:

```typescript
import '@docloai/providers-google';
import { createVLMProvider } from '@docloai/providers-llm';

// Now 'google' provider is available
const provider = createVLMProvider({
  provider: 'google',
  model: 'google/gemini-2.5-flash-preview-05-20',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});
```

## License

MIT
