import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types.js'
import { nodeEnv } from '../config.js'
import { toOpenAIContent } from './multimodal.js'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

function toWireMessages(messages: Message[]): Record<string, unknown>[] {
  return messages.map((m) => ({
    role: m.role,
    content: toOpenAIContent(m.content),
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
  }))
}

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

function headers(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://persona-bot.local',
    'X-Title': 'Persona Bot',
  }
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter'
  private apiKey: string
  private defaultModel: string

  constructor(apiKey?: string, defaultModel?: string) {
    const env = nodeEnv();
    this.apiKey = apiKey || env.OPENROUTER_API_KEY || env.VISION_API_KEY || ''
    this.defaultModel = defaultModel || env.AI_MODEL || 'openai/gpt-4o'
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    if (!this.apiKey) throw new Error('OpenRouter API key not configured. Add it via the Keys dialog.')
    const model = options?.model || this.defaultModel
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: headers(this.apiKey),
      body: JSON.stringify({
        model, messages: toWireMessages(messages),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stop: options?.stop,
        ...(options?.tools?.length ? { tools: options.tools, tool_choice: options.toolChoice || 'auto' } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter ${res.status}: ${text || res.statusText}`)
    }
    const data = await res.json()
    const choice = data.choices?.[0]
    const rawCalls = choice?.message?.tool_calls || []
    return {
      content: choice?.message?.content || '',
      model: data.model || model,
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens || 0, completionTokens: data.usage.completion_tokens || 0, totalTokens: data.usage.total_tokens || 0 } : undefined,
      finishReason: choice?.finish_reason,
      id: data.id,
      toolCalls: rawCalls.map((tc: any) => ({
        id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
        name: tc.function?.name || '',
        arguments: safeParseArgs(tc.function?.arguments),
      })),
    }
  }

  async completeStream(messages: Message[], onChunk: (chunk: string) => void, options?: CompletionOptions): Promise<CompletionResponse> {
    if (!this.apiKey) throw new Error('OpenRouter API key not configured.')
    const model = options?.model || this.defaultModel
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { ...headers(this.apiKey), Accept: 'text/event-stream' },
      body: JSON.stringify({ model, messages: toWireMessages(messages), stream: true, temperature: options?.temperature ?? 0.7, max_tokens: options?.maxTokens, ...(options?.tools?.length ? { tools: options.tools, tool_choice: options.toolChoice || 'auto' } : {}) }),
    })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`OpenRouter ${res.status}: ${t || res.statusText}`) }
    let fullContent = ''
    let finishReason: string | undefined
    for await (const chunk of res.body as any) {
      const text = new TextDecoder().decode(chunk)
      for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
        const json = line.slice(6).trim()
        if (json === '[DONE]') continue
        try {
          const d = JSON.parse(json)
          const delta = d.choices?.[0]
          if (delta?.delta?.content) { fullContent += delta.delta.content; onChunk(delta.delta.content) }
          if (delta?.finish_reason) finishReason = delta.finish_reason
        } catch { /* skip unparseable */ }
      }
    }
    return { content: fullContent, model, finishReason }
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((s, m) => s + contentLength(m.content), 0) / 4)
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.apiKey) return this._defaultModels()
    try {
      const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return this._defaultModels()
      const data = await res.json()
      return (data.data || [])
        .filter((m: any) => (m.architecture?.modality || '').includes('text'))
        .map((m: any) => m.id)
        .sort()
    } catch {
      return this._defaultModels()
    }
  }

  private _defaultModels(): string[] {
    return [
      'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4-turbo',
      'anthropic/claude-sonnet-4-20250514', 'anthropic/claude-3.5-haiku', 'anthropic/claude-opus-4-20250514',
      'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct', 'meta-llama/llama-3.2-90b-vision',
      'qwen/qwen3.6-plus', 'qwen/qwen3.5-plus', 'qwen/qwen-2.5-72b-instruct',
      'mistralai/mistral-7b-instruct', 'mistralai/mistral-large',
      'deepseek/deepseek-r1', 'deepseek/deepseek-chat',
      'cohere/command-r-plus',
    ]
  }

  async validateConfig(): Promise<boolean> {
    return !!this.apiKey
  }
}

function contentLength(content: Message['content']): number {
  if (typeof content === 'string') return content.length
  return content.reduce((s, p) => {
    if (p.type === 'text') return s + p.text.length
    if (p.type === 'image_url') return s + p.image_url.url.length
    return s + p.file.data.length
  }, 0)
}
