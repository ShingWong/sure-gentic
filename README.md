# Lexagentic

Provider-agnostic AI agent framework with skill-based architecture.

## Quick Start

```bash
npm install lexagentic
```

```typescript
import { Agent, BaseSkill } from 'lexagentic';

// Define a skill
class GreetSkill extends BaseSkill<{ name: string }, string> {
  name = 'greet';
  description = 'Generates a personalized greeting';

  async execute(context: { name: string }): Promise<string> {
    const result = await this.callLLM(this.agent, [
      { role: 'system', content: 'You are a friendly assistant.' },
      { role: 'user', content: `Greet ${context.name} warmly.` },
    ]);
    return result;
  }
}

// Run it
const agent = new Agent();
const result = await agent.run(new GreetSkill(), { name: 'Alice' });
console.log(result);
```

## Configuration

Set environment variables:

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER` | `openai`, `anthropic`, or auto-detect |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_MODEL` | Model override (e.g. `gpt-4o`) |
| `AI_TEMPERATURE` | Temperature (default: 0.7) |

## Architecture

- **Providers** — LLM backends (OpenAI, Anthropic, Google, Ollama, Mock)
- **Skills** — Domain-specific AI tasks
- **Agent** — Executes skills with provider context
