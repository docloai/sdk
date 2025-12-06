/**
 * Browser-safe validation utilities for @docloai/core
 *
 * This module exports validation utilities that can be used in browser environments.
 * It excludes Node.js-specific utilities like file operations.
 *
 * **No bundler configuration required!** This module has zero Node.js dependencies
 * and works out-of-the-box in all browser environments.
 *
 * @example Browser usage
 * ```typescript
 * import { validateNodeConnection, NODE_COMPATIBILITY_MATRIX } from '@docloai/core/validation';
 *
 * const result = validateNodeConnection('parse', 'extract', false);
 * if (!result.valid) {
 *   console.error(result.reason);
 * }
 * ```
 *
 * @example React flow builder
 * ```typescript
 * import { getCompatibleTargets, canStartForEachItemFlow } from '@docloai/core/validation';
 *
 * function FlowBuilder() {
 *   const targets = getCompatibleTargets('parse');
 *   // Use targets to show valid connections in UI
 * }
 * ```
 *
 * @example Server usage (with file utilities)
 * ```typescript
 * // For Node.js environments, import from @docloai/core for full functionality
 * import { validateNodeConnection, fileToBase64 } from '@docloai/core';
 * ```
 */

// Re-export validation functions (from browser-safe module)
export {
  validateNodeConnection,
  getNodeTypeName,
  getNodeTypeInfo,
  getCompatibleTargets,
  getSuggestedConnections,
  getValidForEachStarters,
  canStartForEachItemFlow
} from './internal/validation-utils.js';

// Re-export validation constants (from browser-safe module)
export {
  NODE_COMPATIBILITY_MATRIX
} from './internal/validation-utils.js';

// Re-export validation classes (from browser-safe module)
export {
  FlowValidationError
} from './internal/validation-utils.js';

// Re-export validation types (from browser-safe module)
export type {
  NodeTypeName,
  NodeTypeInfo,
  CompatibilityRule,
  ValidationResult,
  NodeDef,
  NodeCtx
} from './internal/validation-utils.js';

// Note: fileToBase64, resolveDocument, and bufferToBase64 are NOT exported
// as they require Node.js fs module and are not browser-compatible.
// For file operations, use '@docloai/core' instead of '@docloai/core/validation'.
