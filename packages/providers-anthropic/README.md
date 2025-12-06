# @docloai/providers-anthropic

Anthropic provider for the Doclo SDK. Supports Claude 3.5, Claude 4, and Opus models.

## Installation

```bash
npm install @docloai/providers-anthropic
# or
pnpm add @docloai/providers-anthropic
```

## Usage

```typescript
import { AnthropicProvider } from '@docloai/providers-anthropic';

// Direct usage with Anthropic API
const provider = new AnthropicProvider({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Via OpenRouter (recommended)
const provider = new AnthropicProvider({
  provider: 'anthropic',
  model: 'anthropic/claude-sonnet-4',
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

- Claude Vision support for images and PDFs
- Extended thinking/reasoning support
- Structured output with JSON Schema validation
- Automatic MIME type detection
- Cost and token tracking
- OpenRouter integration

## Extended Thinking

Enable Claude's extended thinking for complex reasoning:

```typescript
const result = await provider.completeJson({
  input: { text: 'Analyze this complex document...' },
  schema: mySchema,
  reasoning: {
    enabled: true,
    budget_tokens: 10000
  }
});

// Access reasoning output
console.log(result.reasoning);
```

## Auto-Registration

This package auto-registers with `@docloai/providers-llm` when imported:

```typescript
import '@docloai/providers-anthropic';
import { createVLMProvider } from '@docloai/providers-llm';

// Now 'anthropic' provider is available
const provider = createVLMProvider({
  provider: 'anthropic',
  model: 'anthropic/claude-sonnet-4',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});
```

## License

MIT
