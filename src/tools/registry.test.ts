import { describe, expect, it } from 'vitest'
import { ToolRegistryService } from './registry.js'
import type { ToolDefinition } from './types.js'

function echoDef(active = true): ToolDefinition {
  return {
    id: 'echo',
    name: 'echo_tool',
    description: 'Echoes text',
    parameters: [
      { name: 'text', type: 'string', description: 'Text to echo', required: true },
    ],
    returns: { type: 'string', description: 'Echoed text' },
    isActive: active,
  }
}

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

  it('setToolActive disables by id or name, false for unknown', () => {
    const registry = ToolRegistryService.getInstance()
    registry.clear()
    registry.register({ ...echoDef() }, async (params) => `echo:${params.text}`)

    expect(registry.setToolActive('echo', false)).toBe(true)
    expect(registry.get('echo')?.isActive).toBe(false)
    expect(registry.setToolActive('echo_tool', true)).toBe(true)
    expect(registry.get('echo')?.isActive).toBe(true)
    expect(registry.setToolActive('nope', false)).toBe(false)
  })

  it('excludes inactive tools from schemas but not listings', () => {
    const registry = ToolRegistryService.getInstance()
    registry.clear()
    registry.register({ ...echoDef() }, async (params) => `echo:${params.text}`)
    registry.setToolActive('echo', false)

    expect(registry.getOpenAITools()).toHaveLength(0)
    expect(registry.getToolSchemas()).toHaveLength(0)
    expect(registry.getActive()).toHaveLength(0)
    // Admin listings still show the disabled tool.
    expect(registry.getAll()).toHaveLength(1)
    expect(registry.listTools()).toHaveLength(1)
  })
})
