import { describe, it, expect } from 'vitest';
import { ToolRegistryService } from './registry';
import { registerBuiltinTools } from './builtin';

describe('calculator tool', () => {
  beforeAll(() => {
    registerBuiltinTools();
  });

  it('adds two numbers', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: '2 + 3' }, { metadata: {} });
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ expression: '2 + 3', result: 5 });
  });

  it('handles complex expressions', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: '(10 + 5) * 2 / 3' }, { metadata: {} });
    expect(result.success).toBe(true);
    expect(result.result.result).toBeCloseTo(10, 1);
  });

  it('rejects invalid expressions', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: 'invalid' }, { metadata: {} });
    expect(result.success).toBe(false);
  });

  it('rejects code injection attempts', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: 'process.env' }, { metadata: {} });
    expect(result.success).toBe(false);
  });

  it('handles decimal numbers', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: '3.5 * 2' }, { metadata: {} });
    expect(result.success).toBe(true);
    expect(result.result.result).toBe(7);
  });

  it('rejects division by zero', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: '1/0' }, { metadata: {} });
    expect(result.success).toBe(false);
  });

  it('rejects empty expression', async () => {
    const result = await ToolRegistryService.getInstance().execute('calculator', { expression: '' }, { metadata: {} });
    expect(result.success).toBe(false);
  });
});
