import type { LLMProvider, Message, CompletionOptions } from '../types';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: any = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key) {
      // @ts-expect-error optional peer dep
      import('openai').then((mod) => {
        this.client = new mod.default({ apiKey: key });
      });
    }
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<string> {
    if (!this.client) {
      // @ts-expect-error optional peer dep
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4o',
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });
    return response.choices[0]?.message?.content || '';
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
  }
}
