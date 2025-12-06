# @docloai/providers-datalab

Datalab OCR provider integration for document text extraction in the Doclo SDK.

## Installation

```bash
npm install @docloai/providers-datalab
# or
pnpm add @docloai/providers-datalab
```

## Features

- OCR text extraction using Datalab's Surya and Marker APIs
- Support for images and PDFs
- High-quality text extraction with layout preservation

## Usage

```typescript
import { DatalabProvider } from '@docloai/providers-datalab';

const provider = new DatalabProvider({
  apiKey: process.env.DATALAB_API_KEY
});

// Extract text from an image
const result = await provider.extractText({
  images: [{ base64: "...", mimeType: "image/jpeg" }]
});
```

## Environment Variables

- `DATALAB_API_KEY` - Your Datalab API key

## License

MIT
