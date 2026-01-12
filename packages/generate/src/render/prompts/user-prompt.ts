/**
 * User prompt builder for JSX document generation
 *
 * Takes a DocumentGenerationConfig and builds a detailed prompt
 * that tells the LLM what document to generate and what data to include.
 */

import type { DocumentGenerationConfig, FieldDefinition, LayoutHints, SectionDefinition } from '../../document-config';

/**
 * Build visual elements section from layoutHints
 * Tells the LLM about stamps, barcodes, logos, and watermarks to include
 */
function buildVisualElementsSection(layoutHints: LayoutHints | undefined): string {
  if (!layoutHints) return '';

  const sections: string[] = [];

  // Stamps
  if (layoutHints.includeStamps?.rate && layoutHints.includeStamps.rate > 0) {
    const { types, rate, position } = layoutHints.includeStamps;
    sections.push(
      `**Stamps (${rate}% of documents):** Consider including one of: ${types.join(', ')}` +
        (position ? ` - prefer ${position} positioning` : '')
    );
  }

  // Barcodes
  if (layoutHints.includeBarcodes?.rate && layoutHints.includeBarcodes.rate > 0) {
    const { types, rate, position } = layoutHints.includeBarcodes;
    sections.push(
      `**Barcodes (${rate}% of documents):** Consider including one of: ${types.join(', ')}` +
        (position ? ` - prefer ${position} positioning` : '')
    );
  }

  // Logo
  if (layoutHints.includeLogo?.rate && layoutHints.includeLogo.rate > 0) {
    const { rate, position } = layoutHints.includeLogo;
    sections.push(
      `**Logo (${rate}% of documents):** Consider including a Logo component` +
        (position ? ` - prefer ${position} positioning` : '')
    );
  }

  // Watermarks
  if (layoutHints.includeWatermarks?.rate && layoutHints.includeWatermarks.rate > 0) {
    const { types, rate } = layoutHints.includeWatermarks;
    sections.push(`**Watermarks (${rate}% of documents):** Consider including: ${types.join(', ')}`);
  }

  return sections.length > 0
    ? `\n## Visual Elements\nBased on seed randomness, consider including:\n${sections.join('\n')}\n`
    : '';
}

/**
 * Build layout preferences section from layoutHints
 * Tells the LLM about preferred patterns, color schemes, density, etc.
 */
function buildLayoutPreferencesSection(layoutHints: LayoutHints | undefined): string {
  if (!layoutHints) return '';

  const prefs: string[] = [];

  if (layoutHints.preferredPatterns?.length) {
    prefs.push(`- Preferred patterns: ${layoutHints.preferredPatterns.join(', ')}`);
  }

  if (layoutHints.colorScheme) {
    const schemeHints: Record<string, string> = {
      monochrome: 'Use only grayscale colors (black, white, grays)',
      'minimal-color': 'Use mostly neutrals with one or two accent colors',
      'full-color': 'Feel free to use a full color palette',
    };
    prefs.push(`- Color scheme: ${schemeHints[layoutHints.colorScheme] || layoutHints.colorScheme}`);
  }

  if (layoutHints.density) {
    const densityHints: Record<string, string> = {
      compact: 'Use tight spacing (gap="xs", padding="sm")',
      normal: 'Use standard spacing (gap="sm", padding="md")',
      spacious: 'Use generous spacing (gap="md", padding="lg")',
    };
    prefs.push(`- Density: ${densityHints[layoutHints.density] || layoutHints.density}`);
  }

  if (layoutHints.margins) {
    prefs.push(`- Margins: ${layoutHints.margins}`);
  }

  return prefs.length > 0 ? `\n## Layout Preferences\n${prefs.join('\n')}\n` : '';
}

/**
 * Build the user prompt for JSX generation
 *
 * @param config - The document generation configuration
 * @param seed - Seed for reproducible variation in layout and data
 * @param previousGenerations - Optional previous JSX outputs to avoid duplication
 * @param additionalInstructions - Optional runtime instructions to append
 */
export function buildUserPrompt(
  config: DocumentGenerationConfig,
  seed: number,
  previousGenerations?: string[],
  additionalInstructions?: string
): string {
  let prompt = `Generate a ${config.documentType.replace(/_/g, ' ')} document as React JSX.

## Document Description
${config.description}

## Fields to Include (INVENT YOUR OWN VALUES - examples show FORMAT only)
${(Object.entries(config.fields) as [string, FieldDefinition][])
  .map(([id, field]) => {
    let info = `- **${field.label}** (${id}): ${field.type}`;
    if (field.description) info += ` - ${field.description}`;
    if (field.constraints) {
      const c = field.constraints as Record<string, unknown>;
      if (c.examples) info += `\n  FORMAT examples (DO NOT USE THESE - invent similar): ${(c.examples as string[]).slice(0, 3).join(', ')}`;
      if (c.min !== undefined || c.max !== undefined) info += `\n  Range: ${c.min ?? ''}${c.min !== undefined && c.max !== undefined ? '-' : ''}${c.max ?? ''}`;
      if (c.handwritten) info += `\n  **HANDWRITTEN** (${c.handwritten}% chance) - use SignatureText with handwriting font`;
    }
    return info;
  })
  .join('\n')}

## Sections (in display order)
${(config.sections as SectionDefinition[])
  .map((s) => `- **${s.name}**: ${s.fields.join(', ')}`)
  .join('\n')}

## MANDATORY LAYOUT PATTERN (seed=${seed})

**YOU MUST USE HEADER PATTERN ${seed % 6}:**
${[
  '**Pattern 0 - Split Header**: Use <Row justify="between"> with Logo+company left, Title+metadata right',
  '**Pattern 1 - Banner Header**: Use <Banner> component with colored background, metadata in Row below',
  '**Pattern 2 - Centered Header**: NO logo, center-align everything, use <Title> centered with elegant spacing',
  '**Pattern 3 - Minimal Header**: Just <Title> and ONE <RefNumber>, nothing else in header area',
  '**Pattern 4 - Boxed Header**: Wrap header in <Box border padding="md">, logo and title inside',
  '**Pattern 5 - Stacked Header**: Vertical stack - Logo on top, then Title below, then metadata below that',
][seed % 6]}

**Required visual choices:**
- Document background: ${['#ffffff', '#fdfdf9', '#fffef5', '#faf8f5', '#f8fafc'][seed % 5]}
- Table style: bordered${seed % 2 === 0 ? ' striped' : ''}${seed % 3 === 0 ? ' compact' : ''}
- Table column pattern: ${['description-heavy (55%|15%|15%|15%)', 'narrow-label (25%|75%)', 'mixed-asymmetric (40%|35%|25%)', 'data-focused (20%|equal)', 'wide-middle (20%|50%|30%)'][seed % 5]}
- Field layout: ${['two-column Grid', 'three-column Grid', 'inline Row pairs', 'single-column Stack'][seed % 4]}
- Section styling: ${['bordered Box sections', 'underlined SectionTitles', 'plain with spacing'][seed % 3]}
- Section headers: ${seed % 2 === 0 ? 'uppercase with underline' : 'normal case, no underline'}
- Dividers: ${['solid', 'dashed', 'dotted', 'none'][seed % 4]}
- Signature font: ${['Caveat', 'Shadows Into Light', 'Give You Glory'][seed % 3]}`;

  // Add diversity hint from previous generations
  if (previousGenerations && previousGenerations.length > 0) {
    prompt += `

## AVOID THESE PREVIOUS LAYOUTS

Previous documents used these patterns - DO SOMETHING DIFFERENT:
${previousGenerations.map((jsx, i) => {
  // Extract key patterns from the JSX
  const hasLogo = jsx.includes('<Logo');
  const hasBanner = jsx.includes('<Banner');
  const hasTable = jsx.includes('<Table');
  const tableStyle = jsx.match(/striped|bordered|compact/g)?.join(', ') || 'none';
  const hasSignature = jsx.includes('<Signature');

  return `${i + 1}. ${hasLogo ? 'Has logo, ' : ''}${hasBanner ? 'Banner header, ' : ''}${hasTable ? `Table (${tableStyle}), ` : ''}${hasSignature ? 'Has signatures' : ''}`;
}).join('\n')}

Make your document VISUALLY DISTINCT from these.`;
  }

  prompt += `

## SAMPLE DATA REQUIREMENTS - CRITICAL

**ALL EXAMPLE VALUES ARE FORMAT GUIDES ONLY.** You MUST invent your own realistic data - NEVER copy the examples.

**The examples show you:**
- The FORMAT/PATTERN to follow (e.g., "BDN-2024-001234" shows the reference number format)
- The TYPE of content expected (e.g., company names, vessel names, quantities)
- The STYLE appropriate for the field

**You must CREATE NEW values that:**
1. Follow the same FORMAT/PATTERN as the examples
2. Stay within any min/max RANGES specified
3. Are COMPLETELY DIFFERENT from the example values
4. Are realistic for a ${config.documentType.replace(/_/g, ' ')}

**Variation seed: ${seed}** - Use this number to inspire unique choices. Different seeds = completely different data.

**FORBIDDEN:** Copying any example value verbatim. Every name, number, date, and reference must be your own invention within the constraints.`;

  // Add visual elements section from layoutHints
  prompt += buildVisualElementsSection(config.layoutHints);

  // Add layout preferences section from layoutHints
  prompt += buildLayoutPreferencesSection(config.layoutHints);

  // Add custom instructions (config-level + runtime)
  if (config.promptCustomizations || additionalInstructions) {
    prompt += `\n## Additional Instructions\n`;
    if (config.promptCustomizations) {
      prompt += config.promptCustomizations + '\n';
    }
    if (additionalInstructions) {
      prompt += additionalInstructions + '\n';
    }
  }

  prompt += `

## FINAL INSTRUCTIONS

Generate the complete JSX document now. Your output must be:

1. **A fully-styled, print-ready document** - NOT a list of fields or data schema
2. **Wrapped in \`\`\`jsx code blocks** - Start with \`\`\`jsx and end with \`\`\`
3. **Using <Document> as root** - This is required
4. **Visually professional** - Use Banner/headers, Grid/Row sections, Table for tabular data, proper spacing and borders
5. **Complete** - Include ALL the fields listed above with your invented values
6. **Using data-field-id** - Every <Field> component must have data-field-id="field_name" attribute
7. **Realistic** - Invent your own values (don't copy examples), make it look like a real ${config.documentType.replace(/_/g, ' ')}

**DO NOT** output JSON, data schemas, field descriptions, or explanations. Output ONLY the styled JSX document code.`;

  return prompt;
}
