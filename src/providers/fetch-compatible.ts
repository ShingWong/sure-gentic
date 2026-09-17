import type { LLMProvider, Message, CompletionOptions, CompletionResponse, ToolCall } from '../types';

/**
 * Fetch-only OpenAI-compatible provider. Zero imports — no `openai` SDK,
 * no node builtins — so it runs in browsers, Thunderbird extensions, and
 * any fetch-capable runtime. Same options shape as OpenAICompatibleProvider,
 * so provider setup / model selection config transfers directly.
 */
export class FetchCompatibleProvider implements LLMProvider {
  readonly name = 'fetch-compatible';
  readonly label: string;
  private baseURL: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(options?: {
    apiKey?: string;
    baseURL?: string;
    defaultModel?: string;
    label?: string;
  }) {
    this.baseURL = (options?.baseURL || 'http://localhost:8080/v1').replace(/\/+$/, '');
    this.apiKey = options?.apiKey || 'not-needed';
    this.defaultModel = options?.defaultModel || 'gpt-4o';
    this.label = options?.label || 'fetch-compatible';
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const model = options?.model || this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
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
        ...(m.name ? { name: m.name } : {}),
      })),
      temperature: options?.temperature ?? 0,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(options?.tools?.length
        ? { tools: options.tools, tool_choice: options.toolChoice || 'auto' }
        : {}),
    };
    const resp = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason?: string }[];
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      id?: string;
    };
    const msg = data.choices?.[0]?.message || {};
    const toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(tc.function?.arguments || '{}');
        if (typeof parsed === 'object' && parsed !== null) args = parsed as Record<string, unknown>;
      } catch { /* {} */ }
      return { id: tc.id, name: tc.function?.name || '', arguments: args };
    });
    return {
      content: msg.content || '',
      toolCalls,
      model: data.model || model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
      id: data.id,
    };
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(
      messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 200), 0) / 4,
    );
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.baseURL}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      if (!resp.ok) return [this.defaultModel];
      const data = (await resp.json()) as { data?: { id: string }[] };
      return data.data?.map((m) => m.id) || [this.defaultModel];
    } catch {
      return [this.defaultModel];
    }
  }
}
