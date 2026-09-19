# sure-gentic

**A portable agent creation framework.** Build AI agents with composable **skills** and pluggable **tools**, then run them against OpenAI, Anthropic, or any LLM backend — swap providers with a single environment variable, no code changes, no lock-in.

```ts
import { Agent, BaseSkill } from 'sure-gentic'

class Summarizer extends BaseSkill<string, string> {
  name = 'summarizer'
  description = 'Summarizes text'
  async execute(text: string): Promise<string> {
    return this.callLLM(this.agent, [
      { role: 'system', content: 'Summarize concisely.' },
      { role: 'user', content: text },
    ])
  }
}

const agent = new Agent()
const result = await agent.run(new Summarizer(), 'Long text here...')
```

### Why sure-gentic?

| Problem | How sure-gentic solves it |
|---------|--------------------------|
| **Provider lock-in** | Agent code never references a specific model or provider. Swap from GPT-4o to Claude by changing `AI_PROVIDER`. |
| **No standard agent pattern** | Agent + Skills + Tools — three clear concepts. Skills encapsulate LLM-powered tasks; Tools provide reusable capabilities. Compose them however you need. |
| **Scattered tool integration** | Built-in `ToolRegistryService` with parameter validation, schemas, and execution lifecycle. Register a tool once, call it from any skill or directly. |
| **Context bloat** | Minimal core (~800 lines). No heavy abstractions, no orchestrator chains, no vector store dependencies. Add only what you need. |
| **Fragmented streaming** | Unified `completeStream()` across providers — same interface for OpenAI and Anthropic streaming. |

### How it compares

| | sure-gentic | LangChain | Vercel AI SDK |
|---|---|---|---|
| Provider-agnostic | ✅ Env var swap | ✅ Yes | ✅ Yes |
| Agent architecture | ✅ Agent + Skills + Tools | ❌ Chains + Agents + Memory | ⚠️ Only AI SDK calls |
| Skill system | ✅ First-class `BaseSkill` | ❌ No standard pattern | ❌ No skill abstraction |
| Tool system | ✅ Built-in registry + validation | ✅ Yes | ❌ External only |
| Bundle size | ~800 lines core | ~50K+ lines | ~10K+ lines |
| Peer deps | 3 (all optional) | 15+ required | 5+ required |
| Learning curve | Low — 3 concepts | High — chains, agents, retrievers, memory | Medium — streams, tools, providers |
| Framework lock-in | Zero — plain TypeScript classes | Tight — chains and callbacks | Tight — provider SDK wrappers |

## Installation

```bash
npm install sure-gentic
```

Peer dependencies (install the providers you need):

```bash
npm install openai                          # OpenAI provider
npm install @anthropic-ai/sdk               # Anthropic provider
# Google provider coming soon
```

## Provider Setup

**OpenAI** — set `OPENAI_API_KEY` env var:

```bash
export OPENAI_API_KEY=sk-proj-...
```

**Anthropic** — set `ANTHROPIC_API_KEY` env var:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**OpenAI-compatible / self-hosted** — point at any OpenAI-style endpoint
(Qwen, vLLM, llama.cpp). Two providers, same options shape — pick by runtime:

```ts
import { OpenAICompatibleProvider, FetchCompatibleProvider } from 'sure-gentic'

// Node (uses the openai SDK under the hood):
const node = new OpenAICompatibleProvider({
  baseURL: 'http://192.168.11.249:8080/v1', defaultModel: 'qwen3:32b',
})
// Browser / Thunderbird extension (zero imports, fetch only):
const browser = new FetchCompatibleProvider({
  baseURL: 'http://192.168.11.249:8080/v1', defaultModel: 'qwen3:32b',
})
```

Both support `tools` / `toolChoice` and return `tool_calls`.

**Mock** — no API key needed, useful for testing. Enable with:

```bash
export AI_PROVIDER=mock
```

The factory auto-discovers providers from environment variables. If no keys are found, it falls back to Mock in test/dev mode.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Agent                                        │
│  ┌─────────────┐   ┌─────────────┐           │
│  │   Skills    │   │    Tools    │           │
│  │  (tasks)    │   │ (capabil.)  │           │
│  └──────┬──────┘   └──────┬──────┘           │
│         │                 │                  │
│  ┌──────▼──────────────────▼──────┐          │
│  │       LLM Provider Layer       │          │
│  │  ┌──────┐ ┌────────┐ ┌──────┐  │          │
│  │  │OpenAI│ │Anthrop.│ │ Mock │  │          │
│  │  └──────┘ └────────┘ └──────┘  │          │
│  └────────────────────────────────┘          │
└──────────────────────────────────────────────┘
```

## Agent

The `Agent` is the central orchestrator. It wires together an LLM provider, a tool registry, and executes skills.

```ts
const agent = new Agent()                              // auto-discovers provider from env
const agent = new Agent(customProvider)                // inject a custom LLMProvider
// Access:
agent.context.provider   // → LLMProvider
agent.context.model      // → 'gpt-4o'
agent.context.temperature // → 0.7
```

### `agent.run(skill, context)`

Executes a skill once and returns `SkillResult`:

```ts
const result = await agent.run(mySkill, { ... })
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)  // API errors sanitized (keys redacted)
}
```

### `agent.runToolLoop(messages, options?)`

Bounded agentic loop — the shared foundation for chatbot, Thunderbird
plugin, and persona-bot. Sends messages + registry tool schemas, executes
any returned `tool_calls` via the registry, appends results, and repeats
until the model answers with text or `maxRounds` (default 5, capped 10):

```ts
const result = await agent.runToolLoop([
  { role: 'system', content: 'Answer only from tool results.' },
  { role: 'user', content: 'What invoices exist?' },
])
// → { success: true, data: '...', toolsUsed: ['recall_brain'] }
```

`options`: `{ maxRounds? (default 5, capped 10), allowedTools?: string[] }`.
`allowedTools` restricts which *active* tools are offered to the model;
tool calls for non-offered tools are refused without executing (and are
not recorded in `toolsUsed`). Direct `registry.execute()` calls are
unaffected — the allowlist only governs the loop.

### Multimodal messages

`Message.content` accepts `string | ContentPart[]` (`text`, `image_url`,
`file`). Each provider serializes parts to its native wire shape
(`src/providers/multimodal.ts` — pure functions, unit-tested):

| Part | OpenAI / OpenRouter / compatible | Anthropic | Google (AIStudio / Vertex) |
|------|----------------------------------|-----------|----------------------------|
| `text` | native | native | native |
| `image_url` (data:) | native | native image block | `inlineData` |
| `image_url` (https:) | native | native url source | `fileData` |
| `file` pdf | `input_file` (`file_data`) | document block | `inlineData` |
| `file` text/* | inlined as text | inlined as text | `inlineData` |
| `file` other (xlsx, docx…) | placeholder note | placeholder note | `inlineData` |

```ts
await agent.runToolLoop([
  { role: 'user', content: [
    { type: 'text', text: 'What is in this image?' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
    { type: 'file', file: { data: '<base64>', mimeType: 'application/pdf', name: 'a.pdf' } },
  ] },
])
```

Requires a tool-capable provider (`openai`, `openai-compatible`,
`fetch-compatible`, or `openrouter`). `mock` demonstrates the loop with
heuristic tool calls (no API key). Tools resolve by id first, then by name
— the LLM only ever sees names.

## Skills

Skills encapsulate LLM-powered tasks. Extend `BaseSkill<TContext, TResult>` with `name`, `description`, and `execute()`:

```ts
import { BaseSkill } from 'sure-gentic'

class Translator extends BaseSkill<{ text: string; lang: string }, string> {
  name = 'translator'
  description = 'Translates text to a target language'

  async execute(context: { text: string; lang: string }): Promise<string> {
    return this.callLLM(this.agent, [
      { role: 'system', content: `You are a translator. Translate to ${context.lang}.` },
      { role: 'user', content: context.text },
    ])
  }
}

const agent = new Agent()
const result = await agent.run(new Translator(), { text: 'Hello', lang: 'French' })
// → { success: true, data: "Bonjour" }
```

### BaseSkill Helpers

| Method | Purpose |
|--------|---------|
| `callLLM(agentContext, messages)` | Calls the provider's `complete()` and returns content string |
| `success(data)` | Wraps result in `{ success: true, data }` |
| `error(message)` | Wraps error in `{ success: false, error }` |

## Tools

Built-in tools are registered on every `Agent` automatically. They provide reusable capabilities that any skill can use:

| Tool | Purpose | Parameters |
|------|---------|------------|
| `web_search` | Web search: SerpAPI → Exa → mock | `query` (required), `max_results` (optional, default 5) |
| `firesearch_search` | Full-text search over your own Firesearch index | `index_path`, `query` (required), `limit`, `access_key` (optional) |
| `firesearch_put_doc` | Add a document to your Firesearch index | `index_path`, `doc_id`, `text` (required), `fields` (optional) |
| `firesearch_create_index` | Create a Firesearch full-text index | `index_path` (required), `name` (optional) |
| `calculator` | Safe math evaluation | `expression` (required) — no `Function()` injection |
| `current_time` | Current time in timezone | `timezone` (optional, default UTC) |

### Custom Tools

```ts
import { ToolRegistryService, type ToolDefinition, type ToolHandler } from 'sure-gentic'

const weatherDef: ToolDefinition = {
  id: 'get_weather',
  name: 'get_weather',
  description: 'Get weather for a city',
  parameters: [{ name: 'city', type: 'string', description: 'City name', required: true }],
  returns: { type: 'object', description: 'Weather data' },
  isActive: true,
}

const weatherHandler: ToolHandler = async (params) => {
  const res = await fetch(`https://api.weather.com/${params.city}`)
  return res.json()
}

ToolRegistryService.getInstance().register(weatherDef, weatherHandler)

// Execute directly (by id or name — the LLM only sees names):
const result = await ToolRegistryService.getInstance().execute('get_weather', { city: 'London' }, { metadata: {} })

// List (alias of getAll — this is what sure-chatbot /api/tools calls):
const tools = ToolRegistryService.getInstance().listTools()
```

### Enabling / Disabling Tools

`ToolDefinition.isActive` governs whether a tool is offered to models.
Disabled tools stay listed but are excluded from `getToolSchemas()` and
`getOpenAITools()` (and therefore from `runToolLoop`):

```ts
const registry = ToolRegistryService.getInstance()
registry.setToolActive('web_search', false) // by id or name; false if unknown
registry.getActive()                        // active tools only
registry.listTools()                        // all tools, including disabled
```

### Tool Schemas for LLMs

Export the registry in OpenAI function-calling format and pass it to any
tool-capable provider via `CompletionOptions.tools`:

```ts
import { ToolRegistryService } from 'sure-gentic'

const tools = ToolRegistryService.getInstance().getOpenAITools()
// → [{ type: 'function', function: { name, description, parameters } }]

await provider.complete(messages, { tools, toolChoice: 'auto' })
// → { content, toolCalls: [{ id, name, arguments }], ... }
```

### Builtin Tool Config

`web_search` tries live backends in order — SerpAPI (`SEARCH_API_KEY`),
then Exa (`EXA_API_KEY`) — otherwise it returns clearly-mocked placeholder
results. Inject keys at runtime (keystores, per-tenant keys, browsers)
instead of relying on env:

```ts
import { configureBuiltinTools, isSearchConfigured } from 'sure-gentic'

configureBuiltinTools({ searchApiKey: decrypted, exaApiKey: exaKey }) // omitted/empty = clear to env fallback
isSearchConfigured() // true when web_search would hit a live API
```

### Firesearch Tool Config

`firesearch_*` tools talk to your own Firesearch instance (serverless
full-text search over your indexes — not the web). Search runs with a 24h
access key, auto-generated from the secret API key when you don't pass
`access_key` explicitly. The secret key is backend-to-backend only
(`X-API-Key` header — never expose it in browsers):

```ts
import { configureFiresearchTools, isFiresearchConfigured } from 'sure-gentic'

configureFiresearchTools({ host, apiKey: secret }) // or FIRESEARCH_HOST / FIRESEARCH_API_KEY env
isFiresearchConfigured() // true when a Firesearch host is set
```

## Streaming

For providers that support it:

```ts
const provider = LLMProviderFactory.getInstance().getProvider('openai')!
await provider.completeStream(
  [{ role: 'user', content: 'Write a story' }],
  (chunk) => process.stdout.write(chunk),
  { model: 'gpt-4o' }
)
```

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `AI_PROVIDER` | auto | `openai`, `anthropic`, or `mock` |
| `AI_MODEL` | provider default | Model override (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `AI_TEMPERATURE` | `0.7` | LLM temperature |
| `SEARCH_API_KEY` | — | SerpAPI key for `web_search` tool (fallback when nothing injected via `configureBuiltinTools`) |
| `EXA_API_KEY` | — | Exa key, second `web_search` backend after SerpAPI (or `exaApiKey` injection) |
| `FIRESEARCH_HOST` | — | Firesearch instance host for `firesearch_*` tools (or `configureFiresearchTools`) |
| `FIRESEARCH_API_KEY` | — | Firesearch secret key, backend-to-backend only (auto-generates 24h search access keys) |
| `FIRESEARCH_ACCESS_KEY` | — | Pre-generated Firesearch search access key (skips auto-generation) |
| `NODE_ENV` | — | When `test`, enables Mock provider |

## Import contract

All relative source imports carry explicit `.js` extensions
(`./types.js`, `./providers/factory.js`). `tsconfig.json` uses
`moduleResolution: bundler` for dev; `tsconfig.nodenext.json` enforces the
NodeNext contract and emits `dist/node`, which loads under plain Node
without `tsx`. `npm run build` compiles ESM + CJS + NodeNext and runs the
smoke scripts, so extensionless imports fail the build instead of
surfacing at runtime.

## API Reference

| Import | Type | Description |
|--------|------|-------------|
| `Agent` | class | Orchestrates provider + skills + tools |
| `BaseSkill` | class (abstract) | Extend to create custom skills |
| `LLMProviderFactory` | class (singleton) | Discovers and registers providers from env |
| `OpenAIProvider` | class | OpenAI LLM backend |
| `AnthropicProvider` | class | Anthropic LLM backend |
| `MockProvider` | class | Mock LLM for testing |
| `ToolRegistryService` | class (singleton) | Register and execute tools |
| `validateParameters` | function | Validate params against a `ToolDefinition` |
| `registerBuiltinTools` | function | Registers built-in tools (called in Agent constructor) |
| `configureBuiltinTools` | function | Injects builtin tool config (`{ searchApiKey?, exaApiKey? }`) without env dependence |
| `isSearchConfigured` | function | True when `web_search` would hit a live API |
| `registerFiresearchTools` | function | Registers Firesearch tools (called in Agent constructor) |
| `configureFiresearchTools` | function | Injects Firesearch config (`{ host?, apiKey?, accessKey? }`) without env dependence |
| `isFiresearchConfigured` | function | True when `firesearch_*` tools have a host |
| `FetchCompatibleProvider` | class | Zero-import fetch-only OpenAI-compatible provider (browsers, Thunderbird) |
| `loadConfig` | function | Loads `SureGenticConfig` from env vars |

### Types

| Type | Description |
|------|-------------|
| `LLMProvider` | Interface for LLM backends (`complete`, `completeStream`, `countTokens`, etc.) |
| `Message` | `{ role, content, name? }` |
| `CompletionOptions` | `{ model?, temperature?, maxTokens?, topP?, stop? }` |
| `CompletionResponse` | `{ content, model, usage?, finishReason?, id? }` |
| `AgentContext` | `{ provider, model, temperature }` |
| `Skill<TContext, TResult>` | Interface for skills |
| `SkillResult` | `{ success, data?, error? }` |
| `ToolDefinition` | Tool schema: `{ id, name, description, parameters, returns }` |
| `ToolHandler` | `(params, context) => Promise<unknown>` |
| `ToolExecutionResult` | `{ success, result?, error?, executionTime }` |

## AI Agent Integration

AI coding assistants (OpenCode, Claude Code, Cursor, VS Code Copilot) can use sure-gentic to scaffold agents, create skills, and wire up tools. Here's how to prompt them:

### Scaffold a new agent

```
Using sure-gentic, create an agent that can research topics and summarize them.
Create a `ResearchSkill` that takes a query, uses the web_search tool to find
results, then calls the LLM to summarize findings.
```

### Create a custom skill

```
Create a new skill at src/skills/sentiment.ts that analyzes the sentiment of
text. It should extend BaseSkill<string, string>, call the LLM with a
sentiment analysis prompt, and return "positive", "negative", or "neutral".
```

### Register a custom tool

```
Create a weather tool using the sure-gentic ToolRegistryService. It should
take a city name, fetch weather from an API, and register itself so skills
can use it.
```

### What AI agents should know

| File | What it tells the AI |
|------|---------------------|
| `src/types.ts` | Core interfaces: `LLMProvider`, `Message`, `Skill`, `AgentContext`, `ToolDefinition` |
| `src/agent.ts` | `Agent` class — orchestrates providers, skills, and tools |
| `src/skills/skill.ts` | `BaseSkill` abstract class — how to create new skills |
| `src/tools/registry.ts` | `ToolRegistryService` — how tools are registered and executed |
| `src/tools/builtin.ts` | Built-in tools (calculator, web_search via SerpAPI/Exa, current_time) |
| `src/tools/firesearch.ts` | Firesearch tools (search/put_doc/create_index over your own indexes) |
| `src/providers/factory.ts` | `LLMProviderFactory` — how providers are discovered from env |

### Example: AI-generated agent workflow

1. Read `src/types.ts` → understand `Skill`, `AgentContext`, `ToolDefinition` interfaces
2. Read `src/skills/skill.ts` → understand `BaseSkill` contract
3. Create a new skill file extending `BaseSkill`
4. Register any needed tools via `ToolRegistryService`
5. Instantiate `Agent` and call `agent.run(skill, context)`

## Development

```bash
git clone git@github.com:ShingWong/sure-gentic.git
cd sure-gentic
npm install
npm run build
npm test           # 24 tests (tool loop, registry, builtin)
node scripts/smoke/node-import.mjs  # plain-Node ESM import + schema check
node scripts/smoke/tool-name.mjs    # registry name-lookup check
npm run typecheck  # tsc --noEmit
```
