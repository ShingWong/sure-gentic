export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(messages: Message[], options?: CompletionOptions): Promise<string>;
  completeStream?(messages: Message[], onChunk: (chunk: string) => void): Promise<string>;
  countTokens(messages: Message[]): Promise<number>;
  getAvailableModels(): Promise<string[]>;
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
