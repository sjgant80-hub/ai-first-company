// check-draft's own tests: no network (drafts with no link), the public fixture holds, the exit code is the verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../scripts/check-draft.mjs', import.meta.url));
const HOLDS = fileURLToPath(new URL('../../../data/draftgate-holds.fixture.json', import.meta.url));
const run = (...a) => { const r = spawnSync(process.execPath, [SKILL, ...a, '--holds', HOLDS], { encoding: 'utf8' }); return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr }; };

test('a plain draft with nothing to check passes, exit 0', () => {
  const r = run('--text', 'A gate that reads a draft before it goes out.');
  assert.equal(r.code, 0); assert.equal(r.out.verdict, 'PASS'); assert.equal(r.out.link, null);
});
test('a held claim fails, exit 1, with the hold named', () => {
  const r = run('--text', 'Our next launch, codename Bluebird, ships soon.');
  assert.equal(r.code, 1); assert.equal(r.out.verdict, 'FAIL');
  assert.ok(r.out.checks.some((c) => c.check === 'hold' && c.result === 'FAIL' && c.evidence.includes('fixture-bluebird')));
});
test('numbers with no link flag, exit 1; a price flags too', () => {
  const a = run('--text', 'We ship 600 servers.');
  assert.equal(a.code, 1); assert.equal(a.out.verdict, 'FLAG');
  assert.ok(a.out.checks.some((c) => c.check === 'backing' && c.evidence === 'numbers with no link: 600'));
  const b = run('--text', 'Get the skill from $5.');
  assert.equal(b.code, 1); assert.equal(b.out.verdict, 'FLAG');
  assert.ok(b.out.checks.some((c) => c.check === 'words' && /money amount/.test(c.evidence)));
  const c = run('--text', 'We ship 600 MCP servers.');
  assert.equal(c.code, 1); assert.equal(c.out.verdict, 'FAIL', 'the 600-mcps hold');
});
test('a listing is checked as a listing', () => {
  const r = run('--text', 'Guaranteed results.', '--kind', 'listing');
  assert.equal(r.code, 1); assert.equal(r.out.verdict, 'FLAG');
  assert.ok(r.out.checks.some((c) => c.check === 'words'));
});
test('no text: usage, exit 2', () => {
  const r = spawnSync(process.execPath, [SKILL], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.match(r.stderr, /usage/);
});
