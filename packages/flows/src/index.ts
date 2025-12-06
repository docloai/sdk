import { runPipeline, type OCRProvider, type LLMJsonProvider, type DocumentIR } from "@docloai/core";
import { parseNode, extractNode } from "@docloai/nodes";
import { simpleSchema } from "./schemas";

// Export schemas
export * from "./schemas";

// Export new flow builder API
export { createFlow, type FlowContext, type FlowProgressCallbacks, type FlowValidationResult, type BuiltFlow, type FlowOptions } from "./flow-builder";
export { parse, split, categorize, extract, chunk, combine, trigger } from "@docloai/nodes";

// Re-export observability types for flow hooks
export type {
  ObservabilityConfig,
  FlowStartContext,
  FlowEndContext,
  FlowErrorContext,
  FlowStats,
  StepStartContext,
  StepEndContext,
  StepErrorContext,
  ConsensusStartContext,
  ConsensusRunContext,
  ConsensusCompleteContext,
  BatchStartContext,
  BatchItemContext,
  BatchItemEndContext,
  BatchEndContext,
  ProviderRequestContext,
  ProviderResponseContext,
  ProviderRetryContext,
  CircuitBreakerContext,
  TraceContext,
  ExecutionContext,
  CustomMetric,
} from "@docloai/core/observability";

// Export flow registry
export {
  FLOW_REGISTRY,
  registerFlow,
  getFlow,
  hasFlow,
  unregisterFlow,
  clearRegistry,
  listFlows,
  getFlowCount,
  type FlowBuilder
} from "./flow-registry";

// Export serialization
export * from "./serialization";

// Export composite nodes
export * from "./composite-nodes";

// Export validation
export * from "./validation";

// Re-export utilities from core for convenience
export { bufferToDataUri, bufferToBase64 } from "@docloai/core";

// Export legacy flows (kept as examples)
export { buildMultiProviderFlow } from "./multi-provider-flow";
export { buildVLMDirectFlow } from "./vlm-direct-flow";

export function buildTwoProviderFlow(opts: { ocr: OCRProvider; llmA: LLMJsonProvider; llmB: LLMJsonProvider }) {
  const parse = parseNode({ ocr: opts.ocr });

  const mkPrompt = (ir: DocumentIR) =>
`Extract JSON matching the schema fields: vessel, port, quantity_mt.
Document (first page preview):
${ir.pages[0]?.lines.slice(0, 50).map(l => l.text).join('\n')}`;

  const extractA = extractNode({ llm: opts.llmA, schema: simpleSchema, makePrompt: mkPrompt });
  const extractB = extractNode({ llm: opts.llmB, schema: simpleSchema, makePrompt: mkPrompt });

  return {
    async run(input: { url?: string; base64?: string }) {
      const parsed = await runPipeline([parse], input);
      const ir = parsed.output as DocumentIR;

      const [resA, resB] = await Promise.all([
        runPipeline([extractA], ir),
        runPipeline([extractB], ir)
      ]);

      return {
        ir,
        outputA: resA.output,
        outputB: resB.output,
        metrics: [...parsed.metrics, ...resA.metrics, ...resB.metrics],
        artifacts: {
          parse: parsed.artifacts.parse,
          extractA: resA.artifacts.extract,
          extractB: resB.artifacts.extract
        }
      };
    }
  };
}
