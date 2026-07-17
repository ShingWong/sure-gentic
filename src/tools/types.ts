export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  returns: { type: string; description: string };
  category?: string;
  isActive: boolean;
}

export type ToolHandler = (params: Record<string, unknown>, context: ToolContext) => Promise<unknown>;

export interface ToolContext {
  sessionId?: string;
  userId?: string;
  metadata: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}
