import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: any = null;

  constructor(apiKey?: string, private defaultModel = 'gpt-4o') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key) {
      import('openai').then((mod) => {
        this.client = new mod.default({ apiKey: key });
      });
    }
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    if (!this.client) {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    const model = options?.model || this.defaultModel;
    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stop: options?.stop,
    });
    const choice = response.choices[0];
    return {
      content: choice?.message?.content || '',
      model: response.model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
      finishReason: choice?.finish_reason,
      id: response.id,
      created: response.created,
    };
  }

  async completeStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    if (!this.client) {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    const model = options?.model || this.defaultModel;
    const stream = await this.client.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });
    let fullContent = '';
    let finishReason: string | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0];
      if (delta?.delta?.content) {
        fullContent += delta.delta.content;
        onChunk(delta.delta.content);
      }
      if (delta?.finish_reason) {
        finishReason = delta.finish_reason;
      }
    }
    return {
      content: fullContent,
      model,
      finishReason,
    };
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
  }

  async validateConfig(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }
}
