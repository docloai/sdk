import { node, type NodeDef, type FlowContext, type FlowResult, type StepMetric, type NodeCtx } from '@docloai/core';

/**
 * Type alias for provider registry
 * Re-exported for convenience
 */
export type ProviderRegistry = Record<string, any>;

/**
 * Flow builder function signature
 *
 * A FlowBuilder is a function that:
 * 1. Accepts an optional ProviderRegistry (for provider injection/override)
 * 2. Returns a Flow instance (from createFlow()) that has a build() method
 * 3. The build() method returns an object with run() and validate()
 *
 * This must match the FlowBuilder type in @docloai/flows/flow-registry
 * Defined here to avoid circular dependencies between packages.
 */
export type FlowBuilder<TInput = any, TOutput = any> = (providers?: ProviderRegistry) => {
  build: () => {
    run: (input: TInput, callbacks?: any) => Promise<any>;
    validate: () => any;
  };
};

/**
 * Configuration for trigger node (Programming API)
 * Supports inline flows with full power of JavaScript functions
 */
export type TriggerNodeConfig<TInput = any, TOutput = any> = {
  /**
   * Flow to execute
   * - Can be a flow builder function (for provider override support)
   * - Or a Flow instance with .build() method
   */
  flow: FlowBuilder<TInput, TOutput> | any;

  /**
   * Optional function to transform input data before passing to child flow
   * Receives current input and FlowContext with access to parent artifacts
   */
  mapInput?: (input: any, context: FlowContext) => TInput;

  /**
   * Provider overrides for child flow
   * These will be merged with parent providers (if flow is a builder function)
   */
  providers?: ProviderRegistry;

  /**
   * Whether to merge child flow metrics into parent flow metrics
   * Default: true (metrics are flattened with step prefixes)
   */
  mergeMetrics?: boolean;

  /**
   * Timeout for child flow execution in milliseconds
   * Default: undefined (no timeout)
   */
  timeout?: number;

  /**
   * Optional flow ID for debugging and circular dependency detection
   * If not provided, uses "anonymous-flow"
   */
  flowId?: string;
};

/**
 * Execute a promise with timeout
 */
function executeWithTimeout<T>(
  promise: Promise<T>,
  timeout?: number
): Promise<T> {
  if (!timeout) return promise;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Flow execution timeout after ${timeout}ms`)), timeout)
    )
  ]);
}

/**
 * Flatten child flow metrics by prefixing step names with trigger ID
 * This makes it clear which metrics came from which nested flow
 */
function flattenMetrics(
  childMetrics: StepMetric[],
  triggerStepId: string
): StepMetric[] {
  return childMetrics.map(m => ({
    ...m,
    step: `${triggerStepId}.${m.step}`,  // Prefix with parent step
    // @ts-ignore - Add metadata for nested metrics
    nested: true
  }));
}

/**
 * Trigger Node - Execute a child flow from within a flow
 *
 * Enables flow composition, conditional routing, and reusable sub-flows.
 *
 * ## Use Cases
 *
 * ### 1. Inline Flow Execution
 * ```typescript
 * .step('processDoc', trigger({
 *   flow: () => createFlow()
 *     .step('parse', parse({ provider: ocrProvider }))
 *     .step('extract', extract({ provider: vlmProvider, schema }))
 * }))
 * ```
 *
 * ### 2. With Input Transformation
 * ```typescript
 * .step('processDoc', trigger({
 *   flow: processingFlowBuilder,
 *   mapInput: (input, context) => ({
 *     document: input,
 *     category: context.artifacts.categorize.category
 *   })
 * }))
 * ```
 *
 * ### 3. With Provider Overrides
 * ```typescript
 * .step('processDoc', trigger({
 *   flow: processingFlowBuilder,
 *   providers: {
 *     vlm: alternateVlmProvider  // Override VLM provider
 *   }
 * }))
 * ```
 *
 * ### 4. Conditional Flow Routing
 * ```typescript
 * .step('categorize', categorize({ provider, categories: ['invoice', 'receipt'] }))
 * .conditional('route', (data, context) => {
 *   const category = context.artifacts.categorize.category;
 *   if (category === 'invoice') {
 *     return trigger({ flow: invoiceFlowBuilder });
 *   }
 *   return trigger({ flow: receiptFlowBuilder });
 * })
 * ```
 *
 * ## Metrics & Observability
 *
 * By default, child flow metrics are merged into parent with prefixed step names:
 * ```typescript
 * // Parent flow metrics:
 * [
 *   { step: "categorize", ms: 500 },
 *   { step: "processDoc", ms: 2000 },           // Trigger overhead
 *   { step: "processDoc.parse", ms: 1200 },     // Child flow steps
 *   { step: "processDoc.extract", ms: 800 }
 * ]
 * ```
 *
 * ## Circular Dependency Detection
 *
 * The trigger node automatically detects circular dependencies:
 * - Tracks call stack via FlowContext.callStack
 * - Throws error if same flow is triggered recursively
 * - Maximum depth limit (default: 10 levels)
 *
 * @param config - Trigger configuration
 * @returns NodeDef that executes the child flow
 */
export function trigger<TInput = any, TOutput = any>(
  config: TriggerNodeConfig<TInput, TOutput>
): NodeDef<any, TOutput> {
  const triggerNode = node<any, TOutput>("trigger", async (input, ctx) => {
    const t0 = Date.now();
    const flowId = config.flowId || 'anonymous-flow';

    try {
      // 1. Build FlowContext for input mapping and circular dependency detection
      const flowContext: FlowContext = {
        artifacts: { ...ctx.artifacts },
        metrics: [],  // Empty array - metrics are tracked separately in parent flow
        callStack: (ctx.artifacts.__callStack as string[]) || [],
        maxDepth: (ctx.artifacts.__maxDepth as number) || 10
      };

      // 2. Check for circular dependencies
      if (flowContext.callStack && flowContext.callStack.includes(flowId)) {
        throw new Error(
          `Circular flow dependency detected: ${[...flowContext.callStack, flowId].join(' → ')}`
        );
      }

      // 3. Check max depth
      if (flowContext.callStack && flowContext.callStack.length >= (flowContext.maxDepth || 10)) {
        throw new Error(
          `Maximum flow depth (${flowContext.maxDepth || 10}) exceeded. ` +
          `Call stack: ${flowContext.callStack.join(' → ')}`
        );
      }

      // 4. Map input if needed
      const flowInput = config.mapInput
        ? config.mapInput(input, flowContext)
        : input;

      // 5. Build flow with provider overrides
      let flowInstance: any;  // Flow instance from createFlow()

      if (typeof config.flow === 'function') {
        // Flow builder function - call with merged providers
        const mergedProviders = config.providers
          ? { ...(ctx.artifacts.__providers as ProviderRegistry || {}), ...config.providers }
          : (ctx.artifacts.__providers as ProviderRegistry);

        flowInstance = config.flow(mergedProviders);
      } else {
        // Flow instance passed directly
        flowInstance = config.flow;
      }

      // 6. Build the flow to get executable and validate
      const builtFlow = flowInstance.build();

      // 7. Validate flow
      const validation = builtFlow.validate();
      if (!validation.valid) {
        const errors = validation.errors.map((e: any) =>
          `  - Step ${e.stepId} (${e.stepType}): ${e.message}`
        ).join('\n');
        throw new Error(
          `Child flow validation failed:\n${errors}`
        );
      }

      // 8. Execute with updated call stack

      // Update artifacts with call stack for child flow
      ctx.emit('__callStack', [...flowContext.callStack!, flowId]);
      ctx.emit('__maxDepth', flowContext.maxDepth);
      ctx.emit('__providers', config.providers || ctx.artifacts.__providers);

      // Execute with timeout
      const result = await executeWithTimeout(
        builtFlow.run(flowInput),
        config.timeout
      ) as FlowResult<TOutput>;

      // 9. Merge or isolate metrics
      if (config.mergeMetrics !== false) {
        // Flatten child metrics with step prefix
        const flattenedMetrics = flattenMetrics(result.metrics, 'trigger');
        flattenedMetrics.forEach(m => ctx.metrics.push(m));
      }

      // 10. Add trigger node overhead metric
      ctx.metrics.push({
        step: "trigger",
        configStepId: ctx.stepId,
        startMs: t0,
        ms: Date.now() - t0,
        costUSD: 0,
        attemptNumber: 1,
        metadata: {
          kind: 'wrapper',
          type: 'trigger',
          flowId,
          childStepCount: result.metrics.length,
          mergedMetrics: config.mergeMetrics !== false,
          hasTimeout: !!config.timeout
        }
      });

      // 11. Emit child artifacts (prefixed to avoid conflicts)
      ctx.emit('trigger:artifacts', result.artifacts);
      ctx.emit('trigger:metrics', result.metrics);

      // 12. Return child flow output
      return result.output;

    } catch (error) {
      // Add trigger context to error
      const err = error instanceof Error ? error : new Error(String(error));

      ctx.metrics.push({
        step: "trigger",
        configStepId: ctx.stepId,
        startMs: t0,
        ms: Date.now() - t0,
        costUSD: 0,
        attemptNumber: 1,
        // @ts-ignore - Add error field
        error: err.message,
        metadata: {
          kind: 'wrapper',
          type: 'trigger',
          flowId,
          failed: true
        }
      });

      throw new Error(
        `Trigger node failed (flowId: ${flowId}): ${err.message}`
      );
    }
  });

  // Add type metadata for validation
  triggerNode.__meta = {
    inputTypes: ['any'],
    outputType: 'TOutput',
    acceptsArray: false,
    outputsArray: false,
    description: 'Execute a child flow from within a flow (type-dependent on child flow)'
  };

  return triggerNode;
}
