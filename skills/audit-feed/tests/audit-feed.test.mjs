// audit-feed.test.mjs — on a scratch feed, the skill FAILs a forbidden act and PASSes an allowed one, and writes nothing
// unless asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/audit-feed.mjs', import.meta.url));

test('FAIL for a forbidden act, PASS for an allowed one; nothing written', () => {
  const d = mkdtempSync(join(tmpdir(), 'skill-'));
  mkdirSync(join(d, '.estate')); writeFileSync(join(d, '.estate', 'feed.jsonl'), '');
  const env = { ...process.env, KAR_CONTINUITY: d };
  const add = (...a) => spawnSync('node', ['tools/team.mjs', 'add', ...a, '--ts', '2026-11-01T09:00:00Z'], { cwd: root, encoding: 'utf8', env });
  assert.equal(add('--agent', 'scout', '--kind', 'note', '--what', 'messaged a lead', '--evidence', 'tool:dm.send').status, 0);
  assert.equal(add('--agent', 'scout', '--kind', 'note', '--what', 'read the mentions', '--evidence', 'tool:x.read').status, 0);
  const before = readFileSync(join(d, '.estate', 'feed.jsonl'), 'utf8');
  const r = spawnSync('node', [script], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^FAIL .* scout note: messaged a lead\n\s+ok\s+tools: on the list: feed.write\n\s+FAIL tools: dm\.send: forbidden$/m);
  assert.match(r.stdout, /^PASS .* scout note: read the mentions$/m);
  assert.equal(readFileSync(join(d, '.estate', 'feed.jsonl'), 'utf8'), before);
});
