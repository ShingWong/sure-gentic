import type { LLMProvider, Message, CompletionOptions, CompletionResponse, ContentPart } from '../types';

/** Convert content parts to Gemini inlineData/text format */
function toGeminiParts(content: string | ContentPart[]): any[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(c => {
    if (c.type === 'text') return { text: c.text };
    if (c.type === 'image_url') {
      const m = c.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (m) return { inlineData: { mimeType: m[1], data: m[2] } };
      return { fileData: { fileUri: c.image_url.url, mimeType: 'image/png' } };
    }
    if (c.type === 'file') return { inlineData: { mimeType: c.file.mimeType, data: c.file.data } };
    return { text: '' };
  });
}

export class GoogleAIStudioProvider implements LLMProvider {
  readonly name = 'google';
  private clientReady: Promise<any>;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gemini-2.5-flash-lite') {
    this.defaultModel = defaultModel;
    const key = apiKey || process.env.GOOGLE_API_KEY || process.env.VISION_API_KEY || '';
    this.clientReady = (async () => {
      try {
        // @ts-expect-error
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        return new GoogleGenerativeAI(key);
      } catch {
        throw new Error('npm install @google/generative-ai. Get a key at aistudio.google.com → API Keys → Create Key.');
      }
    })();
  }

  private async client(): Promise<any> { return this.clientReady; }

  private buildContents(messages: Message[]) {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    return {
      contents: chatMessages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(m.content) })),
      systemInstruction: systemMsg ? { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : '[system]' }] } : undefined,
    };
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const genModel = c.getGenerativeModel({ model });
    const { contents, systemInstruction } = this.buildContents(messages);

    const config: Record<string, unknown> = {};
    if (options?.temperature !== undefined) config.temperature = options.temperature;
    if (options?.maxTokens !== undefined) config.maxOutputTokens = options.maxTokens;
    if (options?.topP !== undefined) config.topP = options.topP;
    if (systemInstruction) config.systemInstruction = systemInstruction;

    const result = await genModel.generateContent({ contents, generationConfig: config });
    return { content: result.response.text(), model, finishReason: result.response.candidates?.[0]?.finishReason };
  }

  async completeStream(messages: Message[], onChunk: (chunk: string) => void, options?: CompletionOptions): Promise<CompletionResponse> {
    const c = await this.client();
    const model = options?.model || this.defaultModel;
    const genModel = c.getGenerativeModel({ model });
    const { contents, systemInstruction } = this.buildContents(messages);

    const config: Record<string, unknown> = {};
    if (options?.temperature !== undefined) config.temperature = options.temperature;
    if (options?.maxTokens !== undefined) config.maxOutputTokens = options.maxTokens;
    if (systemInstruction) config.systemInstruction = systemInstruction;

    const result = await genModel.generateContentStream({ contents, generationConfig: config });
    let full = '';
    for await (const chunk of result) { const t = chunk.text(); if (t) { full += t; onChunk(t); } }
    return { content: full, model };
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
