#!/usr/bin/env node
import { spawn } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const child = spawn(process.execPath, ['--', './bin/oracle.js', ...args], {
  stdio: 'inherit',
});
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
