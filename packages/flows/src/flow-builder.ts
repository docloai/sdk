import {
  runPipeline,
  FlowExecutionError,
  aggregateMetrics,
  getNodeTypeName,
  validateNodeConnection,
  getSuggestedConnections,
  canStartForEachItemFlow,
  getValidForEachStarters,
  getProviderById,
  validateFlowInputFormat,
  type NodeDef,
  type FlowInput,
  type FlowInputValidation,
  type FlowResult,
  type StepMetric,
  type FlowContext,
  type NodeTypeName,
  type NodeCtx,
  type OutputNodeConfig,
  type AcceptedMimeType
} from "@docloai/core";
import { shouldSkipValidation } from "@docloai/core/runtime/env";

import { output as createOutputNode } from "@docloai/nodes";

import type {
  ObservabilityConfig,
  ExecutionContext,
  TraceContext,
  FlowStartContext,
  FlowEndContext,
  FlowErrorContext,
  FlowStats,
  StepStartContext,
  StepEndContext,
  StepErrorContext,
  BatchStartContext,
  BatchItemContext,
  BatchItemEndContext,
  BatchEndContext,
} from "@docloai/core/observability";

import {
  mergeConfig,
  shouldSample,
  TraceContextManager,
  generateExecutionId,
  executeHook,
  buildStepAttributes,
  generateSpanId,
} from "@docloai/core/observability";

/**
 * Progress callback options for flow execution
 */
export interface FlowProgressCallbacks {
  /** Called when a step starts execution */
  onStepStart?: (stepId: string, stepIndex: number, stepType: string) => void;
  /** Called when a step completes successfully */
  onStepComplete?: (stepId: string, stepIndex: number, stepType: string, durationMs: number) => void;
  /** Called when a step fails with an error */
  onStepError?: (stepId: string, stepIndex: number, stepType: string, error: Error) => void;
}

/**
 * Validation error for a flow step
 */
export interface FlowValidationError {
  stepId: string;
  stepIndex: number;
  stepType: string;
  message: string;
}

/**
 * Result of flow validation
 */
export interface FlowValidationResult {
  valid: boolean;
  errors: FlowValidationError[];
  warnings: string[];
}

// FlowContext is now exported from @docloai/core
export type { FlowContext } from "@docloai/core";

/**
 * Batch result type returned when flow has multiple outputs
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BatchFlowResult = { results: FlowResult<any>[] };

/**
 * Type representing the built flow object returned by Flow.build()
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BuiltFlow<TInput = any, TOutput = any> = {
  run: (input: TInput, callbacks?: FlowProgressCallbacks) => Promise<FlowResult<TOutput> | BatchFlowResult>;
  validate: () => FlowValidationResult;
};

/**
 * Type guard to check if a flow result is a single result (not batch)
 */
export function isSingleFlowResult<T>(result: FlowResult<T> | BatchFlowResult): result is FlowResult<T> {
  return 'output' in result && 'artifacts' in result;
}

/**
 * Type guard to check if a flow result is a batch result
 */
export function isBatchFlowResult(result: FlowResult<unknown> | BatchFlowResult): result is BatchFlowResult {
  return 'results' in result && Array.isArray(result.results);
}

/**
 * Type helper to extract the unwrapped input type from a wrapped type.
 * If T has an 'input' property, returns the type of that property.
 * Otherwise returns T unchanged.
 *
 * This matches the runtime behavior where conditionals receive wrapped data
 * but pass unwrapped data to the selected node.
 */
type UnwrapInput<T> = T extends { input: infer I } ? I : T;

type StepConfig<I, O> = {
  type: 'step';
  id: string;
  name?: string;
  node: NodeDef<I, O>;
};

type ConditionalConfig<I, O> = {
  type: 'conditional';
  id: string;
  name?: string;
  condition: (data: I, context?: FlowContext) => NodeDef<UnwrapInput<I>, O>;
};

type ForEachConfig<I, O> = {
  type: 'forEach';
  id: string;
  name?: string;
  childFlow: (item: any) => Flow<any, O>;
};

type FlowStep = StepConfig<any, any> | ConditionalConfig<any, any> | ForEachConfig<any, any>;

/**
 * Normalizes various input formats to FlowInput format
 * Handles:
 * - FlowInput objects: { base64, url, pages, bounds }
 * - Data URLs: "data:application/pdf;base64,..."
 * - HTTP URLs: "https://..."
 * - Raw base64 strings
 * - Objects with wrapper fields like { input: FlowInput }
 */
function normalizeFlowInput(input: any): any {
  // Null or undefined - return as is
  if (input == null) {
    return input;
  }

  // Already a FlowInput object - return as is
  if (typeof input === 'object' && (input.base64 || input.url)) {
    return input;
  }

  // String input - detect format
  if (typeof input === 'string') {
    // Data URL - keep as data URL (providers handle this)
    if (input.startsWith('data:')) {
      return { base64: input };
    }

    // HTTP/HTTPS URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return { url: input };
    }

    // Assume raw base64 string
    return { base64: input };
  }

  // Other object types - return as is (might be DocumentIR, string, etc.)
  return input;
}

/**
 * Options for creating a flow
 */
export interface FlowOptions {
  /** Observability configuration */
  observability?: ObservabilityConfig;
  /** User metadata to include in all observability contexts */
  metadata?: Record<string, unknown>;
  /**
   * Input format validation configuration.
   * Allows specifying accepted MIME types for early validation
   * before flow execution begins.
   */
  inputValidation?: FlowInputValidation;
}

/**
 * Flow builder class for creating document processing pipelines.
 * @template TInput - The input type for the flow
 * @template TOutput - The output type for the flow
 */
export class Flow<TInput = any, TOutput = any> {
  private steps: FlowStep[] = [];
  private observability?: ObservabilityConfig;
  private metadata?: Record<string, unknown>;
  private inputValidation?: FlowInputValidation;
  private traceContextManager?: TraceContextManager;
  private currentExecution?: ExecutionContext;

  constructor(options?: FlowOptions) {
    if (options?.observability) {
      this.observability = mergeConfig(options.observability);
      this.traceContextManager = new TraceContextManager(this.observability);
    }
    if (options?.metadata) {
      this.metadata = options.metadata;
    }
    if (options?.inputValidation) {
      this.inputValidation = options.inputValidation;
    }
  }

  /**
   * Set accepted input formats for this flow (fluent API).
   * Validates input format before flow execution begins.
   *
   * @param formats - List of accepted MIME types (e.g., ['application/pdf', 'image/jpeg'])
   * @returns This flow instance for chaining
   *
   * @example
   * ```typescript
   * const pdfOnlyFlow = createFlow()
   *   .acceptFormats(['application/pdf'])
   *   .step('parse', parse({ provider }))
   *   .build();
   *
   * // Throws FlowInputValidationError if input is not a PDF
   * await pdfOnlyFlow.run({ base64: jpegBase64 });
   * ```
   */
  acceptFormats(formats: AcceptedMimeType[]): Flow<TInput, TOutput> {
    this.inputValidation = { acceptedFormats: formats };
    return this;
  }

  /**
   * Add a sequential step to the flow
   */
  step<TStepOutput>(id: string, node: NodeDef<TOutput, TStepOutput>, name?: string): Flow<TInput, TStepOutput> {
    this.steps.push({
      type: 'step',
      id,
      name,
      node
    });
    return this as any;
  }

  /**
   * Add a conditional step that chooses a node based on input data
   *
   * IMPORTANT: Conditionals must return a NODE, not a promise or executed flow.
   * The SDK will execute the returned node for you.
   *
   * The condition function receives the full wrapped data (e.g., { input, quality })
   * but the returned node should accept the unwrapped input (e.g., just FlowInput).
   * The SDK automatically unwraps the data before passing it to the selected node.
   *
   * ✅ CORRECT - Return a node (declarative):
   * ```typescript
   * .step('qualify', qualify({ provider, levels: ['low', 'medium', 'high'] }))
   * .conditional('parse', (data) => {
   *   // data is { input: FlowInput, quality: string }
   *   if (data.quality === 'high') {
   *     return parse({ provider: fastProvider });  // Return the node
   *   }
   *   return parse({ provider: accurateProvider }); // Return the node
   * })
   * ```
   *
   * ❌ INCORRECT - Do NOT return a promise (imperative):
   * ```typescript
   * .conditional('parse', (data) => {
   *   // This will throw an error!
   *   return createFlow()
   *     .step('parse', parse({ provider }))
   *     .build()
   *     .run(data.input)  // ❌ Don't call .run() here!
   *     .then(r => r.output);
   * })
   * ```
   *
   * 🆕 NEW - Access previous step outputs via context:
   * ```typescript
   * .step('categorize', categorize({ provider, categories }))
   * .conditional('parse', (data) => parse({ provider }))
   * .conditional('extract', (data, context) => {
   *   // Access category from earlier step via context.artifacts
   *   const category = context?.artifacts.categorize?.category;
   *   return extract({ provider, schema: SCHEMAS[category] });
   * })
   * ```
   *
   * Use the declarative pattern (return nodes) for consistent flow execution,
   * proper error tracking, and accurate metrics collection.
   */
  conditional<TConditionalOutput>(
    id: string,
    condition: (data: TOutput, context?: FlowContext) => NodeDef<UnwrapInput<TOutput>, TConditionalOutput>,
    name?: string
  ): Flow<TInput, TConditionalOutput> {
    this.steps.push({
      type: 'conditional',
      id,
      name,
      condition
    });
    return this as any;
  }

  /**
   * Process each item from previous step (which must return an array) with a child flow
   * Each item is processed in parallel as its own isolated run
   */
  forEach<TItem, TForEachOutput>(
    id: string,
    childFlow: (item: TItem) => Flow<TItem, TForEachOutput>,
    name?: string
  ): Flow<TInput, FlowResult<TForEachOutput>[]> {
    this.steps.push({
      type: 'forEach',
      id,
      name,
      childFlow
    });
    return this as any;
  }

  /**
   * Add an explicit output node to mark which data to return from the flow
   *
   * By default, flows return the output of the last step. Use output nodes to:
   * - Return data from earlier steps
   * - Return multiple named outputs
   * - Transform outputs before returning
   *
   * @param config - Output configuration
   * @returns Flow with output node added
   *
   * @example
   * // Single output
   * .output({ name: 'invoice_data' })
   *
   * // Select specific source
   * .output({ name: 'result', source: 'step2' })
   *
   * // Multiple outputs
   * .step('extract1', extract({ provider, schema1 }))
   * .output({ name: 'summary', source: 'extract1' })
   * .step('extract2', extract({ provider, schema2 }))
   * .output({ name: 'details', source: 'extract2' })
   */
  output<TOutputShape = TOutput>(config?: OutputNodeConfig): Flow<TInput, TOutputShape> {
    // Normalize and validate name
    const name = config?.name?.trim();

    // Use provided name or generate unique default
    const stepId = name || this.generateOutputStepId();

    this.steps.push({
      type: 'step',
      id: stepId,
      node: createOutputNode({
        ...config,
        name: stepId  // Ensure name matches step ID
      })
    });

    return this as any;
  }

  /**
   * Get current execution context
   *
   * Returns null if not currently executing.
   */
  getExecutionContext(): ExecutionContext | null {
    return this.currentExecution ?? null;
  }

  /**
   * Get current trace context
   *
   * Returns null if not currently executing or observability not configured.
   */
  getTraceContext(): TraceContext | null {
    return this.traceContextManager?.getTraceContext() ?? null;
  }

  /**
   * Set a custom attribute on the current execution
   *
   * Custom attributes appear in execution context and can be accessed by hooks.
   */
  setCustomAttribute(key: string, value: unknown): void {
    if (this.currentExecution) {
      this.currentExecution.customAttributes[key] = value;
    }
  }

  /**
   * Record a custom metric for the current execution
   *
   * Custom metrics appear in execution context and can be accessed by hooks.
   */
  recordMetric(name: string, value: number, unit?: string): void {
    if (this.currentExecution) {
      this.currentExecution.customMetrics.push({
        name,
        value,
        unit,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Build and return the executable flow
   */
  build(): BuiltFlow<TInput, TOutput> {
    return {
      run: async (input: TInput, callbacks?: FlowProgressCallbacks) => {
        return this.execute(input, callbacks);
      },
      validate: () => {
        return this.validate();
      }
    };
  }

  /**
   * Generate a unique step ID for unnamed output nodes
   * Prevents duplicate IDs when multiple .output() calls without names
   */
  private generateOutputStepId(): string {
    let counter = 0;
    let candidateId = 'output';

    // Check if 'output' is already taken
    while (this.steps.some(step => step.id === candidateId)) {
      counter++;
      candidateId = `output_${counter}`;
    }

    return candidateId;
  }

  /**
   * Validate the flow configuration
   */
  private validate(): FlowValidationResult {
    const errors: FlowValidationError[] = [];
    const warnings: string[] = [];

    // Check if flow has at least one step
    if (this.steps.length === 0) {
      errors.push({
        stepId: '<flow>',
        stepIndex: -1,
        stepType: 'flow',
        message: 'Flow has no steps. Add at least one step using .step(), .conditional(), or .forEach()'
      });
    }

    // Validate each step
    for (let stepIndex = 0; stepIndex < this.steps.length; stepIndex++) {
      const step = this.steps[stepIndex];

      // Check for duplicate step IDs
      const duplicateIndex = this.steps.findIndex((s, i) => i !== stepIndex && s.id === step.id);
      if (duplicateIndex !== -1) {
        errors.push({
          stepId: step.id,
          stepIndex,
          stepType: step.type,
          message: `Duplicate step ID "${step.id}" found at indices ${stepIndex} and ${duplicateIndex}`
        });
      }

      // Validate step-specific configuration
      if (step.type === 'step') {
        if (!step.node) {
          errors.push({
            stepId: step.id,
            stepIndex,
            stepType: step.type,
            message: 'Step node is missing. Use parse(), qualify(), categorize(), extract(), or split()'
          });
        }
        // Note: We don't check typeof === 'function' because NodeDef can be various structures
        // TypeScript already ensures type safety at compile time
      } else if (step.type === 'conditional') {
        if (!step.condition || typeof step.condition !== 'function') {
          errors.push({
            stepId: step.id,
            stepIndex,
            stepType: step.type,
            message: 'Conditional must have a condition function'
          });
        }
      } else if (step.type === 'forEach') {
        if (!step.childFlow || typeof step.childFlow !== 'function') {
          errors.push({
            stepId: step.id,
            stepIndex,
            stepType: step.type,
            message: 'forEach must have a childFlow function'
          });
        }

        // Warn if forEach is not preceded by a step that could produce an array
        if (stepIndex === 0) {
          warnings.push(`forEach step "${step.id}" at index ${stepIndex} is the first step - ensure input is an array`);
        }
      }

      // Check for empty step IDs
      if (!step.id || step.id.trim() === '') {
        errors.push({
          stepId: '<empty>',
          stepIndex,
          stepType: step.type,
          message: 'Step ID cannot be empty'
        });
      }
    }

    // Type compatibility validation (skip if DOCLO_SKIP_VALIDATION is set)
    if (!shouldSkipValidation()) {
      this.validateTypeCompatibility(errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate type compatibility between consecutive steps
   */
  private validateTypeCompatibility(errors: FlowValidationError[], warnings: string[]): void {
    for (let i = 0; i < this.steps.length - 1; i++) {
      const currentStep = this.steps[i];
      const nextStep = this.steps[i + 1];

      // Only validate step → step connections (not conditional or forEach)
      if (currentStep.type === 'step' && nextStep.type === 'step') {
        const sourceType = getNodeTypeName(currentStep.node);
        const targetType = getNodeTypeName(nextStep.node);

        // Skip if either node type is unknown (custom nodes)
        if (!sourceType || !targetType) {
          continue;
        }

        // Check if source node has forEach capability (split node)
        const forEachEnabled = false; // TODO: Detect forEach from node config

        // Validate connection
        const validation = validateNodeConnection(sourceType, targetType, forEachEnabled);

        if (!validation.valid) {
          errors.push({
            stepId: currentStep.id,
            stepIndex: i,
            stepType: currentStep.type,
            message: `Invalid connection: ${sourceType} → ${targetType}. ${validation.reason || 'Types incompatible'}`,
          });

          // Add suggestions as warnings
          if (validation.suggestions && validation.suggestions.length > 0) {
            warnings.push(`Suggestions for step "${currentStep.id}":`);
            validation.suggestions.forEach(s => warnings.push(`  ${s}`));
          }
        } else if (validation.warning) {
          // Add runtime validation warning
          warnings.push(`Step "${currentStep.id}" → "${nextStep.id}": ${validation.warning}`);
        }
      }

      // Validate forEach requirements
      if (currentStep.type === 'step' && nextStep.type === 'forEach') {
        const sourceType = getNodeTypeName(currentStep.node);
        if (sourceType) {
          const sourceInfo = currentStep.node.__meta;
          const outputsArray = sourceInfo?.outputsArray;

          // Check if source outputs array
          const isArrayOutput = typeof outputsArray === 'function'
            ? outputsArray(null) // Can't access config here, so pass null
            : outputsArray;

          if (!isArrayOutput) {
            warnings.push(
              `forEach step "${nextStep.id}" requires array input. ` +
              `Previous step "${currentStep.id}" (${sourceType}) may not output an array. ` +
              `Ensure ${sourceType} is configured to output an array (e.g., parse with chunked:true).`
            );
          }

          // Validate forEach itemFlow starting node
          if (nextStep.childFlow && typeof nextStep.childFlow === 'function') {
            try {
              // Try to build the child flow to inspect its first step
              const childFlowInstance = nextStep.childFlow(null as any);

              // Access the steps array if available (Flow class internal structure)
              const childSteps = (childFlowInstance as any).steps;

              if (childSteps && Array.isArray(childSteps) && childSteps.length > 0) {
                const firstStep = childSteps[0];

                // Validate the first step is a regular step (not forEach/conditional)
                if (firstStep.type === 'step') {
                  const firstNodeType = getNodeTypeName(firstStep.node);

                  if (firstNodeType) {
                    // Validate that this node can start forEach itemFlow
                    const validation = canStartForEachItemFlow(sourceType, firstNodeType);

                    if (!validation.valid) {
                      errors.push({
                        stepId: nextStep.id,
                        stepIndex: i + 1,
                        stepType: 'forEach',
                        message: `Invalid forEach itemFlow starter: ${validation.reason || `${firstNodeType} cannot start forEach itemFlow after ${sourceType}`}`
                      });

                      // Add suggestions as warnings
                      if (validation.suggestions && validation.suggestions.length > 0) {
                        warnings.push(`Suggestions for forEach "${nextStep.id}":`);
                        validation.suggestions.forEach(s => warnings.push(`  ${s}`));
                      }
                    }
                  }
                } else if (firstStep.type === 'forEach') {
                  // Nested forEach is not allowed for split
                  if (sourceType === 'split') {
                    errors.push({
                      stepId: nextStep.id,
                      stepIndex: i + 1,
                      stepType: 'forEach',
                      message: 'Invalid forEach itemFlow: Cannot nest forEach operations. Split nodes cannot appear in forEach itemFlow.'
                    });
                  }
                }
              }
            } catch (error) {
              // If we can't inspect the child flow, add a warning but don't block
              warnings.push(
                `forEach step "${nextStep.id}": Unable to validate itemFlow structure. ` +
                `Ensure the first node in itemFlow is compatible with ${sourceType} output. ` +
                `Valid starters: ${getValidForEachStarters(sourceType).join(', ')}`
              );
            }
          }
        }
      }
    }

    // Check for efficiency anti-patterns
    this.checkEfficiencyPatterns(warnings);
  }

  /**
   * Check for inefficient flow patterns and add warnings.
   *
   * Detects patterns like:
   * - parse() → extract(raw-document-provider): The extract provider ignores parse output
   */
  private checkEfficiencyPatterns(warnings: string[]): void {
    for (let i = 0; i < this.steps.length - 1; i++) {
      const current = this.steps[i];
      const next = this.steps[i + 1];

      // Only check step → step connections
      if (current.type !== 'step' || next.type !== 'step') continue;

      const currNodeType = getNodeTypeName(current.node);
      const nextNodeType = getNodeTypeName(next.node);

      // Detect: parse() → extract(raw-document-provider)
      if (currNodeType === 'parse' && nextNodeType === 'extract') {
        const extractProvider = this.getProviderFromNode(next.node);

        if (extractProvider) {
          const metadata = getProviderById(extractProvider);

          if (metadata?.inputRequirements?.inputType === 'raw-document') {
            warnings.push(
              `Efficiency warning: Step "${current.id}" (parse) output may be ignored. ` +
              `"${metadata.name}" processes raw documents directly, not parsed text. ` +
              `Consider: (1) Remove the parse step, or (2) Use an LLM provider for extraction that can use parsed text.`
            );
          }
        }
      }
    }
  }

  /**
   * Extract provider ID from a node definition.
   * Returns undefined if provider cannot be determined.
   */
  private getProviderFromNode(node: NodeDef<any, any>): string | undefined {
    // Try to get provider from node config
    const config = (node as any).__meta?.config;
    if (config?.provider) {
      // Provider can be a string ID or a provider object
      if (typeof config.provider === 'string') {
        return config.provider;
      }
      // If provider is an object, it might have an id or name property
      if (typeof config.provider === 'object') {
        return config.provider.id ?? config.provider.name;
      }
    }
    return undefined;
  }

  /**
   * Execute the flow with optional progress callbacks
   */
  private async execute(input: any, callbacks?: FlowProgressCallbacks): Promise<any> {
    const flowStartTime = Date.now();
    const artifacts: Record<string, any> = {};
    const metrics: StepMetric[] = [];
    const completedSteps: string[] = [];
    const outputs: Record<string, any> = {};  // Store output node results
    let lastNonOutputData: any = null;  // Track data from last non-output step

    // Initialize observability
    let executionId: string | undefined;
    let traceContext: TraceContext | undefined;
    let sampled = false;

    if (this.observability) {
      // Determine if this execution should be sampled
      sampled = shouldSample(this.observability);

      // Initialize trace context
      if (this.traceContextManager && sampled) {
        traceContext = this.traceContextManager.initialize(sampled);
      }

      // Generate execution ID
      const execIdGenerator = this.observability.generateExecutionId ?? generateExecutionId;
      executionId = execIdGenerator();

      // Initialize execution context for tracking
      this.currentExecution = {
        flowId: 'flow', // TODO: Add flowId to Flow class
        executionId,
        startTime: flowStartTime,
        status: 'running',
        customAttributes: {},
        customMetrics: [],
      };

      // Call onFlowStart hook
      if (sampled && traceContext) {
        const flowStartContext: FlowStartContext = {
          flowId: 'flow', // TODO: Add flowId
          flowVersion: '0.0.1',
          executionId,
          timestamp: flowStartTime,
          input,
          config: {}, // TODO: Capture flow config
          metadata: this.metadata,
          sdkVersion: '0.0.1',
          observabilityVersion: this.observability.observabilityVersion ?? '1.0.0',
          traceContext,
        };

        await executeHook(this.observability.onFlowStart, {
          hookName: 'onFlowStart',
          config: this.observability,
          context: flowStartContext,
        });
      }
    }

    // Normalize input format to handle various input types
    // (data URLs, HTTP URLs, raw base64, FlowInput objects)
    let currentData = normalizeFlowInput(input);

    // Validate input format if configured
    if (this.inputValidation?.acceptedFormats?.length) {
      const dataUrl = currentData?.base64 || currentData?.url;
      if (dataUrl) {
        // This will throw FlowInputValidationError if format doesn't match
        validateFlowInputFormat(dataUrl, this.inputValidation.acceptedFormats);
      }
    }

    // Wrap execution in try-catch for flow-level error handling
    try {

    for (let stepIndex = 0; stepIndex < this.steps.length; stepIndex++) {
      const step = this.steps[stepIndex];
      const stepStartTime = Date.now();

      // Generate span ID for this step
      const stepSpanId = this.traceContextManager && sampled ? generateSpanId() : undefined;

      // Notify step start (old callbacks)
      callbacks?.onStepStart?.(step.id, stepIndex, step.type);

      // Call onStepStart hook (new observability)
      if (this.observability && sampled && traceContext && executionId && stepSpanId) {
        const stepStartContext: StepStartContext = {
          flowId: 'flow',
          executionId,
          stepId: step.id,
          stepIndex,
          stepType: (step as StepConfig<any, any>).node?.key ?? step.type,
          stepName: step.name ?? step.id,
          timestamp: stepStartTime,
          provider: undefined, // Will be populated from step config if available
          model: undefined,
          config: {},
          input: currentData,
          isConsensusEnabled: false, // TODO: Check step config for consensus
          isRetry: false,
          metadata: this.metadata,
          traceContext,
          spanId: stepSpanId,
        };

        await executeHook(this.observability.onStepStart, {
          hookName: 'onStepStart',
          config: this.observability,
          context: stepStartContext,
        });
      }

      try {
        if (step.type === 'step') {
          // Check if this is an output node
          const isOutputNode = (step.node as any)?.__meta?.isOutputNode === true;
          const outputName = (step.node as any)?.__meta?.outputName?.trim() || step.id;

          interface StepResult {
            output: unknown;
            artifacts: Record<string, unknown>;
            metrics: StepMetric[];
          }

          let result: StepResult;

          if (isOutputNode) {
            // Output nodes need access to flow-level artifacts
            // Execute directly with custom context instead of using runPipeline
            const ctx: NodeCtx = {
              stepId: step.id,
              artifacts,
              emit: (k: string, v: unknown) => { artifacts[k] = v; },
              metrics: { push: (m: StepMetric) => metrics.push(m) },
              observability: this.observability && sampled ? {
                config: this.observability,
                flowId: 'flow',
                executionId,
                stepId: step.id,
                stepIndex,
                traceContext,
                metadata: this.metadata,
              } : undefined
            };

            const outputData = await step.node.run(currentData, ctx);
            result = { output: outputData, artifacts: {}, metrics: [] };

            // Store the output node result
            outputs[outputName] = outputData;
            artifacts[step.id] = outputData;
            completedSteps.push(step.id);

            // Notify step complete (old callbacks)
            const stepDuration = Date.now() - stepStartTime;
            callbacks?.onStepComplete?.(step.id, stepIndex, step.type, stepDuration);

            // Call onStepEnd hook (new observability) - output nodes
            if (this.observability && sampled && traceContext && executionId && stepSpanId) {
              const stepEndContext: StepEndContext = {
                flowId: 'flow',
                executionId,
                stepId: step.id,
                stepIndex,
                timestamp: Date.now(),
                startTime: stepStartTime,
                duration: stepDuration,
                output: outputData,
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                cost: 0,
                metricKind: 'prep',  // Output nodes are prep steps (no API call)
                otelAttributes: buildStepAttributes({
                  stepType: step.node?.key ?? step.type,
                }),
                metadata: this.metadata,
                traceContext,
                spanId: stepSpanId,
              };

              await executeHook(this.observability.onStepEnd, {
                hookName: 'onStepEnd',
                config: this.observability,
                context: stepEndContext,
              });
            }

            // Pass through the last non-output data to the next step
            // (output nodes don't change the data flow, they just mark outputs)
            currentData = lastNonOutputData !== null ? lastNonOutputData : currentData;
          } else {
            // Regular sequential step
            result = await runPipeline([step.node], currentData, this.observability && sampled ? {
              config: this.observability,
              flowId: 'flow',
              executionId,
              stepId: step.id,
              stepIndex,
              traceContext,
              metadata: this.metadata,
            } : {
              // Always pass stepId for metrics tracking, even without observability
              stepId: step.id
            });

            // Store the original output in artifacts (preserve wrapped data)
            artifacts[step.id] = result.output;
            metrics.push(...result.metrics);
            completedSteps.push(step.id);

            // Notify step complete (old callbacks)
            const stepDuration = Date.now() - stepStartTime;
            callbacks?.onStepComplete?.(step.id, stepIndex, step.type, stepDuration);

            // Call onStepEnd hook (new observability) - regular steps
            if (this.observability && sampled && traceContext && executionId && stepSpanId) {
              // Find metrics by type
              const leafMetrics = result.metrics.filter(m => m.metadata?.kind === 'leaf');
              const wrapperMetric = result.metrics.find(m => m.metadata?.kind === 'wrapper');

              // Find leaf metrics that belong to this step
              const stepLeafMetrics = result.metrics.filter(m =>
                m.configStepId === step.id && m.metadata?.kind === 'leaf'
              );

              // If there are MULTIPLE leaf metrics for this step, it's consensus runs (pure wrapper)
              // If there's exactly ONE leaf metric for this step, that's the step's own work
              const isConsensus = stepLeafMetrics.length > 1;
              const stepOwnLeafMetric = isConsensus ? undefined : stepLeafMetrics[0];

              // Determine if there are child metrics (from branch flows, etc.)
              const hasOtherChildMetrics = result.metrics.some(m => m.configStepId !== step.id);
              const hasChildMetrics = isConsensus || hasOtherChildMetrics || leafMetrics.length > 1;

              let metricKind: 'leaf' | 'wrapper' | 'prep';
              let ownDuration: number;
              let ownCost: number;
              let ownInputTokens: number;
              let ownOutputTokens: number;
              let ownCacheCreationTokens: number | undefined;
              let ownCacheReadTokens: number | undefined;

              if (isConsensus) {
                // Consensus: multiple leaf metrics = pure wrapper (children report via onConsensusRunComplete)
                metricKind = 'wrapper';
                ownDuration = wrapperMetric?.metadata?.overheadMs ?? 0;
                ownCost = 0;
                ownInputTokens = 0;
                ownOutputTokens = 0;
                ownCacheCreationTokens = undefined;
                ownCacheReadTokens = undefined;
              } else if (stepOwnLeafMetric) {
                // Step has its own API call (e.g., categorize in conditional, single extract)
                // It's a wrapper if it ALSO has child metrics
                metricKind = hasOtherChildMetrics ? 'wrapper' : 'leaf';
                ownDuration = stepOwnLeafMetric.ms ?? 0;
                ownCost = stepOwnLeafMetric.costUSD ?? 0;
                ownInputTokens = stepOwnLeafMetric.inputTokens ?? 0;
                ownOutputTokens = stepOwnLeafMetric.outputTokens ?? 0;
                ownCacheCreationTokens = stepOwnLeafMetric.cacheCreationInputTokens;
                ownCacheReadTokens = stepOwnLeafMetric.cacheReadInputTokens;
              } else if (wrapperMetric || hasChildMetrics) {
                // Pure wrapper - no own API call, just orchestration
                metricKind = 'wrapper';
                ownDuration = wrapperMetric?.metadata?.overheadMs ?? 0;
                ownCost = 0;
                ownInputTokens = 0;
                ownOutputTokens = 0;
                ownCacheCreationTokens = undefined;
                ownCacheReadTokens = undefined;
              } else {
                // No metrics = prep step (e.g., output node)
                metricKind = 'prep';
                ownDuration = stepDuration;
                ownCost = 0;
                ownInputTokens = 0;
                ownOutputTokens = 0;
                ownCacheCreationTokens = undefined;
                ownCacheReadTokens = undefined;
              }

              // Get provider/model from first metric (all consensus runs use same provider)
              const firstMetric = result.metrics.length > 0 ? result.metrics[0] : undefined;

              const stepEndContext: StepEndContext = {
                flowId: 'flow',
                executionId,
                stepId: step.id,
                stepIndex,
                timestamp: Date.now(),
                startTime: stepStartTime,
                duration: ownDuration,
                output: result.output,
                usage: {
                  inputTokens: ownInputTokens,
                  outputTokens: ownOutputTokens,
                  totalTokens: ownInputTokens + ownOutputTokens,
                  cacheCreationInputTokens: ownCacheCreationTokens,
                  cacheReadInputTokens: ownCacheReadTokens,
                },
                cost: ownCost,
                metricKind,
                otelAttributes: buildStepAttributes({
                  stepType: step.node?.key ?? step.type,
                  provider: firstMetric?.provider,
                  model: firstMetric?.model,
                  inputTokens: ownInputTokens,
                  outputTokens: ownOutputTokens,
                }),
                metadata: this.metadata,
                traceContext,
                spanId: stepSpanId,
              };

              await executeHook(this.observability.onStepEnd, {
                hookName: 'onStepEnd',
                config: this.observability,
                context: stepEndContext,
              });
            }

            // Regular node - save this as the last non-output data
            lastNonOutputData = result.output;

            // Auto-unwrap ONLY if next step is a regular step (not conditional/forEach)
            // Conditionals need the wrapped data to make decisions
            // This preserves { input, quality/category } for final output and conditionals
            const hasNextStep = stepIndex < this.steps.length - 1;
            const nextStep = hasNextStep ? this.steps[stepIndex + 1] : null;
            const shouldUnwrap = hasNextStep &&
                                nextStep?.type === 'step' &&
                                result.output &&
                                typeof result.output === 'object' &&
                                'input' in result.output;

            if (shouldUnwrap) {
              currentData = (result.output as Record<string, unknown>).input;
            } else {
              currentData = result.output;
            }
          }
        } else if (step.type === 'conditional') {
          // Conditional step - choose node based on current data
          // Pass the FULL wrapped data to the condition function
          // (it needs access to quality/category for decision making)
          // Also pass context with artifacts and metrics for accessing previous step outputs
          const context: FlowContext = {
            artifacts: { ...artifacts },
            metrics: [...metrics]
          };
          const node = step.condition(currentData, context);

          // Validate that the condition function returned a valid NodeDef
          // NodeDef is an object with { key: string; run: function }
          if (!node || typeof node !== 'object' || !node.key || typeof node.run !== 'function') {
            throw new Error(
              `Conditional step "${step.id}" must return a node (e.g., parse(), categorize(), extract()). ` +
              `Got: ${typeof node}${node && typeof node === 'object' ? ` with keys: ${Object.keys(node).join(', ')}` : ''}. ` +
              `\n\nA valid node must have 'key' and 'run' properties.` +
              `\n\nIncorrect: .conditional('step', () => flow.run(...).then(r => r.output))` +
              `\nCorrect: .conditional('step', () => parse({ provider }))`
            );
          }

          // Auto-unwrap when executing the node (if data has 'input' field)
          // The selected node should receive just the input
          const nodeInput = currentData && typeof currentData === 'object' && 'input' in currentData
            ? currentData.input
            : currentData;

          const result = await runPipeline([node], nodeInput, this.observability && sampled ? {
            config: this.observability,
            flowId: 'flow',
            executionId,
            stepId: step.id,
            stepIndex,
            traceContext,
            metadata: this.metadata,
          } : undefined);

          // Store the original output in artifacts
          artifacts[step.id] = result.output;
          metrics.push(...result.metrics);
          completedSteps.push(step.id);

          // Notify step complete
          const stepDuration = Date.now() - stepStartTime;
          callbacks?.onStepComplete?.(step.id, stepIndex, step.type, stepDuration);

          // Call onStepEnd hook (new observability) - conditional steps
          if (this.observability && sampled && traceContext && executionId && stepSpanId) {
            // Find metrics by type
            const leafMetrics = result.metrics.filter(m => m.metadata?.kind === 'leaf');
            const wrapperMetric = result.metrics.find(m => m.metadata?.kind === 'wrapper');

            // Find leaf metrics that belong to this step
            const stepLeafMetrics = result.metrics.filter(m =>
              m.configStepId === step.id && m.metadata?.kind === 'leaf'
            );

            // If there are MULTIPLE leaf metrics for this step, it's consensus runs (pure wrapper)
            // If there's exactly ONE leaf metric for this step, that's the step's own work
            const isConsensus = stepLeafMetrics.length > 1;
            const stepOwnLeafMetric = isConsensus ? undefined : stepLeafMetrics[0];

            // Determine if there are child metrics (from branch flows, etc.)
            const hasOtherChildMetrics = result.metrics.some(m => m.configStepId !== step.id);
            const hasChildMetrics = isConsensus || hasOtherChildMetrics || leafMetrics.length > 1;

            let metricKind: 'leaf' | 'wrapper' | 'prep';
            let ownDuration: number;
            let ownCost: number;
            let ownInputTokens: number;
            let ownOutputTokens: number;
            let ownCacheCreationTokens: number | undefined;
            let ownCacheReadTokens: number | undefined;

            if (isConsensus) {
              // Consensus: multiple leaf metrics = pure wrapper (children report via onConsensusRunComplete)
              metricKind = 'wrapper';
              ownDuration = wrapperMetric?.metadata?.overheadMs ?? 0;
              ownCost = 0;
              ownInputTokens = 0;
              ownOutputTokens = 0;
              ownCacheCreationTokens = undefined;
              ownCacheReadTokens = undefined;
            } else if (stepOwnLeafMetric) {
              // Step has its own API call (e.g., categorize in conditional)
              // It's a wrapper if it ALSO has child metrics
              metricKind = hasOtherChildMetrics ? 'wrapper' : 'leaf';
              ownDuration = stepOwnLeafMetric.ms ?? 0;
              ownCost = stepOwnLeafMetric.costUSD ?? 0;
              ownInputTokens = stepOwnLeafMetric.inputTokens ?? 0;
              ownOutputTokens = stepOwnLeafMetric.outputTokens ?? 0;
              ownCacheCreationTokens = stepOwnLeafMetric.cacheCreationInputTokens;
              ownCacheReadTokens = stepOwnLeafMetric.cacheReadInputTokens;
            } else if (wrapperMetric || hasChildMetrics) {
              // Pure wrapper - no own API call, just orchestration
              metricKind = 'wrapper';
              ownDuration = wrapperMetric?.metadata?.overheadMs ?? 0;
              ownCost = 0;
              ownInputTokens = 0;
              ownOutputTokens = 0;
              ownCacheCreationTokens = undefined;
              ownCacheReadTokens = undefined;
            } else {
              // No metrics = prep step
              metricKind = 'prep';
              ownDuration = stepDuration;
              ownCost = 0;
              ownInputTokens = 0;
              ownOutputTokens = 0;
              ownCacheCreationTokens = undefined;
              ownCacheReadTokens = undefined;
            }

            // Get provider/model from first metric
            const firstMetric = result.metrics.length > 0 ? result.metrics[0] : undefined;

            const stepEndContext: StepEndContext = {
              flowId: 'flow',
              executionId,
              stepId: step.id,
              stepIndex,
              timestamp: Date.now(),
              startTime: stepStartTime,
              duration: ownDuration,
              output: result.output,
              usage: {
                inputTokens: ownInputTokens,
                outputTokens: ownOutputTokens,
                totalTokens: ownInputTokens + ownOutputTokens,
                cacheCreationInputTokens: ownCacheCreationTokens,
                cacheReadInputTokens: ownCacheReadTokens,
              },
              cost: ownCost,
              metricKind,
              otelAttributes: buildStepAttributes({
                stepType: 'conditional',
                provider: firstMetric?.provider,
                model: firstMetric?.model,
                inputTokens: ownInputTokens,
                outputTokens: ownOutputTokens,
              }),
              metadata: this.metadata,
              traceContext,
              spanId: stepSpanId,
            };

            await executeHook(this.observability.onStepEnd, {
              hookName: 'onStepEnd',
              config: this.observability,
              context: stepEndContext,
            });
          }

          // Track as non-output data
          lastNonOutputData = result.output;

          // Update currentData for next step (no need to unwrap here, handled in next iteration)
          currentData = result.output;
        } else if (step.type === 'forEach') {
        // forEach step - process array items in parallel
        if (!Array.isArray(currentData)) {
          throw new Error(`forEach step "${step.id}" requires array input, got ${typeof currentData}`);
        }

        const items = currentData;
        const batchId = executionId ? `${executionId}-batch-${stepIndex}` : `batch-${stepIndex}`;
        const batchStartTime = Date.now();

        // onBatchStart hook
        if (this.observability && sampled && traceContext && executionId) {
          const batchStartContext: BatchStartContext = {
            flowId: 'flow',
            executionId,
            batchId,
            stepId: step.id,
            totalItems: items.length,
            timestamp: batchStartTime,
            metadata: this.metadata,
            traceContext,
          };
          await executeHook(this.observability.onBatchStart, {
            hookName: 'onBatchStart',
            config: this.observability,
            context: batchStartContext,
          });
        }

        const results = await Promise.allSettled(
          items.map(async (item: any, itemIndex: number) => {
            const itemStartTime = Date.now();
            const itemSpanId = this.traceContextManager && sampled ? generateSpanId() : undefined;

            // onBatchItemStart hook
            if (this.observability && sampled && traceContext && executionId) {
              const batchItemContext: BatchItemContext = {
                flowId: 'flow',
                executionId,
                batchId,
                stepId: step.id,
                itemIndex,
                totalItems: items.length,
                timestamp: itemStartTime,
                item,
                metadata: this.metadata,
                traceContext,
              };
              await executeHook(this.observability.onBatchItemStart, {
                hookName: 'onBatchItemStart',
                config: this.observability,
                context: batchItemContext,
              });
            }

            try {
              const childFlow = step.childFlow(item);
              const builtFlow = childFlow.build();

              // If item is a SplitDocument (has .input property), pass the input to the child flow
              // Otherwise pass the item itself
              const flowInput = item && typeof item === 'object' && 'input' in item ? item.input : item;
              const result = await builtFlow.run(flowInput);

              // Handle both FlowResult and { results: FlowResult[] }
              let itemResult;
              if ('results' in result && Array.isArray(result.results)) {
                // Child flow has forEach - aggregate metrics and artifacts from results
                const aggregatedMetrics = (result.results || []).flatMap((r: any) => (r && r.metrics) || []);
                const aggregatedArtifacts = (result.results || []).map((r: any) => r && r.artifacts);
                itemResult = {
                  output: (result.results || []).map((r: any) => r && r.output),
                  metrics: aggregatedMetrics,
                  artifacts: aggregatedArtifacts
                };
              } else {
                // Regular flow result - cast to access properties
                const flowResult = result as FlowResult<any>;
                itemResult = {
                  output: flowResult.output,
                  metrics: flowResult.metrics || [],
                  artifacts: flowResult.artifacts || {}
                };
              }

              // onBatchItemEnd hook (success)
              if (this.observability && sampled && traceContext && executionId) {
                const batchItemEndContext: BatchItemEndContext = {
                  flowId: 'flow',
                  executionId,
                  batchId,
                  stepId: step.id,
                  itemIndex,
                  totalItems: items.length,
                  item,
                  timestamp: Date.now(),
                  duration: Date.now() - itemStartTime,
                  result: itemResult.output,
                  status: 'success',
                  metadata: this.metadata,
                  traceContext,
                };
                await executeHook(this.observability.onBatchItemEnd, {
                  hookName: 'onBatchItemEnd',
                  config: this.observability,
                  context: batchItemEndContext,
                });
              }

              return itemResult;
            } catch (error) {
              // Log the full error for debugging
              console.error('[forEach error]', error);

              // onBatchItemEnd hook (error)
              if (this.observability && sampled && traceContext && executionId) {
                const batchItemEndContext: BatchItemEndContext = {
                  flowId: 'flow',
                  executionId,
                  batchId,
                  stepId: step.id,
                  itemIndex,
                  totalItems: items.length,
                  item,
                  timestamp: Date.now(),
                  duration: Date.now() - itemStartTime,
                  result: null,
                  status: 'failed',
                  error: error instanceof Error ? error : new Error(String(error)),
                  metadata: this.metadata,
                  traceContext,
                };
                await executeHook(this.observability.onBatchItemEnd, {
                  hookName: 'onBatchItemEnd',
                  config: this.observability,
                  context: batchItemEndContext,
                });
              }

              return {
                output: null,
                error: (error as Error).message || String(error),
                metrics: [],
                artifacts: {}
              };
            }
          })
        );

        // Convert Promise.allSettled results to FlowResult[]
        const flowResults = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              output: null,
              error: result.reason,
              metrics: [],
              artifacts: {}
            };
          }
        });

          artifacts[step.id] = flowResults.map(r => r.artifacts);
          metrics.push(...flowResults.flatMap(r => r.metrics));
          completedSteps.push(step.id);

          // onBatchEnd hook
          const successfulCount = flowResults.filter(r => !r.error).length;
          const failedCount = flowResults.filter(r => r.error).length;

          if (this.observability && sampled && traceContext && executionId) {
            const batchEndContext: BatchEndContext = {
              flowId: 'flow',
              executionId,
              batchId,
              stepId: step.id,
              timestamp: Date.now(),
              startTime: batchStartTime,
              duration: Date.now() - batchStartTime,
              totalItems: items.length,
              successfulItems: successfulCount,
              failedItems: failedCount,
              results: flowResults.map(r => r.output),
              metadata: this.metadata,
              traceContext,
            };
            await executeHook(this.observability.onBatchEnd, {
              hookName: 'onBatchEnd',
              config: this.observability,
              context: batchEndContext,
            });
          }

          // Notify step complete
          const stepDuration = Date.now() - stepStartTime;
          callbacks?.onStepComplete?.(step.id, stepIndex, step.type, stepDuration);

          // Return results array
          return {
            results: flowResults,
            metrics,
            aggregated: aggregateMetrics(metrics),
            artifacts
          };
        }
      } catch (error) {
        // Wrap error with flow execution context
        const err = error instanceof Error ? error : new Error(String(error));

        // Notify step error (old callbacks)
        callbacks?.onStepError?.(step.id, stepIndex, step.type, err);

        // Call onStepError hook (new observability)
        if (this.observability && sampled && traceContext && executionId && stepSpanId) {
          const stepErrorTime = Date.now();
          const stepErrorContext: StepErrorContext = {
            flowId: 'flow',
            executionId,
            stepId: step.id,
            stepIndex,
            timestamp: stepErrorTime,
            startTime: stepStartTime,
            duration: stepErrorTime - stepStartTime,
            error: err,
            errorCode: (err as any).code,
            willRetry: false, // TODO: Determine if will retry
            metadata: this.metadata,
            traceContext,
            spanId: stepSpanId,
          };

          await executeHook(this.observability.onStepError, {
            hookName: 'onStepError',
            config: this.observability,
            context: stepErrorContext,
          });
        }

        // Build helpful error message with context
        const completedStepsStr = completedSteps.length > 0
          ? `\n  Completed steps: ${completedSteps.join(' → ')}`
          : '\n  No steps completed before failure';

        const artifactsStr = Object.keys(artifacts).length > 0
          ? `\n  Partial results available in: ${Object.keys(artifacts).join(', ')}`
          : '';

        throw new FlowExecutionError(
          `Flow execution failed at step "${step.id}" (index ${stepIndex}, type: ${step.type})` +
          `\n  Error: ${err.message}` +
          completedStepsStr +
          artifactsStr,
          step.id,
          stepIndex,
          step.type,
          completedSteps,
          err,
          artifacts  // Include partial artifacts for debugging
        );
      }
    }

    // Determine final output based on whether output nodes were used
    const hasOutputNodes = Object.keys(outputs).length > 0;

    let result: any;
    if (hasOutputNodes) {
      // If there are output nodes, use them for the output
      const outputCount = Object.keys(outputs).length;

      if (outputCount === 1) {
        // Single output node - return both output and outputs for flexibility
        const singleOutput = Object.values(outputs)[0];
        result = {
          output: singleOutput,
          outputs,
          metrics,
          aggregated: aggregateMetrics(metrics),
          artifacts
        };
      } else {
        // Multiple output nodes - return outputs object
        result = {
          output: outputs,  // For backward compatibility, set output to outputs
          outputs,
          metrics,
          aggregated: aggregateMetrics(metrics),
          artifacts
        };
      }
    } else {
      // No output nodes - use traditional last-step-as-output behavior
      result = {
        output: currentData,
        metrics,
        aggregated: aggregateMetrics(metrics),
        artifacts
      };
    }

    // Call onFlowEnd hook
    if (this.observability && sampled && traceContext && executionId) {
      const flowEndTime = Date.now();
      const aggregated = aggregateMetrics(metrics);

      const flowStats: FlowStats = {
        stepsTotal: this.steps.length,
        stepsCompleted: completedSteps.length,
        stepsFailed: 0,
        totalTokens: aggregated.totalInputTokens + aggregated.totalOutputTokens,
        totalCost: aggregated.totalCostUSD,
      };

      const flowEndContext: FlowEndContext = {
        flowId: 'flow',
        executionId,
        timestamp: flowEndTime,
        startTime: flowStartTime,
        duration: flowEndTime - flowStartTime,
        output: result.output,
        stats: flowStats,
        metadata: this.metadata,
        traceContext,
      };

      await executeHook(this.observability.onFlowEnd, {
        hookName: 'onFlowEnd',
        config: this.observability,
        context: flowEndContext,
      });

      // Update execution context
      if (this.currentExecution) {
        this.currentExecution.status = 'completed';
      }
    }

    return result;

    } catch (error) {
      // Call onFlowError hook
      if (this.observability && sampled && traceContext && executionId) {
        const flowErrorTime = Date.now();
        const aggregated = aggregateMetrics(metrics);

        const flowStats: FlowStats = {
          stepsTotal: this.steps.length,
          stepsCompleted: completedSteps.length,
          stepsFailed: 1,
          totalTokens: aggregated.totalInputTokens + aggregated.totalOutputTokens,
          totalCost: aggregated.totalCostUSD,
        };

        // Find failed step index
        const failedStepIndex = completedSteps.length; // Next step after last completed

        const flowErrorContext: FlowErrorContext = {
          flowId: 'flow',
          executionId,
          timestamp: flowErrorTime,
          startTime: flowStartTime,
          duration: flowErrorTime - flowStartTime,
          error: error as Error,
          errorCode: (error as any).code,
          failedAtStepIndex: failedStepIndex,
          partialStats: flowStats,
          metadata: this.metadata,
          traceContext,
        };

        await executeHook(this.observability.onFlowError, {
          hookName: 'onFlowError',
          config: this.observability,
          context: flowErrorContext,
        });

        // Update execution context
        if (this.currentExecution) {
          this.currentExecution.status = 'failed';
        }
      }

      // Re-throw the original error
      throw error;
    }
  }
}

/**
 * Create a new flow builder
 *
 * @param options - Flow configuration options including observability and metadata
 * @example
 * ```typescript
 * const flow = createFlow({
 *   observability: {
 *     onFlowStart: (ctx) => console.log('Flow started:', ctx.flowId),
 *     onStepEnd: (ctx) => console.log('Step done:', ctx.stepId, ctx.duration),
 *   },
 *   metadata: { environment: 'production', userId: 'user_123' }
 * });
 * ```
 */
export function createFlow<TInput = FlowInput>(options?: FlowOptions): Flow<TInput, TInput> {
  return new Flow<TInput, TInput>(options);
}
