// check-fence.test.mjs — the skill answers from the roster: refused with the reason, allowed once the condition is met.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-fence.mjs', import.meta.url));
const ask = (...a) => { const r = spawnSync('node', [script, ...a], { encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout) }; };

test("a post needs Simon's go", () => {
  assert.deepEqual(ask('reach', 'post.publish'), { code: 1, out: { bot: 'reach', tool: 'post.publish', auditorPass: false, simonGo: false, ok: false, why: "needs Simon's go" } });
  assert.deepEqual(ask('reach', 'post.publish', '--go').code, 0);
});

test('forbidden stays forbidden, even with both conditions', () => {
  const r = ask('scout', 'dm.send', '--pass', '--go');
  assert.equal(r.code, 1);
  assert.equal(r.out.why, 'forbidden');
});

test('a merge needs both the PASS and the go', () => {
  assert.equal(ask('builder', 'main.merge', '--go').out.why, "needs the auditor's PASS");
  assert.equal(ask('builder', 'main.merge', '--pass', '--go').code, 0);
});
