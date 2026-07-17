import type { LLMProvider, AgentContext, Skill, SkillResult } from './types';
import { LLMProviderFactory } from './providers/factory';
import { loadConfig } from './config';
import { registerBuiltinTools } from './tools/builtin';

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  mock: 'mock-model',
};

export class Agent {
  public readonly context: AgentContext;
  public readonly factory: LLMProviderFactory;

  constructor(provider?: LLMProvider) {
    registerBuiltinTools();
    this.factory = LLMProviderFactory.getInstance();
    const config = loadConfig();
    const resolvedProvider = provider || this.factory.initializeFromEnv(config.provider);
    this.context = {
      provider: resolvedProvider,
      model: config.model || DEFAULT_MODELS[resolvedProvider.name] || '',
      temperature: config.temperature,
    };
  }

  async run<T>(skill: Skill<T>, context: T): Promise<SkillResult> {
    try {
      const result = await skill.execute(context);
      return { success: true, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
