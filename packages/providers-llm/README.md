# @doclo/providers-llm

LLM/VLM provider integrations for the Doclo SDK.

## Installation

```bash
pnpm add @doclo/providers-llm
```

## Supported Providers

- **OpenAI** - GPT-4, GPT-4o, GPT-4.1
- **Anthropic** - Claude 3.5, Claude 4.5
- **Google** - Gemini 2.5 Flash, Gemini Pro
- **xAI** - Grok 4

All providers can be used directly or via OpenRouter.

## Usage

### Via OpenRouter (Recommended)

```typescript
import { createVLMProvider } from '@doclo/providers-llm';

const provider = createVLMProvider({
  provider: 'google',
  model: 'google/gemini-2.5-flash-preview',
  apiKey: process.env.OPENROUTER_API_KEY!,
  via: 'openrouter'
});
```

### Native Provider APIs

```typescript
// Google
const gemini = createVLMProvider({
  provider: 'google',
  model: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY!
});

// OpenAI
const gpt = createVLMProvider({
  provider: 'openai',
  model: 'gpt-4.1',
  apiKey: process.env.OPENAI_API_KEY!
});

// Anthropic
const claude = createVLMProvider({
  provider: 'anthropic',
  model: 'claude-sonnet-4.5',
  apiKey: process.env.ANTHROPIC_API_KEY!
});

// xAI
const grok = createVLMProvider({
  provider: 'xai',
  model: 'grok-4-fast',
  apiKey: process.env.XAI_API_KEY!
});
```

## Features

- Unified interface across all providers
- Structured output with JSON Schema validation
- Vision/multimodal support (images, PDFs)
- Extended thinking/reasoning support
- Cost and token tracking

## License

MIT
