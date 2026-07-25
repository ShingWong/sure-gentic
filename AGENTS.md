# sure-gentic — AI Agent Context

## What this project is

A portable agent creation framework for TypeScript. Build AI agents with composable **Skills** and pluggable **Tools**, runnable against OpenAI, Anthropic, or any LLM backend.

## Key files to read

- `src/types.ts` — Core interfaces (LLMProvider, Message, Skill, AgentContext, ToolDefinition)
- `src/agent.ts` — Agent orchestrator class
- `src/skills/skill.ts` — BaseSkill abstract class (extend this to create skills)
- `src/tools/registry.ts` — ToolRegistryService singleton
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

## Provider setup

- OPENAI_API_KEY env var → OpenAI provider
- ANTHROPIC_API_KEY env var → Anthropic provider
- AI_PROVIDER=mock → Mock provider (testing)
- AI_MODEL overrides the default model

## Build & test

```bash
npm run build     # tsc (ESM + CJS)
npm test          # vitest (10 tests)
npm run typecheck # tsc --noEmit
```

## Architecture

```
Agent → Skills (LLM tasks) + Tools (capabilities) → Provider Layer (OpenAI/Anthropic/Mock)
```
