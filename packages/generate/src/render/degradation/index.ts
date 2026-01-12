/**
 * Degradation module - orchestrates image degradation effects
 *
 * This module provides both canvas-level effects (blur, rotation, noise, etc.)
 * and element-level CSS effects (faded ink, pressure variation, etc.)
 */

import { CATEGORIES } from './effects';
import { ELEMENT_EFFECT_CATEGORIES, type ElementEffect } from './element-effects';

/**
 * Generate a browser-executable script containing all canvas effects
 * This script injects the __applyDegradation function into the page
 */
export function generateEffectsScript(): string {
  // Serialize all effects from CATEGORIES
  const effectsArray: { id: string; params: unknown[]; applyFn: string }[] = [];

  CATEGORIES.forEach((category) => {
    category.effects.forEach((effect) => {
      // Convert the apply function to a string
      const applyFn = effect.apply.toString();
      effectsArray.push({
        id: effect.id,
        params: effect.params,
        applyFn,
      });
    });
  });

  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
// ============================================================================
// DEGRADATION EFFECTS - Generated from effects.ts (${effectsArray.length} effects)
// ============================================================================

// Seeded random
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Intensity range calculation - uses sqrt curve for more punch at low intensities
function getIntensityRange(intensity) {
  // sqrt curve: 20% intensity -> ~45% of max effect, 50% -> ~71%, 100% -> 100%
  const scaleFactor = Math.sqrt(intensity / 100);
  return {
    minOffset: 0.15 + scaleFactor * 0.35,  // 20%: 0.31, 50%: 0.40, 100%: 0.50
    maxOffset: 0.25 + scaleFactor * 0.55,  // 20%: 0.50, 50%: 0.64, 100%: 0.80
  };
}

// Effect count based on intensity - minimum 3 effects even at low intensity
function getIntensityCount(intensity, baseMin, baseMax, seed) {
  // sqrt curve for effect count too
  const scaleFactor = Math.sqrt(intensity / 100);
  const range = baseMax - baseMin;
  // At 20%: scaleFactor=0.45, min=3, max=5
  // At 50%: scaleFactor=0.71, min=3, max=6
  // At 100%: scaleFactor=1.0, min=3, max=7
  const scaledMin = Math.max(3, Math.floor(baseMin * scaleFactor + 2));
  const scaledMax = Math.max(scaledMin + 2, Math.floor(baseMin + range * scaleFactor + 1));
  const random = Math.abs(Math.sin(seed * 9999)) % 1;
  return scaledMin + Math.floor(random * (scaledMax - scaledMin + 1));
}

// All effect definitions
const EFFECTS = {
${effectsArray
  .map(
    (e) => `  "${e.id}": {
    params: ${JSON.stringify(e.params)},
    apply: ${e.applyFn}
  }`
  )
  .join(',\n')}
};

// Generate random params for an effect
function generateEffectParams(effectId, intensity, seed, index) {
  const params = {};
  const effect = EFFECTS[effectId];
  if (!effect) return params;

  const effectParams = effect.params || [];
  const { minOffset, maxOffset } = getIntensityRange(intensity);

  effectParams.forEach((p, paramIndex) => {
    const paramSeed = seed + index * 100 + paramIndex;
    const random = seededRandom(paramSeed);

    if (p.type === 'range' && p.min !== undefined && p.max !== undefined) {
      const range = p.max - p.min;
      const isBidirectional = p.min < 0 && p.max > 0 && (p.default === 0 || p.default === undefined);

      if (isBidirectional) {
        const maxAbsolute = Math.max(Math.abs(p.min), Math.abs(p.max));
        const scaledMax = maxAbsolute * (intensity / 100);
        const randomSign = seededRandom(paramSeed + 1) < 0.5 ? -1 : 1;
        const randomMagnitude = minOffset + random * (maxOffset - minOffset);
        params[p.name] = randomSign * scaledMax * randomMagnitude;
      } else {
        const scaledMinOffset = range * minOffset;
        const scaledMaxOffset = range * maxOffset;
        params[p.name] = p.min + scaledMinOffset + random * (scaledMaxOffset - scaledMinOffset);
      }
    } else if (p.type === 'checkbox') {
      params[p.name] = random < intensity / 100;
    } else if (p.type === 'select' && p.options) {
      const nonNoneOptions = p.options.filter(opt => opt !== 'none');
      if (nonNoneOptions.length > 0) {
        params[p.name] = nonNoneOptions[Math.floor(random * nonNoneOptions.length)];
      } else {
        params[p.name] = p.options[Math.floor(random * p.options.length)];
      }
    } else {
      params[p.name] = p.default;
    }
  });

  return params;
}

// Main degradation function
window.__applyDegradation = async function(intensity, seed) {
  if (intensity <= 0) return [];

  const docElement = document.querySelector('.d-document');
  if (!docElement) {
    return [];
  }

  try {
    // Capture to canvas
    const canvas = await html2canvas(docElement, { scale: 1, useCORS: true, logging: false });
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const w = canvas.width;
    const h = canvas.height;

    // Get all effect IDs
    const allEffectIds = Object.keys(EFFECTS);

    // Shuffle with seed
    const shuffled = [...allEffectIds].sort((a, b) => {
      return seededRandom(seed + a.charCodeAt(0)) - seededRandom(seed + b.charCodeAt(0));
    });

    // Get number of effects (2-7 base range)
    const numEffects = getIntensityCount(intensity, 2, 7, seed);
    const selectedEffects = shuffled.slice(0, Math.min(numEffects, shuffled.length));

    // Apply each effect
    for (let i = 0; i < selectedEffects.length; i++) {
      const effectId = selectedEffects[i];
      const effect = EFFECTS[effectId];
      if (!effect || !effect.apply) continue;

      const params = generateEffectParams(effectId, intensity, seed, i);

      try {
        effect.apply(ctx, canvas, params);
      } catch (e) {
        // Effect application failed - continue with others
      }
    }

    // Replace document with degraded canvas
    docElement.innerHTML = '';
    canvas.style.display = 'block';
    docElement.appendChild(canvas);

    return selectedEffects;
  } catch (e) {
    return [];
  }
};
</script>`;
}

/**
 * Get the count of available canvas effects
 */
export function getEffectsCount(): number {
  let count = 0;
  CATEGORIES.forEach((category) => {
    count += category.effects.length;
  });
  return count;
}

/**
 * Serialize an effect's getStyles function to a string
 */
function serializeGetStyles(effect: ElementEffect): string {
  return effect.getStyles.toString();
}

/**
 * Element class zones for the generated documents.
 * Maps semantic zones to the CSS classes used in components.
 */
const DOCUMENT_ZONES = {
  signatures: ['.d-signature-text', '.d-signature-block', '.d-signature'],
  tables: ['.d-table', '.d-table-header', '.d-table-row', '.d-table-cell', 'th', 'td'],
  headers: ['.d-title', '.d-section-title', '.d-subtitle'],
  text: ['.d-text', '.d-body', '.d-field', '.d-label', '.d-value'],
  amounts: ['.d-amount', '.d-total-row', '.d-grand-total'],
  stamps: ['.d-stamp-paid', '.d-stamp-approved', '.d-stamp-received'],
  checkboxes: ['.d-checkbox'],
};

/**
 * Zone-appropriate effects mapping
 */
const ZONE_EFFECTS: Record<string, string[]> = {
  signatures: ['S-CSS-1', 'S-CSS-2', 'S-CSS-3', 'E-CSS-5', 'E-CSS-6'],
  tables: ['E-CSS-1', 'E-CSS-2', 'C-CSS-3'],
  headers: ['E-CSS-1', 'E-CSS-7', 'C-CSS-4'],
  text: ['E-CSS-1', 'E-CSS-2', 'B-CSS-1'],
  amounts: ['E-CSS-1', 'E-CSS-5'],
  stamps: ['E-CSS-1', 'A-CSS-1', 'C-CSS-6'],
  checkboxes: ['E-CSS-1'],
};

/**
 * Generate browser-executable script for element effects
 * This script injects the __applyElementEffects function into the page
 */
export function generateElementEffectsScript(): string {
  // Collect all effects that don't require pseudo-elements
  const effectsArray: { id: string; params: unknown[]; getStylesFn: string }[] = [];

  ELEMENT_EFFECT_CATEGORIES.forEach((category) => {
    category.effects.forEach((effect) => {
      if (!effect.getPseudoStyles) {
        effectsArray.push({
          id: effect.id,
          params: effect.params,
          getStylesFn: serializeGetStyles(effect),
        });
      }
    });
  });

  return `
<script>
// ============================================================================
// ELEMENT CSS EFFECTS - Generated from element-effects.ts (${effectsArray.length} effects)
// ============================================================================

// Element zones for targeting
const DOCUMENT_ZONES = ${JSON.stringify(DOCUMENT_ZONES)};

// Zone-appropriate effects
const ZONE_EFFECTS = ${JSON.stringify(ZONE_EFFECTS)};

// Seeded random for element effects
function elementSeededRandom(seed) {
  const x = Math.sin(seed * 9.8765 + 43.21) * 12345.6789;
  return x - Math.floor(x);
}

// All element effect definitions
const ELEMENT_EFFECTS = {
${effectsArray
  .map(
    (e) => `  "${e.id}": {
    params: ${JSON.stringify(e.params)},
    getStyles: ${e.getStylesFn}
  }`
  )
  .join(',\n')}
};

// Get intensity-scaled range for element effects - sqrt curve for more punch at low intensities
function getElementIntensityRange(intensity) {
  const scaleFactor = Math.sqrt(intensity / 100);
  return {
    minOffset: 0.15 + scaleFactor * 0.35,
    maxOffset: 0.25 + scaleFactor * 0.55,
  };
}

// Generate random params for an element effect
function generateElementEffectParams(effectId, intensity, seed, index) {
  const params = {};
  const effect = ELEMENT_EFFECTS[effectId];
  if (!effect) return params;

  const effectParams = effect.params || [];
  const { minOffset, maxOffset } = getElementIntensityRange(intensity);

  effectParams.forEach((p, paramIndex) => {
    const paramSeed = seed + index * 50 + paramIndex;
    const random = elementSeededRandom(paramSeed);

    if (p.type === 'range' && p.min !== undefined && p.max !== undefined) {
      const range = p.max - p.min;
      const scaledMinOffset = range * minOffset;
      const scaledMaxOffset = range * maxOffset;
      params[p.name] = p.min + scaledMinOffset + random * (scaledMaxOffset - scaledMinOffset);
    } else if (p.type === 'checkbox') {
      params[p.name] = random < intensity / 100;
    } else if (p.type === 'select' && p.options) {
      params[p.name] = p.options[Math.floor(random * p.options.length)];
    } else {
      params[p.name] = p.default;
    }
  });

  return params;
}

// Generate a random gradient mask for directional/radial degradation
function generateGradientMask(seed, elIndex, intensity, targetOpacity) {
  const random1 = elementSeededRandom(seed + elIndex * 13);
  const random2 = elementSeededRandom(seed + elIndex * 17);
  const random3 = elementSeededRandom(seed + elIndex * 23);

  const isRadial = random1 > 0.6;

  let minOpacity, maxOpacity;
  if (targetOpacity !== undefined) {
    maxOpacity = 0.95 + random3 * 0.05;
    minOpacity = Math.max(0.1, targetOpacity - 0.15);
  } else {
    const scaleFactor = Math.sqrt(intensity / 100);
    minOpacity = 0.3 + (1 - scaleFactor) * 0.4;
    maxOpacity = 0.9 + (1 - scaleFactor) * 0.1;
  }

  if (isRadial) {
    const corners = ['top left', 'top right', 'bottom left', 'bottom right', 'center'];
    const corner = corners[Math.floor(random2 * corners.length)];
    const radius = 50 + random3 * 50;
    return 'radial-gradient(ellipse at ' + corner + ', rgba(0,0,0,' + maxOpacity.toFixed(2) + ') 0%, rgba(0,0,0,' + minOpacity.toFixed(2) + ') ' + radius + '%)';
  } else {
    const directions = [
      'to right', 'to left', 'to bottom', 'to top',
      'to bottom right', 'to bottom left', 'to top right', 'to top left'
    ];
    const direction = directions[Math.floor(random2 * directions.length)];
    const startPos = 5 + random3 * 25;
    return 'linear-gradient(' + direction + ', rgba(0,0,0,' + maxOpacity.toFixed(2) + ') 0%, rgba(0,0,0,' + maxOpacity.toFixed(2) + ') ' + startPos + '%, rgba(0,0,0,' + minOpacity.toFixed(2) + ') 100%)';
  }
}

const OPACITY_EFFECTS = ['E-CSS-1', 'S-CSS-1'];
const UNIFORM_EFFECTS = ['C-CSS-1', 'C-CSS-2', 'C-CSS-3', 'C-CSS-4', 'C-CSS-6', 'B-CSS-1'];

function applyStylesToElement(element, styles, effectId, seed, elIndex, intensity) {
  const isOpacityEffect = OPACITY_EFFECTS.includes(effectId);
  const targetOpacity = isOpacityEffect ? styles.opacity : undefined;

  Object.entries(styles).forEach(([key, value]) => {
    if (key.startsWith('__')) return;
    if (isOpacityEffect && key === 'opacity') return;
    element.style[key] = value;
  });

  if (isOpacityEffect && targetOpacity !== undefined) {
    const gradient = generateGradientMask(seed, elIndex, intensity, targetOpacity);
    element.style.maskImage = gradient;
    element.style.webkitMaskImage = gradient;
  } else if (UNIFORM_EFFECTS.includes(effectId)) {
    const gradient = generateGradientMask(seed, elIndex, intensity);
    const existingMask = element.style.maskImage || element.style.webkitMaskImage;
    if (existingMask && existingMask !== 'none') {
      element.style.maskImage = existingMask + ', ' + gradient;
      element.style.webkitMaskImage = existingMask + ', ' + gradient;
      element.style.maskComposite = 'intersect';
      element.style.webkitMaskComposite = 'source-in';
    } else {
      element.style.maskImage = gradient;
      element.style.webkitMaskImage = gradient;
    }
  }
}

// Main element effects function
window.__applyElementEffects = function(intensity, seed) {
  if (intensity <= 0) return [];

  const docElement = document.querySelector('.d-document');
  if (!docElement) {
    return [];
  }

  const appliedEffects = [];
  const scaleFactor = Math.sqrt(intensity / 100);

  const numZones = Math.max(2, Math.floor(2 + scaleFactor * 2.5));
  const zoneNames = Object.keys(DOCUMENT_ZONES);

  const specialZones = ['signatures', 'stamps'];
  const shuffledZones = [...zoneNames].sort((a, b) => {
    let aWeight = elementSeededRandom(seed + a.charCodeAt(0));
    let bWeight = elementSeededRandom(seed + b.charCodeAt(0));

    const specialPenalty = (1 - scaleFactor) * 0.55;
    if (specialZones.includes(a)) aWeight += specialPenalty;
    if (specialZones.includes(b)) bWeight += specialPenalty;

    return aWeight - bWeight;
  });

  const selectedZones = shuffledZones.slice(0, numZones);

  let effectIndex = 0;
  selectedZones.forEach((zoneName, zoneIndex) => {
    const selectors = DOCUMENT_ZONES[zoneName];
    const zoneEffectIds = ZONE_EFFECTS[zoneName] || ['E-CSS-1'];

    const effectId = zoneEffectIds[Math.floor(elementSeededRandom(seed + zoneIndex * 10) * zoneEffectIds.length)];
    const effect = ELEMENT_EFFECTS[effectId];

    if (!effect) return;

    const params = generateElementEffectParams(effectId, intensity, seed, effectIndex);

    let appliedCount = 0;
    let totalCount = 0;
    selectors.forEach((selector) => {
      const elements = docElement.querySelectorAll(selector);
      totalCount += elements.length;

      elements.forEach((el, elIndex) => {
        const elementProbability = 0.1 + scaleFactor * 0.7;
        const shouldApply = elementSeededRandom(seed + effectIndex * 100 + elIndex * 7) < elementProbability;

        if (!shouldApply) return;

        appliedCount++;

        const elementParams = { ...params };
        effect.params.forEach((p) => {
          if (p.type === 'range' && typeof elementParams[p.name] === 'number') {
            const variation = 1 + (elementSeededRandom(seed + effectIndex + elIndex) - 0.5) * 0.2;
            elementParams[p.name] = Math.max(
              p.min ?? 0,
              Math.min(p.max ?? 1, elementParams[p.name] * variation)
            );
          }
        });

        try {
          const styles = effect.getStyles(elementParams);
          applyStylesToElement(el, styles, effectId, seed, elIndex, intensity);
        } catch (e) {}
      });
    });

    if (appliedCount > 0) {
      appliedEffects.push(effectId + ' → ' + zoneName + ' (' + appliedCount + '/' + totalCount + ' elements)');
    }

    effectIndex++;
  });

  // Always apply handwriting effects to signatures
  const handwritingSelectors = ['.d-signature-text', '.d-signature-block', '.d-signature'];
  let handwritingCount = 0;

  handwritingSelectors.forEach((selector) => {
    const elements = docElement.querySelectorAll(selector);
    elements.forEach((el, elIndex) => {
      const r1 = elementSeededRandom(seed + elIndex * 31);
      const r2 = elementSeededRandom(seed + elIndex * 37);
      const r3 = elementSeededRandom(seed + elIndex * 41);
      const r4 = elementSeededRandom(seed + elIndex * 43);

      const pressureStops = [];
      const numStops = 5 + Math.floor(r1 * 4);

      for (let i = 0; i <= numStops; i++) {
        const pos = (i / numStops) * 100;
        const basePressure = 0.6 + r2 * 0.3;
        const variation = (elementSeededRandom(seed + elIndex * 47 + i) - 0.5) * 0.4;
        const pressure = Math.max(0.4, Math.min(1, basePressure + variation));
        pressureStops.push('rgba(0,0,0,' + pressure.toFixed(2) + ') ' + pos.toFixed(1) + '%');
      }

      const pressureGradient = 'linear-gradient(90deg, ' + pressureStops.join(', ') + ')';

      el.style.maskImage = pressureGradient;
      el.style.webkitMaskImage = pressureGradient;

      const rotation = (r3 - 0.5) * 4;
      const existingTransform = el.style.transform || '';
      if (!existingTransform.includes('rotate')) {
        el.style.transform = existingTransform + ' rotate(' + rotation.toFixed(1) + 'deg)';
      }

      const wobble = (r4 - 0.5) * 2;
      el.style.transform = (el.style.transform || '') + ' translateY(' + wobble.toFixed(1) + 'px)';

      const r5 = elementSeededRandom(seed + elIndex * 53);
      const letterSpacing = -0.5 + r5 * 2;
      el.style.letterSpacing = letterSpacing.toFixed(1) + 'px';

      handwritingCount++;
    });
  });

  if (handwritingCount > 0) {
    appliedEffects.push('Handwriting pressure → ' + handwritingCount + ' elements');
  }

  return appliedEffects;
};
</script>`;
}

/**
 * Get the count of available element effects (non-pseudo only)
 */
export function getElementEffectsCount(): number {
  let count = 0;
  ELEMENT_EFFECT_CATEGORIES.forEach((category) => {
    category.effects.forEach((effect) => {
      if (!effect.getPseudoStyles) {
        count++;
      }
    });
  });
  return count;
}

// Re-export types and categories for direct access
export { CATEGORIES } from './effects';
export type { Effect, Category, EffectParam } from './effects';
export { ELEMENT_EFFECT_CATEGORIES } from './element-effects';
export type { ElementEffect, ElementEffectCategory, ElementEffectParam } from './element-effects';
