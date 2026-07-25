import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private clientReady: Promise<any>;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'claude-sonnet-4-20250514') {
    this.defaultModel = defaultModel;
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    this.clientReady = (async () => {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      return new Anthropic({ apiKey: key });
    })();
  }

  private async client(): Promise<any> {
    return await this.clientReady;
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

    const response = await c.messages.create({
      model,
      system: systemMsg?.content,
      messages: chatMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
    });

    return {
      content: response.content.map((b: any) => 'text' in b ? b.text : '').join(''),
      model: response.model,
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      },
      finishReason: response.stop_reason,
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
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

    const stream = await c.messages.create({
      model,
      system: systemMsg?.content,
      messages: chatMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    });

    let fullContent = '';
    let responseId = '';
    let responseModel = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | undefined;
    for await (const event of stream) {
      if (event.type === 'message_start') {
        responseId = event.message.id;
        responseModel = event.message.model;
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === 'content_block_delta') {
        const content = (event.delta as any).text || '';
        fullContent += content;
        onChunk(content);
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens;
        finishReason = event.delta.stop_reason || 'stop';
      }
    }

    return {
      content: fullContent,
      model: responseModel || model,
      usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens },
      finishReason,
      id: responseId,
    };
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['claude-sonnet-4-20250514', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
  }

  async validateConfig(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}
