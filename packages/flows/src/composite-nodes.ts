/**
 * Composite nodes for conditional and forEach execution
 *
 * These nodes wrap complex multi-step operations (categorize + branch, split + forEach)
 * into single logical steps with proper observability, metrics, and error handling.
 */

import type { NodeDef, StepMetric, VLMProvider, FlowResult, NodeCtx, FlowInput, SplitDocument, FlowStepLocation } from '@doclo/core';
import { FlowExecutionError } from '@doclo/core';
import { buildFlowFromConfig, type ProviderRegistry } from './serialization.js';
import type { SerializableFlow, FlowReference, CategorizeConfig, SplitConfig } from './serialization.js';
import { categorize, split } from '@doclo/nodes';
import { isSingleFlowResult, type BatchFlowResult } from './flow-builder.js';

/**
 * Flow registry type
 * Maps flow IDs to SerializableFlow objects (from database/Convex)
 */
type FlowRegistry = Record<string, SerializableFlow>;

/**
 * Parse provider name in format "provider:model" to separate fields
 * Example: "google:gemini-2.5-flash" -> { provider: "google", model: "gemini-2.5-flash" }
 */
function parseProviderName(name: string): { provider: string; model: string } {
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) {
    // No colon found, treat entire name as provider
    return { provider: name, model: 'unknown' };
  }
  return {
    provider: name.substring(0, colonIndex),
    model: name.substring(colonIndex + 1)
  };
}

/**
 * Parse reference string in format "id@version" to extract id and version
 * @example "my-prompt@1.2.0" -> { id: "my-prompt", version: "1.2.0" }
 * @example "my-prompt" -> { id: "my-prompt", version: undefined }
 */
function parseRef(refString: string | undefined): { id: string; version: string | undefined } | null {
  if (!refString) return null;

  const atIndex = refString.indexOf('@');
  if (atIndex === -1) {
    return { id: refString, version: undefined };
  }

  return {
    id: refString.substring(0, atIndex),
    version: refString.substring(atIndex + 1)
  };
}

/**
 * Helper function to flatten child flow metrics by prefixing step names
 * Follows the pattern from trigger node (packages/nodes/src/trigger.ts:253-276)
 */
function flattenMetrics(
  childMetrics: StepMetric[],
  prefix: string
): StepMetric[] {
  return childMetrics.map(m => ({
    ...m,
    step: `${prefix}.${m.step}`,
    // @ts-ignore - Add metadata for nested metrics (not in official type but works at runtime)
    nested: true
  }));
}

/**
 * Configuration for conditional composite node
 */
export interface ConditionalCompositeConfig {
  stepId: string;
  categorizeConfig: CategorizeConfig;
  branches: Record<string, SerializableFlow | FlowReference>;
  providers: ProviderRegistry;
  flows: FlowRegistry;
}

/**
 * Creates a composite node that:
 * 1. Executes a categorize node to determine the category
 * 2. Selects and executes the appropriate branch flow
 * 3. Returns the branch flow's output
 *
 * Includes full observability, metrics merging, and error context.
 */
export function createConditionalCompositeNode(
  config: ConditionalCompositeConfig
): NodeDef<FlowInput, unknown> {
  const { stepId, categorizeConfig, branches, providers, flows } = config;

  return {
    key: 'conditional-composite',
    run: async (input: FlowInput, ctx?: NodeCtx) => {
      const t0 = Date.now();
      let selectedCategory: string | undefined;
      let phase: 'categorize' | 'branch' = 'categorize';

      try {
        // === PHASE 1: CATEGORIZE ===
        // Build categorize node
        // Cast to VLMProvider since categorize requires VLM capabilities
        const categorizeNode = categorize({
          ...categorizeConfig,
          provider: providers[categorizeConfig.providerRef] as VLMProvider,
          categories: categorizeConfig.categories || Object.keys(branches)
        });

        // Execute categorize node (track metrics to get cost)
        const categorizeT0 = Date.now();
        const categorizeCostTracker: StepMetric[] = [];
        const categorizeCtx: NodeCtx = {
          stepId: stepId,  // Use composite step's ID so categorize metric is attributed to this step
          metrics: { push: (m: StepMetric) => categorizeCostTracker.push(m) },
          artifacts: ctx?.artifacts ?? {},
          emit: ctx?.emit ?? (() => {}),  // No-op if emit not provided
          observability: ctx?.observability
        };
        const categorizeResult = await categorizeNode.run(input, categorizeCtx);
        selectedCategory = categorizeResult.category;

        // Push categorize metric to main context
        categorizeCostTracker.forEach(m => ctx?.metrics?.push(m));

        // Store category decision in artifacts
        if (ctx?.emit) {
          ctx.emit(`${stepId}:category`, selectedCategory);
        }

        // === PHASE 2: ROUTE TO BRANCH ===
        phase = 'branch';

        // Check if branch exists
        if (!branches[selectedCategory]) {
          throw new Error(
            `No branch defined for category "${selectedCategory}". ` +
            `Available branches: ${Object.keys(branches).join(', ')}`
          );
        }

        // Resolve flow reference to actual flow definition
        const branchFlowDef = resolveBranchFlow(branches[selectedCategory], flows);

        // Build the branch flow with observability options
        const branchFlow = buildFlowFromConfig(
          branchFlowDef,
          providers,
          flows,
          ctx?.observability?.config ? {
            observability: ctx.observability.config,
            metadata: {
              ...ctx.observability?.metadata,
              parentNode: stepId,
              phase: 'branch',
              category: selectedCategory
            }
          } : undefined
        );

        // Execute branch flow
        const branchT0 = Date.now();
        const branchResultRaw = await branchFlow.run(input);

        // Type guard to ensure we have a single flow result
        if (!isSingleFlowResult(branchResultRaw)) {
          throw new Error('Branch flow returned batch result instead of single result');
        }
        const branchResult = branchResultRaw;

        // Merge branch flow metrics
        if (ctx?.metrics && branchResult.metrics) {
          const branchMetrics = flattenMetrics(
            branchResult.metrics,
            `${stepId}.branch.${selectedCategory}`
          );
          branchMetrics.forEach(m => ctx.metrics.push(m));
        }

        // Store branch output in artifacts
        if (ctx?.emit) {
          ctx.emit(`${stepId}:branchOutput`, branchResult.output);
          ctx.emit(`${stepId}:branchArtifacts`, branchResult.artifacts);
        }

        // === PHASE 3: COMPLETE ===
        // Calculate aggregate cost from categorize + branch operations
        const categorizeCost = categorizeCostTracker.reduce((sum: number, m: StepMetric) => sum + (m.costUSD ?? 0), 0);
        const branchCost = branchResult.metrics
          ? branchResult.metrics.reduce((sum: number, m: StepMetric) => sum + (m.costUSD ?? 0), 0)
          : 0;
        const aggregateCost = categorizeCost + branchCost;

        // Calculate duration breakdown
        const totalMs = Date.now() - t0;
        const categorizeMs = categorizeCostTracker.reduce((sum: number, m: StepMetric) => sum + (m.ms ?? 0), 0);
        const branchMs = branchResult.metrics
          ? branchResult.metrics.reduce((sum: number, m: StepMetric) => sum + (m.ms ?? 0), 0)
          : 0;
        const overheadMs = totalMs - categorizeMs - branchMs;  // Pure wrapper overhead

        // Add composite node overhead metric
        if (ctx?.metrics) {
          const provider = providers[categorizeConfig.providerRef];
          const { provider: providerName, model } = parseProviderName(provider.name ?? '');

          // Extract promptId and promptVersion from promptRef if present
          const promptRefData = parseRef(categorizeConfig.promptRef);

          const wrapperMetric: StepMetric = {
            step: stepId,
            configStepId: ctx.stepId,
            startMs: t0,
            provider: providerName,
            model,
            ms: totalMs,
            costUSD: aggregateCost,  // Total cost from categorize + branch
            attemptNumber: 1,  // Composite wrappers don't retry, always 1
            metadata: {
              kind: 'wrapper',  // Distinguish wrapper from leaf metrics
              type: 'conditional',
              rollup: true,  // Duration includes child work
              overheadMs,  // Pure wrapper overhead (flow orchestration)
              category: selectedCategory,
              branchStepCount: branchResult.metrics?.length || 0,
              branchFlowId: typeof branches[selectedCategory] === 'object' && 'flowRef' in branches[selectedCategory]
                ? (branches[selectedCategory] as FlowReference).flowRef
                : 'inline',
              // Include prompt metadata if available
              ...(promptRefData && {
                promptId: promptRefData.id,
                ...(promptRefData.version && { promptVersion: promptRefData.version })
              })
            }
          };

          ctx.metrics.push(wrapperMetric);
        }

        // Return branch output (transparent to next step)
        return branchResult.output;

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const isNestedFlowError = err instanceof FlowExecutionError;

        // Add error metric
        if (ctx?.metrics) {
          ctx.metrics.push({
            step: stepId,
            configStepId: ctx.stepId,
            startMs: t0,
            ms: Date.now() - t0,
            costUSD: 0,
            attemptNumber: 1,
            // @ts-ignore - Add error field
            error: err.message,
            metadata: {
              kind: 'wrapper',
              type: 'conditional',
              failed: true,
              category: selectedCategory,
              failedPhase: phase
            }
          });
        }

        // Build flow path with branch context
        const flowPath: FlowStepLocation[] = [{
          stepId,
          stepIndex: 0,
          stepType: 'conditional',
          branch: selectedCategory || undefined
        }];

        // If inner error is FlowExecutionError, extend its path
        if (isNestedFlowError && err.flowPath) {
          flowPath.push(...err.flowPath);
        }

        // Get the root cause message for cleaner error display
        const rootCauseMessage = isNestedFlowError
          ? err.getRootCause().message
          : err.message;

        // Throw FlowExecutionError with full context
        throw new FlowExecutionError(
          `Conditional step "${stepId}" failed` +
          `${selectedCategory ? ` (category: ${selectedCategory})` : ''}` +
          ` in phase: ${phase}` +
          `\n  Error: ${rootCauseMessage}`,
          stepId,
          0,
          'conditional',
          [],
          isNestedFlowError ? err.originalError : err,
          undefined,
          flowPath,
          isNestedFlowError ? err.allCompletedSteps : undefined
        );
      }
    }
  };
}

/**
 * Configuration for forEach composite node
 */
export interface ForEachCompositeConfig {
  stepId: string;
  splitConfig: SplitConfig;
  itemFlow: SerializableFlow | FlowReference;
  providers: ProviderRegistry;
  flows: FlowRegistry;
}

/**
 * Creates a composite node that:
 * 1. Executes a split node to get an array of items
 * 2. Executes the item flow for each item in parallel
 * 3. Returns aggregated results
 *
 * Includes full observability, metrics merging, and error context.
 */
export function createForEachCompositeNode(
  config: ForEachCompositeConfig
): NodeDef<FlowInput, unknown[]> {
  const { stepId, splitConfig, itemFlow, providers, flows } = config;

  return {
    key: 'forEach-composite',
    run: async (input: FlowInput, ctx?: NodeCtx) => {
      const t0 = Date.now();
      let items: SplitDocument[] | undefined;
      let phase: 'split' | 'forEach' = 'split';

      try {
        // === PHASE 1: SPLIT ===
        // Build split node
        // Cast to VLMProvider since split requires VLM capabilities
        const splitNode = split({
          provider: providers[splitConfig.providerRef] as VLMProvider,
          ...splitConfig
        });

        // Execute split node (track metrics to get cost)
        const splitT0 = Date.now();
        const splitCostTracker: StepMetric[] = [];
        const splitCtx: NodeCtx = {
          stepId: stepId,  // Use composite step's ID for attribution
          metrics: { push: (m: StepMetric) => splitCostTracker.push(m) },
          artifacts: ctx?.artifacts ?? {},
          emit: ctx?.emit ?? (() => {}),  // No-op if emit not provided
          observability: ctx?.observability
        };
        const splitResult = await splitNode.run(input, splitCtx);
        items = splitResult; // Split node returns array directly

        // Push split metric to main context
        splitCostTracker.forEach(m => ctx?.metrics?.push(m));

        if (!Array.isArray(items)) {
          throw new Error(
            `Split node did not return an array. Got: ${typeof items}`
          );
        }

        // Store item count in artifacts
        if (ctx?.emit) {
          ctx.emit(`${stepId}:itemCount`, items.length);
        }

        // === PHASE 2: FOR EACH ===
        phase = 'forEach';

        // Resolve flow reference to actual flow definition
        const itemFlowDef = resolveBranchFlow(itemFlow, flows);

        // Track all item flow results to aggregate costs
        const itemFlowResults: FlowResult<unknown>[] = [];

        // Execute item flow for each item in parallel
        const results = await Promise.allSettled(
          items.map(async (item, index) => {
            // Build item flow with observability options
            const flow = buildFlowFromConfig(
              itemFlowDef,
              providers,
              flows,
              ctx?.observability?.config ? {
                observability: ctx.observability.config,
                metadata: {
                  ...ctx.observability?.metadata,
                  parentNode: stepId,
                  phase: 'forEach',
                  itemIndex: index,
                  totalItems: items!.length
                }
              } : undefined
            );

            // Execute item flow
            // Pass the split document's input field (which contains url/base64/pages/bounds)
            const itemT0 = Date.now();
            const resultRaw = await flow.run(item.input);

            // Type guard to ensure we have a single flow result
            if (!isSingleFlowResult(resultRaw)) {
              throw new Error('Item flow returned batch result instead of single result');
            }
            const result = resultRaw;

            // Store result for cost aggregation
            itemFlowResults.push(result);

            // Merge item flow metrics
            if (ctx?.metrics && result.metrics) {
              const itemMetrics = flattenMetrics(
                result.metrics,
                `${stepId}.item[${index}]`
              );
              itemMetrics.forEach(m => ctx.metrics.push(m));
            }

            return result.output;
          })
        );

        // === PHASE 3: AGGREGATE ===
        // Count successes and failures
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failureCount = results.filter(r => r.status === 'rejected').length;

        // Calculate aggregate cost from split + all item flows
        const splitCost = splitCostTracker.reduce((sum: number, m: StepMetric) => sum + (m.costUSD ?? 0), 0);
        const itemsCost = itemFlowResults.reduce((sum: number, result: FlowResult<unknown>) => {
          const itemCost = result.metrics
            ? result.metrics.reduce((s: number, m: StepMetric) => s + (m.costUSD ?? 0), 0)
            : 0;
          return sum + itemCost;
        }, 0);
        const aggregateCost = splitCost + itemsCost;

        // Calculate duration breakdown
        const totalMs = Date.now() - t0;
        const splitMs = splitCostTracker.reduce((sum: number, m: StepMetric) => sum + (m.ms ?? 0), 0);
        const itemsMs = itemFlowResults.reduce((sum: number, result: FlowResult<unknown>) => {
          const itemMs = result.metrics
            ? result.metrics.reduce((s: number, m: StepMetric) => s + (m.ms ?? 0), 0)
            : 0;
          return sum + itemMs;
        }, 0);
        const overheadMs = totalMs - splitMs - itemsMs;  // Pure wrapper overhead

        // Store results in artifacts
        if (ctx?.emit) {
          ctx.emit(`${stepId}:results`, results);
          ctx.emit(`${stepId}:successCount`, successCount);
          ctx.emit(`${stepId}:failureCount`, failureCount);
        }

        // Add composite node overhead metric
        if (ctx?.metrics) {
          const provider = providers[splitConfig.providerRef];
          const { provider: providerName, model } = parseProviderName(provider.name ?? '');

          // Extract schemaId and schemaVersion from schemaRef if present
          const schemaRefData = parseRef(splitConfig.schemaRef);

          ctx.metrics.push({
            step: stepId,
            configStepId: ctx.stepId,
            startMs: t0,
            provider: providerName,
            model,
            ms: totalMs,
            costUSD: aggregateCost,  // Total cost from split + all items
            attemptNumber: 1,  // Composite wrappers don't retry, always 1
            metadata: {
              kind: 'wrapper',  // Distinguish wrapper from leaf metrics
              type: 'forEach',
              rollup: true,  // Duration includes child work
              overheadMs,  // Pure wrapper overhead (flow orchestration)
              itemCount: items.length,
              successCount,
              failureCount,
              itemFlowId: typeof itemFlow === 'object' && 'flowRef' in itemFlow
                ? (itemFlow as FlowReference).flowRef
                : 'inline',
              // Include schema metadata if available
              ...(schemaRefData && {
                schemaId: schemaRefData.id,
                ...(schemaRefData.version && { schemaVersion: schemaRefData.version })
              })
            }
          });
        }

        // Return results in forEach format (matching runtime API)
        return results;

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const isNestedFlowError = err instanceof FlowExecutionError;

        // Add error metric
        if (ctx?.metrics) {
          ctx.metrics.push({
            step: stepId,
            configStepId: ctx.stepId,
            startMs: t0,
            ms: Date.now() - t0,
            costUSD: 0,
            attemptNumber: 1,
            // @ts-ignore - Add error field
            error: err.message,
            metadata: {
              kind: 'wrapper',
              type: 'forEach',
              failed: true,
              itemCount: items?.length,
              failedPhase: phase
            }
          });
        }

        // Build flow path with forEach context
        const flowPath: FlowStepLocation[] = [{
          stepId,
          stepIndex: 0,
          stepType: 'forEach'
        }];

        // If inner error is FlowExecutionError, extend its path
        if (isNestedFlowError && err.flowPath) {
          flowPath.push(...err.flowPath);
        }

        // Get the root cause message for cleaner error display
        const rootCauseMessage = isNestedFlowError
          ? err.getRootCause().message
          : err.message;

        // Throw FlowExecutionError with full context
        throw new FlowExecutionError(
          `ForEach step "${stepId}" failed` +
          `${items ? ` (itemCount: ${items.length})` : ''}` +
          ` in phase: ${phase}` +
          `\n  Error: ${rootCauseMessage}`,
          stepId,
          0,
          'forEach',
          [],
          isNestedFlowError ? err.originalError : err,
          undefined,
          flowPath,
          isNestedFlowError ? err.allCompletedSteps : undefined
        );
      }
    }
  };
}

/**
 * Helper function to resolve flow references
 *
 * Resolves flow references from the registry (database-driven flows).
 * The registry contains SerializableFlow objects, not flow builder functions.
 */
function resolveBranchFlow(
  flowOrRef: SerializableFlow | FlowReference,
  flows: FlowRegistry
): SerializableFlow {
  // Check if it's a flow reference
  if (typeof flowOrRef === 'object' && flowOrRef !== null && 'flowRef' in flowOrRef) {
    const flowRef = (flowOrRef as FlowReference).flowRef;

    if (!flows[flowRef]) {
      throw new Error(
        `Flow reference "${flowRef}" not found in registry. ` +
        `Available flows: ${Object.keys(flows).join(', ')}`
      );
    }

    // Return the serializable flow directly from registry
    // (flows are already SerializableFlow objects from database/Convex)
    return flows[flowRef];
  }

  // It's an inline flow, return as-is
  return flowOrRef as SerializableFlow;
}
