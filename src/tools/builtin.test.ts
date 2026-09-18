import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { ToolRegistryService } from './registry.js';
import { registerBuiltinTools, configureBuiltinTools, isSearchConfigured } from './builtin.js';

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

describe('builtin tool config', () => {
  afterEach(() => {
    configureBuiltinTools();
    delete process.env.SEARCH_API_KEY;
  });

  it('isSearchConfigured reflects injected key, then env, then none', () => {
    configureBuiltinTools();
    delete process.env.SEARCH_API_KEY;
    expect(isSearchConfigured()).toBe(false);

    process.env.SEARCH_API_KEY = 'env-key';
    expect(isSearchConfigured()).toBe(true);

    configureBuiltinTools({ searchApiKey: '' });
    expect(isSearchConfigured()).toBe(true); // cleared to env fallback

    configureBuiltinTools({ searchApiKey: 'injected-key' });
    delete process.env.SEARCH_API_KEY;
    expect(isSearchConfigured()).toBe(true);
  });

  it('web_search returns mock results without a key', async () => {
    configureBuiltinTools();
    delete process.env.SEARCH_API_KEY;
    const result = await ToolRegistryService.getInstance().execute(
      'web_search', { query: 'test' }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect(Array.isArray(result.result)).toBe(true);
    expect((result.result as { url: string }[])[0].url).toContain('example.com');
  });
});
