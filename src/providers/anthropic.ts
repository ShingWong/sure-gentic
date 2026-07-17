import type { LLMProvider, Message, CompletionOptions } from '../types';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: any = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      // @ts-expect-error optional peer dep
      import('@anthropic-ai/sdk').then((mod) => {
        this.client = new mod.default({ apiKey: key });
      });
    }
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<string> {
    if (!this.client) {
      // @ts-expect-error optional peer dep
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

    const response = await this.client.messages.create({
      model: options?.model || 'claude-sonnet-4-20250514',
      system: systemMsg?.content,
      messages: chatMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
    });

    return response.content.map((b: any) => 'text' in b ? b.text : '').join('');
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['claude-sonnet-4-20250514', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
  }
}
