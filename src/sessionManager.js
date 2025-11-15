import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';

const ORACLE_HOME = process.env.ORACLE_HOME_DIR ?? path.join(os.homedir(), '.oracle');
const SESSIONS_DIR = path.join(ORACLE_HOME, 'sessions');
const MAX_STATUS_LIMIT = 1000;

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureSessionStorage() {
  await ensureDir(SESSIONS_DIR);
}

function slugify(text, maxLength = 32) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) {
    return 'session';
  }
  const parts = [];
  let length = 0;
  for (const word of words) {
    const projected = length === 0 ? word.length : length + 1 + word.length;
    if (projected > maxLength) {
      if (parts.length === 0) {
        parts.push(word.slice(0, maxLength));
      }
      break;
    }
    parts.push(word);
    length = projected;
  }
  return parts.join('-') || 'session';
}

export function createSessionId(prompt) {
  const timestamp = new Date().toISOString().replace(/\..*/, '').replace('T', '-').replace(/:/g, '-');
  const slug = slugify(prompt);
  return `${timestamp}-${slug}`;
}

function sessionDir(id) {
  return path.join(SESSIONS_DIR, id);
}

function metaPath(id) {
  return path.join(sessionDir(id), 'session.json');
}

function logPath(id) {
  return path.join(sessionDir(id), 'output.log');
}

function requestPath(id) {
  return path.join(sessionDir(id), 'request.json');
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function initializeSession(options, cwd) {
  await ensureSessionStorage();
  let sessionId = createSessionId(options.prompt || 'session');
  while (await fileExists(sessionDir(sessionId))) {
    sessionId = `${sessionId}-${Math.floor(Math.random() * 1000)}`;
  }
  const dir = sessionDir(sessionId);
  await ensureDir(dir);
  const metadata = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    promptPreview: (options.prompt || '').slice(0, 160),
    model: options.model,
    cwd,
    options: {
      prompt: options.prompt,
      file: options.file ?? [],
      model: options.model,
      maxInput: options.maxInput,
      system: options.system,
      maxOutput: options.maxOutput,
      silent: options.silent,
      filesReport: options.filesReport,
    },
  };
  await fs.writeFile(metaPath(sessionId), JSON.stringify(metadata, null, 2), 'utf8');
  await fs.writeFile(requestPath(sessionId), JSON.stringify(metadata.options, null, 2), 'utf8');
  await fs.writeFile(logPath(sessionId), '', 'utf8');
  return metadata;
}

export async function readSessionMetadata(sessionId) {
  try {
    const raw = await fs.readFile(metaPath(sessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function updateSessionMetadata(sessionId, updates) {
  const existing = (await readSessionMetadata(sessionId)) ?? { id: sessionId };
  const next = { ...existing, ...updates };
  await fs.writeFile(metaPath(sessionId), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function createSessionLogWriter(sessionId) {
  const stream = createWriteStream(logPath(sessionId), { flags: 'a' });
  const logLine = (line = '') => {
    stream.write(`${line}\n`);
  };
  const writeChunk = (chunk) => {
    stream.write(chunk);
    return true;
  };
  return { stream, logLine, writeChunk, logPath: logPath(sessionId) };
}

export async function listSessionsMetadata() {
  await ensureSessionStorage();
  const entries = await fs.readdir(SESSIONS_DIR).catch(() => []);
  const metas = [];
  for (const entry of entries) {
    const meta = await readSessionMetadata(entry);
    if (meta) {
      metas.push(meta);
    }
  }
  return metas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function filterSessionsByRange(metas, { hours = 24, includeAll = false, limit = 100 }) {
  const maxLimit = Math.min(limit, MAX_STATUS_LIMIT);
  let filtered = metas;
  if (!includeAll) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    filtered = metas.filter((meta) => new Date(meta.createdAt).getTime() >= cutoff);
  }
  const limited = filtered.slice(0, maxLimit);
  const truncated = filtered.length > maxLimit;
  return { entries: limited, truncated, total: filtered.length };
}

export async function readSessionLog(sessionId) {
  try {
    return await fs.readFile(logPath(sessionId), 'utf8');
  } catch {
    return '';
  }
}

export async function deleteSessionsOlderThan({ hours = 24, includeAll = false } = {}) {
  await ensureSessionStorage();
  const entries = await fs.readdir(SESSIONS_DIR).catch(() => []);
  if (!entries.length) {
    return { deleted: 0 };
  }
  const cutoff = includeAll ? Number.NEGATIVE_INFINITY : Date.now() - hours * 60 * 60 * 1000;
  let deleted = 0;

  for (const entry of entries) {
    const dir = sessionDir(entry);
    let createdMs;
    const meta = await readSessionMetadata(entry);
    if (meta?.createdAt) {
      const parsed = Date.parse(meta.createdAt);
      if (!Number.isNaN(parsed)) {
        createdMs = parsed;
      }
    }
    if (createdMs == null) {
      try {
        const stats = await fs.stat(dir);
        createdMs = stats.birthtimeMs || stats.mtimeMs;
      } catch {
        continue;
      }
    }
    if (includeAll || (createdMs != null && createdMs < cutoff)) {
      await fs.rm(dir, { recursive: true, force: true });
      deleted += 1;
    }
  }

  return { deleted };
}

export async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { ORACLE_HOME, SESSIONS_DIR, MAX_STATUS_LIMIT };
