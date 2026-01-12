/**
 * HTML Generator for Document Rendering
 *
 * This module handles:
 * 1. Calling the LLM to generate JSX code
 * 2. Validating and repairing the JSX
 * 3. Assembling complete HTML with components and effects
 */

import type { VLMProvider } from '@doclo/core';
import type { DocumentGenerationConfig } from '../document-config';
import { generateInlineComponents, generateComponentStyles } from './components';
import { generateEffectsScript, generateElementEffectsScript } from './degradation';
import { buildSystemPrompt } from './prompts/system-prompt';
import { buildUserPrompt } from './prompts/user-prompt';

/**
 * Result from HTML generation
 */
export interface HTMLGenerationResult {
  /** Complete HTML ready for Puppeteer */
  html: string;

  /** Extracted JSX code (for debugging/caching) */
  jsx: string;

  /** LLM usage stats (if LLM was used) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  };
}

/**
 * Google Fonts for signature handwriting
 */
const GOOGLE_FONTS = [
  'Inter:wght@400;500;600;700',
  'Caveat:wght@400;700',
  'Give+You+Glory',
  'Inspiration',
  'Nothing+You+Could+Do',
  'Over+the+Rainbow',
  'Qwitcher+Grypen:wght@400;700',
  'Shadows+Into+Light',
  'Zen+Loop',
];

/**
 * Generate HTML for a document
 *
 * @param config - Document generation configuration
 * @param options - Generation options
 */
export async function generateHTML(
  config: DocumentGenerationConfig,
  options: {
    llmProvider?: VLMProvider;
    seed?: number;
    degradation?: number;
    previousGenerations?: string[];
    htmlTemplate?: string;
    /** Additional instructions to append to the generation prompt */
    additionalInstructions?: string;
  }
): Promise<HTMLGenerationResult> {
  const { llmProvider, seed = Date.now(), degradation = 0, previousGenerations, htmlTemplate, additionalInstructions } = options;

  let jsxCode: string;
  let usage: HTMLGenerationResult['usage'];

  if (htmlTemplate) {
    // Use provided template directly
    jsxCode = htmlTemplate;
  } else if (llmProvider) {
    // Generate JSX using LLM
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(config, seed, previousGenerations, additionalInstructions);

    // Use completeText if available (preferred - no JSON mode)
    // Fall back to completeJson for providers that don't support it yet
    if (llmProvider.completeText) {
      const response = await llmProvider.completeText({
        input: {
          text: userPrompt,
          systemPrompt: systemPrompt,
        },
        max_tokens: 8000,
      });

      // Extract JSX from response
      jsxCode = extractJSXFromResponse(response.text || '');

      // Always repair common LLM syntax errors (including raw JSON conversion)
      jsxCode = repairJSX(jsxCode);

      usage = {
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        costUSD: response.costUSD ?? 0,
      };
    } else {
      // Fallback: use completeJson (may force JSON mode on some providers)
      const response = await llmProvider.completeJson({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        schema: {}, // No schema - we want free-form JSX
        max_tokens: 8000,
      });

      // Extract JSX from response
      jsxCode = extractJSXFromResponse(response.rawText || '');

      // Always repair common LLM syntax errors (including raw JSON conversion)
      jsxCode = repairJSX(jsxCode);

      usage = {
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        costUSD: response.costUSD ?? 0,
      };
    }
  } else {
    throw new Error('Either llmProvider or htmlTemplate is required');
  }

  // Build the complete HTML
  const html = buildCompleteHTML(jsxCode, degradation);

  return { html, jsx: jsxCode, usage };
}

/**
 * Build complete HTML document with components, styles, and effects
 */
function buildCompleteHTML(jsxCode: string, degradation: number): string {
  const fontUrl = `https://fonts.googleapis.com/css2?${GOOGLE_FONTS.map((f) => `family=${f}`).join('&')}&display=swap`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=850, height=1200">
  <title>Document Render</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fontUrl}" rel="stylesheet">
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    ${generateComponentStyles()}
    /* Reset only structural elements - preserve margins/padding on document content */
    *, *::before, *::after { box-sizing: border-box; }
    html, body { width: 850px; height: 1200px; margin: 0; padding: 0; overflow: hidden; background: #fff; }
    #root { width: 850px; height: 1200px; margin: 0; padding: 0; overflow: hidden; position: absolute; top: 0; left: 0; }
    .d-document { position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    ${generateInlineComponents()}
  </script>
  <script type="text/babel">
    function GeneratedDocument() {
      return (
        ${jsxCode}
      );
    }
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(GeneratedDocument));
    window.__RENDER_COMPLETE__ = true;
  </script>
  ${degradation > 0 ? generateElementEffectsScript() : ''}
  ${degradation > 0 ? generateEffectsScript() : ''}
</body>
</html>`;
}

/**
 * Extract JSX code from LLM response
 * Handles markdown code blocks and raw JSX
 */
function extractJSXFromResponse(response: string): string {
  // Try to find JSX in code blocks (```jsx or ```)
  const codeBlockMatch = response.match(/```(?:jsx|javascript|js|tsx)?\s*([\s\S]*?)```/);

  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSX starting with < and ending with >
  const jsxMatch = response.match(/<[A-Z][^]*>[\s\S]*<\/[A-Z][a-zA-Z]*>/);
  if (jsxMatch) {
    return jsxMatch[0].trim();
  }

  // Try to find just opening tag (self-closing or with children)
  const tagMatch = response.match(/<[A-Z][a-zA-Z]*[^>]*(?:\/>|>[\s\S]*)/);
  if (tagMatch) {
    return tagMatch[0].trim();
  }

  // Return as-is if no patterns match
  return response.trim();
}

/**
 * Validate that the JSX looks reasonable
 */
export function validateJSX(jsx: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must start with a component tag
  if (!jsx.match(/^\s*<[A-Z]/)) {
    errors.push('JSX must start with a component tag (e.g., <Document>)');
  }

  // Should have Document as root
  if (!jsx.includes('<Document')) {
    errors.push('JSX should have <Document> as the root component');
  }

  // Check for balanced tags (basic check)
  const openTags = (jsx.match(/<[A-Z][a-zA-Z]*(?:\s[^>]*)?(?<!\/?)>/g) || []).filter((t) => !t.endsWith('/>')).length;
  const closeTags = (jsx.match(/<\/[A-Z][a-zA-Z]*>/g) || []).length;

  if (openTags !== closeTags) {
    errors.push(`Unbalanced tags: ${openTags} opening, ${closeTags} closing`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert camelCase/snake_case key to Title Case label
 */
function keyToLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Escape special characters for JSX text content
 */
function escapeJSX(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Recursively convert any JSON value to JSX components
 */
function jsonValueToJSX(value: unknown, label?: string): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return label ? `<Field label="${escapeJSX(label)}"><Value>-</Value></Field>` : '<Value>-</Value>';
  }

  // Handle numbers
  if (typeof value === 'number') {
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return label
      ? `<Field label="${escapeJSX(label)}"><Value>${formatted}</Value></Field>`
      : `<Value>${formatted}</Value>`;
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    const formatted = value ? 'Yes' : 'No';
    return label
      ? `<Field label="${escapeJSX(label)}"><Value>${formatted}</Value></Field>`
      : `<Value>${formatted}</Value>`;
  }

  // Handle strings
  if (typeof value === 'string') {
    return label
      ? `<Field label="${escapeJSX(label)}"><Value>${escapeJSX(value)}</Value></Field>`
      : `<Value>${escapeJSX(value)}</Value>`;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return label ? `<Field label="${escapeJSX(label)}"><Value>-</Value></Field>` : '<Value>-</Value>';
    }

    const items = value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          // Object in array - wrap in Box
          const innerFields = Object.entries(item as Record<string, unknown>)
            .map(([k, v]) => jsonValueToJSX(v, keyToLabel(k)))
            .join('\n');
          return `<Box padding="sm" border>\n${innerFields}\n</Box>`;
        }
        return jsonValueToJSX(item);
      })
      .join('\n');

    const content = `<Stack gap="sm">\n${items}\n</Stack>`;
    return label ? `<Section><SectionTitle size="sm">${escapeJSX(label)}</SectionTitle>\n${content}</Section>` : content;
  }

  // Handle objects (recursive)
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return label ? `<Field label="${escapeJSX(label)}"><Value>-</Value></Field>` : '<Value>-</Value>';
    }

    const fields = entries.map(([k, v]) => jsonValueToJSX(v, keyToLabel(k))).join('\n');

    if (label) {
      // Nested object with label - wrap in a section-like box
      return `<Box padding="sm" style={{ marginTop: 8 }}><Label weight="semibold" style={{ marginBottom: 4 }}>${escapeJSX(label)}</Label>\n<Stack gap="xs">\n${fields}\n</Stack></Box>`;
    }
    return `<Stack gap="sm">\n${fields}\n</Stack>`;
  }

  // Fallback for any other type
  return label
    ? `<Field label="${escapeJSX(label)}"><Value>${escapeJSX(String(value))}</Value></Field>`
    : `<Value>${escapeJSX(String(value))}</Value>`;
}

/**
 * Find the end position of a balanced JSON structure starting at startIndex
 * Returns -1 if no balanced structure found
 */
function findBalancedJSONEnd(str: string, startIndex: number): number {
  const openChar = str[startIndex];
  if (openChar !== '{' && openChar !== '[') return -1;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Convert raw JSON objects/arrays embedded in JSX to proper Field/Value components
 *
 * LLMs sometimes output malformed JSX like:
 *   <Document>{"amount": 425.50, "currency": "USD"}</Document>
 *   <Document>[{"item": "value"}]</Document>
 *   <Document>{"nested": {"deep": {"value": 123}}}</Document>
 *
 * This function converts it to proper JSX with Field/Value components,
 * recursively handling nested objects and arrays.
 */
function convertRawJSONToJSX(jsx: string): string {
  let result = '';
  let lastIndex = 0;

  // Find all positions where > is followed by { or [ (potential JSON)
  const potentialJSONPattern = />(\s*)([\[{])/g;
  let match;

  while ((match = potentialJSONPattern.exec(jsx)) !== null) {
    const tagClosePos = match.index; // Position of >
    const whitespace = match[1]; // Any whitespace between > and JSON
    const jsonStartChar = match[2]; // { or [
    const jsonStartPos = match.index + 1 + whitespace.length; // Position of { or [

    // Skip if this is a JSX expression (double braces like style={{ }})
    if (jsx[jsonStartPos + 1] === '{') {
      continue;
    }

    // Find the balanced end of this JSON structure
    const jsonEndPos = findBalancedJSONEnd(jsx, jsonStartPos);
    if (jsonEndPos === -1) continue;

    // Check if this JSON is followed by </ (closing tag)
    const afterJSON = jsx.slice(jsonEndPos + 1).match(/^\s*<\//);
    if (!afterJSON) continue;

    // Extract the JSON string
    const jsonStr = jsx.slice(jsonStartPos, jsonEndPos + 1);

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(jsonStr);

      // Successfully parsed - convert to JSX components
      const jsxContent = jsonValueToJSX(parsed);

      // Add everything up to and including the >
      result += jsx.slice(lastIndex, tagClosePos + 1);
      // Add the converted JSX content
      result += jsxContent;
      // Update lastIndex to skip past the JSON
      lastIndex = jsonEndPos + 1;

      // Reset regex lastIndex to continue searching after this match
      potentialJSONPattern.lastIndex = jsonEndPos + 1;
    } catch {
      // Not valid JSON - skip this match and continue
      continue;
    }
  }

  // Add any remaining content
  result += jsx.slice(lastIndex);

  return result;
}

/**
 * Attempt to repair common JSX issues from LLM output
 */
function repairJSX(jsx: string): string {
  let repaired = jsx;

  // Remove any leading/trailing backticks or language markers
  repaired = repaired.replace(/^```(?:jsx|javascript|js|tsx)?\s*/g, '');
  repaired = repaired.replace(/\s*```$/g, '');

  // Fix doubled quotes at end of string values (LLM hallucination)
  repaired = repaired.replace(/'([^']*)''/g, "'$1'");
  repaired = repaired.replace(/"([^"]*)""(?=[,}\s>])/g, '"$1"');

  // Fix extra quote before closing tag (inside style objects)
  repaired = repaired.replace(/''\s*>/g, "' }}>");
  repaired = repaired.replace(/""\s*>/g, '" }}>');

  // Fix style objects missing closing braces before >
  repaired = repaired.replace(/style=\{\{([^{}]*?)'?\s*>/g, (match, content) => {
    if (match.includes('}}')) return match;
    return `style={{${content} }}>`;
  });

  // General fix: any {{ that ends with a value followed by > needs }}
  repaired = repaired.replace(/\{\{([^{}]*?)(['"0-9])\s*>/g, (match) => {
    if (match.includes('}}')) return match;
    return match.slice(0, -1) + ' }}>';
  });

  // Fix style objects missing double braces
  repaired = repaired.replace(/style=\{\s*([a-zA-Z]+\s*:)/g, 'style={{ $1');

  // Fix unclosed style objects (single brace at end)
  repaired = repaired.replace(/style=\{\{([^}]*)\}(?!\})/g, 'style={{$1}}');

  // Fix extra quotes in attribute values
  repaired = repaired.replace(/="'([^']+)'"/g, '="$1"');

  // Fix missing space between attributes
  repaired = repaired.replace(/"([a-zA-Z]+=)/g, '" $1');

  // Fix common issues with style objects
  repaired = repaired.replace(/style=\{([^{}]+)\}/g, (match, inner) => {
    if (!inner.startsWith('{')) {
      return `style={{ ${inner} }}`;
    }
    return match;
  });

  // Remove any JavaScript comments that might break JSX
  repaired = repaired.replace(/\/\/[^\n]*\n/g, '\n');

  // Remove HTML comments (<!-- ... -->) which are invalid in JSX
  repaired = repaired.replace(/<!--[\s\S]*?-->/g, '');

  // CRITICAL: Handle case where LLM outputs PURE JSON (no JSX tags at all)
  // This happens when the LLM completely ignores instructions and outputs raw JSON
  const trimmed = repaired.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !trimmed.includes('<')) {
    // Entire content is JSON - convert it directly
    try {
      const parsed = JSON.parse(trimmed);
      repaired = `<Document>\n${jsonValueToJSX(parsed)}\n</Document>`;
    } catch {
      // Not valid JSON - wrap as-is and let the next step handle it
    }
  }

  // Ensure there's a Document wrapper if missing (do this BEFORE JSON conversion)
  if (!repaired.includes('<Document')) {
    repaired = `<Document>${repaired}</Document>`;
  }

  // CRITICAL FIX: Convert raw JSON objects inside JSX tags to proper Field/Value components
  // LLMs sometimes output {"amount": 425.50} instead of <Field label="Amount"><Value>425.50</Value></Field>
  repaired = convertRawJSONToJSX(repaired);

  // Balance unbalanced tags
  repaired = balanceTags(repaired);

  return repaired.trim();
}

/**
 * Attempt to balance unbalanced JSX tags
 */
function balanceTags(jsx: string): string {
  const tagStack: { name: string; pos: number }[] = [];
  const insertions: { pos: number; text: string }[] = [];
  const orphanPositions: { start: number; end: number }[] = [];

  let pos = 0;
  const len = jsx.length;

  while (pos < len) {
    // Skip JSX comments
    if (jsx.slice(pos, pos + 3) === '{/*') {
      const endComment = jsx.indexOf('*/}', pos);
      if (endComment !== -1) {
        pos = endComment + 3;
        continue;
      }
    }

    // Check for self-closing tag first
    const selfMatch = jsx.slice(pos).match(/^<([a-zA-Z][a-zA-Z0-9]*)[^>]*\/>/);
    if (selfMatch) {
      pos += selfMatch[0].length;
      continue;
    }

    // Check for closing tag
    const closeMatch = jsx.slice(pos).match(/^<\/([a-zA-Z][a-zA-Z0-9]*)>/);
    if (closeMatch) {
      const tagName = closeMatch[1];
      const matchIdx = findLastIndex(tagStack, (t) => t.name.toLowerCase() === tagName.toLowerCase());

      if (matchIdx !== -1) {
        if (matchIdx < tagStack.length - 1) {
          const unclosedTags = tagStack.slice(matchIdx + 1);
          const closingTags = unclosedTags.reverse().map((t) => `</${t.name}>`).join('');
          insertions.push({ pos, text: closingTags });
          tagStack.splice(matchIdx);
        } else {
          tagStack.pop();
        }
      } else {
        orphanPositions.push({ start: pos, end: pos + closeMatch[0].length });
      }
      pos += closeMatch[0].length;
      continue;
    }

    // Check for opening tag
    const simpleOpenMatch = jsx.slice(pos).match(/^<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/);
    if (simpleOpenMatch) {
      const fullTag = simpleOpenMatch[0];
      if (!fullTag.endsWith('/>')) {
        const tagName = simpleOpenMatch[1];
        tagStack.push({ name: tagName, pos });
        pos += fullTag.length;
        continue;
      }
    }

    pos++;
  }

  // Build result by applying fixes
  let result = jsx;

  type Modification = { pos: number; type: 'insert' | 'delete'; text?: string; end?: number };
  const mods: Modification[] = [];

  for (const ins of insertions) {
    mods.push({ pos: ins.pos, type: 'insert', text: ins.text });
  }
  for (const del of orphanPositions) {
    mods.push({ pos: del.start, type: 'delete', end: del.end });
  }

  // Sort by position descending to apply from end to start
  mods.sort((a, b) => b.pos - a.pos);

  for (const mod of mods) {
    if (mod.type === 'insert' && mod.text) {
      result = result.slice(0, mod.pos) + mod.text + result.slice(mod.pos);
    } else if (mod.type === 'delete' && mod.end) {
      result = result.slice(0, mod.pos) + result.slice(mod.end);
    }
  }

  // Add missing closing tags at the end
  if (tagStack.length > 0) {
    const closingTags = tagStack.reverse().map((t) => `</${t.name}>`).join('\n');
    result = result + '\n' + closingTags;
  }

  return result;
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
