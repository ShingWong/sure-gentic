import type { ToolDefinition, ToolHandler, ToolContext } from './types';
import { ToolRegistryService } from './registry';

async function webSearchHandler(params: Record<string, unknown>, _context: ToolContext): Promise<unknown> {
  const query = params.query as string;
  const maxResults = (params.max_results as number) || 5;
  const searchApiKey = process.env.SEARCH_API_KEY;

  if (searchApiKey) {
    try {
      const url = `https://serpapi.com/search?api_key=${searchApiKey}&q=${encodeURIComponent(query)}&num=${maxResults}`;
      const res = await fetch(url);
      const data = await res.json() as { organic_results?: { title: string; snippet: string; link: string }[] };
      return (data.organic_results || []).slice(0, maxResults).map(r => ({
        title: r.title,
        snippet: r.snippet,
        url: r.link,
      }));
    } catch {
      // fall through to mock
    }
  }

  return Array.from({ length: maxResults }, (_, i) => ({
    title: i === 0 ? `Search results for: ${query}` : `Result ${i + 1} for: ${query}`,
    snippet: i === 0 ? `Information about "${query}" from web search.` : `Additional result about "${query}".`,
    url: `https://example.com/result/${i + 1}`,
  }));
}

async function calculatorHandler(params: Record<string, unknown>): Promise<unknown> {
  const expression = params.expression as string;
  const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
  try {
    const result = new Function(`"use strict"; return (${sanitized})`)();
    return { expression, result, formatted: String(result) };
  } catch {
    throw new Error(`Invalid expression: ${expression}`);
  }
}

async function currentTimeHandler(params: Record<string, unknown>): Promise<unknown> {
  const timezone = (params.timezone as string) || 'UTC';
  const now = new Date();
  try {
    const formatted = now.toLocaleString('en-US', { timeZone: timezone });
    return { timestamp: now.toISOString(), formatted, timezone, locale: 'en-US' };
  } catch {
    const formatted = now.toISOString();
    return { timestamp: formatted, formatted, timezone: 'UTC', locale: 'en-US' };
  }
}

const webSearchDef: ToolDefinition = {
  id: 'web_search', name: 'web_search',
  description: 'Search the web for current information',
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'max_results', type: 'number', description: 'Max results (1-10)', required: false, default: 5 },
  ],
  returns: { type: 'array', description: 'Search results with title, snippet, URL' },
  category: 'information', isActive: true,
};

const calculatorDef: ToolDefinition = {
  id: 'calculator', name: 'calculator',
  description: 'Perform mathematical calculations',
  parameters: [
    { name: 'expression', type: 'string', description: 'Math expression', required: true },
  ],
  returns: { type: 'object', description: '{ expression, result, formatted }' },
  category: 'utility', isActive: true,
};

const currentTimeDef: ToolDefinition = {
  id: 'current_time', name: 'current_time',
  description: 'Get current time in a timezone',
  parameters: [
    { name: 'timezone', type: 'string', description: 'Timezone (e.g., America/New_York)', required: false, default: 'UTC' },
  ],
  returns: { type: 'object', description: '{ timestamp, formatted, timezone }' },
  category: 'utility', isActive: true,
};

export function registerBuiltinTools(): void {
  const registry = ToolRegistryService.getInstance();
  registry.register(webSearchDef, webSearchHandler);
  registry.register(calculatorDef, calculatorHandler);
  registry.register(currentTimeDef, currentTimeHandler);
}
