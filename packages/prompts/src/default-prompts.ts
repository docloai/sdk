/**
 * Default prompts that are automatically registered on package import
 */

import { registerPrompt } from './prompt-registry.js';
import type { PromptAsset } from './types.js';

/**
 * Default extraction prompt (for extract node)
 */
const defaultExtractionPrompt: PromptAsset = {
  id: 'default-extraction',
  version: '1.0.0',
  type: 'extraction',
  status: 'active',
  messages: [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'You are an expert at extracting structured data from documents. Your task is to carefully analyze the document and extract information that matches the specified schema.'
        }
      ]
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Extract structured data from the document according to the following schema:

{{schema}}

IMPORTANT GUIDELINES:
- Extract ONLY information that is explicitly present in the document
- Use exact field names as specified in the schema
- For missing required fields, use null
- For optional fields with no data, you may omit them or use null
- Do NOT invent or infer data that isn't clearly stated in the document
- Preserve the exact data types (strings, numbers, booleans) as specified
- Return valid JSON only`
        }
      ]
    }
  ],
  variables: {
    schema: {
      type: 'schema',
      required: true,
      description: 'The JSON schema defining the structure of data to extract',
      source: 'auto',
      overridable: false
    }
  },
  description: 'Default prompt for structured data extraction',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

/**
 * Default parse prompt (for parse node with VLM)
 */
const defaultParsePrompt: PromptAsset = {
  id: 'default-parse',
  version: '1.0.0',
  type: 'parse',
  status: 'active',
  messages: [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'You are an expert at converting documents to structured text format. Accurately transcribe all text while preserving the document\'s logical structure and layout.'
        }
      ]
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Convert this document to text format.

REQUIREMENTS:
- Preserve all text content exactly as it appears
- Maintain the document's logical structure and reading order
- Do NOT add any content that isn't in the document
- Do NOT skip or summarize content`
        }
      ]
    }
  ],
  variables: {},
  description: 'Default prompt for document parsing/OCR',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

/**
 * Default categorize prompt (for categorize node)
 */
const defaultCategorizePrompt: PromptAsset = {
  id: 'default-categorize',
  version: '1.0.0',
  type: 'categorize',
  status: 'active',
  messages: [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'You are an expert at document classification. Analyze documents and assign them to the most appropriate category based on their content and characteristics.'
        }
      ]
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analyze this document and classify it into one of the following categories:

AVAILABLE CATEGORIES:
{{categories}}

INSTRUCTIONS:
- Examine the document's content, structure, and purpose
- Choose the single most appropriate category
- Base your decision on clear evidence from the document
- Return only the category name, exactly as listed above

Return your response as JSON: { "category": "chosen_category" }`
        }
      ]
    }
  ],
  variables: {
    categories: {
      type: 'string',
      required: true,
      description: 'List of available categories (formatted as bullet points or numbered list)',
      source: 'auto',
      overridable: false
    }
  },
  description: 'Default prompt for document categorization',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Register all default prompts
registerPrompt(defaultExtractionPrompt);
registerPrompt(defaultParsePrompt);
registerPrompt(defaultCategorizePrompt);
