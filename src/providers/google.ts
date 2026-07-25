import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types';

export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  private clientReady: Promise<any>;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gemini-2.5-flash-lite') {
    this.defaultModel = defaultModel;
    const key = apiKey || process.env.GOOGLE_API_KEY || process.env.VISION_API_KEY || '';
    this.clientReady = (async () => {
      try {
        // @ts-expect-error — optional peer dep
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        return new GoogleGenerativeAI(key);
      } catch {
        throw new Error(
          'Missing dependency: npm install @google/generative-ai. Also set GOOGLE_API_KEY env var.'
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

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const genModel = c.getGenerativeModel({ model });

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const requestOptions: Record<string, unknown> = {};
    if (options?.temperature !== undefined) requestOptions.temperature = options.temperature;
    if (options?.maxTokens !== undefined) requestOptions.maxOutputTokens = options.maxTokens;
    if (options?.topP !== undefined) requestOptions.topP = options.topP;
    if (options?.stop) requestOptions.stopSequences = options.stop;
    if (systemMsg) requestOptions.systemInstruction = { parts: [{ text: systemMsg.content }] };

    const result = await genModel.generateContent({ contents, generationConfig: requestOptions });
    const response = result.response;
    const text = response.text();

    return {
      content: text,
      model,
      finishReason: response.candidates?.[0]?.finishReason,
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
    const chatMessages = messages.filter(m => m.role !== 'system');

    const genModel = c.getGenerativeModel({ model });

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const requestOptions: Record<string, unknown> = {};
    if (options?.temperature !== undefined) requestOptions.temperature = options.temperature;
    if (options?.maxTokens !== undefined) requestOptions.maxOutputTokens = options.maxTokens;
    if (systemMsg) requestOptions.systemInstruction = { parts: [{ text: systemMsg.content }] };

    const result = await genModel.generateContentStream({ contents, generationConfig: requestOptions });

    let fullContent = '';
    for await (const chunk of result) {
      const text = chunk.text();
      if (text) {
        fullContent += text;
        onChunk(text);
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
    return ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
  }

  async validateConfig(): Promise<boolean> {
    return !!(process.env.GOOGLE_API_KEY || process.env.VISION_API_KEY);
  }
}
