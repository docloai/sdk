import { runPipeline, type OCRProvider, type DocumentIR } from "@doclo/core";
import { parseNode, extractNode } from "@doclo/nodes";
import { simpleSchema } from "./schemas";
import { buildLLMProvider } from "@doclo/providers-llm";

/**
 * Build a flow with automatic fallback between multiple LLM providers
 *
 * Example usage:
 * ```
 * const flow = buildMultiProviderFlow({
 *   ocr: suryaProvider({ endpoint, apiKey }),
 *   llmConfigs: [
 *     { provider: 'openai', model: 'gpt-4.1', apiKey: process.env.OPENAI_KEY },
 *     { provider: 'anthropic', model: 'claude-haiku-4.5', apiKey: process.env.ANTHROPIC_KEY, via: 'openrouter' },
 *     { provider: 'google', model: 'gemini-2.5-flash', apiKey: process.env.GOOGLE_KEY }
 *   ],
 *   maxRetries: 2
 * });
 * ```
 */
export function buildMultiProviderFlow(opts: {
  ocr: OCRProvider;
  llmConfigs: Array<{
    provider: 'openai' | 'anthropic' | 'google' | 'xai';
    model: string;
    apiKey: string;
    via?: 'openrouter' | 'native';
    baseUrl?: string;
  }>;
  maxRetries?: number;
  retryDelay?: number;
  circuitBreakerThreshold?: number;
}) {
  const parse = parseNode({ ocr: opts.ocr });

  // Build LLM provider with fallback support
  // buildLLMProvider returns CoreVLMProvider directly (no adapter needed)
  const coreLLMProvider = buildLLMProvider({
    providers: opts.llmConfigs,
    maxRetries: opts.maxRetries ?? 2,
    retryDelay: opts.retryDelay ?? 1000,
    useExponentialBackoff: true,
    circuitBreakerThreshold: opts.circuitBreakerThreshold ?? 3
  });

  const mkPrompt = (ir: DocumentIR) =>
    `Extract JSON matching the schema fields: vessel, port, quantity_mt.
Document (first page preview):
${ir.pages[0]?.lines.slice(0, 50).map(l => l.text).join('\n')}`;

  const extract = extractNode({
    llm: coreLLMProvider,
    schema: simpleSchema,
    makePrompt: mkPrompt
  });

  return {
    async run(input: { url?: string; base64?: string }) {
      const parsed = await runPipeline([parse], input);
      const ir = parsed.output as DocumentIR;

      const result = await runPipeline([extract], ir);

      return {
        ir,
        output: result.output,
        metrics: [...parsed.metrics, ...result.metrics],
        artifacts: {
          parse: parsed.artifacts.parse,
          extract: result.artifacts.extract
        }
      };
    }
  };
}
