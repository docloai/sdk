# @doclo/client

Cloud client for executing Doclo flows via API.

## Installation

```bash
pnpm add @doclo/client
```

## Quick Start

```typescript
import { DocloClient } from '@doclo/client';

const client = new DocloClient({
  apiKey: process.env.DOCLO_API_KEY!
});

// Execute a flow
const result = await client.flows.run('flow_abc123', {
  input: {
    document: {
      base64: '...',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf'
    }
  }
});

console.log(result.output);
```

## Hybrid Execution

Execute flows locally with cloud observability:

```typescript
import { DocloHybridClient } from '@doclo/client';
import { createVLMProvider } from '@doclo/providers-llm';

const client = new DocloHybridClient({
  apiKey: process.env.DOCLO_API_KEY!,
  providers: {
    vlm: createVLMProvider({
      provider: 'google',
      model: 'gemini-2.5-flash',
      apiKey: process.env.GOOGLE_API_KEY!
    })
  }
});

// Pull flow from cloud, execute locally
const result = await client.runHybrid('flow_abc123', { base64: '...' });
```

## API

### Flows

```typescript
// Execute flow (sync)
const result = await client.flows.run('flow_id', { input: { document } });

// Execute flow (async with webhook)
const execution = await client.flows.run('flow_id', {
  input: { document },
  async: true,
  webhookUrl: 'https://your-app.com/webhook'
});

// List flows
const flows = await client.flows.list({ limit: 20 });

// Get flow details
const flow = await client.flows.get('flow_id');
```

### Runs

```typescript
// Get execution status
const execution = await client.runs.get('exec_id');

// Cancel execution
await client.runs.cancel('exec_id');

// Wait for completion
const result = await client.runs.waitForCompletion('exec_id', {
  interval: 2000,
  timeout: 60000
});
```

## Webhooks

```typescript
import { verifyWebhookSignature, parseWebhookEvent } from '@doclo/client';

// Verify signature
const isValid = await verifyWebhookSignature(
  rawBody,
  signature,
  process.env.WEBHOOK_SECRET!
);

// Parse event
const event = parseWebhookEvent(JSON.parse(rawBody));
// event.event: 'run.started' | 'run.completed' | 'run.failed' | 'run.cancelled'
```

## License

MIT
