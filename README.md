# sure-gentic

**Write AI skills once. Run them anywhere.** sure-gentic is a lightweight, provider-agnostic AI agent framework. Define your agent's capabilities as modular **Skills**, then swap between OpenAI, Anthropic, or any LLM backend with a single environment variable — no code changes, no lock-in.

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
| **Provider lock-in** | Skill code never references a specific model or provider. Swap from GPT-4o to Claude by changing `AI_PROVIDER`. |
| **Scattered tool integration** | Built-in tool registry with validation, schemas, and execution lifecycle. Add tools once, use them from any skill. |
| **No standard skill pattern** | `BaseSkill` gives you a consistent interface: `name`, `description`, `execute()`. All skills look the same, all skills compose the same way. |
| **Context bloat** | Minimal core (~800 lines). No heavy abstractions, no orchestrator chains, no vector store dependencies. Add only what you need. |
| **Fragmented streaming** | Unified `completeStream()` across providers — same interface for OpenAI and Anthropic streaming. |

### How it compares

| | sure-gentic | LangChain | Vercel AI SDK |
|---|---|---|---|
| Provider-agnostic | ✅ Yes — env var swap | ✅ Yes | ✅ Yes |
| Skill architecture | ✅ First-class `BaseSkill` | ❌ No standard pattern | ❌ No skill abstraction |
| Tool system | ✅ Built-in with validation | ✅ Yes | ❌ External only |
| Bundle size | ~800 lines core | ~50K+ lines | ~10K+ lines |
| Peer deps | 3 (all optional) | 15+ required | 5+ required |
| Learning curve | Low — 3 concepts (Skill, Agent, Tool) | High — chains, agents, retrievers, memory | Medium — streams, tools, providers |

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

**Mock** — no API key needed, useful for testing. Enable with:

```bash
export AI_PROVIDER=mock
```

The factory auto-discovers providers from environment variables. If no keys are found, it falls back to Mock in test/dev mode.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Agent                                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Provider │  │   Tool   │  │   Skills   │ │
│  │ Factory  │  │ Registry │  │ (User-Def) │ │
│  └────┬─────┘  └────┬─────┘  └──────┬─────┘ │
│       │              │               │       │
│  ┌────▼─────┐  ┌────▼─────┐  ┌──────▼─────┐ │
│  │ OpenAI   │  │ web_     │  │ Custom     │ │
│  │ Anthropic│  │ search   │  │ Skills     │ │
│  │ Mock     │  │ calc     │  │ extend     │ │
│  │          │  │ time     │  │ BaseSkill  │ │
│  └──────────┘  └──────────┘  └────────────┘ │
└─────────────────────────────────────────────┘
```

## Skills

Skills are the core unit of work. Extend `BaseSkill<TContext, TResult>` and implement `name`, `description`, and `execute()`:

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

const result = await agent.run(new Translator(), { text: 'Hello', lang: 'French' })
// → { success: true, data: "Bonjour" }
```

### BaseSkill Helpers

| Method | Purpose |
|--------|---------|
| `callLLM(agentContext, messages)` | Calls the provider's `complete()` and returns content string |
| `success(data)` | Wraps result in `{ success: true, data }` |
| `error(message)` | Wraps error in `{ success: false, error }` |

## Agent

```ts
const agent = new Agent()                              // auto-discovers provider from env
const agent = new Agent(customProvider)                // inject a custom LLMProvider
// Access:
agent.context.provider   // → LLMProvider
agent.context.model      // → 'gpt-4o'
agent.context.temperature // → 0.7
```

### `agent.run(skill, context)`

Executes a skill and returns `SkillResult`:

```ts
const result = await agent.run(mySkill, { ... })
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)  // API errors sanitized (keys redacted)
}
```

## Tools

Built-in tools registered on every Agent:

| Tool | Purpose | Parameters |
|------|---------|------------|
| `web_search` | SerpAPI web search | `query` (required), `max_results` (optional, default 5) |
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

// Execute directly:
const result = await ToolRegistryService.getInstance().execute('get_weather', { city: 'London' }, { metadata: {} })
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
| `SEARCH_API_KEY` | — | SerpAPI key for `web_search` tool |
| `NODE_ENV` | — | When `test`, enables Mock provider |

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

## Development

```bash
git clone git@github.com:ShingWong/sure-gentic.git
cd sure-gentic
npm install
npm run build
npm test           # 10 tests
npm run typecheck  # tsc --noEmit
```
