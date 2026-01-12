/**
 * Known model capabilities for accurate reporting.
 * Unknown models get sensible defaults and work with OpenRouter.
 */

export interface KnownModelInfo {
  supportsVision: boolean;
  supportsReasoning: boolean;
  maxContextTokens?: number;
}

/**
 * Prefix-based matching for model families.
 * More specific prefixes should come before less specific ones.
 * Data sourced from OpenRouter API: https://openrouter.ai/api/v1/models
 */
export const KNOWN_MODEL_PREFIXES: Record<string, KnownModelInfo> = {
  // Qwen models - VL variants support vision, thinking variants support reasoning
  'qwen/qwen3-vl-235b-a22b-thinking': { supportsVision: true, supportsReasoning: true, maxContextTokens: 262144 },
  'qwen/qwen3-vl-235b-a22b': { supportsVision: true, supportsReasoning: false, maxContextTokens: 262144 },
  'qwen/qwen3-vl-30b-a3b-thinking': { supportsVision: true, supportsReasoning: true, maxContextTokens: 131072 },
  'qwen/qwen3-vl-30b-a3b': { supportsVision: true, supportsReasoning: false, maxContextTokens: 262144 },
  'qwen/qwen3-vl-8b-thinking': { supportsVision: true, supportsReasoning: true, maxContextTokens: 256000 },
  'qwen/qwen3-vl-8b': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'qwen/qwen3-vl': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'qwen/qwen-vl-max': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'qwen/qwen-vl-plus': { supportsVision: true, supportsReasoning: false, maxContextTokens: 7500 },
  'qwen/qwen2.5-vl': { supportsVision: true, supportsReasoning: false, maxContextTokens: 32768 },
  'qwen/qwq': { supportsVision: false, supportsReasoning: true, maxContextTokens: 32768 },
  'qwen/qwen3-235b-a22b-thinking': { supportsVision: false, supportsReasoning: true, maxContextTokens: 262144 },
  'qwen/qwen3-235b-a22b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'qwen/qwen3-30b-a3b-thinking': { supportsVision: false, supportsReasoning: true, maxContextTokens: 32768 },
  'qwen/qwen3-30b-a3b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 262144 },
  'qwen/qwen3-next-80b-a3b-thinking': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'qwen/qwen3-next-80b-a3b': { supportsVision: false, supportsReasoning: false, maxContextTokens: 262144 },
  'qwen/qwen3-coder': { supportsVision: false, supportsReasoning: true, maxContextTokens: 262144 },
  'qwen/qwen3-max': { supportsVision: false, supportsReasoning: false, maxContextTokens: 256000 },
  'qwen/qwen3-32b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'qwen/qwen3-14b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'qwen/qwen3-8b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 128000 },
  'qwen/qwen3-4b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'qwen/qwen-plus-2025-07-28:thinking': { supportsVision: false, supportsReasoning: true, maxContextTokens: 1000000 },
  'qwen/qwen-plus': { supportsVision: false, supportsReasoning: false, maxContextTokens: 1000000 },
  'qwen/qwen-turbo': { supportsVision: false, supportsReasoning: false, maxContextTokens: 1000000 },
  'qwen/qwen-max': { supportsVision: false, supportsReasoning: false, maxContextTokens: 32768 },
  'qwen/qwen-2.5': { supportsVision: false, supportsReasoning: false, maxContextTokens: 32768 },

  // Llama 4 models (vision capable)
  'meta-llama/llama-4-maverick': { supportsVision: true, supportsReasoning: false, maxContextTokens: 1048576 },
  'meta-llama/llama-4-scout': { supportsVision: true, supportsReasoning: false, maxContextTokens: 327680 },
  'meta-llama/llama-guard-4': { supportsVision: true, supportsReasoning: false, maxContextTokens: 163840 },

  // Llama 3.x models - 3.2 vision variants support images
  'meta-llama/llama-3.2-90b-vision': { supportsVision: true, supportsReasoning: false, maxContextTokens: 32768 },
  'meta-llama/llama-3.2-11b-vision': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'meta-llama/llama-3.3': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },
  'meta-llama/llama-3.2': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },
  'meta-llama/llama-3.1': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },
  'meta-llama/llama-3': { supportsVision: false, supportsReasoning: false, maxContextTokens: 8192 },

  // DeepSeek models - all support reasoning except base chat
  'deepseek/deepseek-r1': { supportsVision: false, supportsReasoning: true, maxContextTokens: 163840 },
  'deepseek/deepseek-v3': { supportsVision: false, supportsReasoning: true, maxContextTokens: 163840 },
  'deepseek/deepseek-chat-v3': { supportsVision: false, supportsReasoning: true, maxContextTokens: 163840 },
  'deepseek/deepseek-chat': { supportsVision: false, supportsReasoning: false, maxContextTokens: 163840 },
  'deepseek/deepseek-prover': { supportsVision: false, supportsReasoning: false, maxContextTokens: 163840 },

  // GLM models (Zhipu AI / Z.AI)
  'z-ai/glm-4.6v': { supportsVision: true, supportsReasoning: true, maxContextTokens: 131072 },
  'z-ai/glm-4.5v': { supportsVision: true, supportsReasoning: true, maxContextTokens: 65536 },
  'z-ai/glm-4.6': { supportsVision: false, supportsReasoning: true, maxContextTokens: 202752 },
  'z-ai/glm-4.5-air': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'z-ai/glm-4.5': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'z-ai/glm-4-32b': { supportsVision: false, supportsReasoning: false, maxContextTokens: 128000 },
  'thudm/glm-4.1v-9b-thinking': { supportsVision: true, supportsReasoning: true, maxContextTokens: 65536 },
  'thudm/glm': { supportsVision: false, supportsReasoning: false, maxContextTokens: 65536 },

  // Kimi / Moonshot models
  'moonshotai/kimi-dev-72b': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'moonshotai/kimi-k2-thinking': { supportsVision: false, supportsReasoning: true, maxContextTokens: 262144 },
  'moonshotai/kimi-k2-0905': { supportsVision: false, supportsReasoning: false, maxContextTokens: 262144 },
  'moonshotai/kimi-k2': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },

  // Mistral models - Mistral 3.x family supports vision
  'mistralai/mistral-large-2512': { supportsVision: true, supportsReasoning: false, maxContextTokens: 262144 },
  'mistralai/mistral-medium-3.1': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/mistral-medium-3': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/mistral-small-3.2': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/mistral-small-3.1': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/ministral-14b-2512': { supportsVision: true, supportsReasoning: false, maxContextTokens: 262144 },
  'mistralai/ministral-8b-2512': { supportsVision: true, supportsReasoning: false, maxContextTokens: 262144 },
  'mistralai/ministral-3b-2512': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/pixtral-large': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/pixtral-12b': { supportsVision: true, supportsReasoning: false, maxContextTokens: 32768 },
  'mistralai/pixtral': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/devstral': { supportsVision: false, supportsReasoning: false, maxContextTokens: 262144 },
  'mistralai/codestral': { supportsVision: false, supportsReasoning: false, maxContextTokens: 256000 },
  // Magistral reasoning models
  'mistralai/magistral-medium-2506': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'mistralai/magistral-small-2506': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'mistralai/magistral-medium': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'mistralai/magistral-small': { supportsVision: false, supportsReasoning: true, maxContextTokens: 40960 },
  'mistralai/mistral-large': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/mistral-small': { supportsVision: false, supportsReasoning: false, maxContextTokens: 32768 },
  'mistralai/mistral-nemo': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },
  'mistralai/mixtral': { supportsVision: false, supportsReasoning: false, maxContextTokens: 65536 },
  'mistralai/mistral-7b': { supportsVision: false, supportsReasoning: false, maxContextTokens: 32768 },

  // xAI Grok models - Grok 4 supports vision and reasoning
  'x-ai/grok-4.1-fast': { supportsVision: true, supportsReasoning: true, maxContextTokens: 2000000 },
  'x-ai/grok-4-fast': { supportsVision: true, supportsReasoning: true, maxContextTokens: 2000000 },
  'x-ai/grok-4': { supportsVision: true, supportsReasoning: true, maxContextTokens: 256000 },
  'x-ai/grok-code-fast': { supportsVision: false, supportsReasoning: true, maxContextTokens: 256000 },
  'x-ai/grok-3-mini': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'x-ai/grok-3': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },

  // Cohere Command models
  'cohere/command-a': { supportsVision: false, supportsReasoning: false, maxContextTokens: 256000 },
  'cohere/command-r': { supportsVision: false, supportsReasoning: false, maxContextTokens: 128000 },

  // Gemma models (Google open source) - Gemma 3 supports vision
  'google/gemma-3': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'google/gemma-3n': { supportsVision: false, supportsReasoning: false, maxContextTokens: 32768 },
  'google/gemma-2': { supportsVision: false, supportsReasoning: false, maxContextTokens: 8192 },

  // Phi models (Microsoft) - phi-4-multimodal supports vision, phi-4-reasoning supports reasoning
  'microsoft/phi-4-multimodal': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'microsoft/phi-4-reasoning': { supportsVision: false, supportsReasoning: true, maxContextTokens: 32768 },
  'microsoft/phi-4': { supportsVision: false, supportsReasoning: false, maxContextTokens: 16384 },
  'microsoft/phi-3': { supportsVision: false, supportsReasoning: false, maxContextTokens: 128000 },

  // OpenGVLab InternVL
  'opengvlab/internvl3': { supportsVision: true, supportsReasoning: false, maxContextTokens: 32768 },
  'opengvlab/internvl2': { supportsVision: true, supportsReasoning: false, maxContextTokens: 32768 },

  // StepFun AI - step3 supports both vision and reasoning
  'stepfun-ai/step3': { supportsVision: true, supportsReasoning: true, maxContextTokens: 65536 },
  'stepfun-ai/step2': { supportsVision: true, supportsReasoning: false, maxContextTokens: 131072 },
  'stepfun-ai/step1': { supportsVision: true, supportsReasoning: false, maxContextTokens: 32768 },

  // NVIDIA Nemotron - VL and ultra models support reasoning
  'nvidia/nemotron-nano-12b-v2-vl': { supportsVision: true, supportsReasoning: true, maxContextTokens: 131072 },
  'nvidia/nemotron-nano-9b-v2': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'nvidia/llama-3.3-nemotron-super': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'nvidia/llama-3.1-nemotron-ultra': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'nvidia/llama-3.1-nemotron': { supportsVision: false, supportsReasoning: false, maxContextTokens: 131072 },

  // Amazon Nova models - vision capable
  'amazon/nova-2-lite': { supportsVision: true, supportsReasoning: true, maxContextTokens: 1000000 },
  'amazon/nova-premier': { supportsVision: true, supportsReasoning: false, maxContextTokens: 1000000 },
  'amazon/nova-pro': { supportsVision: true, supportsReasoning: false, maxContextTokens: 300000 },
  'amazon/nova-lite': { supportsVision: true, supportsReasoning: false, maxContextTokens: 300000 },
  'amazon/nova-micro': { supportsVision: false, supportsReasoning: false, maxContextTokens: 128000 },

  // Baidu ERNIE models - VL variants support vision
  'baidu/ernie-4.5-vl': { supportsVision: true, supportsReasoning: true, maxContextTokens: 123000 },
  'baidu/ernie-4.5-thinking': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },
  'baidu/ernie-4.5': { supportsVision: false, supportsReasoning: false, maxContextTokens: 123000 },

  // ByteDance models
  'bytedance/ui-tars': { supportsVision: true, supportsReasoning: false, maxContextTokens: 128000 },

  // MiniMax models
  'minimax/minimax-01': { supportsVision: true, supportsReasoning: false, maxContextTokens: 1000192 },
  'minimax/minimax-m': { supportsVision: false, supportsReasoning: true, maxContextTokens: 1000000 },

  // Tencent Hunyuan
  'tencent/hunyuan': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },

  // Alibaba Tongyi
  'alibaba/tongyi-deepresearch': { supportsVision: false, supportsReasoning: true, maxContextTokens: 131072 },

  // Other notable models
  'databricks/dbrx': { supportsVision: false, supportsReasoning: false, maxContextTokens: 32768 },
};

/**
 * Default capabilities for unknown models.
 * Assumes a basic text-only model with reasonable defaults.
 */
export const DEFAULT_MODEL_INFO: KnownModelInfo = {
  supportsVision: false,
  supportsReasoning: false,
  maxContextTokens: 32768,
};

/**
 * Get model capabilities from registry or return defaults.
 * Uses prefix matching - more specific prefixes should be listed first.
 *
 * @param model - Full model ID (e.g., "qwen/qwen3-235b-a22b")
 * @returns Model capabilities (known or default)
 */
export function getModelInfo(model: string): KnownModelInfo {
  // Sort prefixes by length (longest first) for most specific match
  const sortedPrefixes = Object.keys(KNOWN_MODEL_PREFIXES).sort((a, b) => b.length - a.length);

  for (const prefix of sortedPrefixes) {
    if (model.startsWith(prefix)) {
      return KNOWN_MODEL_PREFIXES[prefix];
    }
  }

  return DEFAULT_MODEL_INFO;
}

/**
 * Check if a model is known to support vision.
 *
 * @param model - Full model ID
 * @returns true if model supports vision input
 */
export function modelSupportsVision(model: string): boolean {
  return getModelInfo(model).supportsVision;
}

/**
 * Check if a model is known to support reasoning tokens.
 *
 * @param model - Full model ID
 * @returns true if model supports reasoning/thinking mode
 */
export function modelSupportsReasoning(model: string): boolean {
  return getModelInfo(model).supportsReasoning;
}
