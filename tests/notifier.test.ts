import { describe, expect, it } from 'vitest';
import { resolveNotificationSettings } from '../src/cli/notifier.js';

describe('resolveNotificationSettings', () => {
  it('defaults to enabled when not in CI or SSH', () => {
    const result = resolveNotificationSettings({ cliNotify: undefined, cliNotifySound: undefined, env: {} });
    expect(result.enabled).toBe(true);
    expect(result.sound).toBe(false);
  });

  it('disables by default in CI', () => {
    const result = resolveNotificationSettings({ cliNotify: undefined, cliNotifySound: undefined, env: { CI: '1' } });
    expect(result.enabled).toBe(false);
  });

  it('honors explicit CLI override', () => {
    const result = resolveNotificationSettings({ cliNotify: true, cliNotifySound: true, env: { CI: '1' } });
    expect(result.enabled).toBe(true);
    expect(result.sound).toBe(true);
  });

  it('parses env toggles', () => {
    const result = resolveNotificationSettings({ cliNotify: undefined, cliNotifySound: undefined, env: { ORACLE_NOTIFY: 'off' } });
    expect(result.enabled).toBe(false);
  });
});
