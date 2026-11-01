// write-feed-line.test.mjs — the skill writes one redacted line to a scratch feed, and refuses a stranger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/write-feed-line.mjs', import.meta.url));
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'skill-')); mkdirSync(join(d, '.estate')); writeFileSync(join(d, '.estate', 'feed.jsonl'), ''); return d; };
const run = (d, args) => spawnSync('node', [script, ...args], { encoding: 'utf8', env: { ...process.env, KAR_CONTINUITY: d } });

test('writes one line, with the email removed', () => {
  const d = scratch();
  const r = run(d, ['--agent', 'scout', '--kind', 'lead', '--what', 'a lead asked about mint-a-node; reply to ops@example.com', '--link', 'https://e.example/x', '--ts', '2026-11-01T09:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  const lines = readFileSync(join(d, '.estate', 'feed.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].agent, 'scout');
  assert.equal(lines[0].what, 'a lead asked about mint-a-node; reply to [redacted:email]');
  assert.deepEqual(lines[0].flags, ['redacted:email']);
});

test('refuses an agent that is not on the team, and writes nothing', () => {
  const d = scratch();
  const r = run(d, ['--agent', 'grok', '--kind', 'note', '--what', 'hello', '--ts', '2026-11-01T09:00:00Z']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /unknown agent/);
  assert.equal(readFileSync(join(d, '.estate', 'feed.jsonl'), 'utf8'), '');
});
