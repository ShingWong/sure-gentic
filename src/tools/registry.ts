import type { ToolDefinition, ToolHandler } from './types';
import { validateParameters } from './validator';

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

  getAll(): ToolDefinition[] {
    return Array.from(this.registry.values());
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  async execute(toolId: string, params: Record<string, unknown>, context: { sessionId?: string; userId?: string; metadata?: Record<string, unknown> }): Promise<{ success: boolean; result?: unknown; error?: string; executionTime: number }> {
    const start = Date.now();
    const tool = this.registry.get(toolId);
    if (!tool) return { success: false, error: `Tool ${toolId} not found`, executionTime: Date.now() - start };

    const handler = this.handlers.get(toolId);
    if (!handler) return { success: false, error: `No handler for ${toolId}`, executionTime: Date.now() - start };

    const validation = validateParameters(tool, params);
    if (!validation.isValid) {
      return { success: false, error: validation.errors.map(e => e.message).join('; '), executionTime: Date.now() - start };
    }

    try {
      const result = await handler(validation.validatedParams, { ...context, metadata: context.metadata || {} });
      return { success: true, result, executionTime: Date.now() - start };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), executionTime: Date.now() - start };
    }
  }

  getToolSchemas(): Record<string, unknown>[] {
    return this.getAll().map(tool => ({
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

  clear(): void {
    this.registry.clear();
    this.handlers.clear();
  }
}
