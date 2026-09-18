import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types.js';
import { nodeEnv } from '../config.js';

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toOpenAIMessages(messages: Message[]): Record<string, unknown>[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.toolCalls?.length
      ? {
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
          })),
        }
      : {}),
    ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    ...(m.role === 'tool' && m.name ? { name: m.name } : {}),
  }));
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private clientReady: Promise<any>;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gpt-4o') {
    this.defaultModel = defaultModel;
    const key = apiKey || nodeEnv().OPENAI_API_KEY;
    this.clientReady = (async () => {
      const { default: OpenAI } = await import('openai');
      return new OpenAI({ apiKey: key });
    })();
  }

  private async client(): Promise<any> {
    return await this.clientReady;
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const requestOptions =
      options?.timeoutMs && options.timeoutMs > 0 ? { timeout: options.timeoutMs } : undefined;
    const response = await c.chat.completions.create({
      model,
      messages: toOpenAIMessages(messages),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stop: options?.stop,
      ...(options?.tools?.length ? { tools: options.tools, tool_choice: options.toolChoice || 'auto' } : {}),
    }, ...(requestOptions ? [requestOptions] : []));
    const choice = response.choices[0];
    const rawCalls = choice?.message?.tool_calls || [];
    return {
      content: choice?.message?.content || '',
      toolCalls: rawCalls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        arguments: safeParseArgs(tc.function?.arguments),
      })),
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
    return Math.ceil(messages.reduce((s, m) => s + contentLength(m.content), 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
  }

  async validateConfig(): Promise<boolean> {
    return !!nodeEnv().OPENAI_API_KEY;
  }
}

function contentLength(content: Message['content']): number {
  if (typeof content === 'string') return content.length;
  return content.reduce((s, p) => {
    if (p.type === 'text') return s + p.text.length;
    if (p.type === 'image_url') return s + p.image_url.url.length;
    return s + p.file.data.length;
  }, 0);
}
