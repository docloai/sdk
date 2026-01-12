/**
 * Document Generation Configuration Schema
 *
 * Defines the structure for configuring synthetic document generation.
 * This config tells an LLM what fields exist, how often they appear,
 * and how to generate realistic values for any document type.
 */

// =============================================================================
// FIELD TYPES
// =============================================================================

/**
 * Supported field data types for generation
 */
export type FieldType =
  | 'text' // Free-form text
  | 'number' // Numeric values
  | 'date' // Date values
  | 'time' // Time values (HH:MM format)
  | 'datetime' // Combined date and time
  | 'enum' // Selection from predefined options
  | 'currency' // Monetary values
  | 'phone' // Phone numbers
  | 'email' // Email addresses
  | 'address' // Physical addresses
  | 'signature' // Signature placeholder
  | 'barcode' // Barcode/QR code
  | 'image' // Image placeholder (logo, photo)
  | 'boolean'; // Yes/No, True/False

/**
 * Weighted option for enum fields where some values are more common
 */
export interface WeightedOption {
  value: string;
  /** Weight relative to other options (higher = more frequent) */
  weight: number;
}

/**
 * Base constraint properties shared across types
 */
export interface BaseConstraints {
  /**
   * Percentage chance (0-100) that this field should be rendered in a handwriting font.
   * Use for fields that might be filled in by hand on printed forms.
   */
  handwritten?: number;
}

/**
 * Constraints for text field generation
 */
export interface TextConstraints extends BaseConstraints {
  minLength?: number;
  maxLength?: number;
  /** Regex-like pattern hint, e.g. "XXX-NNNNNN" where X=letter, N=number */
  pattern?: string;
  /** Example values for LLM reference */
  examples?: string[];
  /** If true, should be UPPERCASE */
  uppercase?: boolean;
  /** If true, use monospace font styling */
  monospace?: boolean;
}

/**
 * Constraints for number field generation
 */
export interface NumberConstraints extends BaseConstraints {
  min?: number;
  max?: number;
  /** Number of decimal places */
  decimals?: number;
  /** Unit label, e.g. "MT", "USD", "liters", "%" */
  unit?: string;
  /** If true, format with thousand separators */
  formatted?: boolean;
}

/**
 * Constraints for date/time field generation
 */
export interface DateConstraints extends BaseConstraints {
  /** Date format string, e.g. "MM/DD/YYYY", "DD-MMM-YYYY" */
  format?: string;
  /** Relative range from generation date, e.g. "-30d to +7d", "-1y to today" */
  relativeRange?: string;
}

/**
 * Constraints for enum field generation
 */
export interface EnumConstraints {
  /** Simple list of options (equal probability) */
  options?: string[];
  /** Weighted options (different probabilities) */
  weightedOptions?: WeightedOption[];
}

/**
 * Constraints for currency field generation
 */
export interface CurrencyConstraints {
  /** Currency codes, e.g. ["USD", "EUR", "SGD"] */
  currencies?: string[];
  min?: number;
  max?: number;
  decimals?: number;
}

/**
 * Constraints for address field generation
 */
export interface AddressConstraints {
  /** Include street address */
  includeStreet?: boolean;
  /** Include city */
  includeCity?: boolean;
  /** Include state/province */
  includeState?: boolean;
  /** Include postal/zip code */
  includePostal?: boolean;
  /** Include country */
  includeCountry?: boolean;
  /** Specific countries to use */
  countries?: string[];
}

/**
 * Union of all constraint types
 */
export type FieldConstraints =
  | TextConstraints
  | NumberConstraints
  | DateConstraints
  | EnumConstraints
  | CurrencyConstraints
  | AddressConstraints;

// =============================================================================
// FIELD DEPENDENCIES
// =============================================================================

/**
 * Condition types for field dependencies
 */
export type DependencyCondition =
  | 'present' // Dependent field only appears if referenced field exists
  | 'absent' // Dependent field only appears if referenced field is missing
  | 'equals' // Dependent field only appears if referenced field equals value
  | 'notEquals' // Dependent field only appears if referenced field doesn't equal value
  | 'greaterThan' // For numeric comparisons
  | 'lessThan'; // For numeric comparisons

/**
 * Defines when a field should appear based on another field
 */
export interface FieldDependency {
  /** ID of the field this depends on */
  field: string;
  /** Type of condition to check */
  condition: DependencyCondition;
  /** Value to compare against (for equals/notEquals/greaterThan/lessThan) */
  value?: string | number | boolean;
}

/**
 * Defines how a field is computed from other fields
 */
export interface ComputedField {
  /** IDs of fields used in computation */
  fields: string[];
  /** Formula description, e.g. "quantity * unitPrice", "sum of line items" */
  formula?: string;
}

// =============================================================================
// FIELD DEFINITION
// =============================================================================

/**
 * Complete definition of a document field
 */
export interface FieldDefinition {
  /** Human-readable label for the field */
  label: string;

  /** Description of what this field represents (helps LLM understand context) */
  description: string;

  /** Data type for generation */
  type: FieldType;

  /**
   * Percentage of documents that include this field (0-100)
   * - 100 = always present
   * - 50 = present in half of generated documents
   * - 0 = never present (disabled)
   */
  inclusionRate: number;

  /** Type-specific generation constraints */
  constraints?: FieldConstraints;

  /** Conditional inclusion based on other fields */
  dependsOn?: FieldDependency;

  /** If this field is computed from other fields */
  computedFrom?: ComputedField;

  /** Display hints for rendering */
  display?: {
    /** Preferred width (e.g. "50%", "200px", "auto") */
    width?: string;
    /** Text alignment */
    align?: 'left' | 'center' | 'right';
    /** Visual emphasis */
    emphasis?: 'normal' | 'bold' | 'subtle';
  };
}

// =============================================================================
// SECTION DEFINITION
// =============================================================================

/**
 * Preferred layout pattern for a section
 */
export type SectionLayout =
  | 'header' // Document header patterns
  | 'footer' // Document footer patterns
  | 'table' // Tabular data
  | 'columns' // Multi-column layout
  | 'fields' // Label-value field pairs
  | 'list' // Bulleted/numbered list
  | 'signature-block' // Signature area
  | 'form' // Form elements (checkboxes, inputs)
  | 'freeform'; // No specific layout preference

/**
 * Logical grouping of related fields
 */
export interface SectionDefinition {
  /** Unique identifier for the section */
  id: string;

  /** Human-readable section name */
  name: string;

  /** Description of what this section contains */
  description: string;

  /** Field IDs that belong to this section */
  fields: string[];

  /**
   * Percentage of documents that include this entire section (0-100)
   * Individual field inclusionRates are applied within included sections
   */
  inclusionRate: number;

  /** Suggested layout pattern for this section */
  preferredLayout?: SectionLayout;

  /** If true, render a visual border around this section */
  bordered?: boolean;

  /** Section title to display (if different from name) */
  displayTitle?: string;

  /** If true, hide the section title */
  hideTitle?: boolean;
}

// =============================================================================
// LAYOUT HINTS
// =============================================================================

/**
 * Visual element configuration
 */
export interface VisualElementConfig {
  /** Types of elements to potentially include */
  types: string[];
  /** Percentage of documents that include this element (0-100) */
  rate: number;
  /** Preferred position if applicable */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'random';
}

/**
 * Document-level layout preferences and constraints
 */
export interface LayoutHints {
  /** Specific pattern component names to prefer */
  preferredPatterns?: string[];

  /** Document structure requirements */
  hasHeader?: boolean;
  hasFooter?: boolean;
  hasSidebar?: boolean;

  /** Page count constraints */
  pageCount?: {
    min: number;
    max: number;
  };

  /** Paper/page orientation */
  orientation?: 'portrait' | 'landscape';

  /** Page size */
  pageSize?: 'letter' | 'a4' | 'legal' | 'custom';

  /** Margin size preference */
  margins?: 'tight' | 'normal' | 'wide';

  /** Visual elements to potentially include */
  includeStamps?: VisualElementConfig;
  includeBarcodes?: VisualElementConfig;
  includeWatermarks?: VisualElementConfig;
  includeLogo?: VisualElementConfig;

  /** Color scheme preference */
  colorScheme?: 'monochrome' | 'minimal-color' | 'full-color';

  /** Typography density */
  density?: 'compact' | 'normal' | 'spacious';
}

// =============================================================================
// MAIN CONFIG
// =============================================================================

/**
 * Complete document generation configuration
 *
 * @example
 * ```typescript
 * const bdnConfig: DocumentGenerationConfig = {
 *   documentType: 'bunker_delivery_note',
 *   description: 'Marine fuel delivery receipt',
 *   fields: {
 *     vessel_name: {
 *       label: 'Vessel Name',
 *       description: 'Name of the receiving vessel',
 *       type: 'text',
 *       inclusionRate: 100,
 *       constraints: {
 *         examples: ['MV Palena', 'Ever Given']
 *       }
 *     },
 *     quantity: {
 *       label: 'Quantity Delivered',
 *       description: 'Amount of fuel delivered',
 *       type: 'number',
 *       inclusionRate: 100,
 *       constraints: {
 *         min: 50,
 *         max: 5000,
 *         decimals: 3,
 *         unit: 'MT'
 *       }
 *     }
 *   },
 *   sections: [
 *     {
 *       id: 'vessel_info',
 *       name: 'Vessel Information',
 *       description: 'Details of the receiving vessel',
 *       fields: ['vessel_name'],
 *       inclusionRate: 100,
 *       preferredLayout: 'columns'
 *     }
 *   ]
 * };
 * ```
 */
export interface DocumentGenerationConfig {
  /**
   * Unique identifier for this document type
   * Use snake_case, e.g. 'bunker_delivery_note', 'commercial_invoice'
   */
  documentType: string;

  /**
   * Human-readable description of what this document is
   * Helps LLM understand the overall context
   */
  description: string;

  /**
   * Optional category for grouping document types
   * e.g. 'maritime', 'financial', 'legal', 'medical'
   */
  category?: string;

  /**
   * Field definitions keyed by unique field ID
   */
  fields: Record<string, FieldDefinition>;

  /**
   * Logical sections grouping related fields
   * Sections are rendered in array order
   */
  sections: SectionDefinition[];

  /**
   * Optional layout preferences and visual hints
   */
  layoutHints?: LayoutHints;

  /**
   * Custom instructions appended to the generation prompt.
   * Use for document-specific guidelines not covered by other config options.
   * @example "Always include a company watermark in the header"
   */
  promptCustomizations?: string;

  /**
   * Metadata about this config
   */
  meta?: {
    /** Version of this config */
    version?: string;
    /** Author/maintainer */
    author?: string;
    /** Last updated date */
    updated?: string;
    /** Additional notes */
    notes?: string;
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Extract field IDs from a config
 */
export type FieldId<T extends DocumentGenerationConfig> = keyof T['fields'];

/**
 * Extract section IDs from a config
 */
export type SectionId<T extends DocumentGenerationConfig> = T['sections'][number]['id'];

/**
 * Generated field value based on field type
 */
export type GeneratedFieldValue<T extends FieldType> = T extends 'number' | 'currency'
  ? number
  : T extends 'boolean'
    ? boolean
    : T extends 'date' | 'time' | 'datetime'
      ? Date | string
      : string;

/**
 * Result of generating a document from a config
 */
export interface GeneratedDocument<T extends DocumentGenerationConfig = DocumentGenerationConfig> {
  /** The config used to generate this document */
  configType: T['documentType'];

  /** Generated field values */
  values: Partial<Record<keyof T['fields'], unknown>>;

  /** Which sections were included */
  includedSections: string[];

  /** Random seed used for generation (for reproducibility) */
  seed: number;

  /** Timestamp of generation */
  generatedAt: Date;
}
