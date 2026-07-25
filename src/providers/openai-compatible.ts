import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  private clientReady: Promise<any>;
  private defaultModel: string;
  private baseURL: string;
  readonly label: string;

  constructor(options?: {
    apiKey?: string;
    baseURL?: string;
    defaultModel?: string;
    label?: string;
  }) {
    this.defaultModel = options?.defaultModel || process.env.AI_MODEL || 'gpt-4o';
    this.baseURL = options?.baseURL || process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.label = options?.label || 'openai-compatible';
    const key = options?.apiKey || process.env.OPENAI_API_KEY || process.env.VISION_API_KEY || 'not-needed';
    const baseURL = this.baseURL;
    this.clientReady = (async () => {
      try {
        const { default: OpenAI } = await import('openai');
        return new OpenAI({ apiKey: key, baseURL });
      } catch {
        throw new Error(
          'Missing dependency: npm install openai. ' +
          'Set OPENAI_API_KEY (or VISION_API_KEY) and VISION_BASE_URL for custom endpoints.'
        );
      }
    })();
  }

  private async client(): Promise<any> {
    return await this.clientReady;
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const response = await c.chat.completions.create({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
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
    };
  }

  async completeStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const stream = await c.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });
    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0];
      if (delta?.delta?.content) {
        fullContent += delta.delta.content;
        onChunk(delta.delta.content);
      }
    }
    return {
      content: fullContent,
      model,
    };
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const c = await this.client();
      const models = await c.models.list();
      return models.data?.map((m: any) => m.id) || [this.defaultModel];
    } catch {
      return [this.defaultModel];
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!(this.baseURL && process.env.OPENAI_API_KEY);
  }
}
