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

Executes a skill and returns `SkillResult`:

```ts
const result = await agent.run(mySkill, { ... })
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)  // API errors sanitized (keys redacted)
}
```

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
| `src/tools/builtin.ts` | Built-in tool examples (calculator, web_search, current_time) |
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
npm test           # 10 tests
npm run typecheck  # tsc --noEmit
```
