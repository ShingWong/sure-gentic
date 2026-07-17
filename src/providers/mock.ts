import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(messages: Message[], _options?: CompletionOptions): Promise<CompletionResponse> {
    const last = messages[messages.length - 1];
    return {
      content: `Mock response to: ${last.content.slice(0, 50)}...`,
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
    const response = `Mock streaming response to: ${last.content.slice(0, 50)}...`;
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
    return messages.reduce((sum, m) => sum + m.content.length, 0);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['mock-model'];
  }
}
