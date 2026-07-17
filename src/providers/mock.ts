import type { LLMProvider, Message, CompletionOptions } from '../types';

export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(messages: Message[], _options?: CompletionOptions): Promise<string> {
    const last = messages[messages.length - 1];
    return `Mock response to: ${last.content.slice(0, 50)}...`;
  }

  async countTokens(messages: Message[]): Promise<number> {
    return messages.reduce((sum, m) => sum + m.content.length, 0);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['mock-model'];
  }
}
