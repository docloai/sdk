# @doclo/providers-llm

LLM provider integrations for the Doclo SDK. Supports OpenAI, Anthropic, Google (Gemini), and xAI (Grok).

## Installation

```bash
npm install @doclo/providers-llm
# or
pnpm add @doclo/providers-llm
```

## Supported Providers

- **OpenAI** - GPT-4, GPT-4o, GPT-4.1 models
- **Anthropic** - Claude 3.5, Claude 4.5, Opus models
- **Google** - Gemini 2.5 Flash, Gemini Pro models
- **xAI** - Grok 4 models

All providers can be used directly or via OpenRouter for unified billing and routing.

## Usage

```typescript
import { createProvider } from '@doclo/providers-llm';

// Create a provider
const provider = createProvider({
  provider: 'anthropic',
  model: 'anthropic/claude-sonnet-4-5-20250929',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});

// Use with structured output
const result = await provider.completeJson({
  input: { text: "Extract data from this...", images: [...] },
  schema: myZodSchema,
  mode: 'strict'
});
```

## Features

- Unified interface across all providers
- Structured output with JSON Schema validation
- Multimodal support (images, PDFs)
- Extended thinking/reasoning support
- Automatic MIME type detection
- Cost and token tracking

## License

MIT
