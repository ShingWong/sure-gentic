import { describe, expect, it } from 'vitest'
import { ToolRegistryService } from './registry.js'

describe('tool registry', () => {
  it('executes an LLM tool call by name', async () => {
    const registry = ToolRegistryService.getInstance()
    registry.clear()
    registry.register(
      {
        id: 'echo',
        name: 'echo_tool',
        description: 'Echoes text',
        parameters: [
          { name: 'text', type: 'string', description: 'Text to echo', required: true },
        ],
        returns: { type: 'string', description: 'Echoed text' },
        isActive: true,
      },
      async (params) => `echo:${params.text}`,
    )

    const result = await registry.execute('echo_tool', { text: 'hi' }, { metadata: {} })
    expect(result).toMatchObject({ success: true, result: 'echo:hi' })
  })
})
