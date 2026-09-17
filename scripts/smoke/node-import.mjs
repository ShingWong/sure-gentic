import assert from 'node:assert/strict'

const sureGentic = await import('../../dist/node/index.js')
assert.equal(typeof sureGentic.Agent, 'function')
assert.equal(typeof sureGentic.ToolRegistryService, 'function')
assert.equal(typeof sureGentic.FetchCompatibleProvider, 'function')

const registry = sureGentic.ToolRegistryService.getInstance()
registry.clear()
registry.register({
  id: 'smoke',
  name: 'smoke_tool',
  description: 'Smoke-test tool',
  parameters: [],
  returns: { type: 'string', description: 'ok' },
  isActive: true,
}, async () => 'ok')

const tools = registry.getOpenAITools()
assert.equal(tools[0].function.name, 'smoke_tool')
console.log('plain Node ESM import and tool schema smoke test passed')
