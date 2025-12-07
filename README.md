# Doclo SDK

A TypeScript SDK for document processing workflows with multi-provider LLM extraction, OCR, and document parsing capabilities.

## Installation

```bash
npm install @doclo/core @doclo/flows @doclo/providers-llm
```

Or install specific providers:

```bash
# LLM Providers (via OpenRouter or native APIs)
npm install @doclo/providers-openai
npm install @doclo/providers-anthropic
npm install @doclo/providers-google
npm install @doclo/providers-xai

# Document Processing Providers
npm install @doclo/providers-datalab   # OCR via Datalab/Surya
npm install @doclo/providers-reducto   # Document parsing & extraction
npm install @doclo/providers-unsiloed  # Document classification & extraction
```

## Quick Start

```typescript
import { createVLMProvider } from '@doclo/providers-llm';
import { z } from 'zod';

// Create a provider (supports OpenAI, Anthropic, Google, xAI)
const provider = createVLMProvider({
  provider: 'google',
  model: 'google/gemini-2.0-flash-001',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});

// Define your extraction schema
const invoiceSchema = z.object({
  vendor: z.string(),
  total: z.number(),
  date: z.string(),
  items: z.array(z.object({
    description: z.string(),
    amount: z.number()
  }))
});

// Extract structured data from an image
const result = await provider.completeJson({
  input: {
    text: 'Extract the invoice details from this image',
    images: [{ base64: imageBase64, mimeType: 'image/jpeg' }]
  },
  schema: invoiceSchema
});

console.log(result.json);
// { vendor: "Acme Corp", total: 1250.00, date: "2025-01-15", items: [...] }
```

## Packages

| Package | Description |
|---------|-------------|
| `@doclo/core` | Core types, utilities, security, and observability |
| `@doclo/flows` | Flow engine for multi-step document processing |
| `@doclo/nodes` | Processing nodes (extract, categorize, split, etc.) |
| `@doclo/prompts` | Prompt templates and registry |
| `@doclo/schemas` | JSON schema definitions and registry |
| `@doclo/providers-llm` | Shared LLM types and provider registry |
| `@doclo/providers-openai` | OpenAI provider (GPT-4, etc.) |
| `@doclo/providers-anthropic` | Anthropic provider (Claude) |
| `@doclo/providers-google` | Google provider (Gemini) |
| `@doclo/providers-xai` | xAI provider (Grok) |
| `@doclo/providers-datalab` | Datalab OCR provider (Surya, Marker) |
| `@doclo/providers-reducto` | Reducto document processing |
| `@doclo/providers-unsiloed` | Unsiloed document processing |
| `@doclo/client` | Cloud client for hosted Doclo API |

## Features

- **Multi-Provider Support**: Use OpenAI, Anthropic, Google, or xAI models interchangeably
- **OpenRouter Integration**: Access all providers through a single API key
- **Structured Output**: Type-safe JSON extraction with Zod schema validation
- **Vision Support**: Process images and PDFs with VLM capabilities
- **Document Processing**: OCR, parsing, splitting, and classification
- **Flow Engine**: Build multi-step document processing pipelines
- **Fallback & Retry**: Built-in resilience with provider fallback chains

## Using with OpenRouter

All LLM providers can be used via [OpenRouter](https://openrouter.ai) for unified billing and access:

```typescript
import { createVLMProvider } from '@doclo/providers-llm';

// OpenAI via OpenRouter
const openai = createVLMProvider({
  provider: 'openai',
  model: 'openai/gpt-4.1',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});

// Anthropic via OpenRouter
const claude = createVLMProvider({
  provider: 'anthropic',
  model: 'anthropic/claude-sonnet-4',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});

// Google via OpenRouter
const gemini = createVLMProvider({
  provider: 'google',
  model: 'google/gemini-2.0-flash-001',
  apiKey: process.env.OPENROUTER_API_KEY,
  via: 'openrouter'
});
```

## Building Flows

Create multi-step document processing pipelines:

```typescript
import { FlowBuilder } from '@doclo/flows';
import { createVLMProvider } from '@doclo/providers-llm';

const provider = createVLMProvider({ /* ... */ });

const flow = new FlowBuilder()
  .addNode('extract', {
    type: 'extract',
    provider,
    schema: mySchema
  })
  .addNode('categorize', {
    type: 'categorize',
    provider,
    categories: ['invoice', 'receipt', 'contract']
  })
  .build();

const result = await flow.run({ document: myDocument });
```

## License

MIT
