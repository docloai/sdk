/**
 * Prompt Renderer
 *
 * Renders prompt templates by substituting variables and resolving images
 */

import type {
  PromptAsset,
  PromptMessage,
  PromptContent,
  PromptSections,
  ImageVariable,
  RenderedPrompt,
  RenderedMessage,
  RenderedContent
} from './types.js';

/**
 * Schema formatter function type
 * Can be injected from providers-llm package or use default
 */
type SchemaFormatter = (schema: any) => string;

let schemaFormatter: SchemaFormatter | undefined;

/**
 * Set the schema formatter function
 * This should be called from the providers-llm package or by the user
 */
export function setSchemaFormatter(formatter: SchemaFormatter): void {
  schemaFormatter = formatter;
}

/**
 * Get the schema formatter (with fallback)
 */
function getSchemaFormatter(): SchemaFormatter {
  if (schemaFormatter) {
    return schemaFormatter;
  }

  // Simple fallback: JSON stringify
  return (schema: any) => {
    if (!schema) return '';
    return JSON.stringify(schema, null, 2);
  };
}

/**
 * Options for rendering a prompt
 */
export interface RenderOptions {
  /**
   * Values for prompt variables
   */
  variables?: Record<string, any>;

  /**
   * Whether to throw on missing required variables (default: true)
   */
  strict?: boolean;

  /**
   * Additional instructions to append (for additionalInstructions parameter)
   */
  additionalInstructions?: string;
}

/**
 * Renderer for prompt assets
 */
export class PromptRenderer {
  /**
   * Render a prompt asset with variable substitution
   */
  render(prompt: PromptAsset, options: RenderOptions = {}): RenderedPrompt {
    const { variables = {}, strict = true, additionalInstructions } = options;

    // Validate required variables
    if (strict) {
      this.validateRequiredVariables(prompt, variables);
    }

    // Merge with defaults
    const mergedVariables = this.mergeDefaults(prompt, variables);

    // Check if this is a section-based prompt or message-based prompt
    if (prompt.sections) {
      return this.renderSections(prompt, mergedVariables, additionalInstructions);
    } else if (prompt.messages) {
      return this.renderMessages(prompt, mergedVariables, additionalInstructions);
    } else {
      throw new Error(
        `Prompt "${prompt.id}@${prompt.version}" must have either messages or sections`
      );
    }
  }

  /**
   * Render a message-based prompt (template format)
   */
  private renderMessages(
    prompt: PromptAsset,
    variables: Record<string, any>,
    additionalInstructions?: string
  ): RenderedPrompt {
    const renderedMessages: RenderedMessage[] = [];

    for (const message of prompt.messages!) {
      const renderedMessage = this.renderMessage(message, variables, prompt);
      renderedMessages.push(renderedMessage);
    }

    // If additionalInstructions provided, append to last user message
    if (additionalInstructions) {
      // Find last user message (backward compatible)
      let lastUserMsg: RenderedMessage | undefined;
      for (let i = renderedMessages.length - 1; i >= 0; i--) {
        if (renderedMessages[i].role === 'user') {
          lastUserMsg = renderedMessages[i];
          break;
        }
      }

      if (lastUserMsg && lastUserMsg.content.length > 0) {
        const lastContent = lastUserMsg.content[lastUserMsg.content.length - 1];
        if (lastContent.type === 'text') {
          lastContent.text += `\n\nADDITIONAL INSTRUCTIONS:\n${additionalInstructions}`;
        }
      } else {
        // No user message found, add a new one
        renderedMessages.push({
          role: 'user',
          content: [{
            type: 'text',
            text: `ADDITIONAL INSTRUCTIONS:\n${additionalInstructions}`
          }]
        });
      }
    }

    return { messages: renderedMessages };
  }

  /**
   * Render a section-based prompt (template-free format)
   */
  private renderSections(
    prompt: PromptAsset,
    variables: Record<string, any>,
    additionalInstructions?: string
  ): RenderedPrompt {
    const sections = prompt.sections!;
    const messages: RenderedMessage[] = [];

    // Build content from sections
    let userContent = '';

    // Add context section (auto-injected variables like schema, categories)
    if (sections.context) {
      userContent += sections.context + '\n\n';
    } else if (prompt.autoInject) {
      // Auto-build context from autoInject spec
      userContent += this.buildAutoContext(prompt.autoInject, variables) + '\n\n';
    }

    // Add examples section
    if (sections.examples) {
      userContent += sections.examples + '\n\n';
    }

    // Add instructions section
    if (sections.instructions) {
      userContent += sections.instructions + '\n\n';
    }

    // Add additional instructions if provided
    if (additionalInstructions) {
      userContent += `ADDITIONAL INSTRUCTIONS:\n${additionalInstructions}\n\n`;
    }

    // Add notes section
    if (sections.notes) {
      userContent += sections.notes;
    }

    // Add system message if present
    if (sections.system) {
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: sections.system }]
      });
    }

    // Add user message with all content
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: userContent.trim() }]
    });

    return { messages };
  }

  /**
   * Build context section from autoInject specification
   */
  private buildAutoContext(autoInject: string[], variables: Record<string, any>): string {
    let context = '';

    for (const varName of autoInject) {
      if (!(varName in variables)) continue;

      const value = variables[varName];

      if (varName === 'schema') {
        const formatter = getSchemaFormatter();
        context += `SCHEMA:\n${formatter(value)}\n\n`;
      } else if (varName === 'categories') {
        context += `AVAILABLE CATEGORIES:\n${this.valueToString(value)}\n\n`;
      } else if (varName === 'format') {
        context += `OUTPUT FORMAT: ${value}\n\n`;
      } else {
        context += `${varName.toUpperCase()}:\n${this.valueToString(value)}\n\n`;
      }
    }

    return context.trim();
  }

  /**
   * Render a single message
   */
  private renderMessage(
    message: PromptMessage,
    variables: Record<string, any>,
    prompt: PromptAsset
  ): RenderedMessage {
    const renderedContent: RenderedContent[] = [];

    for (const content of message.content) {
      if (content.type === 'text') {
        // Render text with variable substitution
        const renderedText = this.renderText(content.text, variables);
        renderedContent.push({ type: 'text', text: renderedText });
      } else if (content.type === 'image') {
        // Resolve image source
        const imageUrl = this.resolveImageSource(content.source, variables);
        renderedContent.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      }
    }

    return {
      role: message.role,
      content: renderedContent
    };
  }

  /**
   * Render text content with variable substitution
   * Supports {{variableName}} syntax
   */
  private renderText(text: string, variables: Record<string, any>): string {
    let result = text;

    // Find all {{variable}} patterns
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = [...text.matchAll(variablePattern)];

    for (const match of matches) {
      const fullMatch = match[0]; // "{{variableName}}"
      const variableName = match[1].trim(); // "variableName"

      let replacement: string;

      if (variableName === 'schema') {
        // Special handling for schema variable
        const schema = variables.schema;
        if (schema) {
          const formatter = getSchemaFormatter();
          replacement = formatter(schema);
        } else {
          replacement = '';
        }
      } else if (variableName in variables) {
        // Regular variable substitution
        const value = variables[variableName];
        replacement = this.valueToString(value);
      } else {
        // Variable not found - leave as-is or throw error
        replacement = fullMatch; // Keep the placeholder
      }

      result = result.replace(fullMatch, replacement);
    }

    return result;
  }

  /**
   * Resolve an image source (can be URL, base64, or variable reference)
   */
  private resolveImageSource(
    source: string | ImageVariable,
    variables: Record<string, any>
  ): string {
    if (typeof source === 'string') {
      // Direct URL or base64
      return source;
    } else {
      // Variable reference
      const variableValue = variables[source.variable];
      if (!variableValue) {
        throw new Error(`Image variable "${source.variable}" not found in variables`);
      }

      // Ensure it's a string (URL or base64)
      return String(variableValue);
    }
  }

  /**
   * Convert a variable value to string for substitution
   */
  private valueToString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (typeof value === 'object') {
      // For objects/arrays, JSON stringify
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  /**
   * Validate that all required variables are provided
   */
  private validateRequiredVariables(
    prompt: PromptAsset,
    variables: Record<string, any>
  ): void {
    if (!prompt.variables) {
      return;
    }

    const missing: string[] = [];

    for (const [name, config] of Object.entries(prompt.variables)) {
      if (config.required && !(name in variables)) {
        // Check if there's a default
        if (config.default === undefined) {
          missing.push(name);
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required variables for prompt "${prompt.id}@${prompt.version}": ${missing.join(', ')}`
      );
    }
  }

  /**
   * Merge provided variables with defaults from prompt definition
   */
  private mergeDefaults(
    prompt: PromptAsset,
    variables: Record<string, any>
  ): Record<string, any> {
    if (!prompt.variables) {
      return { ...variables };
    }

    const merged = { ...variables };

    for (const [name, config] of Object.entries(prompt.variables)) {
      if (!(name in merged) && config.default !== undefined) {
        merged[name] = config.default;
      }
    }

    return merged;
  }
}

/**
 * Global renderer instance
 */
export const PROMPT_RENDERER = new PromptRenderer();

/**
 * Render a prompt with the global renderer
 */
export function renderPrompt(
  prompt: PromptAsset,
  options?: RenderOptions
): RenderedPrompt {
  return PROMPT_RENDERER.render(prompt, options);
}
