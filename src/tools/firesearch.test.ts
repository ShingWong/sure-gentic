import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { ToolRegistryService } from './registry.js';
import { registerFiresearchTools, configureFiresearchTools, isFiresearchConfigured } from './firesearch.js';

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: { headers: Record<string, string>; body?: string }) => unknown): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (url: unknown, init: { headers: Record<string, string>; body?: string }) => {
    urls.push(String(url));
    return handler(String(url), init);
  }) as typeof fetch;
  return urls;
}

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });

describe('firesearch tools', () => {
  beforeAll(() => {
    registerFiresearchTools();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    configureFiresearchTools();
    delete process.env.FIRESEARCH_HOST;
    delete process.env.FIRESEARCH_API_KEY;
    delete process.env.FIRESEARCH_ACCESS_KEY;
  });

  it('isFiresearchConfigured reflects host config', () => {
    expect(isFiresearchConfigured()).toBe(false);
    process.env.FIRESEARCH_HOST = 'https://fs.test/';
    expect(isFiresearchConfigured()).toBe(true);
  });

  it('errors helpfully when unconfigured', async () => {
    const result = await ToolRegistryService.getInstance().execute(
      'firesearch_search', { index_path: 'a/b', query: 'q' }, { metadata: {} },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('FIRESEARCH_HOST');
  });

  it('search auto-generates an access key then searches', async () => {
    configureFiresearchTools({ host: 'https://fs.test', apiKey: 'secret' });
    const seen: { url: string; body: string }[] = [];
    stubFetch((url, init) => {
      seen.push({ url, body: init.body || '' });
      if (url.endsWith('AccessKeyService.GenerateKey'))
        return ok({ accessKey: 'ak-1' });
      return ok({
        hits: [{
          id: 'd1', score: 0.9,
          fields: [{ key: 'lang', value: 'en' }],
          highlights: [{ field: 'text', text: 'match <em>here</em>' }],
        }],
      });
    });
    const result = await ToolRegistryService.getInstance().execute(
      'firesearch_search', { index_path: 'firesearch/orgs/o/cards', query: 'hello', limit: 5 }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect(seen[0].url).toBe('https://fs.test/api/AccessKeyService.GenerateKey');
    expect(JSON.parse(seen[0].body)).toMatchObject({ indexPathPrefix: 'firesearch/orgs/o' });
    expect(seen[1].url).toBe('https://fs.test/api/IndexService.Search');
    expect(JSON.parse(seen[1].body)).toMatchObject({
      query: { indexPath: 'firesearch/orgs/o/cards', accessKey: 'ak-1', limit: 5, text: 'hello' },
    });
    expect(result.result).toEqual([{
      id: 'd1', score: 0.9,
      fields: { lang: 'en' },
      highlights: [{ field: 'text', text: 'match <em>here</em>' }],
    }]);
  });

  it('search uses an explicit access key without GenerateKey', async () => {
    configureFiresearchTools({ host: 'https://fs.test' });
    const urls = stubFetch((url) => {
      expect(url.endsWith('IndexService.Search')).toBe(true);
      return ok({ hits: [] });
    });
    const result = await ToolRegistryService.getInstance().execute(
      'firesearch_search', { index_path: 'a/b', query: 'q', access_key: 'given' }, { metadata: {} },
    );
    expect(result.success).toBe(true);
    expect(urls).toHaveLength(1);
  });

  it('put_doc and create_index post the right RPC bodies', async () => {
    configureFiresearchTools({ host: 'https://fs.test', apiKey: 'secret' });
    const seen: { url: string; body: string }[] = [];
    stubFetch((url, init) => {
      seen.push({ url, body: init.body || '' });
      return ok({ index: { indexPath: 'a/b', name: 'b' } });
    });
    const put = await ToolRegistryService.getInstance().execute(
      'firesearch_put_doc',
      { index_path: 'a/b', doc_id: 'd1', text: 'hello world', fields: { lang: 'en' } },
      { metadata: {} },
    );
    expect(put.success).toBe(true);
    expect(put.result).toEqual({ ok: true, id: 'd1', indexPath: 'a/b' });
    expect(seen[0].url).toBe('https://fs.test/api/IndexService.PutDoc');
    expect(JSON.parse(seen[0].body)).toMatchObject({
      indexPath: 'a/b',
      doc: { id: 'd1', searchFields: [{ key: 'text', value: 'hello world', store: true }] },
    });

    const create = await ToolRegistryService.getInstance().execute(
      'firesearch_create_index', { index_path: 'a/b' }, { metadata: {} },
    );
    expect(create.success).toBe(true);
    expect(seen[1].url).toBe('https://fs.test/api/IndexService.CreateIndex');
    expect(JSON.parse(seen[1].body)).toMatchObject({ index: { indexPath: 'a/b', name: 'b' } });
  });

  it('surfaces Firesearch application errors', async () => {
    configureFiresearchTools({ host: 'https://fs.test', apiKey: 'secret' });
    stubFetch(() => ok({ error: 'bad index' }));
    const result = await ToolRegistryService.getInstance().execute(
      'firesearch_put_doc', { index_path: 'a/b', doc_id: 'd', text: 't' }, { metadata: {} },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('bad index');
  });
});
