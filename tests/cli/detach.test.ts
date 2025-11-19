import { describe, expect, test } from 'vitest';
import { shouldDetachSession } from '../../src/cli/detach.js';

describe('shouldDetachSession', () => {
  test('disables detach when env disables it', () => {
    const result = shouldDetachSession({
      engine: 'api',
      model: 'gpt-5.1',
      waitPreference: true,
      disableDetachEnv: true,
    });
    expect(result).toBe(false);
  });

  test('disables detach for gemini regardless of engine or wait preference', () => {
    const result = shouldDetachSession({
      engine: 'api',
      model: 'gemini-3-pro',
      waitPreference: true,
      disableDetachEnv: false,
    });
    expect(result).toBe(false);
  });

  test('allows detach for non-gemini models when env permits', () => {
    const result = shouldDetachSession({
      engine: 'api',
      model: 'gpt-5.1',
      waitPreference: true,
      disableDetachEnv: false,
    });
    expect(result).toBe(true);
  });
});
