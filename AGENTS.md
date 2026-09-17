# sure-gentic — AI Agent Context

## What this project is

A portable agent creation framework for TypeScript. Build AI agents with composable **Skills** and pluggable **Tools**, runnable against OpenAI, Anthropic, or any LLM backend.

## Key files to read

- `src/types.ts` — Core interfaces (LLMProvider, Message, Skill, AgentContext, ToolDefinition)
- `src/agent.ts` — Agent orchestrator class
- `src/skills/skill.ts` — BaseSkill abstract class (extend this to create skills)
- `src/tools/registry.ts` — ToolRegistryService singleton
  (`register`, `execute` by id-or-name, `listTools`/`getAll`,
  `getOpenAITools` schema export)
- `src/providers/fetch-compatible.ts` — zero-import fetch provider for
  browsers/extensions (same options shape as openai-compatible)
- `src/tools/builtin.ts` — Built-in tool examples
- `src/providers/factory.ts` — LLMProviderFactory singleton

## Three concepts

1. **Agent** — central orchestrator (`new Agent()` auto-discovers provider from env)
2. **Skill** — extends `BaseSkill<TContext, TResult>`, implements `name`, `description`, `execute()`
3. **Tool** — registered via `ToolRegistryService.getInstance().register(def, handler)`

## Common tasks

**Create a skill:** Extend `BaseSkill`, implement `name + description + execute()`. Use `this.callLLM()` to invoke the LLM.

**Create a tool:** Define a `ToolDefinition` + `ToolHandler`, register via `ToolRegistryService.getInstance().register()`.

**Run an agent:** `new Agent()` → `await agent.run(skill, context)` → `SkillResult`.
Single-shot. For tool use, see the agentic loop below.

**Run the agentic loop:** `await agent.runToolLoop(messages, { maxRounds })` —
sends messages + `registry.getOpenAITools()`, executes returned `tool_calls`
via the registry (lookup by id, fallback by name), repeats to answer.
Returns `{ success, data, toolsUsed }`.

**Expose tools to an LLM:** `registry.getOpenAITools()` → OpenAI
`{ type: 'function', function: {...} }` format → `provider.complete(msgs,
{ tools, toolChoice: 'auto' })` → `response.toolCalls`.

## Provider setup

- OPENAI_API_KEY env var → OpenAI provider
- ANTHROPIC_API_KEY env var → Anthropic provider
- AI_PROVIDER=mock → Mock provider (testing)
- AI_MODEL overrides the default model

## Build & test

```bash
npm run build     # tsc (ESM + CJS)
npm test          # vitest (14 tests, incl. tool-loop suite)
npm run typecheck # tsc --noEmit
```

## Architecture

```
Agent → Skills (LLM tasks) + Tools (capabilities) → Provider Layer (OpenAI/Anthropic/Mock)
```

## Graphify

A queryable knowledge graph of this project is indexed at `/usr/local/devel/sure-master/graphify-out/merged-graph.json` (merged across all sure-* projects).

Query via OpenCode: `/graphify /path/to/project` or `graphify query "your question" --graph /path/to/graph.json`

Rebuild index: `graphify extract /path/to/project --code-only --out /tmp/graphify-out`
