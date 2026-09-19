import type { ToolDefinition, ToolHandler } from './types.js';
import { ToolRegistryService } from './registry.js';

/**
 * Firesearch tools: full-text search over YOUR OWN indexes (not the web).
 * Thin fetch wrappers over the Firesearch Oto RPC API
 * (https://github.com/pacedotdev/firesearch-sdk):
 *   POST {host}/api/IndexService.Search|PutDoc|CreateIndex
 *   POST {host}/api/AccessKeyService.GenerateKey
 * Auth is the secret key via X-API-Key header (backend-to-backend only —
 * never expose it in browsers). Searches run with a 24h access key, which
 * the handler auto-generates from the secret key when the caller does not
 * pass one explicitly.
 */

/** Injected config (configureFiresearchTools) wins; env is the fallback. */
let configuredHost: string | undefined;
let configuredApiKey: string | undefined;
let configuredAccessKey: string | undefined;

function nodeEnvVar(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

function resolveHost(): string {
  const host = configuredHost || nodeEnvVar('FIRESEARCH_HOST') || '';
  return host.replace(/\/+$/, '');
}

function resolveApiKey(): string | undefined {
  return configuredApiKey || nodeEnvVar('FIRESEARCH_API_KEY');
}

function resolveAccessKey(): string | undefined {
  return configuredAccessKey || nodeEnvVar('FIRESEARCH_ACCESS_KEY');
}

/**
 * Inject runtime config for Firesearch tools without env dependence
 * (keystores, per-tenant keys). Omitted = clear to env fallback.
 */
export function configureFiresearchTools(opts?: { host?: string; apiKey?: string; accessKey?: string }): void {
  configuredHost = opts?.host || undefined;
  configuredApiKey = opts?.apiKey || undefined;
  configuredAccessKey = opts?.accessKey || undefined;
}

/** True when firesearch_* tools can actually search (host + a credential). */
export function isFiresearchConfigured(): boolean {
  return !!resolveHost() && (!!resolveApiKey() || !!resolveAccessKey());
}

function requireHost(): string {
  const host = resolveHost();
  if (!host) throw new Error('Firesearch not configured: set FIRESEARCH_HOST or call configureFiresearchTools({ host })');
  return host;
}

async function rpc(host: string, serviceMethod: string, body: unknown): Promise<any> {
  const apiKey = resolveApiKey();
  const res = await fetch(`${host}/api/${serviceMethod}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firesearch ${serviceMethod} HTTP ${res.status}`);
  const data = (await res.json()) as { error?: string };
  if (data.error) throw new Error(`Firesearch ${serviceMethod}: ${data.error}`);
  return data;
}

/** Parent path of an index path (GenerateKey prefix), e.g. a/b/cards → a/b. */
function keyPrefixFor(indexPath: string): string {
  const i = indexPath.lastIndexOf('/');
  return i > 0 ? indexPath.slice(0, i) : indexPath;
}

async function resolveSearchAccessKey(host: string, indexPath: string, override?: string): Promise<string> {
  const accessKey = override || resolveAccessKey();
  if (accessKey) return accessKey;
  if (!resolveApiKey()) {
    throw new Error('Firesearch search needs an access key or secret key: pass access_key, set FIRESEARCH_ACCESS_KEY, or configure an API key');
  }
  const keyRes = (await rpc(host, 'AccessKeyService.GenerateKey', {
    indexPathPrefix: keyPrefixFor(indexPath),
  })) as { accessKey?: string };
  if (!keyRes.accessKey) throw new Error('Firesearch GenerateKey returned no access key');
  return keyRes.accessKey;
}

const searchHandler: ToolHandler = async (params: Record<string, unknown>) => {
  const host = requireHost();
  const indexPath = String(params.index_path ?? '');
  const text = String(params.query ?? '');
  const limit = (params.limit as number) || 5;
  if (!indexPath) throw new Error('index_path is required');
  const accessKey = await resolveSearchAccessKey(host, indexPath, (params.access_key as string) || undefined);
  const data = (await rpc(host, 'IndexService.Search', {
    query: { indexPath, accessKey, limit, text },
  })) as {
    hits?: { id: string; score?: number; fields?: { key: string; value: unknown }[]; highlights?: { field: string; text: string }[] }[];
  };
  return (data.hits || []).map((h) => ({
    id: h.id,
    score: h.score,
    fields: (h.fields || []).reduce<Record<string, unknown>>((acc, f) => ({ ...acc, [f.key]: f.value }), {}),
    highlights: (h.highlights || []).map((hl) => ({ field: hl.field, text: hl.text })),
  }));
};

const putDocHandler: ToolHandler = async (params: Record<string, unknown>) => {
  const host = requireHost();
  const indexPath = String(params.index_path ?? '');
  const id = String(params.doc_id ?? '');
  const text = String(params.text ?? '');
  if (!indexPath || !id || !text) throw new Error('index_path, doc_id and text are required');
  const fields = (params.fields as Record<string, unknown>) || {};
  await rpc(host, 'IndexService.PutDoc', {
    indexPath,
    doc: {
      id,
      searchFields: [{ key: 'text', value: text, store: true }],
      fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
    },
  });
  return { ok: true, id, indexPath };
};

const createIndexHandler: ToolHandler = async (params: Record<string, unknown>) => {
  const host = requireHost();
  const indexPath = String(params.index_path ?? '');
  if (!indexPath) throw new Error('index_path is required');
  const name = String(params.name || indexPath.split('/').pop() || indexPath);
  const data = (await rpc(host, 'IndexService.CreateIndex', {
    index: { indexPath, name },
  })) as { index?: { indexPath: string; name: string } };
  return data.index || { indexPath, name };
};

const searchDef: ToolDefinition = {
  id: 'firesearch_search', name: 'firesearch_search',
  description: 'Full-text search over your own Firesearch index (not the web)',
  parameters: [
    { name: 'index_path', type: 'string', description: 'Firesearch index path', required: true },
    { name: 'query', type: 'string', description: 'Search text', required: true },
    { name: 'limit', type: 'number', description: 'Max hits (default 5)', required: false, default: 5 },
    { name: 'access_key', type: 'string', description: '24h search access key (auto-generated from API key when omitted)', required: false },
  ],
  returns: { type: 'array', description: 'Hits with id, score, fields, highlights' },
  category: 'information', isActive: true,
};

const putDocDef: ToolDefinition = {
  id: 'firesearch_put_doc', name: 'firesearch_put_doc',
  description: 'Add a document to your Firesearch index',
  parameters: [
    { name: 'index_path', type: 'string', description: 'Firesearch index path', required: true },
    { name: 'doc_id', type: 'string', description: 'Document identifier', required: true },
    { name: 'text', type: 'string', description: 'Searchable text (stored)', required: true },
    { name: 'fields', type: 'object', description: 'Extra filterable key/value fields', required: false },
  ],
  returns: { type: 'object', description: '{ ok, id, indexPath }' },
  category: 'information', isActive: true,
};

const createIndexDef: ToolDefinition = {
  id: 'firesearch_create_index', name: 'firesearch_create_index',
  description: 'Create a Firesearch full-text index',
  parameters: [
    { name: 'index_path', type: 'string', description: 'Firesearch index path', required: true },
    { name: 'name', type: 'string', description: 'Human-readable name (defaults to last path segment)', required: false },
  ],
  returns: { type: 'object', description: '{ indexPath, name }' },
  category: 'information', isActive: true,
};

let toolsRegistered = false;

export function registerFiresearchTools(): void {
  if (toolsRegistered) return;
  toolsRegistered = true;
  const registry = ToolRegistryService.getInstance();
  registry.register(searchDef, searchHandler);
  registry.register(putDocDef, putDocHandler);
  registry.register(createIndexDef, createIndexHandler);
}
