import type { LLMProvider, AgentContext, Skill, SkillResult, Message } from './types.js';
import { LLMProviderFactory } from './providers/factory.js';
import { loadConfig } from './config.js';
import { registerBuiltinTools } from './tools/builtin.js';
import { ToolRegistryService } from './tools/registry.js';

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
    const resolvedProvider = provider || this.factory.initializeFromEnv().defaultProvider;
    if (!resolvedProvider) {
      throw new Error('No LLM provider available. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or use mock provider.');
    }
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
      const sanitized = message.replace(/(sk-[a-zA-Z0-9]{10,}|AIza[0-9A-Za-z_-]{35}|ant-api[0-9a-f]{32})/g, '[API KEY REDACTED]');
      return { success: false, error: sanitized };
    }
  }

  /**
   * Bounded agentic loop: send messages + registry tool schemas, execute
   * any returned tool_calls via the registry, append results, repeat until
   * the model answers with text or maxRounds is hit. Non-breaking addition:
   * existing single-shot run() is untouched.
   *
   * Budget: up to maxRounds tool rounds plus one final no-tools closing
   * call if maxRounds exhausts without a text answer.
   *
   * Returns the final text plus the names of tools that fired (for citation).
   */
  async runToolLoop(
    messages: Message[],
    options?: { maxRounds?: number; toolContext?: { sessionId?: string; userId?: string; metadata?: Record<string, unknown> } },
  ): Promise<SkillResult & { data: string; toolsUsed: string[] }> {
    const maxRounds = Math.min(Math.max(options?.maxRounds ?? 5, 1), 10);
    const registry = ToolRegistryService.getInstance();
    const tools = registry.getOpenAITools();
    const convo: Message[] = [...messages];
    const toolsUsed: string[] = [];
    try {
      for (let round = 0; round < maxRounds; round++) {
        const resp = await this.context.provider.complete(convo, {
          model: this.context.model || undefined,
          temperature: this.context.temperature,
          tools: tools.length ? tools : undefined,
          toolChoice: tools.length ? 'auto' : undefined,
        });
        if (resp.toolCalls && resp.toolCalls.length) {
          convo.push({
            role: 'assistant',
            content: resp.content || '',
            toolCalls: resp.toolCalls,
          });
          for (const tc of resp.toolCalls.slice(0, 4)) {
            if (!toolsUsed.includes(tc.name)) toolsUsed.push(tc.name);
            let result: unknown;
            try {
              const exec = await registry.execute(
                tc.name, tc.arguments || {},
                { sessionId: options?.toolContext?.sessionId, userId: options?.toolContext?.userId, metadata: options?.toolContext?.metadata },
              );
              result = exec.success ? exec.result : `Tool error: ${exec.error}`;
            } catch (err) {
              result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
            }
            convo.push({
              role: 'tool',
              content: String(result ?? '(empty)').slice(0, 6000),
              toolCallId: tc.id,
              name: tc.name,
            });
          }
          continue;
        }
        return { success: true, data: resp.content || '(empty answer)', toolsUsed };
      }
      // Out of rounds with no text answer: one final pass with NO
      // tools forces the model to answer from everything gathered
      // instead of dying on '(agent hit max rounds without answering)'.
      // The closing call deliberately omits tools; any toolCalls it
      // returns anyway are ignored in favor of its text content.
      try {
        const closing = await this.context.provider.complete(
          [...convo,
            { role: 'user',
              content: 'Answer the original request now, using only the tool results above. Do not call any more tools.' },
          ],
          { model: this.context.model || undefined,
            temperature: this.context.temperature },
        );
        return { success: true, data: closing.content || '(empty answer)', toolsUsed };
      } catch (closeErr) {
        const message = closeErr instanceof Error ? closeErr.message : String(closeErr);
        return { success: true, data: '(agent hit max rounds without answering)', error: message, toolsUsed };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const sanitized = message.replace(/(sk-[a-zA-Z0-9]{10,}|AIza[0-9A-Za-z_-]{35}|ant-api[0-9a-f]{32})/g, '[API KEY REDACTED]');
      return { success: false, data: '', error: sanitized, toolsUsed };
    }
  }
}
