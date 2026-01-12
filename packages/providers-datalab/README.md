# @doclo/providers-datalab

Datalab OCR providers for document text extraction.

## Installation

```bash
pnpm add @doclo/providers-datalab
```

## Providers

| Provider | Type | Description | Cost |
|----------|------|-------------|------|
| `suryaProvider` | OCRProvider | OCR with text + bounding boxes | $0.01/page |
| `markerOCRProvider` | OCRProvider | PDF/Image → Markdown | $0.002-0.006/page |
| `markerVLMProvider` | VLMProvider | Structured JSON extraction | $0.002-0.006/page |

## Usage

```typescript
import { suryaProvider, markerOCRProvider, markerVLMProvider } from '@doclo/providers-datalab';

// Surya OCR - text with bounding boxes
const surya = suryaProvider({
  apiKey: process.env.DATALAB_API_KEY!
});

// Marker OCR - markdown output
const markerOCR = markerOCRProvider({
  apiKey: process.env.DATALAB_API_KEY!
});

// Marker VLM - structured extraction
const markerVLM = markerVLMProvider({
  apiKey: process.env.DATALAB_API_KEY!
});

// Use with parse node
import { createFlow, parse } from '@doclo/flows';

const flow = createFlow()
  .step('parse', parse({ provider: markerOCR }))
  .build();
```

## Environment Variables

- `DATALAB_API_KEY` - Your Datalab API key from [datalab.to](https://www.datalab.to/)

## License

MIT
