import type { ProviderType } from './types';

export interface SureGenticConfig {
  provider?: ProviderType;
  apiKey?: string;
  model?: string;
  temperature: number;
  ollamaBaseUrl: string;
}

export function loadConfig(): SureGenticConfig {
  return {
    provider: (process.env.AI_PROVIDER as ProviderType) || undefined,
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_GEMINI_API_KEY,
    model: process.env.AI_MODEL,
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  };
}
