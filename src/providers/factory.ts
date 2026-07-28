import type { LLMProvider, ProviderType } from '../types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OpenRouterProvider } from './openrouter';
import { MockProvider } from './mock';

const PROVIDER_PRIORITY: ProviderType[] = ['openai', 'anthropic', 'google', 'openai-compatible', 'openrouter', 'mock'];

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
    const registered: string[] = [];

    if (process.env.OPENAI_API_KEY && !process.env.VISION_BASE_URL) {
      const p = new OpenAIProvider();
      this.register(p);
      registered.push('openai');
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const p = new AnthropicProvider();
      this.register(p);
      registered.push('anthropic');
    }
    if (process.env.GOOGLE_API_KEY) {
      const p = new GoogleProvider();
      this.register(p);
      registered.push('google');
    }
    if (process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL) {
      const p = new OpenAICompatibleProvider({
        baseURL: process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL,
        apiKey: process.env.VISION_API_KEY || process.env.OPENAI_API_KEY,
      });
      this.register(p);
      registered.push('openai-compatible');
    }
    if (process.env.OPENROUTER_API_KEY) {
      const p = new OpenRouterProvider();
      this.register(p);
      registered.push('openrouter');
    }

    const hasReal = registered.length > 0;
    if (!hasReal && (process.env.AI_PROVIDER === 'mock' || process.env.NODE_ENV === 'test')) {
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
