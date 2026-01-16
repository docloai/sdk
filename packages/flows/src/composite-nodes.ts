/**
 * Composite nodes for conditional and forEach execution
 *
 * These nodes wrap complex multi-step operations (categorize + branch, split + forEach)
 * into single logical steps with proper observability, metrics, and error handling.
 */

import type { NodeDef, StepMetric, VLMProvider, FlowResult, NodeCtx, FlowInput, SplitDocument, FlowStepLocation } from '@doclo/core';
import { FlowExecutionError } from '@doclo/core';
import { buildFlowFromConfig, type ProviderRegistry } from './serialization.js';
import type { SerializableFlow, FlowReference, CategorizeConfig, SplitConfig, RouteConfig, RouteBranchConfig } from './serialization.js';
import { detectMimeTypeFromBase64Async, detectMimeTypeFromBase64 } from '@doclo/core';
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
 * Helper function to flatten child flow artifacts by prefixing keys
 * Mirrors the flattenMetrics pattern for consistency between metrics and artifacts.
 *
 * This enables direct access to nested step outputs:
 * - Before: artifacts["step:branchArtifacts"]["nested-step"]
 * - After: artifacts["step.branch.category.nested-step"]
 *
 * @param childArtifacts - Artifacts from child flow execution
 * @param prefix - Prefix to add to all artifact keys (e.g., "stepId.branch.categoryName")
 * @returns Record with flattened artifact keys
 */
function flattenArtifacts(
  childArtifacts: Record<string, unknown>,
  prefix: string
): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(childArtifacts)) {
    // Skip internal artifacts (they're flow-specific and shouldn't propagate)
    if (key.startsWith('__')) continue;

    // Prefix the key with the branch path
    flattened[`${prefix}.${key}`] = value;
  }

  return flattened;
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

          // Flatten branch artifacts with prefixed keys for direct access
          // This enables: artifacts["quality-gate.branch.high_quality.extract"]
          if (branchResult.artifacts) {
            const flattenedArtifacts = flattenArtifacts(
              branchResult.artifacts,
              `${stepId}.branch.${selectedCategory}`
            );
            for (const [key, value] of Object.entries(flattenedArtifacts)) {
              ctx.emit(key, value);
            }

            // Also emit nested structure for backward compatibility
            ctx.emit(`${stepId}:branchArtifacts`, branchResult.artifacts);
          }
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

          // Flatten item artifacts with prefixed keys for direct access
          // This enables: artifacts["split-step.item[0].extract"], artifacts["split-step.item[1].extract"]
          itemFlowResults.forEach((result, index) => {
            if (result.artifacts) {
              const flattenedArtifacts = flattenArtifacts(
                result.artifacts,
                `${stepId}.item[${index}]`
              );
              for (const [key, value] of Object.entries(flattenedArtifacts)) {
                ctx.emit(key, value);
              }
            }
          });

          // Also emit array of artifacts for backward compatibility
          ctx.emit(`${stepId}:itemArtifacts`, itemFlowResults.map(r => r.artifacts));
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

/**
 * Configuration for route composite node
 */
export interface RouteCompositeConfig {
  stepId: string;
  routeConfig: RouteConfig;
  branches: Record<string, SerializableFlow | FlowReference>;
  others?: SerializableFlow | FlowReference;
  providers: ProviderRegistry;
  flows: FlowRegistry;
}

/**
 * Match a MIME type against a pattern
 * Supports exact match and glob patterns (e.g., 'image/*')
 */
function matchesMimePattern(mimeType: string, pattern: string): boolean {
  if (pattern === mimeType) return true;

  // Handle glob patterns like 'image/*' or 'application/*'
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2); // Remove '/*'
    return mimeType.startsWith(prefix + '/');
  }

  return false;
}

/**
 * Find matching branch for a MIME type
 * Returns the first branch name that matches, or undefined if none match
 */
function findMatchingBranch(
  mimeType: string,
  branches: Record<string, RouteBranchConfig>
): string | undefined {
  for (const [branchName, config] of Object.entries(branches)) {
    for (const pattern of config.mimeTypes) {
      if (matchesMimePattern(mimeType, pattern)) {
        return branchName;
      }
    }
  }
  return undefined;
}

/**
 * Extract base64 data from a data URI or return as-is if already raw base64
 */
function extractBase64Data(input: string): string {
  if (input.startsWith('data:')) {
    const commaIndex = input.indexOf(',');
    if (commaIndex !== -1) {
      return input.substring(commaIndex + 1);
    }
  }
  return input;
}

/**
 * Creates a composite node that:
 * 1. Detects MIME type from input (base64 or URL)
 * 2. Routes to appropriate branch based on MIME type
 * 3. Returns the branch flow's output
 *
 * No provider required - uses deterministic MIME detection from magic bytes.
 */
export function createRouteCompositeNode(
  config: RouteCompositeConfig
): NodeDef<FlowInput, unknown> {
  const { stepId, routeConfig, branches, others, providers, flows } = config;

  return {
    key: 'route-composite',
    run: async (input: FlowInput, ctx?: NodeCtx) => {
      const t0 = Date.now();
      let detectedMimeType: string | undefined;
      let selectedBranch: string | undefined;
      let phase: 'detect' | 'route' | 'branch' = 'detect';

      try {
        // === PHASE 1: DETECT MIME TYPE ===
        let base64Data: string | undefined;

        if (input.base64) {
          base64Data = extractBase64Data(input.base64);
        } else if (input.url) {
          // For URL inputs, we need to fetch the content first to detect MIME type
          // This is a read-only fetch operation
          const response = await fetch(input.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          // Convert to base64 for MIME detection
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64Data = btoa(binary);
        } else {
          throw new Error(
            'Route node requires either url or base64 input for MIME detection'
          );
        }

        // Detect MIME type from actual file content (magic bytes)
        try {
          detectedMimeType = await detectMimeTypeFromBase64Async(base64Data);
        } catch {
          // Fallback to sync detection if async fails
          try {
            detectedMimeType = detectMimeTypeFromBase64(base64Data);
          } catch (syncErr) {
            throw new Error(
              `Unable to detect MIME type from input. ` +
              `Ensure the document is a supported format. ` +
              `Error: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`
            );
          }
        }

        // Emit detection result
        if (ctx?.emit) {
          ctx.emit(`${stepId}:detectedMimeType`, detectedMimeType);
        }

        // === PHASE 2: ROUTE TO BRANCH ===
        phase = 'route';

        selectedBranch = findMatchingBranch(detectedMimeType, routeConfig.branches);

        // Check for 'others' fallback
        if (!selectedBranch && others) {
          selectedBranch = 'others';
        }

        // Check for no match
        if (!selectedBranch) {
          const availableBranches = Object.entries(routeConfig.branches)
            .map(([name, cfg]) => `${name}: [${cfg.mimeTypes.join(', ')}]`)
            .join('; ');
          throw new Error(
            `No branch matches MIME type "${detectedMimeType}". ` +
            `Available branches: ${availableBranches}. ` +
            `Add an 'others' fallback branch to handle unmatched types.`
          );
        }

        // Emit routing decision
        if (ctx?.emit) {
          ctx.emit(`${stepId}:selectedBranch`, selectedBranch);
        }

        // === PHASE 3: EXECUTE BRANCH ===
        phase = 'branch';

        // Get branch flow (handle 'others' separately)
        const branchFlowOrRef = selectedBranch === 'others'
          ? others
          : branches[selectedBranch];

        if (!branchFlowOrRef) {
          throw new Error(
            `Branch "${selectedBranch}" not found in route configuration`
          );
        }

        // Resolve flow reference
        const branchFlowDef = resolveBranchFlow(branchFlowOrRef, flows);

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
              detectedMimeType,
              selectedBranch
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
            `${stepId}.branch.${selectedBranch}`
          );
          branchMetrics.forEach(m => ctx.metrics.push(m));
        }

        // Store branch output in artifacts
        if (ctx?.emit) {
          ctx.emit(`${stepId}:branchOutput`, branchResult.output);

          // Flatten branch artifacts with prefixed keys for direct access
          // This enables: artifacts["route-step.branch.pdf.extract"]
          if (branchResult.artifacts) {
            const flattenedArtifacts = flattenArtifacts(
              branchResult.artifacts,
              `${stepId}.branch.${selectedBranch}`
            );
            for (const [key, value] of Object.entries(flattenedArtifacts)) {
              ctx.emit(key, value);
            }

            // Also emit nested structure for backward compatibility
            ctx.emit(`${stepId}:branchArtifacts`, branchResult.artifacts);
          }
        }

        // === PHASE 4: COMPLETE ===
        // Calculate aggregate cost from branch operations (no provider cost for MIME detection)
        const branchCost = branchResult.metrics
          ? branchResult.metrics.reduce((sum: number, m: StepMetric) => sum + (m.costUSD ?? 0), 0)
          : 0;

        // Calculate duration breakdown
        const totalMs = Date.now() - t0;
        const branchMs = branchResult.metrics
          ? branchResult.metrics.reduce((sum: number, m: StepMetric) => sum + (m.ms ?? 0), 0)
          : 0;
        const overheadMs = totalMs - branchMs;  // Pure wrapper overhead (MIME detection + routing)

        // Add composite node wrapper metric
        if (ctx?.metrics) {
          const wrapperMetric: StepMetric = {
            step: stepId,
            configStepId: ctx.stepId,
            startMs: t0,
            provider: 'internal',  // No external provider - uses built-in MIME detection
            model: 'mime-detection',
            ms: totalMs,
            costUSD: branchCost,  // Total cost from branch (MIME detection is free)
            attemptNumber: 1,  // Composite wrappers don't retry, always 1
            metadata: {
              kind: 'wrapper',  // Distinguish wrapper from leaf metrics
              type: 'route',
              rollup: true,  // Duration includes child work
              overheadMs,  // Pure wrapper overhead (MIME detection + routing)
              detectedMimeType,
              selectedBranch,
              branchStepCount: branchResult.metrics?.length || 0,
              branchFlowId: selectedBranch === 'others'
                ? (others && typeof others === 'object' && 'flowRef' in others
                    ? (others as FlowReference).flowRef
                    : 'inline')
                : (typeof branches[selectedBranch] === 'object' && 'flowRef' in branches[selectedBranch]
                    ? (branches[selectedBranch] as FlowReference).flowRef
                    : 'inline')
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
              type: 'route',
              failed: true,
              detectedMimeType,
              selectedBranch,
              failedPhase: phase
            }
          });
        }

        // Build flow path with route context
        const flowPath: FlowStepLocation[] = [{
          stepId,
          stepIndex: 0,
          stepType: 'route',
          branch: selectedBranch || undefined
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
          `Route step "${stepId}" failed` +
          `${detectedMimeType ? ` (mimeType: ${detectedMimeType})` : ''}` +
          `${selectedBranch ? ` (branch: ${selectedBranch})` : ''}` +
          ` in phase: ${phase}` +
          `\n  Error: ${rootCauseMessage}`,
          stepId,
          0,
          'route',
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
