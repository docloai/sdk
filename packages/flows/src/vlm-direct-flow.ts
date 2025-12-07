import { runPipeline } from "@doclo/core";
import { node } from "@doclo/core";
import { simpleSchema } from "./schemas";
import { buildLLMProvider } from "@doclo/providers-llm";

/**
 * Build a flow that uses VLM (Vision Language Model) for direct extraction
 * Skips OCR entirely - sends image/PDF directly to the vision model
 *
 * Pros:
 * - Faster (one API call instead of two)
 * - Can understand layout, tables, charts visually
 * - No OCR errors/artifacts
 *
 * Cons:
 * - More expensive (vision tokens cost more)
 * - Limited to models with vision capabilities
 */
export function buildVLMDirectFlow(opts: {
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
  // Build LLM provider with vision support
  // buildLLMProvider returns CoreVLMProvider directly (no adapter needed)
  const coreLLMProvider = buildLLMProvider({
    providers: opts.llmConfigs,
    maxRetries: opts.maxRetries ?? 2,
    retryDelay: opts.retryDelay ?? 1000,
    useExponentialBackoff: true,
    circuitBreakerThreshold: opts.circuitBreakerThreshold ?? 3
  });

  // Create VLM extraction node
  const vlmExtract = node<{ url?: string; base64?: string }, any>(
    "vlm_extract",
    async (input, ctx) => {
      const t0 = Date.now();

      // Build multimodal prompt with proper format for OpenRouter
      const prompt: any = {
        text: `You are a document data extraction expert. Extract the following fields from this maritime document:
- vessel: The vessel/ship name
- port: The port name or location
- quantity_mt: The quantity in metric tons (MT)

Return ONLY a JSON object with these fields. Use null if a field is not found.`
      };

      // Determine if it's a PDF or image based on data
      let isPDF = false;

      if (input.url) {
        isPDF = input.url.endsWith('.pdf') || input.url.toLowerCase().includes('.pdf');
      } else if (input.base64) {
        // Check if base64 data URL indicates PDF
        isPDF = input.base64.startsWith('data:application/pdf');
      }

      // Add file/image to prompt based on type
      if (isPDF) {
        // For PDFs, use 'pdfs' array
        prompt.pdfs = [];
        if (input.url) {
          // If it's a data URL (base64), extract the base64 part
          if (input.url.startsWith('data:')) {
            const base64Data = input.url.replace(/^data:application\/pdf;base64,/, '');
            prompt.pdfs.push({ base64: base64Data });
          } else {
            // Regular URL
            prompt.pdfs.push({ url: input.url });
          }
        } else if (input.base64) {
          // Extract base64 data if it's a data URL, otherwise use as-is
          const base64Data = input.base64.startsWith('data:')
            ? input.base64.replace(/^data:application\/pdf;base64,/, '')
            : input.base64;
          prompt.pdfs.push({ base64: base64Data });
        }
      } else {
        // For images, use 'images' array
        prompt.images = [];
        if (input.url) {
          // If it's a data URL (base64), extract the base64 part
          if (input.url.startsWith('data:')) {
            const base64Data = input.url.replace(/^data:image\/[^;]+;base64,/, '');
            const mimeType = input.url.match(/^data:(image\/[^;]+);/)?.[1] || 'image/jpeg';
            prompt.images.push({ base64: base64Data, mimeType });
          } else {
            // Regular URL
            prompt.images.push({ url: input.url, mimeType: 'image/jpeg' });
          }
        } else if (input.base64) {
          // Extract base64 data if it's a data URL, otherwise use as-is
          const base64Data = input.base64.startsWith('data:')
            ? input.base64.replace(/^data:image\/[^;]+;base64,/, '')
            : input.base64;
          const mimeType = input.base64.startsWith('data:')
            ? input.base64.match(/^data:(image\/[^;]+);/)?.[1] || 'image/jpeg'
            : 'image/jpeg';
          prompt.images.push({ base64: base64Data, mimeType });
        }
      }

      const { json, costUSD, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens } = await coreLLMProvider.completeJson({
        prompt,
        schema: simpleSchema
      });

      ctx.metrics.push({
        step: "vlm_extract",
        startMs: t0,
        provider: coreLLMProvider.name,
        model: 'unknown',
        ms: Date.now() - t0,
        costUSD,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        attemptNumber: 1,
        metadata: { kind: 'leaf' }
      });

      return json;
    }
  );

  return {
    async run(input: { url?: string; base64?: string }) {
      const result = await runPipeline([vlmExtract], input);

      return {
        output: result.output,
        metrics: result.metrics,
        artifacts: {
          vlm_extract: result.artifacts.vlm_extract
        }
      };
    }
  };
}
