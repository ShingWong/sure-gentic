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

  it('forces a no-tools closing answer when maxRounds exhausts', async () => {
    const calls: (CompletionOptions | undefined)[] = [];
    const looping = new (class implements LLMProvider {
      readonly name = 'looping';
      async complete(_messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
        calls.push(options);
        if ((options?.tools?.length ?? 0) > 0) {
          return {
            content: '',
            toolCalls: [{ id: 'tc1', name: 'echo_tool', arguments: { text: 'hi' } }],
            model: 'looping',
          };
        }
        // Closing pass: must arrive with no tools attached.
        return { content: 'closing answer', model: 'looping' };
      }
      async countTokens(): Promise<number> { return 0; }
      async getAvailableModels(): Promise<string[]> { return ['looping']; }
    })();
    const agent = new Agent(looping);
    const result = await agent.runToolLoop([{ role: 'user', content: 'x' }], { maxRounds: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toBe('closing answer');
    expect(calls.length).toBe(2);
    expect(calls[1]?.tools).toBeUndefined();
    expect(result.toolsUsed).toEqual(['echo_tool']);
  });

  it('falls back to the sentinel (with cause) when the closing pass fails', async () => {
    const failing = new (class implements LLMProvider {
      readonly name = 'failing-close';
      calls = 0;
      async complete(_messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
        this.calls++;
        if (options?.tools?.length) {
          return {
            content: '',
            toolCalls: [{ id: 'tc1', name: 'echo_tool', arguments: { text: 'hi' } }],
            model: 'failing-close',
          };
        }
        throw new Error('closing boom');
      }
      async countTokens(): Promise<number> { return 0; }
      async getAvailableModels(): Promise<string[]> { return ['failing-close']; }
    })();
    const agent = new Agent(failing);
    const result = await agent.runToolLoop([{ role: 'user', content: 'x' }], { maxRounds: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toBe('(agent hit max rounds without answering)');
    expect(result.error).toContain('closing boom');
  });
});
