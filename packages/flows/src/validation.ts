/**
 * Flow Validation
 *
 * Provides validation for flow configurations before execution.
 */

import type { JSONSchemaNode } from '@doclo/core';
import type {
  SerializableFlow,
  NodeConfig,
  SerializableConditionalStep,
  SerializableForEachStep,
  ExtractConfig,
  SplitConfig,
  CategorizeConfig,
  TriggerConfig,
  OutputConfig,
  FlowReference
} from './serialization.js';
import { isDebugValidation } from '@doclo/core/runtime/env';

/**
 * Validate JSON Schema structure (Edge Runtime compatible)
 *
 * This is a lightweight validator that checks basic JSON Schema structure
 * without using AJV's code generation (which breaks Edge Runtime).
 *
 * @param schema - JSON Schema object to validate
 * @param depth - Current recursion depth (internal parameter)
 * @returns Error message if invalid, null if valid
 */
function validateJSONSchemaStructure(schema: unknown, depth: number = 0): string | null {
  const MAX_DEPTH = 50; // Prevent DoS via deeply nested schemas

  // Check recursion depth to prevent DoS attacks
  if (depth > MAX_DEPTH) {
    return `Schema nesting depth exceeds maximum (${MAX_DEPTH})`;
  }

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return 'Schema must be an object';
  }

  // Type narrowed schema as Record for property access
  const schemaObj = schema as Record<string, unknown>;

  // Check for basic JSON Schema properties
  if (!schemaObj.type || typeof schemaObj.type !== 'string') {
    return 'Schema missing "type" property';
  }

  const validTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
  if (!validTypes.includes(schemaObj.type)) {
    return `Invalid schema type: "${schemaObj.type}". Must be one of: ${validTypes.join(', ')}`;
  }

  // Validate object schemas
  if (schemaObj.type === 'object') {
    if (schemaObj.properties && typeof schemaObj.properties !== 'object') {
      return 'Schema properties must be an object';
    }

    if (schemaObj.required && !Array.isArray(schemaObj.required)) {
      return 'Schema required must be an array';
    }

    // Recursively validate nested properties
    if (schemaObj.properties && typeof schemaObj.properties === 'object' && !Array.isArray(schemaObj.properties)) {
      const properties = schemaObj.properties as Record<string, unknown>;
      for (const [propName, propSchema] of Object.entries(properties)) {
        const propError = validateJSONSchemaStructure(propSchema, depth + 1);
        if (propError) {
          return `Invalid schema for property "${propName}": ${propError}`;
        }
      }
    }
  }

  // Validate array schemas
  if (schemaObj.type === 'array') {
    if (!schemaObj.items) {
      return 'Array schema missing "items" property';
    }

    const itemsError = validateJSONSchemaStructure(schemaObj.items, depth + 1);
    if (itemsError) {
      return `Invalid array items schema: ${itemsError}`;
    }
  }

  return null;
}

/**
 * Calculate JSON nesting depth for a flow
 *
 * This calculates the actual JSON nesting depth when the flow is serialized,
 * which is important for Convex and other databases with nesting limits.
 *
 * Each logical nesting level adds multiple JSON levels:
 * - Conditional step: +5 levels (branches → category → flow → steps → step)
 * - ForEach step: +4 levels (itemFlow → flow → steps → step)
 * - Standard step with schema: +4 levels (config → schema → properties → field)
 *
 * @param flow - Flow definition to analyze
 * @param currentDepth - Current depth (used for recursion)
 * @returns Maximum JSON nesting depth
 */
function calculateFlowNestingDepth(flow: SerializableFlow, currentDepth: number = 1): number {
  // Start at depth 1 for the root flow object
  // +1 for steps array
  let maxDepth = currentDepth + 1;

  for (const step of flow.steps) {
    // +1 for step object itself
    let stepDepth = currentDepth + 2;

    if (step.type === 'conditional') {
      // Conditional: step → branches (obj) → category → flow/flowRef
      // Type narrowing: step is SerializableConditionalStep
      const conditionalStep = step as SerializableConditionalStep;
      if (conditionalStep.branches) {
        for (const branchFlowOrRef of Object.values(conditionalStep.branches)) {
          // Check if it's a flow reference
          if ('flowRef' in branchFlowOrRef) {
            // Flow reference: branches (+1) → category (+1) → flowRef object (+1) = +3 from step
            // This is much shallower than inline flows!
            maxDepth = Math.max(maxDepth, stepDepth + 3);
          } else {
            // Inline flow: branches (+1) → category (+1) → flow → steps → nested step = +5+ levels
            const branchDepth = calculateFlowNestingDepth(branchFlowOrRef, stepDepth + 2);
            maxDepth = Math.max(maxDepth, branchDepth);
          }
        }
      }
    } else if (step.type === 'forEach') {
      // ForEach: step → itemFlow (obj or ref)
      // Type narrowing: step is SerializableForEachStep
      const forEachStep = step as SerializableForEachStep;
      if (forEachStep.itemFlow) {
        const itemFlowOrRef = forEachStep.itemFlow;

        // Check if it's a flow reference
        if ('flowRef' in itemFlowOrRef) {
          // Flow reference: itemFlow (+1) → flowRef object (+1) = +2 from step
          maxDepth = Math.max(maxDepth, stepDepth + 2);
        } else {
          // Inline flow: itemFlow (+1) → flow → steps → nested step = +4+ levels
          const itemDepth = calculateFlowNestingDepth(itemFlowOrRef, stepDepth + 1);
          maxDepth = Math.max(maxDepth, itemDepth);
        }
      }
    } else {
      // Standard step: check for schema depth
      const config = step.config;

      // config object (+1)
      let configDepth = stepDepth + 1;

      // If has schema: schema (+1) → properties (+1) → field (+1) → type/items (+1)
      // That's +4 levels for a typical schema
      if ('schema' in config && config.schema) {
        configDepth += 4; // Typical schema nesting
      }

      // If has schemas (for split): similar depth
      if ('schemas' in config && config.schemas) {
        configDepth += 4;
      }

      maxDepth = Math.max(maxDepth, configDepth);
    }
  }

  return maxDepth;
}

/**
 * Validation result
 */
export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
};

/**
 * Validation error
 */
export type ValidationError = {
  type: 'missing_provider' | 'invalid_schema' | 'invalid_config' | 'version_mismatch';
  stepId?: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Validation warning
 */
export type ValidationWarning = {
  type: 'deprecated' | 'performance' | 'best_practice';
  stepId?: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Provider instance used for validation (minimal interface)
 */
interface ValidationProviderInstance {
  name?: string;
  // Providers can have additional properties
  [key: string]: unknown;
}

/**
 * Validation options
 */
export type ValidationOptions = {
  checkProviders?: boolean;     // Check if providers exist in registry
  checkSchemas?: boolean;        // Validate JSON schemas
  checkVersion?: boolean;        // Check flow version compatibility
  providers?: Record<string, ValidationProviderInstance>; // Provider registry for validation
};

/**
 * Validate a serializable flow definition
 *
 * @param flowDef - Flow definition to validate
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateFlow(flowDef, {
 *   checkProviders: true,
 *   checkSchemas: true,
 *   providers: { ocr: suryaProvider, llm: geminiProvider }
 * });
 *
 * if (!result.valid) {
 *   console.error('Flow validation failed:', result.errors);
 * }
 * ```
 */
export function validateFlow(
  flowDef: SerializableFlow,
  options: ValidationOptions = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Default options
  const opts = {
    checkProviders: true,
    checkSchemas: true,
    checkVersion: true,
    ...options
  };

  // Validate version
  if (opts.checkVersion) {
    if (!flowDef.version) {
      errors.push({
        type: 'version_mismatch',
        message: 'Flow definition missing version field'
      });
    } else if (flowDef.version !== '1.0.0') {
      errors.push({
        type: 'version_mismatch',
        message: `Unsupported flow version: ${flowDef.version}. Expected: 1.0.0`,
        details: { version: flowDef.version }
      });
    }
  }

  // Validate steps
  if (!flowDef.steps || !Array.isArray(flowDef.steps)) {
    errors.push({
      type: 'invalid_config',
      message: 'Flow definition missing or invalid steps array'
    });
    return { valid: false, errors, warnings };
  }

  if (flowDef.steps.length === 0) {
    warnings.push({
      type: 'best_practice',
      message: 'Flow has no steps defined'
    });
  }

  // Check nesting depth to prevent Convex 16-level limit issues
  const nestingDepth = calculateFlowNestingDepth(flowDef);
  if (nestingDepth > 14) {
    errors.push({
      type: 'invalid_config',
      message: `Flow nesting depth (${nestingDepth} levels) exceeds recommended maximum (14 levels). This will cause issues with Convex and other databases with 16-level JSON nesting limits. Consider using flow references (flowRef) to reduce nesting depth.`,
      details: { nestingDepth, limit: 14 }
    });
  } else if (nestingDepth > 12) {
    warnings.push({
      type: 'performance',
      message: `Flow nesting depth (${nestingDepth} levels) is approaching the database limit (16 levels). Consider using flow references to reduce complexity.`,
      details: { nestingDepth, warningThreshold: 12 }
    });
  }

  // Validate each step
  for (const step of flowDef.steps) {
    const stepId = step.id || 'unknown';

    // Validate step type
    if (!step.type) {
      errors.push({
        type: 'invalid_config',
        stepId,
        message: 'Step missing type field'
      });
      continue;
    }

    // Validate conditional and forEach specific fields
    if (step.type === 'conditional') {
      const conditionalStep = step as SerializableConditionalStep;
      if (!conditionalStep.branches || typeof conditionalStep.branches !== 'object') {
        errors.push({
          type: 'invalid_config',
          stepId,
          message: 'Conditional step missing or invalid branches field'
        });
      } else {
        // Recursively validate each branch flow (or flow reference)
        for (const [category, branchFlowOrRef] of Object.entries(conditionalStep.branches)) {
          // Check if it's a flow reference
          if ('flowRef' in branchFlowOrRef) {
            // Validate flowRef format
            const flowRef = (branchFlowOrRef as FlowReference).flowRef;
            if (typeof flowRef !== 'string' || flowRef.trim() === '') {
              errors.push({
                type: 'invalid_config',
                stepId: `${stepId}.${category}`,
                message: `Branch "${category}": flowRef must be a non-empty string`
              });
            }
            // Note: We don't resolve and validate referenced flows here to avoid circular dependencies
            // The flow registry should be validated separately if needed
          } else {
            // Inline flow - validate recursively
            const branchResult = validateFlow(branchFlowOrRef as SerializableFlow, options);
            for (const error of branchResult.errors) {
              errors.push({
                ...error,
                stepId: `${stepId}.${category}`,
                message: `Branch "${category}": ${error.message}`
              });
            }
            for (const warning of branchResult.warnings) {
              warnings.push({
                ...warning,
                stepId: `${stepId}.${category}`,
                message: `Branch "${category}": ${warning.message}`
              });
            }
          }
        }
      }
    } else if (step.type === 'forEach') {
      const forEachStep = step as SerializableForEachStep;
      if (!forEachStep.itemFlow) {
        errors.push({
          type: 'invalid_config',
          stepId,
          message: 'ForEach step missing itemFlow field'
        });
      } else {
        const itemFlowOrRef = forEachStep.itemFlow;

        // Check if it's a flow reference
        if ('flowRef' in itemFlowOrRef) {
          // Validate flowRef format
          const flowRef = (itemFlowOrRef as FlowReference).flowRef;
          if (typeof flowRef !== 'string' || flowRef.trim() === '') {
            errors.push({
              type: 'invalid_config',
              stepId: `${stepId}.itemFlow`,
              message: `itemFlow: flowRef must be a non-empty string`
            });
          }
          // Note: We don't resolve and validate referenced flows here to avoid circular dependencies
        } else {
          // Inline flow - recursively validate item flow
          const itemResult = validateFlow(itemFlowOrRef as SerializableFlow, options);
          for (const error of itemResult.errors) {
            errors.push({
              ...error,
              stepId: `${stepId}.itemFlow`,
              message: `Item flow: ${error.message}`
            });
          }
          for (const warning of itemResult.warnings) {
            warnings.push({
              ...warning,
              stepId: `${stepId}.itemFlow`,
              message: `Item flow: ${warning.message}`
            });
          }
        }
      }
    }

    // Validate node type
    const validNodeTypes = ['parse', 'extract', 'split', 'categorize', 'trigger', 'output'];
    if (!step.nodeType || !validNodeTypes.includes(step.nodeType)) {
      errors.push({
        type: 'invalid_config',
        stepId,
        message: `Invalid node type: ${step.nodeType}. Must be one of: ${validNodeTypes.join(', ')}`,
        details: { nodeType: step.nodeType }
      });
      continue;
    }

    // Validate config exists
    if (!step.config) {
      errors.push({
        type: 'invalid_config',
        stepId,
        message: 'Step missing config field'
      });
      continue;
    }

    const config = step.config as NodeConfig;

    // Helper to check if config has providerRef (for configs that need it)
    const hasProviderRef = (cfg: NodeConfig): cfg is NodeConfig & { providerRef: string } => {
      return 'providerRef' in cfg && typeof cfg.providerRef === 'string';
    };

    // Validate provider reference (not applicable for trigger and output nodes)
    if (step.nodeType !== 'trigger' && step.nodeType !== 'output') {
      if (!hasProviderRef(config)) {
        errors.push({
          type: 'missing_provider',
          stepId,
          message: 'Step config missing providerRef'
        });
      } else if (opts.checkProviders && opts.providers) {
        if (!opts.providers[config.providerRef]) {
          errors.push({
            type: 'missing_provider',
            stepId,
            message: `Provider "${config.providerRef}" not found in registry`,
            details: {
              providerRef: config.providerRef,
              availableProviders: Object.keys(opts.providers)
            }
          });
        }
      }
    }

    // Validate node-specific config
    if (opts.checkSchemas) {
      switch (step.nodeType) {
        case 'extract': {
          const cfg = config as ExtractConfig;
          if (!cfg.schema) {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Extract node missing schema'
            });
          } else {
            // Validate JSON schema structure
            const schemaError = validateJSONSchemaStructure(cfg.schema);
            if (schemaError) {
              errors.push({
                type: 'invalid_schema',
                stepId,
                message: `Invalid JSON schema: ${schemaError}`,
                details: { schema: cfg.schema as Record<string, unknown> }
              });
            }
          }

          // Check reasoning config if present
          if (cfg.reasoning) {
            if (cfg.reasoning.effort && !['low', 'medium', 'high'].includes(cfg.reasoning.effort)) {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: `Invalid reasoning effort: ${cfg.reasoning.effort}. Must be: low, medium, or high`
              });
            }
          }
          break;
        }

        case 'split': {
          const cfg = config as SplitConfig;
          if (!cfg.schemas) {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Split node missing schemas'
            });
          } else if (typeof cfg.schemas !== 'object') {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Split node schemas must be an object'
            });
          } else {
            // Validate each schema structure
            for (const [schemaName, schema] of Object.entries(cfg.schemas)) {
              const schemaError = validateJSONSchemaStructure(schema);
              if (schemaError) {
                errors.push({
                  type: 'invalid_schema',
                  stepId,
                  message: `Invalid JSON schema for "${schemaName}": ${schemaError}`,
                  details: { schemaName, schema: schema as Record<string, unknown> }
                });
              }
            }

            if (Object.keys(cfg.schemas).length === 0) {
              warnings.push({
                type: 'best_practice',
                stepId,
                message: 'Split node has no schemas defined'
              });
            }
          }
          break;
        }

        case 'categorize': {
          const cfg = config as CategorizeConfig;
          if (!cfg.categories) {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Categorize node missing categories'
            });
          } else if (!Array.isArray(cfg.categories)) {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Categorize node categories must be an array'
            });
          } else if (cfg.categories.length === 0) {
            warnings.push({
              type: 'best_practice',
              stepId,
              message: 'Categorize node has no categories defined'
            });
          }
          break;
        }

        case 'trigger': {
          const cfg = config as TriggerConfig;

          // Validate flowRef is present
          if (!cfg.flowRef) {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Trigger node missing flowRef'
            });
          }

          // Validate providerOverrides if present
          if (cfg.providerOverrides) {
            if (typeof cfg.providerOverrides !== 'object') {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: 'Trigger node providerOverrides must be an object'
              });
            } else if (opts.checkProviders && opts.providers) {
              // Validate that override refs exist in provider registry
              for (const [childRef, parentRef] of Object.entries(cfg.providerOverrides)) {
                if (!opts.providers[parentRef]) {
                  errors.push({
                    type: 'missing_provider',
                    stepId,
                    message: `Provider override "${parentRef}" not found in registry`,
                    details: {
                      childRef,
                      parentRef,
                      availableProviders: Object.keys(opts.providers)
                    }
                  });
                }
              }
            }
          }

          // Validate inputMapping if present
          if (cfg.inputMapping) {
            if (!cfg.inputMapping.type) {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: 'Trigger node inputMapping missing type field'
              });
            } else {
              const validMappingTypes = ['passthrough', 'unwrap', 'artifact', 'merge', 'construct'];
              if (!validMappingTypes.includes(cfg.inputMapping.type)) {
                errors.push({
                  type: 'invalid_config',
                  stepId,
                  message: `Invalid inputMapping type: ${cfg.inputMapping.type}. Must be one of: ${validMappingTypes.join(', ')}`
                });
              }

              // Type-specific validation
              if (cfg.inputMapping.type === 'artifact' && !('path' in cfg.inputMapping)) {
                errors.push({
                  type: 'invalid_config',
                  stepId,
                  message: 'Trigger node inputMapping type "artifact" requires path field'
                });
              }
              if (cfg.inputMapping.type === 'merge' && !('artifactPath' in cfg.inputMapping)) {
                errors.push({
                  type: 'invalid_config',
                  stepId,
                  message: 'Trigger node inputMapping type "merge" requires artifactPath field'
                });
              }
              if (cfg.inputMapping.type === 'construct' && !('fields' in cfg.inputMapping)) {
                errors.push({
                  type: 'invalid_config',
                  stepId,
                  message: 'Trigger node inputMapping type "construct" requires fields object'
                });
              }
            }
          }

          // Validate timeout if present
          if (cfg.timeout !== undefined) {
            if (typeof cfg.timeout !== 'number' || cfg.timeout <= 0) {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: 'Trigger node timeout must be a positive number'
              });
            }
          }

          // Validate mergeMetrics if present
          if (cfg.mergeMetrics !== undefined && typeof cfg.mergeMetrics !== 'boolean') {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Trigger node mergeMetrics must be a boolean'
            });
          }

          break;
        }

        case 'output': {
          const cfg = config as OutputConfig;

          // Validate transform type if present
          if (cfg.transform) {
            const validTransforms = ['first', 'last', 'merge', 'pick'];
            if (!validTransforms.includes(cfg.transform)) {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: `Invalid output transform: ${cfg.transform}. Must be one of: ${validTransforms.join(', ')}`
              });
            }

            // Validate that 'pick' transform has fields
            if (cfg.transform === 'pick' && (!cfg.fields || cfg.fields.length === 0)) {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: 'Output transform "pick" requires fields array'
              });
            }
          }

          // Validate fields if present
          if (cfg.fields && !Array.isArray(cfg.fields)) {
            errors.push({
              type: 'invalid_config',
              stepId,
              message: 'Output fields must be an array'
            });
          }

          // Validate source if present
          if (cfg.source) {
            if (typeof cfg.source !== 'string' && !Array.isArray(cfg.source)) {
              errors.push({
                type: 'invalid_config',
                stepId,
                message: 'Output source must be a string or array of strings'
              });
            } else if (Array.isArray(cfg.source) && cfg.source.length === 0) {
              warnings.push({
                type: 'best_practice',
                stepId,
                message: 'Output source array is empty'
              });
            }
          }

          break;
        }
      }

      // Validate consensus config if present
      if ('consensus' in config && config.consensus) {
        const consensus = config.consensus;

        if (!consensus.runs || consensus.runs < 1) {
          errors.push({
            type: 'invalid_config',
            stepId,
            message: 'Consensus runs must be >= 1'
          });
        }

        if (consensus.strategy && !['majority', 'unanimous'].includes(consensus.strategy)) {
          errors.push({
            type: 'invalid_config',
            stepId,
            message: `Invalid consensus strategy: ${consensus.strategy}. Must be: majority or unanimous`
          });
        }

        if (consensus.onTie && !['random', 'fail', 'retry'].includes(consensus.onTie)) {
          errors.push({
            type: 'invalid_config',
            stepId,
            message: `Invalid consensus onTie: ${consensus.onTie}. Must be: random, fail, or retry`
          });
        }

        if (consensus.runs > 1) {
          warnings.push({
            type: 'performance',
            stepId,
            message: `Consensus with ${consensus.runs} runs will execute the step ${consensus.runs} times`
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate and throw if invalid
 *
 * @param flowDef - Flow definition to validate
 * @param options - Validation options
 * @throws ValidationError if flow is invalid
 */
export function validateFlowOrThrow(
  flowDef: SerializableFlow,
  options: ValidationOptions = {}
): void {
  const result = validateFlow(flowDef, options);

  if (!result.valid) {
    const errorMessages = result.errors.map(e =>
      e.stepId ? `[${e.stepId}] ${e.message}` : e.message
    ).join('\n');

    throw new Error(`Flow validation failed:\n${errorMessages}`);
  }

  // Log warnings if present
  if (result.warnings.length > 0 && isDebugValidation()) {
    console.warn('[Flow Validation] Warnings:');
    for (const warning of result.warnings) {
      const prefix = warning.stepId ? `[${warning.stepId}]` : '';
      console.warn(`  ${prefix} ${warning.message}`);
    }
  }
}
