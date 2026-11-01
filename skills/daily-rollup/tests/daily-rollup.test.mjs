// daily-rollup.test.mjs — on a scratch feed, the rollup puts the waiting listing first and groups each bot's lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/daily-rollup.mjs', import.meta.url));

test('NEEDS SIMON first, then each bot', () => {
  const d = mkdtempSync(join(tmpdir(), 'skill-'));
  mkdirSync(join(d, '.estate')); writeFileSync(join(d, '.estate', 'feed.jsonl'), '');
  const env = { ...process.env, KAR_CONTINUITY: d };
  const add = (...a) => spawnSync('node', ['tools/team.mjs', 'add', ...a], { cwd: root, encoding: 'utf8', env });
  assert.equal(add('--agent', 'money-time', '--kind', 'listing', '--what', 'kar-tally listing draft', '--link', 'https://e.example/d', '--ts', '2026-11-01T08:00:00Z').status, 0);
  assert.equal(add('--agent', 'scout', '--kind', 'lead', '--what', 'a firm asked about owning its model', '--link', 'https://e.example/l', '--ts', '2026-11-01T09:00:00Z').status, 0);
  const r = spawnSync('node', [script, '--date', '2026-11-01'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.ok(out.startsWith("## Kar's rollup · 2026-11-01\n\n### NEEDS SIMON (1)\n\n- 08:00 **Money time** [listing] kar-tally listing draft"), out);
  assert.ok(out.includes('auditor: not yet audited'));
  assert.ok(out.indexOf('### Money time (1)') < out.indexOf('### Scout (1)'));
});
