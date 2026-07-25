import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LLMProviderFactory } from './factory';

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    LLMProviderFactory.getInstance().clear();
  });

  it('returns singleton instance', () => {
    const a = LLMProviderFactory.getInstance();
    const b = LLMProviderFactory.getInstance();
    expect(a).toBe(b);
  });

  it('registers mock provider when AI_PROVIDER=mock', () => {
    process.env.AI_PROVIDER = 'mock';
    const result = LLMProviderFactory.getInstance().initializeFromEnv();
    expect(result.registered).toContain('mock');
    expect(result.defaultProvider?.name).toBe('mock');
    delete process.env.AI_PROVIDER;
  });

  it('does not auto-register mock without explicit opt-in', () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const result = LLMProviderFactory.getInstance().initializeFromEnv();
    expect(result.registered).not.toContain('mock');
    process.env.NODE_ENV = origNodeEnv;
  });
});
