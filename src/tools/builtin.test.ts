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
    delete process.env.EXA_API_KEY;
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
    delete process.env.EXA_API_KEY;
    const result = await ToolRegistryService.getInstance().execute(
      'web_search', { query: 'test' }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect(Array.isArray(result.result)).toBe(true);
    expect((result.result as { url: string }[])[0].url).toContain('example.com');
  });
});

describe('web_search exa backend', () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    registerBuiltinTools();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    configureBuiltinTools();
    delete process.env.SEARCH_API_KEY;
    delete process.env.EXA_API_KEY;
  });

  it('uses Exa when only EXA_API_KEY is set', async () => {
    configureBuiltinTools();
    delete process.env.SEARCH_API_KEY;
    process.env.EXA_API_KEY = 'exa-key';
    const urls: string[] = [];
    globalThis.fetch = (async (url: unknown, init: { headers: Record<string, string> }) => {
      urls.push(String(url));
      expect(init.headers['x-api-key']).toBe('exa-key');
      return {
        ok: true, status: 200,
        json: async () => ({ results: [{ title: 'T', url: 'https://x.test/1', highlights: ['snip one'] }] }),
      };
    }) as typeof fetch;
    const result = await ToolRegistryService.getInstance().execute(
      'web_search', { query: 'q', max_results: 3 }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual([{ title: 'T', snippet: 'snip one', url: 'https://x.test/1' }]);
    expect(urls).toEqual(['https://api.exa.ai/search']);
  });

  it('falls back to mock when Exa errors', async () => {
    configureBuiltinTools();
    delete process.env.SEARCH_API_KEY;
    process.env.EXA_API_KEY = 'exa-key';
    globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as typeof fetch;
    const result = await ToolRegistryService.getInstance().execute(
      'web_search', { query: 'q' }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect((result.result as { url: string }[])[0].url).toContain('example.com');
  });

  it('prefers SerpAPI and falls through to Exa on failure', async () => {
    configureBuiltinTools({ searchApiKey: 'serp-key', exaApiKey: 'exa-key' });
    const urls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      urls.push(String(url));
      if (String(url).includes('serpapi')) throw new Error('serp down');
      return {
        ok: true, status: 200,
        json: async () => ({ results: [{ title: 'E', url: 'https://x.test/2', text: 'body text here' }] }),
      };
    }) as typeof fetch;
    const result = await ToolRegistryService.getInstance().execute(
      'web_search', { query: 'q' }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual([{ title: 'E', snippet: 'body text here', url: 'https://x.test/2' }]);
    expect(urls[0]).toContain('serpapi');
    expect(urls[1]).toBe('https://api.exa.ai/search');
  });
});
