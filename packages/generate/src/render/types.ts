/**
 * Types for document rendering
 */

import type { VLMProvider } from '@doclo/core';
import type { DocumentGenerationConfig } from '../document-config';

/**
 * Options for rendering a document
 */
export interface RenderOptions {
  /** Document config defining fields, sections, layout */
  config: DocumentGenerationConfig;

  /** Seed for reproducible generation (layout + data + degradation) */
  seed?: number;

  /** Degradation intensity 0-100 (0 = none, 100 = heavily degraded) */
  degradation?: number;

  /** LLM provider for HTML generation */
  llmProvider?: VLMProvider;

  /** Include bounding boxes in result (default: false) */
  includeBoundingBoxes?: boolean;

  /** Skip LLM, use pregenerated HTML/JSX template (for testing) */
  htmlTemplate?: string;

  /** Viewport dimensions (default: 850x1200 for A4 aspect) */
  viewport?: { width: number; height: number };

  /** Previous generations to avoid duplicate layouts */
  previousGenerations?: string[];

  /** Pre-launched Puppeteer browser instance (user manages lifecycle) */
  browser?: import('puppeteer').Browser;

  /** Custom Chromium executable path (e.g., from @sparticuz/chromium) */
  executablePath?: string;

  /** Custom Puppeteer launch options (overrides defaults) */
  launchOptions?: import('puppeteer').PuppeteerLaunchOptions;
}

/**
 * Result of rendering a document
 */
export interface RenderResult {
  /** Base64-encoded PNG image */
  image: string;

  /** Ground truth data (generated field values) */
  groundTruth: Record<string, unknown>;

  /** Generated JSX code (for debugging/caching) */
  jsx: string;

  /** Bounding boxes (only if includeBoundingBoxes: true) */
  boundingBoxes?: BoundingBox[];

  /** Applied canvas-level degradation effects */
  appliedEffects: string[];

  /** Applied element-level (CSS) degradation effects */
  appliedElementEffects: string[];

  /** LLM usage stats */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  };
}

/**
 * Bounding box for a field in the rendered document
 */
export interface BoundingBox {
  /** Field identifier from config */
  fieldId: string;

  /** Field label */
  label: string;

  /** Field value as string */
  value: string;

  /** X coordinate (pixels from left) */
  x: number;

  /** Y coordinate (pixels from top) */
  y: number;

  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;
}

/**
 * Internal options for the Puppeteer renderer
 */
export interface PuppeteerRenderOptions {
  /** Complete HTML to render */
  html: string;

  /** Viewport dimensions */
  viewport: { width: number; height: number };

  /** Degradation intensity 0-100 */
  degradation: number;

  /** Seed for degradation effects */
  degradationSeed: number;

  /** Whether to extract bounding boxes */
  extractBoundingBoxes: boolean;

  /** Pre-launched Puppeteer browser instance (user manages lifecycle) */
  browser?: import('puppeteer').Browser;

  /** Custom Chromium executable path (e.g., from @sparticuz/chromium) */
  executablePath?: string;

  /** Custom Puppeteer launch options (overrides defaults) */
  launchOptions?: import('puppeteer').PuppeteerLaunchOptions;
}

/**
 * Result from the Puppeteer renderer
 */
export interface PuppeteerRenderResult {
  /** Base64-encoded PNG image */
  image: string;

  /** Applied canvas effects */
  appliedEffects: string[];

  /** Applied element effects */
  appliedElementEffects: string[];

  /** Extracted bounding boxes */
  boundingBoxes?: BoundingBox[];
}
