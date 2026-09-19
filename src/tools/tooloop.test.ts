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

  it('falls back to the sentinel (with cause) when the closing pass fails', async () => {    const failing = new (class implements LLMProvider {
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

  it('allowedTools restricts the schemas sent to the provider', async () => {
    const registry = ToolRegistryService.getInstance();
    registry.register(
      {
        id: 'other', name: 'other_tool', description: 'Other',
        parameters: [{ name: 'text', type: 'string', description: 'text', required: true }],
        returns: { type: 'string', description: 'other' },
        isActive: true,
      },
      async (params) => `other:${params.text}`,
    );
    const provider = new ScriptedProvider();
    const agent = new Agent(provider);
    await agent.runToolLoop([{ role: 'user', content: 'x' }], { allowedTools: ['other_tool'] });
    const names = (provider.lastOptions?.tools ?? []).map(t => t.function.name);
    expect(names).toEqual(['other_tool']);
  });

  it('refuses to execute a tool call that was not offered', async () => {
    const sneaky = new (class implements LLMProvider {
      readonly name = 'sneaky';
      calls = 0;
      toolContent?: string;
      async complete(messages: Message[], _options?: CompletionOptions): Promise<CompletionResponse> {
        this.calls++;
        if (this.calls === 1) {
          return {
            content: '',
            toolCalls: [{ id: 'tc1', name: 'echo_tool', arguments: { text: 'hi' } }],
            model: 'sneaky',
          };
        }
        const tm = messages.find((m) => m.role === 'tool');
        this.toolContent = typeof tm?.content === 'string' ? tm.content : undefined;
        return { content: `got: ${this.toolContent}`, model: 'sneaky' };
      }
      async countTokens(): Promise<number> { return 0; }
      async getAvailableModels(): Promise<string[]> { return ['sneaky']; }
    })();
    const agent = new Agent(sneaky);
    const result = await agent.runToolLoop([{ role: 'user', content: 'x' }], { allowedTools: ['no_such_tool'] });
    expect(result.success).toBe(true);
    expect(result.toolsUsed).toEqual([]);
    expect(sneaky.toolContent).toContain('not enabled');
    expect(result.data).toContain('not enabled');
  });

  it('inactive registry tools are excluded from the loop', async () => {
    const provider = new ScriptedProvider();
    const agent = new Agent(provider);
    ToolRegistryService.getInstance().setToolActive('echo', false);
    await agent.runToolLoop([{ role: 'user', content: 'x' }]);
    expect(provider.lastOptions?.tools ?? []).toEqual([]);
    expect(provider.lastOptions?.toolChoice).toBeUndefined();
  });

  it('nudges past an empty mid-loop reply instead of returning it', async () => {
    const seen: string[][] = [];
    const gappy = new (class implements LLMProvider {
      readonly name = 'gappy';
      calls = 0;
      async complete(messages: Message[], _options?: CompletionOptions): Promise<CompletionResponse> {
        this.calls++;
        seen.push(messages.map((m) => `${m.role}:${(m.content || '').slice(0, 40)}`));
        if (this.calls === 1) return { content: '', model: 'gappy' };
        return { content: 'recovered answer', model: 'gappy' };
      }
      async countTokens(): Promise<number> { return 0; }
      async getAvailableModels(): Promise<string[]> { return ['gappy']; }
    })();
    const agent = new Agent(gappy);
    const result = await agent.runToolLoop([{ role: 'user', content: 'x' }], { maxRounds: 3 });
    expect(result.success).toBe(true);
    expect(result.data).toBe('recovered answer');
    expect(gappy.calls).toBe(2);
    expect(seen[1].some((m) => m.includes('empty'))).toBe(true);
  });

  it('retries the closing pass once when it comes back empty', async () => {
    const closing = new (class implements LLMProvider {
      readonly name = 'empty-close';
      closes = 0;
      async complete(_messages: Message[], options?: CompletionOptions): Promise<CompletionResponse> {
        if ((options?.tools?.length ?? 0) > 0) {
          return {
            content: '',
            toolCalls: [{ id: 'tc1', name: 'echo_tool', arguments: { text: 'hi' } }],
            model: 'empty-close',
          };
        }
        this.closes++;
        if (this.closes === 1) return { content: '  ', model: 'empty-close' };
        return { content: 'second-try answer', model: 'empty-close' };
      }
      async countTokens(): Promise<number> { return 0; }
      async getAvailableModels(): Promise<string[]> { return ['empty-close']; }
    })();
    const agent = new Agent(closing);
    const result = await agent.runToolLoop([{ role: 'user', content: 'x' }], { maxRounds: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toBe('second-try answer');
    expect(closing.closes).toBe(2);
  });
});
