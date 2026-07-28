import type { LLMProvider, Message, CompletionOptions, CompletionResponse, ContentPart } from '../types';

/** Convert content parts to Vertex AI inlineData/text format */
function toVertexParts(content: string | ContentPart[]): any[] {
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

export class GoogleVertexProvider implements LLMProvider {
  readonly name = 'google-vertex';
  private clientReady: Promise<any>;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = 'gemini-2.5-flash-lite', region = 'us-central1') {
    this.defaultModel = defaultModel;
    const project = apiKey || process.env.GOOGLE_VERTEX_PROJECT || '';
    const location = region || process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    const baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models`;

    this.clientReady = (async () => {
      try {
        // @ts-ignore
const { GoogleGenerativeAI } = await import('@google/generative-ai');
        // Vertex uses Application Default Credentials (ADC) — no API key passed
        process.env.GOOGLE_API_BASE_URL = baseUrl;
        return new GoogleGenerativeAI('vertex-auth-token');
      } catch {
        throw new Error('npm install @google/generative-ai. Set GOOGLE_VERTEX_PROJECT and GCLOUD_PROJECT, or use ADC.');
      }
    })();
  }

  private async client(): Promise<any> { return this.clientReady; }

  private buildContents(messages: Message[]) {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    return {
      contents: chatMessages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toVertexParts(m.content) })),
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
    const project = process.env.GOOGLE_VERTEX_PROJECT || process.env.GCLOUD_PROJECT || '';
    const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    if (project) {
      try {
        const res = await fetch(`https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models`, {
          headers: { 'Authorization': 'Bearer ' + (process.env.GOOGLE_VERTEX_KEY || '') },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          return (data.models || []).filter((m: any) => m.name.includes('gemini-')).map((m: any) => m.name.split('/').pop()).sort();
        }
      } catch {}
    }
    return ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  }

  async validateConfig(): Promise<boolean> {
    return !!(process.env.GOOGLE_VERTEX_PROJECT || process.env.GCLOUD_PROJECT);
  }
}
