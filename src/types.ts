export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage?: CompletionUsage;
  finishReason?: string;
  id?: string;
  created?: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse>;
  completeStream?(messages: Message[], onChunk: (chunk: string) => void): Promise<CompletionResponse>;
  countTokens(messages: Message[]): Promise<number>;
  getAvailableModels(): Promise<string[]>;
  validateConfig?(): Promise<boolean>;
}

export interface Skill<TContext = Record<string, unknown>, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  execute(context: TContext): Promise<TResult>;
}

export interface AgentContext {
  provider: LLMProvider;
  model: string;
  temperature: number;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'mock';

export type { ToolDefinition, ToolParameter, ToolHandler, ToolContext, ToolExecutionResult } from './tools/types';
