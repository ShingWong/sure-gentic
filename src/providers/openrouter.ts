import { OpenAICompatibleProvider } from './openai-compatible'
import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter'
  private inner: OpenAICompatibleProvider
  private apiKey: string

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || process.env.VISION_API_KEY || ''
    this.inner = new OpenAICompatibleProvider({
      apiKey: this.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultModel: defaultModel || process.env.AI_MODEL || 'qwen/qwen3.6-plus',
    })
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    return this.inner.complete(messages, options)
  }

  async completeStream(messages: Message[], onChunk: (chunk: string) => void, options?: CompletionOptions): Promise<CompletionResponse> {
    return this.inner.completeStream(messages, onChunk, options)
  }

  async countTokens(messages: Message[]): Promise<number> {
    return this.inner.countTokens(messages)
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.apiKey) return this._defaultModels()
    try {
      const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      if (!res.ok) return this._defaultModels()
      const data = await res.json()
      return (data.data || []).map((m: any) => m.id).sort()
    } catch {
      return this._defaultModels()
    }
  }

  private _defaultModels(): string[] {
    return [
      'qwen/qwen3.6-plus', 'qwen/qwen3.5-plus', 'qwen/qwen-2.5-72b-instruct',
      'google/gemini-2.5-flash-lite', 'google/gemini-2.5-pro',
      'anthropic/claude-sonnet-4-20250514', 'anthropic/claude-3.5-haiku',
      'meta-llama/llama-3.2-11b-vision', 'meta-llama/llama-3.3-70b-instruct',
      'glm-4v-plus', 'mistralai/mistral-7b-instruct',
    ]
  }

  async validateConfig(): Promise<boolean> {
    return !!this.apiKey
  }
}
