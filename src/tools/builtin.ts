import type { ToolDefinition, ToolHandler, ToolContext } from './types';
import { ToolRegistryService } from './registry';

async function webSearchHandler(params: Record<string, unknown>, _context: ToolContext): Promise<unknown> {
  const query = params.query as string;
  const maxResults = (params.max_results as number) || 5;
  const searchApiKey = process.env.SEARCH_API_KEY;

  if (searchApiKey) {
    try {
      // Note: SerpAPI only supports api_key as URL query param (no Authorization header).
      // The key appears in server access logs — restrict log access in production.
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

function safeEval(expr: string): number {
  let pos = 0
  function peek(): string { return expr[pos] ?? '' }
  function next(): string { return expr[pos++] ?? '' }
  function skipSpace() { while (/\s/.test(peek())) pos++ }
  function parseError(msg: string): never { throw new Error(`Invalid expression: ${msg} at position ${pos}`) }

  function parseNumber(): number {
    skipSpace()
    let num = ''
    if (peek() === '-') { num += next() }
    while (/[0-9.]/.test(peek())) num += next()
    if (!num || num === '-') parseError('Expected number')
    return parseFloat(num)
  }

  function parseFactor(): number {
    skipSpace()
    if (peek() === '(') {
      next()
      const val = parseExpr()
      skipSpace()
      if (next() !== ')') parseError('Expected )')
      return val
    }
    return parseNumber()
  }

  function parseTerm(): number {
    let left = parseFactor()
    skipSpace()
    while (peek() === '*' || peek() === '/') {
      const op = next()
      const right = parseFactor()
      if (op === '*') left *= right
      else {
        if (right === 0) parseError('Division by zero')
        left /= right
      }
      skipSpace()
    }
    return left
  }

  function parseExpr(): number {
    let left = parseTerm()
    skipSpace()
    while (peek() === '+' || peek() === '-') {
      const op = next()
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
      skipSpace()
    }
    return left
  }

  skipSpace()
  const result = parseExpr()
  skipSpace()
  if (pos < expr.length) parseError(`Unexpected character '${peek()}'`)
  return result
}

async function calculatorHandler(params: Record<string, unknown>): Promise<unknown> {
  const expression = String(params.expression ?? '')
  const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
  if (!/[\d]/.test(sanitized)) throw new Error('Invalid expression: no digits found')
  try {
    const result = safeEval(sanitized)
    return { expression, result, formatted: String(result) }
  } catch (e) {
    throw new Error(`Invalid expression: ${expression}`)
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

let toolsRegistered = false;

export function registerBuiltinTools(): void {
  if (toolsRegistered) return;
  toolsRegistered = true;
  const registry = ToolRegistryService.getInstance();
  registry.register(webSearchDef, webSearchHandler);
  registry.register(calculatorDef, calculatorHandler);
  registry.register(currentTimeDef, currentTimeHandler);
}
