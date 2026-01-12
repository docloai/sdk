/**
 * Element-Level CSS Effects
 *
 * CSS-based degradation effects for individual HTML elements.
 * These preserve DOM structure and text selectability.
 * Apply before canvas capture for combined file + element degradation.
 */

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface ElementEffectParam {
  name: string;
  type: "range" | "select" | "checkbox";
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: string[];
  unit?: string; // e.g., 'px', 'deg', '%'
}

export interface CSSProperties {
  [key: string]: string | number;
}

export interface ElementEffect {
  id: string;
  name: string;
  description: string;
  params: ElementEffectParam[];
  /**
   * Returns CSS properties to apply to the element.
   * For pseudo-element effects, returns { __pseudo: 'after' | 'before', ... }
   */
  getStyles: (params: Record<string, any>) => CSSProperties;
  /**
   * Optional: Returns CSS for pseudo-elements (::before, ::after)
   * These require injecting a <style> tag or using CSS-in-JS
   */
  getPseudoStyles?: (params: Record<string, any>) => {
    pseudo: "before" | "after";
    styles: CSSProperties;
  } | null;
}

export interface ElementEffectCategory {
  id: string;
  name: string;
  effects: ElementEffect[];
}

export interface ElementEffectConfig {
  effectId: string;
  probability: number; // 0-1, chance of applying
  params: Record<string, any>;
  targets?: string[]; // CSS selectors or element types
}

export interface ElementRandomizationConfig {
  seed?: number;
  effects: ElementEffectConfig[];
  elementTypes?: {
    [key: string]: ElementEffectConfig[];
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Converts a CSSProperties object to inline style string
 */
export function toStyleString(props: CSSProperties): string {
  return Object.entries(props)
    .filter(([key]) => !key.startsWith("__"))
    .map(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${cssKey}: ${value}`;
    })
    .join("; ");
}

/**
 * Applies element effect styles to a DOM element
 */
export function applyElementEffect(
  element: HTMLElement,
  effectId: string,
  params: Record<string, any> = {}
): void {
  const effect = getElementEffectById(effectId);
  if (!effect) {
    console.warn(`Element effect not found: ${effectId}`);
    return;
  }

  const mergedParams = { ...getElementEffectDefaults(effectId), ...params };
  const styles = effect.getStyles(mergedParams);

  Object.entries(styles).forEach(([key, value]) => {
    if (!key.startsWith("__")) {
      (element.style as any)[key] = value;
    }
  });

  // Handle pseudo-elements if needed
  if (effect.getPseudoStyles) {
    const pseudoConfig = effect.getPseudoStyles(mergedParams);
    if (pseudoConfig) {
      injectPseudoStyles(element, pseudoConfig.pseudo, pseudoConfig.styles);
    }
  }
}

/**
 * Injects pseudo-element styles via a <style> tag
 */
function injectPseudoStyles(
  element: HTMLElement,
  pseudo: "before" | "after",
  styles: CSSProperties
): void {
  // Generate unique class name
  const className = `element-effect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  element.classList.add(className);

  // Create style element
  const styleEl = document.createElement("style");
  styleEl.textContent = `.${className}::${pseudo} { ${toStyleString(styles)} }`;
  document.head.appendChild(styleEl);

  // Store reference for cleanup
  (element as any).__effectStyleEl = styleEl;
}

/**
 * Removes effect styles from an element
 */
export function removeElementEffect(element: HTMLElement): void {
  // Clear inline styles (this is aggressive - could be improved)
  element.removeAttribute("style");

  // Remove injected style element
  const styleEl = (element as any).__effectStyleEl;
  if (styleEl) {
    styleEl.remove();
    delete (element as any).__effectStyleEl;
  }
}

/**
 * Seeded random number generator
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Apply randomized effects to elements
 */
export function applyRandomizedEffects(
  container: HTMLElement,
  config: ElementRandomizationConfig
): void {
  const random = config.seed ? seededRandom(config.seed) : Math.random;

  // Apply global effects
  config.effects.forEach((effectConfig) => {
    const targets = effectConfig.targets || ["*"];
    targets.forEach((selector) => {
      const elements = container.querySelectorAll<HTMLElement>(selector);
      elements.forEach((el) => {
        if (random() < effectConfig.probability) {
          applyElementEffect(el, effectConfig.effectId, effectConfig.params);
        }
      });
    });
  });

  // Apply element-type specific effects
  if (config.elementTypes) {
    Object.entries(config.elementTypes).forEach(([elementType, effects]) => {
      const selector = getElementTypeSelector(elementType);
      const elements = container.querySelectorAll<HTMLElement>(selector);

      elements.forEach((el) => {
        effects.forEach((effectConfig) => {
          if (random() < effectConfig.probability) {
            applyElementEffect(el, effectConfig.effectId, effectConfig.params);
          }
        });
      });
    });
  }
}

// =============================================================================
// Document Element Classes (.d-* classes for targeting)
// =============================================================================

/**
 * Standard document element classes for targeting with effects.
 * Use these classes on HTML elements to enable smart effect application.
 *
 * Content Types:
 * - .d-signature    - Handwritten signatures
 * - .d-handwriting  - Any handwritten text (notes, annotations)
 * - .d-stamp        - Rubber stamps, official seals
 * - .d-logo         - Company logos, letterheads
 * - .d-barcode      - Barcodes, QR codes
 * - .d-photo        - Embedded photographs
 *
 * Text Elements:
 * - .d-header       - Document titles, section headers
 * - .d-label        - Field labels ("Invoice #:", "Date:", etc.)
 * - .d-value        - Field values (the actual data)
 * - .d-body         - Body text, paragraphs
 * - .d-footer       - Footer text, fine print
 * - .d-caption      - Image captions, table titles
 *
 * Financial/Data:
 * - .d-amount       - Currency amounts, prices
 * - .d-total        - Totals, subtotals, grand totals
 * - .d-date         - Dates
 * - .d-number       - Reference numbers, IDs, quantities
 * - .d-percentage   - Percentages, rates
 *
 * Contact Info:
 * - .d-address      - Postal addresses
 * - .d-phone        - Phone numbers
 * - .d-email        - Email addresses
 * - .d-name         - Person/company names
 *
 * Table Elements:
 * - .d-table        - Entire tables
 * - .d-table-header - Table header rows
 * - .d-table-row    - Table body rows
 * - .d-table-cell   - Individual cells
 *
 * Special:
 * - .d-redacted     - Content marked for redaction
 * - .d-highlight    - Highlighted content
 * - .d-annotation   - Margin notes, comments
 * - .d-checkbox     - Checkboxes, tick marks
 * - .d-important    - Critical information (totals, due dates)
 */
export const ELEMENT_CLASSES = {
  // Content Types
  signature: "d-signature",
  handwriting: "d-handwriting",
  stamp: "d-stamp",
  logo: "d-logo",
  barcode: "d-barcode",
  photo: "d-photo",

  // Text Elements
  header: "d-header",
  label: "d-label",
  value: "d-value",
  body: "d-body",
  footer: "d-footer",
  caption: "d-caption",

  // Financial/Data
  amount: "d-amount",
  total: "d-total",
  date: "d-date",
  number: "d-number",
  percentage: "d-percentage",

  // Contact Info
  address: "d-address",
  phone: "d-phone",
  email: "d-email",
  name: "d-name",

  // Table Elements
  table: "d-table",
  tableHeader: "d-table-header",
  tableRow: "d-table-row",
  tableCell: "d-table-cell",

  // Special
  redacted: "d-redacted",
  highlight: "d-highlight",
  annotation: "d-annotation",
  checkbox: "d-checkbox",
  important: "d-important",
} as const;

export type ElementClass = (typeof ELEMENT_CLASSES)[keyof typeof ELEMENT_CLASSES];

/**
 * Maps element type names to CSS selectors.
 * Supports both .d-* classes and legacy selectors.
 */
function getElementTypeSelector(elementType: string): string {
  const typeMap: Record<string, string> = {
    // Content Types
    signature: ".d-signature",
    handwriting: ".d-handwriting",
    stamp: ".d-stamp",
    logo: ".d-logo",
    barcode: ".d-barcode",
    photo: ".d-photo",

    // Text Elements
    header: ".d-header, h1, h2, h3, h4, h5, h6",
    label: ".d-label",
    value: ".d-value",
    body: ".d-body, p",
    footer: ".d-footer, footer",
    caption: ".d-caption, figcaption",

    // Financial/Data
    amount: ".d-amount",
    total: ".d-total, .d-important",
    date: ".d-date",
    number: ".d-number",
    percentage: ".d-percentage",

    // Contact Info
    address: ".d-address, address",
    phone: ".d-phone",
    email: ".d-email",
    name: ".d-name",

    // Table Elements
    table: ".d-table, table",
    "table-header": ".d-table-header, thead tr, th",
    "table-row": ".d-table-row, tbody tr",
    "table-cell": ".d-table-cell, td, th",

    // Special
    redacted: ".d-redacted",
    highlight: ".d-highlight",
    annotation: ".d-annotation",
    checkbox: ".d-checkbox",
    important: ".d-important",

    // Legacy mappings
    "body-text": ".d-body, p, span:not([class*='d-'])",
  };
  return typeMap[elementType] || `.d-${elementType}, .${elementType}`;
}

/**
 * Effect recommendations by element type.
 * Maps element classes to effects that make sense for them.
 */
export const ELEMENT_EFFECT_RECOMMENDATIONS: Record<string, string[]> = {
  signature: ["S-CSS-1", "S-CSS-2", "S-CSS-3", "E-CSS-5", "E-CSS-6"], // Faded signature, pressure, ink skip, bleed, smear
  handwriting: ["S-CSS-2", "S-CSS-3", "E-CSS-5", "E-CSS-1"], // Pressure, skip, bleed, faded
  stamp: ["E-CSS-1", "E-CSS-2", "C-CSS-6", "A-CSS-1"], // Faded, gradient, desaturated, rotation
  logo: ["E-CSS-1", "C-CSS-3", "B-CSS-1"], // Faded, low contrast, soft focus

  header: ["E-CSS-1", "E-CSS-7", "C-CSS-4"], // Faded, double strike, high contrast
  label: ["E-CSS-1", "E-CSS-2"], // Faded, gradient fade
  value: ["E-CSS-1", "E-CSS-2", "E-CSS-3", "B-CSS-1"], // Various fades, blur
  body: ["E-CSS-1", "E-CSS-2", "E-CSS-3", "D-CSS-2"], // Fades, photocopy

  amount: ["E-CSS-1", "E-CSS-5", "E-CSS-7"], // Faded, bleed, double strike
  total: ["E-CSS-8", "F-CSS-5", "E-CSS-1"], // Heavy strike, highlight, faded
  date: ["E-CSS-1", "E-CSS-6", "S-CSS-3"], // Faded, smear, skip

  "table-cell": ["E-CSS-1", "E-CSS-2", "E-CSS-3", "E-CSS-4", "F-CSS-1"], // Fades, stains
  "table-row": ["E-CSS-2", "E-CSS-3", "A-CSS-1"], // Gradient fades, slight rotation

  redacted: ["L-CSS-1"], // Redaction effect
  highlight: ["F-CSS-5"], // Highlight bleed
  annotation: ["S-CSS-2", "E-CSS-6", "A-CSS-1"], // Handwriting effects
};

// =============================================================================
// Category E-CSS: Text and Ink Effects
// =============================================================================

const fadedText: ElementEffect = {
  id: "E-CSS-1",
  name: "Faded Text",
  description: "Simulates ink running low or age-related fading",
  params: [
    { name: "opacity", type: "range", min: 0.2, max: 0.8, step: 0.05, default: 0.5 },
    { name: "contrast", type: "range", min: 0.5, max: 1, step: 0.05, default: 0.8 },
  ],
  getStyles: (params) => ({
    opacity: String(params.opacity),
    filter: `contrast(${params.contrast})`,
  }),
};

const gradientFadeHorizontal: ElementEffect = {
  id: "E-CSS-2",
  name: "Gradient Fade (Horizontal)",
  description: "Left-to-right or right-to-left ink fade, simulating printer running out of ink",
  params: [
    { name: "direction", type: "select", options: ["left-to-right", "right-to-left"], default: "left-to-right" },
    { name: "startOpacity", type: "range", min: 0.8, max: 1, step: 0.05, default: 1 },
    { name: "endOpacity", type: "range", min: 0.1, max: 0.5, step: 0.05, default: 0.3 },
  ],
  getStyles: (params) => {
    const dir = params.direction === "left-to-right" ? "to right" : "to left";
    const gradient = `linear-gradient(${dir}, rgba(0,0,0,${params.startOpacity}) 0%, rgba(0,0,0,${params.endOpacity}) 100%)`;
    return {
      maskImage: gradient,
      WebkitMaskImage: gradient,
    };
  },
};

const gradientFadeVertical: ElementEffect = {
  id: "E-CSS-3",
  name: "Gradient Fade (Vertical)",
  description: "Top-to-bottom fade, simulating uneven printing pressure",
  params: [
    { name: "direction", type: "select", options: ["top-to-bottom", "bottom-to-top"], default: "top-to-bottom" },
    { name: "startOpacity", type: "range", min: 0.8, max: 1, step: 0.05, default: 1 },
    { name: "endOpacity", type: "range", min: 0.1, max: 0.5, step: 0.05, default: 0.2 },
  ],
  getStyles: (params) => {
    const dir = params.direction === "top-to-bottom" ? "to bottom" : "to top";
    const gradient = `linear-gradient(${dir}, rgba(0,0,0,${params.startOpacity}) 0%, rgba(0,0,0,${params.endOpacity}) 100%)`;
    return {
      maskImage: gradient,
      WebkitMaskImage: gradient,
    };
  },
};

const cornerFade: ElementEffect = {
  id: "E-CSS-4",
  name: "Corner Fade",
  description: "Radial fade from corner, simulating water damage or sun bleaching",
  params: [
    { name: "corner", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "top-right" },
    { name: "fadeStrength", type: "range", min: 0.1, max: 0.5, step: 0.05, default: 0.2 },
    { name: "radius", type: "range", min: 30, max: 100, step: 5, default: 70, unit: "%" },
  ],
  getStyles: (params) => {
    const cornerMap: Record<string, string> = {
      "top-left": "top left",
      "top-right": "top right",
      "bottom-left": "bottom left",
      "bottom-right": "bottom right",
    };
    const position = cornerMap[params.corner];
    const gradient = `radial-gradient(ellipse at ${position}, rgba(0,0,0,${params.fadeStrength}) 0%, rgba(0,0,0,1) ${params.radius}%)`;
    return {
      maskImage: gradient,
      WebkitMaskImage: gradient,
    };
  },
};

const inkBleed: ElementEffect = {
  id: "E-CSS-5",
  name: "Ink Bleed",
  description: "Text appears to have bled into paper fibers",
  params: [
    { name: "spread", type: "range", min: 0.3, max: 1.5, step: 0.1, default: 0.5, unit: "px" },
    { name: "blur", type: "range", min: 0.1, max: 0.5, step: 0.05, default: 0.3, unit: "px" },
  ],
  getStyles: (params) => ({
    textShadow: `${params.spread}px 0 0 currentColor, -${params.spread}px 0 0 currentColor, 0 ${params.spread}px 0 currentColor, 0 -${params.spread}px 0 currentColor`,
    filter: `blur(${params.blur}px)`,
  }),
};

const inkSmear: ElementEffect = {
  id: "E-CSS-6",
  name: "Ink Smear",
  description: "Horizontal smearing as if touched while wet",
  params: [
    { name: "direction", type: "select", options: ["left", "right", "up", "down"], default: "right" },
    { name: "distance", type: "range", min: 1, max: 5, step: 0.5, default: 2, unit: "px" },
    { name: "opacity", type: "range", min: 0.2, max: 0.5, step: 0.05, default: 0.3 },
  ],
  getStyles: (params) => {
    const dirMap: Record<string, [number, number]> = {
      left: [-1, 0],
      right: [1, 0],
      up: [0, -1],
      down: [0, 1],
    };
    const [dx, dy] = dirMap[params.direction];
    const x = dx * params.distance;
    const y = dy * params.distance;
    return {
      textShadow: `${x}px ${y}px 1px rgba(0,0,0,${params.opacity})`,
    };
  },
};

const doubleStrike: ElementEffect = {
  id: "E-CSS-7",
  name: "Double Strike / Ghosting",
  description: "Misaligned duplicate text from printer malfunction",
  params: [
    { name: "offsetX", type: "range", min: 0.5, max: 3, step: 0.25, default: 1, unit: "px" },
    { name: "offsetY", type: "range", min: 0.5, max: 3, step: 0.25, default: 1, unit: "px" },
    { name: "opacity", type: "range", min: 0.2, max: 0.6, step: 0.05, default: 0.4 },
  ],
  getStyles: (params) => ({
    textShadow: `${params.offsetX}px ${params.offsetY}px 0 rgba(0,0,0,${params.opacity})`,
  }),
};

const typewriterHeavy: ElementEffect = {
  id: "E-CSS-8",
  name: "Typewriter Heavy Strike",
  description: "Heavy ink from typewriter key striking too hard",
  params: [
    { name: "intensity", type: "range", min: 0.5, max: 2, step: 0.1, default: 1, unit: "px" },
  ],
  getStyles: (params) => ({
    fontWeight: "bold",
    textShadow: `0 0 ${params.intensity}px currentColor`,
  }),
};

const categoryECSS: ElementEffectCategory = {
  id: "E-CSS",
  name: "Text and Ink Effects",
  effects: [fadedText, gradientFadeHorizontal, gradientFadeVertical, cornerFade, inkBleed, inkSmear, doubleStrike, typewriterHeavy],
};

// =============================================================================
// Category C-CSS: Tone and Exposure
// =============================================================================

const overexposed: ElementEffect = {
  id: "C-CSS-1",
  name: "Overexposed",
  description: "Washed out from too much light",
  params: [
    { name: "brightness", type: "range", min: 1.2, max: 1.8, step: 0.05, default: 1.4 },
    { name: "contrast", type: "range", min: 0.6, max: 0.9, step: 0.05, default: 0.8 },
  ],
  getStyles: (params) => ({
    filter: `brightness(${params.brightness}) contrast(${params.contrast})`,
  }),
};

const underexposed: ElementEffect = {
  id: "C-CSS-2",
  name: "Underexposed",
  description: "Too dark, lost in shadows",
  params: [
    { name: "brightness", type: "range", min: 0.4, max: 0.8, step: 0.05, default: 0.6 },
    { name: "contrast", type: "range", min: 1, max: 1.4, step: 0.05, default: 1.2 },
  ],
  getStyles: (params) => ({
    filter: `brightness(${params.brightness}) contrast(${params.contrast})`,
  }),
};

const lowContrast: ElementEffect = {
  id: "C-CSS-3",
  name: "Low Contrast",
  description: "Flat, washed out appearance",
  params: [
    { name: "contrast", type: "range", min: 0.4, max: 0.8, step: 0.05, default: 0.6 },
  ],
  getStyles: (params) => ({
    filter: `contrast(${params.contrast})`,
  }),
};

const highContrast: ElementEffect = {
  id: "C-CSS-4",
  name: "High Contrast",
  description: "Harsh blacks and whites, lost midtones",
  params: [
    { name: "contrast", type: "range", min: 1.3, max: 2, step: 0.1, default: 1.5 },
  ],
  getStyles: (params) => ({
    filter: `contrast(${params.contrast})`,
  }),
};

const colorCast: ElementEffect = {
  id: "C-CSS-5",
  name: "Color Cast",
  description: "Tinted appearance from aging or bad lighting",
  params: [
    { name: "type", type: "select", options: ["warm", "cool", "yellow", "blue", "green"], default: "warm" },
    { name: "intensity", type: "range", min: 0.1, max: 0.5, step: 0.05, default: 0.3 },
  ],
  getStyles: (params) => {
    const castMap: Record<string, string> = {
      warm: `sepia(${params.intensity}) hue-rotate(-10deg)`,
      cool: `sepia(${params.intensity * 0.7}) hue-rotate(180deg) saturate(0.8)`,
      yellow: `sepia(${params.intensity}) saturate(1.2)`,
      blue: `sepia(${params.intensity * 0.5}) hue-rotate(200deg)`,
      green: `sepia(${params.intensity * 0.5}) hue-rotate(90deg)`,
    };
    return { filter: castMap[params.type] };
  },
};

const desaturated: ElementEffect = {
  id: "C-CSS-6",
  name: "Desaturated / Grayscale",
  description: "Fax machine or old photocopy appearance",
  params: [
    { name: "grayscale", type: "range", min: 0.5, max: 1, step: 0.05, default: 0.7 },
    { name: "contrast", type: "range", min: 1, max: 1.3, step: 0.05, default: 1.1 },
  ],
  getStyles: (params) => ({
    filter: `grayscale(${params.grayscale}) contrast(${params.contrast})`,
  }),
};

const categoryCCSS: ElementEffectCategory = {
  id: "C-CSS",
  name: "Tone and Exposure",
  effects: [overexposed, underexposed, lowContrast, highContrast, colorCast, desaturated],
};

// =============================================================================
// Category B-CSS: Focus and Clarity
// =============================================================================

const softFocus: ElementEffect = {
  id: "B-CSS-1",
  name: "Soft Focus",
  description: "Slight blur as if camera was slightly out of focus",
  params: [
    { name: "blur", type: "range", min: 0.3, max: 1.5, step: 0.1, default: 0.5, unit: "px" },
  ],
  getStyles: (params) => ({
    filter: `blur(${params.blur}px)`,
  }),
};

const edgeBlur: ElementEffect = {
  id: "B-CSS-2",
  name: "Edge Blur",
  description: "Sharp center, blurry edges (depth of field approximation)",
  params: [
    { name: "centerSharpness", type: "range", min: 40, max: 70, step: 5, default: 50, unit: "%" },
    { name: "edgeBlur", type: "range", min: 0.5, max: 2, step: 0.1, default: 1, unit: "px" },
  ],
  getStyles: (params) => {
    const gradient = `radial-gradient(ellipse, black ${params.centerSharpness}%, transparent 100%)`;
    return {
      maskImage: gradient,
      WebkitMaskImage: gradient,
      filter: `blur(${params.edgeBlur * 0.3}px)`, // Slight overall blur
    };
  },
};

const motionBlurCSS: ElementEffect = {
  id: "B-CSS-3",
  name: "Motion Blur (CSS)",
  description: "Directional blur using layered shadows",
  params: [
    { name: "direction", type: "select", options: ["horizontal", "vertical", "diagonal"], default: "horizontal" },
    { name: "distance", type: "range", min: 1, max: 4, step: 0.5, default: 2, unit: "px" },
  ],
  getStyles: (params) => {
    const d = params.distance;
    let shadow: string;
    switch (params.direction) {
      case "horizontal":
        shadow = `-${d}px 0 0 rgba(0,0,0,0.2), -${d / 2}px 0 0 rgba(0,0,0,0.3), ${d / 2}px 0 0 rgba(0,0,0,0.3), ${d}px 0 0 rgba(0,0,0,0.2)`;
        break;
      case "vertical":
        shadow = `0 -${d}px 0 rgba(0,0,0,0.2), 0 -${d / 2}px 0 rgba(0,0,0,0.3), 0 ${d / 2}px 0 rgba(0,0,0,0.3), 0 ${d}px 0 rgba(0,0,0,0.2)`;
        break;
      case "diagonal":
        shadow = `-${d}px -${d}px 0 rgba(0,0,0,0.2), ${d}px ${d}px 0 rgba(0,0,0,0.2)`;
        break;
      default:
        shadow = "none";
    }
    return {
      textShadow: shadow,
      filter: "blur(0.2px)",
    };
  },
};

const categoryBCSS: ElementEffectCategory = {
  id: "B-CSS",
  name: "Focus and Clarity",
  effects: [softFocus, edgeBlur, motionBlurCSS],
};

// =============================================================================
// Category A-CSS: Alignment and Geometry
// =============================================================================

const slightRotation: ElementEffect = {
  id: "A-CSS-1",
  name: "Slight Rotation",
  description: "Element slightly rotated from misaligned scan",
  params: [
    { name: "angle", type: "range", min: -3, max: 3, step: 0.25, default: 0.5, unit: "deg" },
  ],
  getStyles: (params) => ({
    transform: `rotate(${params.angle}deg)`,
    transformOrigin: "center center",
  }),
};

const skewed: ElementEffect = {
  id: "A-CSS-2",
  name: "Skew",
  description: "Text appears slanted",
  params: [
    { name: "angleX", type: "range", min: -5, max: 5, step: 0.5, default: -2, unit: "deg" },
    { name: "angleY", type: "range", min: -3, max: 3, step: 0.5, default: 0, unit: "deg" },
  ],
  getStyles: (params) => ({
    transform: `skew(${params.angleX}deg, ${params.angleY}deg)`,
  }),
};

const scaleMismatch: ElementEffect = {
  id: "A-CSS-3",
  name: "Scale Mismatch",
  description: "Element appears slightly larger/smaller than siblings",
  params: [
    { name: "scale", type: "range", min: 0.95, max: 1.05, step: 0.005, default: 0.98 },
  ],
  getStyles: (params) => ({
    transform: `scale(${params.scale})`,
  }),
};

const categoryACSS: ElementEffectCategory = {
  id: "A-CSS",
  name: "Alignment and Geometry",
  effects: [slightRotation, skewed, scaleMismatch],
};

// =============================================================================
// Category F-CSS: Damage and Defects
// =============================================================================

const stainOverlay: ElementEffect = {
  id: "F-CSS-1",
  name: "Stain Overlay",
  description: "Coffee/water stain on specific element",
  params: [
    { name: "color", type: "select", options: ["coffee", "water", "tea", "wine"], default: "coffee" },
    { name: "positionX", type: "range", min: 0, max: 100, step: 5, default: 30, unit: "%" },
    { name: "positionY", type: "range", min: 0, max: 100, step: 5, default: 40, unit: "%" },
    { name: "size", type: "range", min: 30, max: 80, step: 5, default: 50, unit: "%" },
    { name: "opacity", type: "range", min: 0.2, max: 0.5, step: 0.05, default: 0.3 },
  ],
  getStyles: (params) => {
    const colorMap: Record<string, string> = {
      coffee: "139,90,43",
      water: "150,180,200",
      tea: "160,120,60",
      wine: "100,20,40",
    };
    const rgb = colorMap[params.color];
    return {
      position: "relative",
    };
  },
  getPseudoStyles: (params) => {
    const colorMap: Record<string, string> = {
      coffee: "139,90,43",
      water: "150,180,200",
      tea: "160,120,60",
      wine: "100,20,40",
    };
    const rgb = colorMap[params.color];
    return {
      pseudo: "after",
      styles: {
        content: "''",
        position: "absolute",
        inset: "0",
        background: `radial-gradient(ellipse at ${params.positionX}% ${params.positionY}%, rgba(${rgb},${params.opacity}) 0%, transparent ${params.size}%)`,
        pointerEvents: "none",
        borderRadius: "inherit",
      },
    };
  },
};

const creaseLine: ElementEffect = {
  id: "F-CSS-2",
  name: "Crease Line",
  description: "Fold line across element",
  params: [
    { name: "orientation", type: "select", options: ["horizontal", "vertical", "diagonal"], default: "horizontal" },
    { name: "position", type: "range", min: 20, max: 80, step: 5, default: 50, unit: "%" },
    { name: "intensity", type: "range", min: 0.1, max: 0.3, step: 0.02, default: 0.15 },
  ],
  getStyles: () => ({
    position: "relative",
  }),
  getPseudoStyles: (params) => {
    let gradient: string;
    let positioning: CSSProperties;

    if (params.orientation === "horizontal") {
      gradient = `linear-gradient(to bottom, transparent 0%, rgba(0,0,0,${params.intensity}) 40%, rgba(255,255,255,0.2) 50%, rgba(0,0,0,${params.intensity}) 60%, transparent 100%)`;
      positioning = {
        top: `${params.position}%`,
        left: "0",
        right: "0",
        height: "3px",
        transform: "translateY(-50%)",
      };
    } else if (params.orientation === "vertical") {
      gradient = `linear-gradient(to right, transparent 0%, rgba(0,0,0,${params.intensity}) 40%, rgba(255,255,255,0.2) 50%, rgba(0,0,0,${params.intensity}) 60%, transparent 100%)`;
      positioning = {
        left: `${params.position}%`,
        top: "0",
        bottom: "0",
        width: "3px",
        transform: "translateX(-50%)",
      };
    } else {
      gradient = `linear-gradient(to bottom right, transparent 0%, rgba(0,0,0,${params.intensity}) 40%, rgba(255,255,255,0.2) 50%, rgba(0,0,0,${params.intensity}) 60%, transparent 100%)`;
      positioning = {
        inset: "0",
        transform: "rotate(45deg)",
      };
    }

    return {
      pseudo: "after",
      styles: {
        content: "''",
        position: "absolute",
        background: gradient,
        pointerEvents: "none",
        ...positioning,
      },
    };
  },
};

const tornEdge: ElementEffect = {
  id: "F-CSS-3",
  name: "Torn Edge",
  description: "Ragged edge on one side",
  params: [
    { name: "edge", type: "select", options: ["top", "right", "bottom", "left"], default: "right" },
    { name: "roughness", type: "range", min: 1, max: 5, step: 0.5, default: 2, unit: "%" },
  ],
  getStyles: (params) => {
    // Generate irregular polygon points
    const r = params.roughness;
    const points: string[] = [];

    if (params.edge === "right") {
      points.push("0% 0%");
      for (let y = 0; y <= 100; y += 10) {
        const x = 100 - (Math.sin(y * 0.3) * r + Math.cos(y * 0.7) * r * 0.5);
        points.push(`${x}% ${y}%`);
      }
      points.push("0% 100%");
    } else if (params.edge === "left") {
      for (let y = 0; y <= 100; y += 10) {
        const x = Math.sin(y * 0.3) * r + Math.cos(y * 0.7) * r * 0.5;
        points.push(`${x}% ${y}%`);
      }
      points.push("100% 100%", "100% 0%");
    } else if (params.edge === "top") {
      for (let x = 0; x <= 100; x += 10) {
        const y = Math.sin(x * 0.3) * r + Math.cos(x * 0.7) * r * 0.5;
        points.push(`${x}% ${y}%`);
      }
      points.push("100% 100%", "0% 100%");
    } else {
      points.push("0% 0%", "100% 0%");
      for (let x = 100; x >= 0; x -= 10) {
        const y = 100 - (Math.sin(x * 0.3) * r + Math.cos(x * 0.7) * r * 0.5);
        points.push(`${x}% ${y}%`);
      }
    }

    return {
      clipPath: `polygon(${points.join(", ")})`,
    };
  },
};

const yellowed: ElementEffect = {
  id: "F-CSS-4",
  name: "Yellowed/Aged",
  description: "Paper aging effect",
  params: [
    { name: "intensity", type: "range", min: 0.1, max: 0.4, step: 0.05, default: 0.2 },
  ],
  getStyles: (params) => ({
    filter: `sepia(${params.intensity}) brightness(0.95)`,
    backgroundColor: `rgba(255, 248, 220, ${params.intensity})`,
  }),
};

const highlightBleed: ElementEffect = {
  id: "F-CSS-5",
  name: "Highlight Bleed",
  description: "Highlighter marker bleeding through",
  params: [
    { name: "color", type: "select", options: ["yellow", "pink", "green", "blue"], default: "yellow" },
    { name: "opacity", type: "range", min: 0.2, max: 0.5, step: 0.05, default: 0.3 },
    { name: "bleed", type: "range", min: 0, max: 3, step: 0.5, default: 1, unit: "px" },
  ],
  getStyles: (params) => {
    const colorMap: Record<string, string> = {
      yellow: "255, 255, 0",
      pink: "255, 105, 180",
      green: "0, 255, 127",
      blue: "0, 191, 255",
    };
    const rgb = colorMap[params.color];
    const styles: CSSProperties = {
      background: `linear-gradient(to bottom, transparent 0%, rgba(${rgb}, ${params.opacity}) 20%, rgba(${rgb}, ${params.opacity * 1.3}) 50%, rgba(${rgb}, ${params.opacity}) 80%, transparent 100%)`,
      padding: "0 2px",
      margin: "0 -2px",
    };
    if (params.bleed > 0) {
      styles.filter = `blur(${params.bleed}px)`;
    }
    return styles;
  },
};

const categoryFCSS: ElementEffectCategory = {
  id: "F-CSS",
  name: "Damage and Defects",
  effects: [stainOverlay, creaseLine, tornEdge, yellowed, highlightBleed],
};

// =============================================================================
// Category L-CSS: Occlusions
// =============================================================================

const redacted: ElementEffect = {
  id: "L-CSS-1",
  name: "Redaction",
  description: "Blacked out text with slight imperfection",
  params: [
    { name: "color", type: "select", options: ["#000000", "#1a1a1a", "#333333"], default: "#1a1a1a" },
    { name: "roughEdges", type: "checkbox", default: false },
  ],
  getStyles: (params) => {
    const base: CSSProperties = {
      backgroundColor: params.color,
      color: "transparent",
      userSelect: "none",
      filter: "contrast(0.95)",
      borderRadius: params.roughEdges ? "1px" : "0",
    };
    if (params.roughEdges) {
      base.boxShadow = "0 0 1px rgba(0,0,0,0.5)";
    }
    return base;
  },
};

const stickyNoteCover: ElementEffect = {
  id: "L-CSS-2",
  name: "Sticky Note Partial Cover",
  description: "Element partially obscured by sticky note",
  params: [
    { name: "color", type: "select", options: ["yellow", "pink", "blue", "green"], default: "yellow" },
    { name: "position", type: "select", options: ["top-right", "top-left", "bottom-right", "bottom-left"], default: "top-right" },
    { name: "coverage", type: "range", min: 20, max: 80, step: 5, default: 40, unit: "%" },
    { name: "rotation", type: "range", min: -15, max: 15, step: 1, default: 5, unit: "deg" },
  ],
  getStyles: () => ({
    position: "relative",
    overflow: "visible",
  }),
  getPseudoStyles: (params) => {
    const colorMap: Record<string, string> = {
      yellow: "#ffeb3b",
      pink: "#f8bbd9",
      blue: "#b3e5fc",
      green: "#c8e6c9",
    };
    const bgColor = colorMap[params.color];

    const positionMap: Record<string, CSSProperties> = {
      "top-right": { top: "-10px", right: "-5px" },
      "top-left": { top: "-10px", left: "-5px" },
      "bottom-right": { bottom: "-10px", right: "-5px" },
      "bottom-left": { bottom: "-10px", left: "-5px" },
    };

    return {
      pseudo: "after",
      styles: {
        content: "''",
        position: "absolute",
        width: `${params.coverage}px`,
        height: `${params.coverage}px`,
        background: bgColor,
        transform: `rotate(${params.rotation}deg)`,
        boxShadow: "2px 2px 5px rgba(0,0,0,0.2)",
        zIndex: "10",
        ...positionMap[params.position],
      },
    };
  },
};

const tapeOver: ElementEffect = {
  id: "L-CSS-3",
  name: "Tape Over",
  description: "Transparent tape covering element",
  params: [
    { name: "opacity", type: "range", min: 0.3, max: 0.6, step: 0.05, default: 0.4 },
    { name: "orientation", type: "select", options: ["horizontal", "vertical", "diagonal"], default: "horizontal" },
  ],
  getStyles: () => ({
    position: "relative",
  }),
  getPseudoStyles: (params) => {
    let transform = "";
    let dimensions: CSSProperties = {};

    switch (params.orientation) {
      case "horizontal":
        dimensions = { left: "-10px", right: "-10px", top: "50%", height: "20px", transform: "translateY(-50%)" };
        break;
      case "vertical":
        dimensions = { top: "-10px", bottom: "-10px", left: "50%", width: "20px", transform: "translateX(-50%)" };
        break;
      case "diagonal":
        dimensions = { inset: "-5px", transform: "rotate(45deg) scale(1.2)" };
        break;
    }

    return {
      pseudo: "after",
      styles: {
        content: "''",
        position: "absolute",
        background: `rgba(255, 255, 255, ${params.opacity})`,
        borderTop: "1px solid rgba(255,255,255,0.6)",
        borderBottom: "1px solid rgba(200,200,200,0.3)",
        pointerEvents: "none",
        ...dimensions,
      },
    };
  },
};

const categoryLCSS: ElementEffectCategory = {
  id: "L-CSS",
  name: "Occlusions",
  effects: [redacted, stickyNoteCover, tapeOver],
};

// =============================================================================
// Category S-CSS: Signature-Specific Effects
// =============================================================================

const fadedSignature: ElementEffect = {
  id: "S-CSS-1",
  name: "Faded Signature",
  description: "Old, faded ink signature",
  params: [
    { name: "opacity", type: "range", min: 0.3, max: 0.7, step: 0.05, default: 0.5 },
    { name: "grayscale", type: "range", min: 0.2, max: 0.5, step: 0.05, default: 0.3 },
    { name: "contrast", type: "range", min: 0.6, max: 0.9, step: 0.05, default: 0.7 },
  ],
  getStyles: (params) => ({
    opacity: String(params.opacity),
    filter: `grayscale(${params.grayscale}) contrast(${params.contrast})`,
  }),
};

const pressureVariation: ElementEffect = {
  id: "S-CSS-2",
  name: "Ballpoint Pressure Variation",
  description: "Varying ink density from pen pressure",
  params: [
    { name: "variation", type: "select", options: ["subtle", "moderate", "extreme"], default: "moderate" },
  ],
  getStyles: (params) => {
    const variationMap: Record<string, string> = {
      subtle: "linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0.9) 40%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.95) 100%)",
      moderate: "linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0.9) 100%)",
      extreme: "linear-gradient(90deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,1) 15%, rgba(0,0,0,0.5) 35%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.8) 100%)",
    };
    const gradient = variationMap[params.variation];
    return {
      maskImage: gradient,
      WebkitMaskImage: gradient,
    };
  },
};

const inkSkip: ElementEffect = {
  id: "S-CSS-3",
  name: "Ink Skip",
  description: "Ballpoint pen skipping",
  params: [
    { name: "skips", type: "range", min: 1, max: 4, step: 1, default: 2 },
    { name: "skipWidth", type: "range", min: 2, max: 5, step: 0.5, default: 3, unit: "%" },
  ],
  getStyles: (params) => {
    // Generate gradient with gaps
    const stops: string[] = [];
    const skipPositions = [];
    const segmentSize = 100 / (params.skips + 1);

    for (let i = 1; i <= params.skips; i++) {
      skipPositions.push(segmentSize * i);
    }

    let lastPos = 0;
    skipPositions.forEach((pos) => {
      stops.push(`black ${lastPos}%`);
      stops.push(`black ${pos - params.skipWidth / 2}%`);
      stops.push(`rgba(0,0,0,0.2) ${pos - params.skipWidth / 2}%`);
      stops.push(`rgba(0,0,0,0.2) ${pos + params.skipWidth / 2}%`);
      stops.push(`black ${pos + params.skipWidth / 2}%`);
      lastPos = pos + params.skipWidth / 2;
    });
    stops.push(`black 100%`);

    const gradient = `linear-gradient(90deg, ${stops.join(", ")})`;
    return {
      maskImage: gradient,
      WebkitMaskImage: gradient,
    };
  },
};

const categorySCSS: ElementEffectCategory = {
  id: "S-CSS",
  name: "Signature-Specific Effects",
  effects: [fadedSignature, pressureVariation, inkSkip],
};

// =============================================================================
// Category D-CSS: Noise and Texture
// =============================================================================

const noiseOverlay: ElementEffect = {
  id: "D-CSS-1",
  name: "SVG Noise Overlay",
  description: "Grain texture using SVG filter",
  params: [
    { name: "frequency", type: "range", min: 0.5, max: 1.5, step: 0.1, default: 0.9 },
    { name: "opacity", type: "range", min: 0.05, max: 0.2, step: 0.01, default: 0.1 },
  ],
  getStyles: () => ({
    position: "relative",
  }),
  getPseudoStyles: (params) => ({
    pseudo: "after",
    styles: {
      content: "''",
      position: "absolute",
      inset: "0",
      opacity: String(params.opacity),
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${params.frequency}' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      pointerEvents: "none",
      borderRadius: "inherit",
    },
  }),
};

const photocopyTexture: ElementEffect = {
  id: "D-CSS-2",
  name: "Photocopy Texture",
  description: "Grainy photocopy appearance",
  params: [
    { name: "grayscale", type: "range", min: 0.6, max: 1, step: 0.05, default: 0.8 },
    { name: "contrast", type: "range", min: 1.1, max: 1.5, step: 0.05, default: 1.3 },
    { name: "noiseOpacity", type: "range", min: 0.1, max: 0.2, step: 0.02, default: 0.15 },
  ],
  getStyles: (params) => ({
    filter: `grayscale(${params.grayscale}) contrast(${params.contrast})`,
    position: "relative",
  }),
  getPseudoStyles: (params) => ({
    pseudo: "after",
    styles: {
      content: "''",
      position: "absolute",
      inset: "0",
      opacity: String(params.noiseOpacity),
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
      pointerEvents: "none",
      mixBlendMode: "multiply",
    },
  }),
};

const categoryDCSS: ElementEffectCategory = {
  id: "D-CSS",
  name: "Noise and Texture",
  effects: [noiseOverlay, photocopyTexture],
};

// =============================================================================
// Exports
// =============================================================================

export const ELEMENT_EFFECT_CATEGORIES: ElementEffectCategory[] = [
  categoryECSS,
  categoryCCSS,
  categoryBCSS,
  categoryACSS,
  categoryFCSS,
  categoryLCSS,
  categorySCSS,
  categoryDCSS,
];

/**
 * Get all element effects as a flat array
 */
export function getAllElementEffects(): ElementEffect[] {
  return ELEMENT_EFFECT_CATEGORIES.flatMap((cat) => cat.effects);
}

/**
 * Get an element effect by ID
 */
export function getElementEffectById(effectId: string): ElementEffect | undefined {
  return getAllElementEffects().find((e) => e.id === effectId);
}

/**
 * Get default parameter values for an element effect
 */
export function getElementEffectDefaults(effectId: string): Record<string, any> {
  const effect = getElementEffectById(effectId);
  if (!effect) return {};
  return effect.params.reduce(
    (acc, param) => {
      acc[param.name] = param.default;
      return acc;
    },
    {} as Record<string, any>
  );
}

/**
 * Generate CSS styles for an effect with given parameters
 */
export function getElementEffectStyles(
  effectId: string,
  params: Record<string, any> = {}
): CSSProperties {
  const effect = getElementEffectById(effectId);
  if (!effect) return {};
  const mergedParams = { ...getElementEffectDefaults(effectId), ...params };
  return effect.getStyles(mergedParams);
}
