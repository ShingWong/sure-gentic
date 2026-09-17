import type { ProviderType } from './types.js';

export interface SureGenticConfig {
  provider?: ProviderType;
  apiKey?: string;
  model?: string;
  temperature: number;
  ollamaBaseUrl: string;
}

export function nodeEnv(): Record<string, string | undefined> {
  return typeof process !== 'undefined' ? process.env : {};
}

export function loadConfig(): SureGenticConfig {
  const env = nodeEnv();
  return {
    provider: (env.AI_PROVIDER as ProviderType) || undefined,
    apiKey: env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GOOGLE_GEMINI_API_KEY,
    model: env.AI_MODEL,
    temperature: parseFloat(env.AI_TEMPERATURE || '0.7'),
    ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
  };
}
