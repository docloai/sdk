# @docloai/providers-xai

xAI Grok provider for the Doclo SDK. Supports Grok 2 and Grok 4 models.

## Installation

```bash
npm install @docloai/providers-xai
# or
pnpm add @docloai/providers-xai
```

## Usage

```typescript
import { XAIProvider } from '@docloai/providers-xai';

// Direct usage with xAI API
const provider = new XAIProvider({
  provider: 'xai',
  model: 'grok-2-vision-1212',
  apiKey: process.env.XAI_API_KEY
});

// Via OpenRouter (recommended)
const provider = new XAIProvider({
  provider: 'xai',
  model: 'x-ai/grok-2-vision-1212',
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

- Grok Vision support for images
- Structured output with JSON Schema validation
- Automatic MIME type detection
- Cost and token tracking
- OpenRouter integration

## Auto-Registration

This package auto-registers with `@docloai/providers-llm` when imported:

```typescript
import '@docloai/providers-xai';
import { createVLMProvider } from '@docloai/providers-llm';

// Now 'xai' provider is available
const provider = createVLMProvider({
  provider: 'xai',
  model: 'x-ai/grok-2-vision-1212',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});
```

## Provider Aliases

Both `xai` and `x-ai` are supported as provider type names for compatibility.

## License

MIT
