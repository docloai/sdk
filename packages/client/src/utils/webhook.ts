/**
 * Webhook utilities for verifying Doclo webhook signatures
 */

import type { WebhookEvent } from '../types.js';

/**
 * Compute HMAC-SHA256 signature
 * Works in both Node.js and browser environments
 */
async function computeHmacSha256(
  message: string | Uint8Array,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const messageData = typeof message === 'string' ? encoder.encode(message) : message;
  const secretData = encoder.encode(secret);

  // Use Web Crypto API (available in Node.js 18+ and browsers)
  const key = await crypto.subtle.importKey(
    'raw',
    secretData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    messageData.buffer as ArrayBuffer
  );

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare two strings in constant time to prevent timing attacks
 * Does not leak length information through timing
 */
function secureCompare(a: string, b: string): boolean {
  // Compare lengths without early exit to prevent timing leak
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length;

  for (let i = 0; i < maxLen; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return result === 0;
}

/**
 * Valid webhook event types
 */
const VALID_WEBHOOK_EVENTS = [
  'execution.completed',
  'execution.failed',
] as const;

/**
 * Verify webhook signature from Doclo
 *
 * @param payload - The raw request body (string or Buffer)
 * @param signature - The X-Doclo-Signature header value (e.g., "sha256=abc123...")
 * @param secret - Your webhook secret
 * @returns true if signature is valid
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from '@doclo/client';
 *
 * app.post('/webhook', async (req, res) => {
 *   const signature = req.headers['x-doclo-signature'];
 *   const isValid = await verifyWebhookSignature(
 *     req.rawBody,
 *     signature,
 *     process.env.WEBHOOK_SECRET!
 *   );
 *
 *   if (!isValid) {
 *     return res.status(401).send('Invalid signature');
 *   }
 *
 *   // Process webhook...
 * });
 * ```
 */
export async function verifyWebhookSignature(
  payload: string | Uint8Array,
  signature: string,
  secret: string
): Promise<boolean> {
  // Extract the signature value (format: "sha256=...")
  const parts = signature.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const providedSignature = parts[1];
  const expectedSignature = await computeHmacSha256(payload, secret);

  return secureCompare(providedSignature, expectedSignature);
}

/**
 * Options for parsing webhook events
 */
export interface ParseWebhookEventOptions {
  /** Maximum age of webhook in seconds (default: 300 = 5 minutes) */
  maxAgeSeconds?: number;
}

/**
 * Parse and validate a webhook event payload
 *
 * @param body - The parsed JSON body
 * @param options - Validation options
 * @returns Typed webhook event
 * @throws Error if the payload is invalid
 *
 * @example
 * ```typescript
 * import { parseWebhookEvent, verifyWebhookSignature } from '@doclo/client';
 *
 * app.post('/webhook', async (req, res) => {
 *   // Verify signature first...
 *
 *   const event = parseWebhookEvent(req.body);
 *
 *   if (event.event === 'execution.completed') {
 *     console.log('Extraction result:', event.data.output);
 *   }
 * });
 * ```
 */
export function parseWebhookEvent<T = unknown>(
  body: unknown,
  options?: ParseWebhookEventOptions
): WebhookEvent<T> {
  const maxAgeSeconds = options?.maxAgeSeconds ?? 300;

  if (!body || typeof body !== 'object') {
    throw new Error('Invalid webhook payload: expected object');
  }

  const payload = body as Record<string, unknown>;

  if (typeof payload.event !== 'string') {
    throw new Error('Invalid webhook payload: missing event field');
  }

  // Validate event type
  if (!VALID_WEBHOOK_EVENTS.includes(payload.event as typeof VALID_WEBHOOK_EVENTS[number])) {
    throw new Error(`Invalid webhook event type: ${payload.event}`);
  }

  if (typeof payload.timestamp !== 'string') {
    throw new Error('Invalid webhook payload: missing timestamp field');
  }

  // Validate timestamp freshness
  const timestamp = new Date(payload.timestamp);
  if (isNaN(timestamp.getTime())) {
    throw new Error('Invalid webhook payload: invalid timestamp format');
  }

  const now = new Date();
  const ageSeconds = (now.getTime() - timestamp.getTime()) / 1000;

  if (ageSeconds < -60) {
    // Allow 60s clock skew for future timestamps
    throw new Error('Invalid webhook payload: timestamp is in the future');
  }

  if (ageSeconds > maxAgeSeconds) {
    throw new Error(
      `Webhook timestamp too old: ${Math.round(ageSeconds)}s exceeds maximum ${maxAgeSeconds}s`
    );
  }

  if (!payload.data || typeof payload.data !== 'object') {
    throw new Error('Invalid webhook payload: missing data field');
  }

  return {
    event: payload.event as WebhookEvent['event'],
    timestamp: payload.timestamp,
    data: payload.data as WebhookEvent<T>['data'],
  };
}

/**
 * Webhook signature header name
 */
export const WEBHOOK_SIGNATURE_HEADER = 'x-doclo-signature';
