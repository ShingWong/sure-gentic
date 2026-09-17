import type { LLMProvider, ProviderType } from '../types.js';
import { nodeEnv } from '../config.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleAIStudioProvider } from './google-aistudio.js';
import { GoogleVertexProvider } from './google-vertex.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { OpenRouterProvider } from './openrouter.js';
import { MockProvider } from './mock.js';

const PROVIDER_PRIORITY: ProviderType[] = ['openai', 'anthropic', 'google', 'google-vertex', 'openai-compatible', 'openrouter', 'mock'];

export class LLMProviderFactory {
  private static instance: LLMProviderFactory;
  private providers = new Map<string, LLMProvider>();

  static getInstance(): LLMProviderFactory {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = new LLMProviderFactory();
    }
    return LLMProviderFactory.instance;
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name?: string): LLMProvider | undefined {
    if (name && this.providers.has(name)) {
      return this.providers.get(name);
    }
    for (const type of PROVIDER_PRIORITY) {
      if (this.providers.has(type)) return this.providers.get(type);
    }
    return undefined;
  }

  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getAllProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  initializeFromEnv(): { registered: string[]; defaultProvider: LLMProvider | undefined } {
    if (typeof process === 'undefined') return { registered: [], defaultProvider: undefined };
    const env = nodeEnv();
    const registered: string[] = [];

    if (env.OPENAI_API_KEY && !env.VISION_BASE_URL) {
      const p = new OpenAIProvider();
      this.register(p);
      registered.push('openai');
    }
    if (env.ANTHROPIC_API_KEY) {
      const p = new AnthropicProvider();
      this.register(p);
      registered.push('anthropic');
    }
    if (env.GOOGLE_API_KEY) {
      const p = new GoogleAIStudioProvider();
      this.register(p);
      registered.push('google');
    }
    if (env.GOOGLE_VERTEX_PROJECT || env.GOOGLE_VERTEX_KEY) {
      const p = new GoogleVertexProvider();
      this.register(p);
      registered.push('google-vertex');
    }
    if (env.VISION_BASE_URL || env.OPENAI_BASE_URL) {
      const p = new OpenAICompatibleProvider({
        baseURL: env.VISION_BASE_URL || env.OPENAI_BASE_URL,
        apiKey: env.VISION_API_KEY || env.OPENAI_API_KEY,
      });
      this.register(p);
      registered.push('openai-compatible');
    }
    if (env.OPENROUTER_API_KEY) {
      const p = new OpenRouterProvider();
      this.register(p);
      registered.push('openrouter');
    }

    const hasReal = registered.length > 0;
    if (!hasReal && (env.AI_PROVIDER === 'mock' || env.NODE_ENV === 'test')) {
      const mock = new MockProvider();
      this.register(mock);
      registered.push('mock');
    }

    return {
      registered,
      defaultProvider: this.getProvider(),
    };
  }

  clear(): void {
    this.providers.clear();
  }
}
