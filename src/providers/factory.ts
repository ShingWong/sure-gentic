import type { LLMProvider, ProviderType } from '../types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';

const PROVIDER_PRIORITY: ProviderType[] = ['openai', 'anthropic', 'mock'];

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

  getProvider(name?: string): LLMProvider {
    if (name && this.providers.has(name)) {
      return this.providers.get(name)!;
    }
    for (const type of PROVIDER_PRIORITY) {
      if (this.providers.has(type)) return this.providers.get(type)!;
    }
    return this.providers.get('mock') || new MockProvider();
  }

  initializeFromEnv(overrideProvider?: string): LLMProvider {
    const providerType = overrideProvider || process.env.AI_PROVIDER;

    if (!providerType || providerType === 'openai') {
      if (process.env.OPENAI_API_KEY) {
        const p = new OpenAIProvider();
        this.register(p);
        return p;
      }
    }
    if (!providerType || providerType === 'anthropic') {
      if (process.env.ANTHROPIC_API_KEY) {
        const p = new AnthropicProvider();
        this.register(p);
        return p;
      }
    }
    const mock = new MockProvider();
    this.register(mock);
    return mock;
  }

  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }
}
