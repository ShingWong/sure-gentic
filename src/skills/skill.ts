import type { Skill, SkillResult, AgentContext } from '../types';

export abstract class BaseSkill<TContext, TResult> implements Skill<TContext, TResult> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract execute(context: TContext): Promise<TResult>;

  protected async callLLM(
    agent: AgentContext,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    return agent.provider.complete(messages, {
      model: agent.model,
      temperature: agent.temperature,
    });
  }

  protected success(data: unknown): SkillResult {
    return { success: true, data };
  }

  protected error(message: string): SkillResult {
    return { success: false, error: message };
  }
}
