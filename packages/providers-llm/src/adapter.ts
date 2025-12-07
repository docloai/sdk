import type { LLMJsonProvider as CoreLLMProvider, MultimodalInput as CoreMultimodalInput } from "@doclo/core";
import type { LLMProvider, MultimodalInput } from "./types";

/**
 * Adapter to make new LLMProvider compatible with core LLMJsonProvider interface
 */
export function adaptToCoreLLMProvider(provider: LLMProvider): CoreLLMProvider {
  return {
    name: provider.name,
    capabilities: {
      supportsImages: true,
      supportsPDFs: provider.capabilities.supportsPDFs,
      maxPDFPages: provider.capabilities.maxPDFPages
    },
    async completeJson(input: {
      prompt: string | CoreMultimodalInput;
      schema: object;
      max_tokens?: number;
      reasoning?: import("./types").ReasoningConfig;
    }) {
      // Convert input to MultimodalInput format
      let multimodalInput: MultimodalInput;

      if (typeof input.prompt === 'string') {
        // Simple string prompt
        multimodalInput = { text: input.prompt };
      } else {
        // Already multimodal
        multimodalInput = input.prompt as MultimodalInput;
      }

      // Call the new provider with reasoning parameters
      const response = await provider.completeJson({
        input: multimodalInput,
        schema: input.schema as any,
        max_tokens: input.max_tokens,
        reasoning: input.reasoning
      });

      // Convert response to core format (including reasoning fields and cache metrics)
      return {
        json: response.json,
        rawText: response.rawText,
        costUSD: response.metrics.costUSD,
        inputTokens: response.metrics.inputTokens,
        outputTokens: response.metrics.outputTokens,
        cacheCreationInputTokens: response.metrics.cacheCreationInputTokens,
        cacheReadInputTokens: response.metrics.cacheReadInputTokens
      };
    }
  };
}
