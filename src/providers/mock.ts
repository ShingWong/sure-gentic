import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types.js';
import { messageText } from './multimodal.js';

export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const last = messages[messages.length - 1];
    // Demo tool-use: answer directly when the last message is a tool result,
    // otherwise emit a matching tool call so the example chatbot exercises
    // runToolLoop end-to-end without an API key.
    if (options?.tools?.length && last.role === 'tool') {
      return {
        content: formatToolAnswer(last.name || '', messageText(last.content)),
        model: 'mock-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
      };
    }
    if (options?.tools?.length && !(last as Message).toolCalls?.length) {
      const text = messageText(last.content);
      const offered = new Set(options.tools.map(t => t.function.name));
      const call = mockToolCall(text, offered);
      if (call) {
        return {
          content: '',
          model: 'mock-model',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'tool_calls',
          toolCalls: [call],
        };
      }
    }
    return {
      content: `Mock response to: ${messageText(last.content).slice(0, 50)}...`,
      model: 'mock-model',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    };
  }

  async completeStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    _options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const last = messages[messages.length - 1];
    const response = `Mock streaming response to: ${messageText(last.content).slice(0, 50)}...`;
    for (const char of response) {
      onChunk(char);
    }
    return {
      content: response,
      model: 'mock-model',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    };
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(messages.reduce((sum, m) => sum + messageText(m.content).length, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['mock-model'];
  }
}

/** Pick a demo tool call from user text when that tool is offered. */
function mockToolCall(text: string, offered: Set<string>): { id: string; name: string; arguments: Record<string, unknown> } | undefined {
  const lower = text.toLowerCase();
  const id = `mock_${Math.random().toString(36).slice(2, 8)}`;
  // Math: "calculate 12*8", "what is 15 + 27?", "compute ..."
  const math = text.match(/(\d[\d\s.,+\-*/()^%]*\d|\d)\s*([+\-*/])\s*(\d[\d\s.,+\-*/()^%]*)/);
  if (offered.has('calculator') && (lower.includes('calculat') || lower.includes('compute') || lower.includes('math') || math)) {
    const expr = math ? math[0].trim() : '2 + 2';
    return { id, name: 'calculator', arguments: { expression: expr } };
  }
  if (offered.has('current_time') && /(^|\W)(time|date|clock|today|day is it)(\W|$)/.test(lower)) {
    return { id, name: 'current_time', arguments: {} };
  }
  if (offered.has('web_search') && /(search|who is|what is|latest|news|look up|lookup|find)/.test(lower)) {
    const query = text.replace(/^(please\s+)?(search( for)?|look up|find)\s*/i, '').slice(0, 120) || text.slice(0, 120);
    return { id, name: 'web_search', arguments: { query, max_results: 3 } };
  }
  return undefined;
}

/** Turn a JSON tool result into a readable mock answer. */
function formatToolAnswer(name: string, raw: string): string {
  let data: any = raw;
  try { data = JSON.parse(raw); } catch { /* plain text */ }
  if (name === 'calculator' && data && typeof data === 'object') {
    return `${data.expression || 'Expression'} = ${data.result ?? raw} (mock calculation)`;
  }
  if (name === 'current_time' && data && typeof data === 'object') {
    return `Current time: ${data.formatted || data.timestamp || raw} (${data.timezone || 'UTC'}) [mock]`;
  }
  if (name === 'web_search' && Array.isArray(data)) {
    const lines = data.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.title || '(untitled)'} — ${r.snippet || ''} (${r.url || ''})`);
    return `Top results (mock search):\n${lines.join('\n')}`;
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return `${name || 'Tool'} result (mock): ${text.slice(0, 400)}`;
}
