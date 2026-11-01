#!/usr/bin/env node
// daily-rollup — Kar's rollup of one day of the shared feed (tools/team.mjs rollup).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const r = spawnSync('node', ['tools/team.mjs', 'rollup', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
