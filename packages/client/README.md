# @doclo/client

Doclo cloud client for executing document extraction flows via API.

## Installation

```bash
npm install @doclo/client
# or
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
      base64: '...', // Base64-encoded document
      filename: 'invoice.pdf',
      mimeType: 'application/pdf'
    }
  }
});

console.log(result.output);
console.log(`Cost: $${result.metrics?.cost}`);
```

## Client Configuration

```typescript
const client = new DocloClient({
  // Required: Your API key
  apiKey: 'dc_live_...',

  // Optional: Custom API base URL
  baseUrl: 'https://api.doclo.cloud',

  // Optional: Request timeout in ms (default: 5 minutes)
  timeout: 300000
});
```

## API Reference

### Flows

#### `client.flows.run(flowId, options)`

Execute a flow and get results.

```typescript
// Synchronous execution (default) - waits for completion
const result = await client.flows.run('flow_abc123', {
  input: {
    document: {
      base64: '...',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf'
    },
    variables: {
      customerName: 'Acme Corp'
    }
  }
});

console.log(result.status);  // 'success'
console.log(result.output);  // Extracted data
console.log(result.metrics); // { tokensUsed, cost, stepsRun, stepsTotal }
```

#### Async Execution with Webhooks

```typescript
// Async execution - returns immediately
const execution = await client.flows.run('flow_abc123', {
  input: { document: { ... } },
  async: true,
  webhookUrl: 'https://your-app.com/webhook',
  metadata: { correlationId: 'your-ref-123' }
});

console.log(execution.id);     // 'exec_abc123'
console.log(execution.status); // 'queued'
```

#### `client.flows.list(options?)`

List available flows in your organization.

```typescript
const flows = await client.flows.list({ limit: 20 });

for (const flow of flows.data) {
  console.log(`${flow.id}: ${flow.name}`);
}

// Pagination
if (flows.hasMore) {
  const nextPage = await client.flows.list({ cursor: flows.nextCursor });
}
```

#### `client.flows.get(flowId, version?)`

Get flow information and input schema.

```typescript
const flow = await client.flows.get('flow_abc123');
console.log(flow.name);
console.log(flow.inputSchema);
```

### Runs

#### `client.runs.get(executionId)`

Get the status and result of an execution.

```typescript
const execution = await client.runs.get('exec_abc123');

switch (execution.status) {
  case 'success':
    console.log('Output:', execution.output);
    break;
  case 'failed':
    console.error('Error:', execution.error);
    break;
  case 'running':
    console.log('Still processing...');
    break;
}
```

#### `client.runs.cancel(executionId)`

Cancel a running execution.

```typescript
await client.runs.cancel('exec_abc123');
```

#### `client.runs.waitForCompletion(executionId, options?)`

Poll until an execution completes.

```typescript
const result = await client.runs.waitForCompletion('exec_abc123', {
  interval: 2000,  // Poll every 2 seconds
  timeout: 60000   // Wait up to 1 minute
});

console.log(result.output);
```

## Webhook Integration

### Verifying Webhook Signatures

Always verify webhook signatures to ensure requests are from Doclo.

```typescript
import { verifyWebhookSignature, parseWebhookEvent } from '@doclo/client';
import express from 'express';

const app = express();

// Important: Use raw body for signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-doclo-signature'] as string;

  // Verify signature
  const isValid = await verifyWebhookSignature(
    req.body,
    signature,
    process.env.WEBHOOK_SECRET!
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Parse event
  const event = parseWebhookEvent(JSON.parse(req.body.toString()));

  switch (event.event) {
    case 'run.completed':
      console.log('Flow completed:', event.data.output);
      break;
    case 'run.failed':
      console.error('Flow failed:', event.data.error);
      break;
  }

  res.status(200).send('OK');
});
```

### Webhook Event Types

- `run.started` - Execution has started
- `run.completed` - Execution completed successfully
- `run.failed` - Execution failed
- `run.cancelled` - Execution was cancelled

## Error Handling

The client throws typed errors for different failure modes:

```typescript
import {
  DocloError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  TimeoutError
} from '@doclo/client';

try {
  const result = await client.flows.run('flow_abc123', { ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid or revoked API key
    console.error('Auth failed:', error.code);
  } else if (error instanceof RateLimitError) {
    // Too many requests
    const retryAfter = error.rateLimitInfo?.retryAfter;
    console.log(`Rate limited. Retry after ${retryAfter}s`);
  } else if (error instanceof NotFoundError) {
    // Flow or execution not found
    console.error('Not found:', error.message);
  } else if (error instanceof ValidationError) {
    // Invalid input
    console.error('Validation error:', error.details);
  } else if (error instanceof TimeoutError) {
    // Request or polling timeout
    console.error('Timeout:', error.message);
  } else if (error instanceof DocloError) {
    // Other API error
    console.error(`${error.code}: ${error.message}`);
  }
}
```

### Error Codes

Common error codes from the API:

- `INVALID_API_KEY` - API key is invalid
- `API_KEY_REVOKED` - API key has been revoked
- `INSUFFICIENT_SCOPE` - API key lacks required permissions
- `FLOW_NOT_FOUND` - Flow ID not found
- `EXECUTION_NOT_FOUND` - Execution ID not found
- `INVALID_INPUT` - Invalid input data
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `EXECUTION_TIMEOUT` - Flow took too long
- `PROVIDER_ERROR` - Upstream provider error

## Test Mode

Use test API keys (`dc_test_...`) for development:

```typescript
const client = new DocloClient({
  apiKey: 'dc_test_...'
});

// Executions don't count against quotas
// Separate execution history from production
```

Check if in test mode:

```typescript
if (client.isTestMode) {
  console.log('Running in test mode');
}
```

## TypeScript Support

The client is fully typed. Generic type parameters let you type your output:

```typescript
interface InvoiceData {
  invoiceNumber: string;
  amount: number;
  vendor: string;
}

const result = await client.flows.run<InvoiceData>('invoice-flow', {
  input: { ... }
});

// result.output is typed as InvoiceData
console.log(result.output?.invoiceNumber);
```

## Requirements

- Node.js 18+
- Works in browsers with CORS enabled

## License

MIT
