# Doclo SDK

A TypeScript SDK for document processing workflows with multi-provider LLM extraction, OCR, and document parsing capabilities.

## Installation

```bash
npm install @docloai/core @docloai/flows @docloai/providers-llm
```

Or install specific providers:

```bash
# LLM Providers (via OpenRouter or native APIs)
npm install @docloai/providers-openai
npm install @docloai/providers-anthropic
npm install @docloai/providers-google
npm install @docloai/providers-xai

# Document Processing Providers
npm install @docloai/providers-datalab   # OCR via Datalab/Surya
npm install @docloai/providers-reducto   # Document parsing & extraction
npm install @docloai/providers-unsiloed  # Document classification & extraction
```

## Quick Start

```typescript
import { createVLMProvider } from '@docloai/providers-llm';
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
| `@docloai/core` | Core types, utilities, security, and observability |
| `@docloai/flows` | Flow engine for multi-step document processing |
| `@docloai/nodes` | Processing nodes (extract, categorize, split, etc.) |
| `@docloai/prompts` | Prompt templates and registry |
| `@docloai/schemas` | JSON schema definitions and registry |
| `@docloai/providers-llm` | Shared LLM types and provider registry |
| `@docloai/providers-openai` | OpenAI provider (GPT-4, etc.) |
| `@docloai/providers-anthropic` | Anthropic provider (Claude) |
| `@docloai/providers-google` | Google provider (Gemini) |
| `@docloai/providers-xai` | xAI provider (Grok) |
| `@docloai/providers-datalab` | Datalab OCR provider (Surya, Marker) |
| `@docloai/providers-reducto` | Reducto document processing |
| `@docloai/providers-unsiloed` | Unsiloed document processing |
| `@docloai/client` | Cloud client for hosted Doclo API |

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
import { createVLMProvider } from '@docloai/providers-llm';

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
import { FlowBuilder } from '@docloai/flows';
import { createVLMProvider } from '@docloai/providers-llm';

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
