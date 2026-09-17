import { describe, expect, it, beforeEach } from 'vitest';
import { Agent } from '../agent.js';
import { ToolRegistryService } from './registry.js';
import type { LLMProvider, Message, CompletionOptions, CompletionResponse } from '../types.js';

/** Scripted provider: first call requests a tool, second answers. */
class ScriptedProvider implements LLMProvider {
  readonly name = 'scripted';
  calls = 0;
  lastOptions?: CompletionOptions;
  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
    this.calls++;
    this.lastOptions = options;
    if (this.calls === 1) {
      return {
        content: '',
        toolCalls: [{ id: 'tc1', name: 'echo_tool', arguments: { text: 'hi' } }],
        model: 'scripted',
      };
    }
    const toolMsg = messages.find((m) => m.role === 'tool');
    return { content: `saw: ${toolMsg?.content}`, model: 'scripted' };
  }
  async countTokens(): Promise<number> { return 0; }
  async getAvailableModels(): Promise<string[]> { return ['scripted']; }
}

describe('tool loop', () => {
  beforeEach(() => {
    const registry = ToolRegistryService.getInstance();
    registry.clear();
    registry.register(
      {
        id: 'echo', name: 'echo_tool', description: 'Echoes text',
        parameters: [{ name: 'text', type: 'string', description: 'text', required: true }],
        returns: { type: 'string', description: 'echo' },
        isActive: true,
      },
      async (params) => `echo:${params.text}`,
    );
  });

  it('executes tool_calls and answers from the result', async () => {
    const agent = new Agent(new ScriptedProvider());
    const result = await agent.runToolLoop([{ role: 'user', content: 'say hi' }]);
    expect(result.success).toBe(true);
    expect(result.data).toContain('echo:hi');
    expect(result.toolsUsed).toEqual(['echo_tool']);
  });

  it('sends OpenAI-format tools to the provider', async () => {
    const provider = new ScriptedProvider();
    const agent = new Agent(provider);
    await agent.runToolLoop([{ role: 'user', content: 'x' }]);
    expect(provider.lastOptions?.tools?.[0]?.type).toBe('function');
    expect(provider.lastOptions?.tools?.[0]?.function.name).toBe('echo_tool');
  });

  it('getOpenAITools matches the registry', () => {
    const tools = ToolRegistryService.getInstance().getOpenAITools();
    expect(tools).toHaveLength(1);
    expect(tools[0].function.parameters).toHaveProperty('properties');
  });

  it('listTools aliases getAll (chatbot /api/tools contract)', () => {
    const registry = ToolRegistryService.getInstance();
    expect(registry.listTools()).toHaveLength(registry.getAll().length);
  });
});
