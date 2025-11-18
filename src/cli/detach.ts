import type { EngineMode } from './engine.js';
import type { ModelName } from '../oracle.js';

export function shouldDetachSession({
  engine,
  model,
  waitPreference,
  disableDetachEnv,
}: {
  engine: EngineMode;
  model: ModelName;
  waitPreference: boolean;
  disableDetachEnv: boolean;
}): boolean {
  if (disableDetachEnv) return false;
  if (model.startsWith('gemini')) return false; // Gemini stays inline to avoid browser/API mismatches
  // Original behavior: always try to detach, then reattach when waitPreference=true
  return true;
}
