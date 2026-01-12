/**
 * Document Rendering Module
 *
 * Provides the main `renderDocument` function that:
 * 1. Generates synthetic document data
 * 2. Creates HTML using LLM or template
 * 3. Renders to image using Puppeteer
 * 4. Optionally applies degradation effects
 * 5. Returns image, ground truth, and optional bounding boxes
 *
 * @example
 * ```typescript
 * import { renderDocument, bunkerDeliveryNoteConfig } from '@doclo/generate';
 * import { createVLMProvider } from '@doclo/providers-llm';
 *
 * const provider = createVLMProvider({
 *   provider: 'google',
 *   model: 'gemini-2.5-flash-preview-09-2025',
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   via: 'openrouter'
 * });
 *
 * const result = await renderDocument({
 *   config: bunkerDeliveryNoteConfig,
 *   seed: 12345,
 *   degradation: 20,
 *   llmProvider: provider,
 * });
 *
 * console.log(result.image); // base64 PNG
 * console.log(result.groundTruth); // { supplier_name: "...", vessel_name: "...", ... }
 * ```
 */

import type { RenderOptions, RenderResult } from './types';
import { generateHTML } from './html-generator';
import { renderWithPuppeteer } from './puppeteer-renderer';
import { SyntheticGenerator } from '../index';
import {
  extractValuesWithLabelFallback,
  buildGroundTruthFromExtracted,
} from './jsx-value-extractor';

/**
 * Render a document to an image
 *
 * This is the main entry point for document rendering. It:
 * 1. Generates synthetic data based on the config
 * 2. Uses LLM to generate document layout as JSX
 * 3. Renders the document using Puppeteer
 * 4. Applies degradation effects if specified
 * 5. Returns the image, ground truth, and optional bounding boxes
 *
 * @param options - Render options
 * @returns Render result with image, ground truth, and metadata
 */
export async function renderDocument(options: RenderOptions): Promise<RenderResult> {
  const {
    config,
    seed = Date.now(),
    degradation = 0,
    llmProvider,
    includeBoundingBoxes = false,
    htmlTemplate,
    previousGenerations,
    viewport = { width: 850, height: 1200 },
  } = options;

  // Validate inputs
  if (!config || !config.documentType || !config.fields || !config.sections) {
    throw new Error('Invalid config: missing required fields (documentType, fields, sections)');
  }

  if (!llmProvider && !htmlTemplate) {
    throw new Error(
      'Either llmProvider or htmlTemplate is required.\n' +
        'Create a provider with: import { createVLMProvider } from "@doclo/providers-llm"'
    );
  }

  // Step 1: Generate HTML using LLM or template
  const { html, jsx, usage } = await generateHTML(config, {
    llmProvider,
    seed,
    degradation,
    previousGenerations,
    htmlTemplate,
  });

  // Step 2: Extract values from JSX and build ground truth
  // This ensures ground truth matches what's actually rendered in the image
  let groundTruth: Record<string, unknown>;

  if (htmlTemplate) {
    // For templates, use SyntheticGenerator as fallback
    // (templates may not have proper Field components with data-field-id)
    const generator = new SyntheticGenerator({ seed });
    groundTruth = generateGroundTruth(generator, config);
  } else {
    // Extract values from LLM-generated JSX
    const extracted = extractValuesWithLabelFallback(jsx, config);
    groundTruth = buildGroundTruthFromExtracted(extracted, config);
  }

  // Step 3: Render with Puppeteer
  const degradationSeed = seed + (Date.now() % 10000);
  const renderResult = await renderWithPuppeteer({
    html,
    viewport,
    degradation,
    degradationSeed,
    extractBoundingBoxes: includeBoundingBoxes,
    browser: options.browser,
    executablePath: options.executablePath,
    launchOptions: options.launchOptions,
  });

  return {
    image: renderResult.image,
    groundTruth,
    jsx,
    boundingBoxes: includeBoundingBoxes ? renderResult.boundingBoxes : undefined,
    appliedEffects: renderResult.appliedEffects,
    appliedElementEffects: renderResult.appliedElementEffects,
    usage,
  };
}

/**
 * Generate ground truth data based on document config
 *
 * @deprecated This function is kept for backward compatibility with htmlTemplate rendering.
 * For LLM-generated documents, values are now extracted directly from the JSX output
 * using extractValuesWithLabelFallback() to ensure ground truth matches the rendered image.
 */
function generateGroundTruth(
  generator: SyntheticGenerator,
  config: import('../document-config').DocumentGenerationConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [fieldId, field] of Object.entries(config.fields)) {
    // Generate value based on field type
    const value = generateFieldValue(generator, field, fieldId);
    if (value !== undefined) {
      result[fieldId] = value;
    }
  }

  return result;
}

/**
 * Generate a field value based on its type and constraints
 */
function generateFieldValue(
  generator: SyntheticGenerator,
  field: import('../document-config').FieldDefinition,
  fieldId: string
): unknown {
  const constraints = field.constraints as Record<string, unknown> | undefined;

  switch (field.type) {
    case 'text': {
      // Use examples if available
      if (constraints?.examples && Array.isArray(constraints.examples) && constraints.examples.length > 0) {
        // Pick a random example as a pattern
        return constraints.examples[Math.floor(generator['random']() * constraints.examples.length)];
      }
      // Generate based on field ID patterns
      if (fieldId.includes('company') || fieldId.includes('supplier')) return generator.companyName();
      if (fieldId.includes('vessel')) return `M/V ${generator.companyName().split(' ')[0]}`;
      if (fieldId.includes('person') || fieldId.includes('name')) return generator.personName();
      if (fieldId.includes('city') || fieldId.includes('port')) return generator.city();
      if (fieldId.includes('country')) return generator.country();
      if (fieldId.includes('reference') || fieldId.includes('number')) return generator.referenceNumber('REF');
      return `Sample ${field.label}`;
    }

    case 'number': {
      const min = (constraints?.min as number) ?? 0;
      const max = (constraints?.max as number) ?? 1000;
      const decimals = (constraints?.decimals as number) ?? 0;
      const value = min + generator['random']() * (max - min);
      return Number(value.toFixed(decimals));
    }

    case 'currency': {
      const min = (constraints?.min as number) ?? 0;
      const max = (constraints?.max as number) ?? 10000;
      const decimals = (constraints?.decimals as number) ?? 2;
      const value = min + generator['random']() * (max - min);
      return Number(value.toFixed(decimals));
    }

    case 'date': {
      return generator.date(2020, 2026);
    }

    case 'time': {
      const hours = Math.floor(generator['random']() * 24);
      const minutes = Math.floor(generator['random']() * 60);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    case 'datetime': {
      const date = generator.date(2020, 2026);
      const hours = Math.floor(generator['random']() * 24);
      const minutes = Math.floor(generator['random']() * 60);
      return `${date} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    case 'enum': {
      const options = (constraints?.options as string[]) ?? [];
      if (options.length > 0) {
        return options[Math.floor(generator['random']() * options.length)];
      }
      return null;
    }

    case 'boolean': {
      return generator['random']() > 0.5;
    }

    case 'phone': {
      return generator.phone();
    }

    case 'email': {
      return generator.email();
    }

    case 'address': {
      return generator.address();
    }

    case 'signature': {
      return generator.personName();
    }

    default:
      return null;
  }
}

// Export types
export type { RenderOptions, RenderResult, BoundingBox, PuppeteerRenderOptions, PuppeteerRenderResult } from './types';

// Export utilities
export { generateHTML, validateJSX } from './html-generator';
export { renderWithPuppeteer } from './puppeteer-renderer';
export { buildSystemPrompt } from './prompts/system-prompt';
export { buildUserPrompt } from './prompts/user-prompt';
export { generateEffectsScript, generateElementEffectsScript, getEffectsCount, getElementEffectsCount } from './degradation';
export { generateInlineComponents, generateComponentStyles } from './components';
export {
  extractValuesFromJSX,
  extractValuesWithLabelFallback,
  buildGroundTruthFromExtracted,
  coerceValue,
  type ExtractedField,
} from './jsx-value-extractor';
