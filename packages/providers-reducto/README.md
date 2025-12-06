# @docloai/providers-reducto

Reducto document processing provider for the Doclo SDK.

## Installation

```bash
npm install @docloai/providers-reducto
# or
pnpm add @docloai/providers-reducto
```

## Features

- Document parsing and text extraction
- Support for PDFs and images
- Structured data extraction
- Table detection and extraction

## Usage

```typescript
import { ReductoProvider } from '@docloai/providers-reducto';

const provider = new ReductoProvider({
  apiKey: process.env.REDUCTO_API_KEY
});

// Parse a document
const result = await provider.parse({
  pdfs: [{ url: 'https://example.com/document.pdf' }]
});

console.log(result.text);
```

## Environment Variables

- `REDUCTO_API_KEY` - Your Reducto API key

## License

MIT
