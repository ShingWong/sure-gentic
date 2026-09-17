import { ToolRegistryService } from '../../dist/node/index.js'

const registry = ToolRegistryService.getInstance()
registry.clear()
registry.register({
  id: 'echo',
  name: 'echo_tool',
  description: 'Echoes text',
  parameters: [
    { name: 'text', type: 'string', description: 'Text to echo', required: true },
  ],
  returns: { type: 'string', description: 'Echoed text' },
  isActive: true,
}, async (params) => `echo:${params.text}`)

const result = await registry.execute('echo_tool', { text: 'hi' }, { metadata: {} })
if (!result.success || result.result !== 'echo:hi') {
  throw new Error(`name lookup failed: ${JSON.stringify(result)}`)
}
console.log('tool name lookup smoke test passed')
