import type { ToolDefinition, ToolHandler } from './types.js';
import type { OpenAIFunctionTool } from '../types.js';
import { validateParameters } from './validator.js';

export class ToolRegistryService {
  private static instance: ToolRegistryService;
  private registry = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();

  static getInstance(): ToolRegistryService {
    if (!ToolRegistryService.instance) {
      ToolRegistryService.instance = new ToolRegistryService();
    }
    return ToolRegistryService.instance;
  }

  register(tool: ToolDefinition, handler: ToolHandler): void {
    this.registry.set(tool.id, tool);
    this.handlers.set(tool.id, handler);
  }

  unregister(toolId: string): void {
    this.registry.delete(toolId);
    this.handlers.delete(toolId);
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.registry.get(toolId);
  }

  /**
   * Enable/disable a tool by id or name. Disabled tools stay listed
   * (getAll/listTools/get) but are excluded from the schemas sent to
   * models (getToolSchemas/getOpenAITools). Returns false for unknown ids.
   */
  setToolActive(toolIdOrName: string, active: boolean): boolean {
    const tool = this.registry.get(toolIdOrName)
      ?? this.getAll().find((t) => t.name === toolIdOrName);
    if (!tool) return false;
    this.registry.set(tool.id, { ...tool, isActive: active });
    return true;
  }

  /** Tools eligible to be offered to a model (active only). */
  getActive(): ToolDefinition[] {
    return this.getAll().filter(t => t.isActive !== false);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.registry.values());
  }

  /** Alias used by consumers (e.g. sure-chatbot /api/tools). */
  listTools(): ToolDefinition[] {
    return this.getAll();
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  async execute(toolId: string, params: Record<string, unknown>, context: { sessionId?: string; userId?: string; metadata?: Record<string, unknown> }): Promise<{ success: boolean; result?: unknown; error?: string; executionTime: number }> {
    const start = Date.now();
    // Look up by id first, then by name — the LLM only ever sees names.
    const tool = this.registry.get(toolId) ?? this.getAll().find((t) => t.name === toolId);
    if (!tool) return { success: false, error: `Tool ${toolId} not found`, executionTime: Date.now() - start };

    const handler = this.handlers.get(tool.id);
    if (!handler) return { success: false, error: `No handler for ${toolId}`, executionTime: Date.now() - start };

    const validation = validateParameters(tool, params);
    if (!validation.isValid) {
      return { success: false, error: validation.errors.map(e => e.message).join('; '), executionTime: Date.now() - start };
    }

    try {
      const result = await handler(validation.validatedParams, { ...context, metadata: context.metadata || {} });
      return { success: true, result, executionTime: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const safe = msg.replace(/(sk-[a-zA-Z0-9]{10,}|AIza[0-9A-Za-z_-]{35}|ant-api[0-9a-f]{32})/g, '[API KEY REDACTED]');
      return { success: false, error: safe, executionTime: Date.now() - start };
    }
  }

  getToolSchemas(): Record<string, unknown>[] {
    return this.getActive().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.reduce((acc, p) => {
          acc[p.name] = {
            type: p.type,
            description: p.description,
            ...(p.enum ? { enum: p.enum } : {}),
          };
          return acc;
        }, {} as Record<string, unknown>),
        required: tool.parameters.filter(p => p.required).map(p => p.name),
      },
    }));
  }

  /**
   * OpenAI function-calling format: [{ type: 'function', function: {...} }].
   * Pass straight into CompletionOptions.tools for any provider that
   * supports tool_calls (openai, openai-compatible, fetch-compatible).
   * Ported from persona-bot-v2's getToolSchemas concept, normalized here
   * so all consumers share one shape.
   */
  getOpenAITools(): OpenAIFunctionTool[] {
    return this.getActive().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce((acc, p) => {
            acc[p.name] = {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
            };
            return acc;
          }, {} as Record<string, unknown>),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  clear(): void {
    this.registry.clear();
    this.handlers.clear();
  }
}
