import type { LLMProvider, Message, CompletionOptions, CompletionResponse, ContentPart } from '../types';

export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  private clientReady: Promise<any>;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gemini-2.5-flash-lite', baseUrl?: string) {
    this.defaultModel = defaultModel;
    const key = apiKey || process.env.GOOGLE_API_KEY || process.env.VISION_API_KEY || '';
    this.clientReady = (async () => {
      try {
        // @ts-expect-error — optional peer dep
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        return new GoogleGenerativeAI(key, baseUrl ? { baseUrl } : undefined);
      } catch {
        throw new Error(
          'npm install @google/generative-ai. Set GOOGLE_API_KEY for AI Studio, or GOOGLE_VERTEX_KEY + GOOGLE_VERTEX_LOCATION for Vertex AI.'
        );
      }
    })();
  }

  private async client(): Promise<any> {
    return await this.clientReady;
  }

  /** Convert a single message's content (string or ContentPart[]) to Gemini parts[] */
  private toParts(content: string | ContentPart[]): any[] {
    if (typeof content === 'string') return [{ text: content }];
    return content.map(c => {
      if (c.type === 'text') return { text: c.text };
      if (c.type === 'image_url') {
        // data:image/png;base64,xxxxx
        const match = c.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
        // Remote URL — Gemini supports it directly
        return { fileData: { fileUri: c.image_url.url, mimeType: 'image/png' } };
      }
      if (c.type === 'file') {
        return { inlineData: { mimeType: c.file.mimeType, data: c.file.data } };
      }
      return { text: '' };
    });
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const genModel = c.getGenerativeModel({ model });

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: this.toParts(m.content),
    }));

    const requestOptions: Record<string, unknown> = {};
    if (options?.temperature !== undefined) requestOptions.temperature = options.temperature;
    if (options?.maxTokens !== undefined) requestOptions.maxOutputTokens = options.maxTokens;
    if (options?.topP !== undefined) requestOptions.topP = options.topP;
    if (options?.stop) requestOptions.stopSequences = options.stop;
    if (systemMsg) {
      requestOptions.systemInstruction = { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : systemMsg.content.map(p => p.type === 'text' ? p.text : '').join('\n') }] };
    }

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
    const genModel = c.getGenerativeModel({ model });

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: this.toParts(m.content),
    }));

    const requestOptions: Record<string, unknown> = {};
    if (options?.temperature !== undefined) requestOptions.temperature = options.temperature;
    if (options?.maxTokens !== undefined) requestOptions.maxOutputTokens = options.maxTokens;
    if (systemMsg) {
      requestOptions.systemInstruction = { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : systemMsg.content.map(p => p.type === 'text' ? p.text : '').join('\n') }] };
    }

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
    return Math.ceil(messages.reduce((s, m) => {
      if (typeof m.content === 'string') return s + m.content.length;
      return s + m.content.reduce((a, c) => a + (c.type === 'text' ? c.text.length : 0), 0);
    }, 0) / 4);
  }

  async getAvailableModels(): Promise<string[]> {
    return ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
  }

  async validateConfig(): Promise<boolean> {
    return !!(process.env.GOOGLE_API_KEY || process.env.VISION_API_KEY);
  }
}
