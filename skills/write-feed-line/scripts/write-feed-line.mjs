#!/usr/bin/env node
// write-feed-line — one line into the team's shared feed, through the writer (tools/team.mjs add).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const r = spawnSync('node', ['tools/team.mjs', 'add', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
