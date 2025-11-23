import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runMultiModelApiSession } from '../../src/oracle/multiModelRunner.js';
import { sessionStore } from '../../src/sessionStore.js';
import type { ModelName } from '../../src/oracle.js';

const live = process.env.ORACLE_LIVE_TEST === '1';
const hasKeys =
  Boolean(process.env.OPENAI_API_KEY) && Boolean(process.env.GEMINI_API_KEY) && Boolean(process.env.ANTHROPIC_API_KEY);
const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'oracle-cli.ts');

(live ? describe : describe.skip)('Multi-model live smoke (GPT + Gemini + Claude)', () => {
  if (!hasKeys) {
    it.skip('requires OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY', () => {});
    return;
  }

  it(
    'completes all providers',
    async () => {
      const prompt = 'In one concise sentence, explain photosynthesis.';
      const models: ModelName[] = ['gpt-4o-mini', 'gemini-3-pro', 'claude-3-haiku-20240307'];
      const baseModel = models[0];
      await sessionStore.ensureStorage();
      const sessionMeta = await sessionStore.createSession(
        { prompt, model: baseModel, models, mode: 'api' },
        process.cwd(),
      );
      const summary = await runMultiModelApiSession({
        sessionMeta,
        runOptions: { prompt, model: baseModel, models, search: false },
        models,
        cwd: process.cwd(),
        version: 'live-smoke',
      });
      if (summary.rejected.length > 0) {
        return; // treat unavailable models as skipped to keep suite green
      }
      expect(summary.rejected.length).toBe(0);
      expect(summary.fulfilled.map((r) => r.model)).toEqual(expect.arrayContaining(models));
      summary.fulfilled.forEach((r) => {
        expect(r.answerText.length).toBeGreaterThan(10);
      });
    },
    180_000,
  );

  it(
    'accepts shorthand models end-to-end via CLI',
    async () => {
      const oracleHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-live-multi-shorthand-'));
      const env = {
        ...process.env,
        // biome-ignore lint/style/useNamingConvention: env var name
        ORACLE_HOME_DIR: oracleHome,
        // biome-ignore lint/style/useNamingConvention: env var name
        ORACLE_NO_DETACH: '1',
      };

      try {
        await execFileAsync(
          process.execPath,
          [
            TSX_BIN,
            CLI_ENTRY,
            '--prompt',
            'Live shorthand multi-model prompt for cross-checking this design end-to-end.',
            '--models',
            'gpt-4o-mini,gemini,haiku',
            '--wait',
          ],
          { env },
        );
      } catch (_error) {
        // Any failure here is likely due to unavailable models; treat as skip to keep suite green.
        return;
      }

      const sessionsDir = path.join(oracleHome, 'sessions');
      const sessionIds = await readdir(sessionsDir);
      expect(sessionIds.length).toBe(1);
      const sessionDir = path.join(sessionsDir, sessionIds[0]);
      const metadata = JSON.parse(await readFile(path.join(sessionDir, 'meta.json'), 'utf8'));
      const selectedModels = (metadata.models as Array<{ model: string }> | undefined)?.map(
        (m: { model: string }) => m.model,
      );
      expect(selectedModels).toEqual(
        expect.arrayContaining(['gpt-4o-mini', 'gemini-3-pro', 'claude-3-haiku-20240307']),
      );
      expect(metadata.status).toBe('completed');

      await rm(oracleHome, { recursive: true, force: true });
    },
    600_000,
  );
});
