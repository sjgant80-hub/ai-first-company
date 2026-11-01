#!/usr/bin/env node
// audit-feed — the auditor's pass over the shared feed (tools/audit.mjs).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const r = spawnSync('node', ['tools/audit.mjs', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
