// Regression: simulate a non-Node runtime (browser / Thunderbird) where
// `process` does not exist. Must run as a separate child process because it
// hides globalThis.process.
const g = globalThis;
const realProcess = g.process;
g.process = undefined;
if (typeof process !== 'undefined') throw new Error('simulation failed: process still visible');

const sg = await import('../../dist/node/index.js');
if (typeof sg.nodeEnv !== 'function') throw new Error('nodeEnv not exported');
if (JSON.stringify(sg.nodeEnv()) !== '{}') throw new Error('nodeEnv should be {} without process');

const cfg = sg.loadConfig();
if (cfg.temperature !== 0.7 || cfg.ollamaBaseUrl !== 'http://localhost:11434') {
  throw new Error('loadConfig defaults wrong: ' + JSON.stringify(cfg));
}

// Every provider constructs with explicit args and answers validateConfig.
const providers = [
  new sg.OpenAIProvider('k'),
  new sg.AnthropicProvider('k'),
  new sg.GoogleAIStudioProvider('k'),
  new sg.GoogleVertexProvider('proj'),
  new sg.OpenAICompatibleProvider({ apiKey: 'k', baseURL: 'http://x/v1' }),
  new sg.FetchCompatibleProvider({ baseURL: 'http://x/v1' }),
  new sg.OpenRouterProvider('k'),
  new sg.MockProvider(),
];
for (const p of providers) {
  if (typeof p.validateConfig === "function" && typeof await p.validateConfig() !== "boolean") throw new Error(p.name + ": validateConfig");
  const n = await p.countTokens([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
  if (typeof n !== 'number') throw new Error(p.name + ': countTokens ContentPart[]');
}

// Agent constructs with an explicit provider and runs the loop end to end.
const registry = sg.ToolRegistryService.getInstance();
registry.clear();
registry.register(
  { id: 'echo', name: 'echo_tool', description: 'e', parameters: [], returns: { type: 'string', description: 'e' }, isActive: true },
  async () => 'ok',
);
const scripted = {
  name: 'scripted',
  complete: async (msgs) => msgs.some((m) => m.role === 'tool')
    ? { content: 'done', model: 's' }
    : { content: '', toolCalls: [{ id: 't1', name: 'echo_tool', arguments: {} }], model: 's' },
  countTokens: async () => 0,
  getAvailableModels: async () => ['s'],
};
const agent = new sg.Agent(scripted);
const r = await agent.runToolLoop([{ role: 'user', content: 'hi' }], { maxRounds: 3 });
if (!r.success || r.data !== 'done') throw new Error('runToolLoop failed: ' + JSON.stringify(r));

g.process = realProcess;
console.log('no-process runtime regression passed (' + providers.length + ' providers + agent loop)');
