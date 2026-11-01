// rollup.test.mjs — Kar's daily rollup: NEEDS SIMON first, the flags, one group per persona, slotted into AGENT_FEED.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAMES, HEAD, dayOf, needsSimon, flagged, byPersona, auditOf, rollup, insert } from '../src/rollup.mjs';

let k = 0;
const X = (o) => ({ ts: '2026-11-01T21:30:00Z', agent: 'kar', kind: 'note', what: 'w', link: '', needs_owner: false, flags: [], id: (o.id || 'id' + k++).padEnd(16, '0'), signed: false, ...o, ...(o.id ? { id: o.id.padEnd(16, '0') } : {}) });

test('names and the heading', () => {
  assert.equal(NAMES['money-time'], 'Money time');
  assert.equal(HEAD, "## Kar's rollup · ");
});

test('dayOf: the London date', () => {
  assert.equal(dayOf('2026-11-01T23:30:00Z'), '2026-11-01');
  assert.equal(dayOf('2026-07-01T23:30:00Z'), '2026-07-02');
  assert.equal(dayOf('nope'), '');
  assert.equal(dayOf(5), '');
});

test('needsSimon: open needs-owner lines only; a signed simon answer closes one', () => {
  const lines = [X({ id: 'a', needs_owner: true }), X({ id: 'b', needs_owner: true }), X({ id: 'c', needs_owner: true }), X({ id: 'd' }),
    X({ agent: 'simon', kind: 'decision', verdict: 'approve', ref: 'b'.padEnd(16, '0'), signed: true }),
    X({ agent: 'simon', kind: 'decision', verdict: 'deny', ref: 'c'.padEnd(16, '0'), signed: false })];
  assert.deepEqual(needsSimon(lines).map((x) => x.id[0]), ['a', 'c']);
  assert.deepEqual(needsSimon([{ needs_owner: true }, null]), []);
  assert.deepEqual(needsSimon('x'), []);
});

test('flagged and byPersona: that day only, roster order, only those who wrote', () => {
  const lines = [X({ agent: 'reach', flags: ['no-receipt'] }), X({ agent: 'kar' }), X({ agent: 'reach' }), X({ agent: 'simon' }), X({ agent: 'builder', flags: ['x'], ts: '2026-10-31T12:00:00Z' }), X({ agent: 'auditor', flags: [] })];
  assert.deepEqual(flagged(lines, '2026-11-01').map((x) => x.agent), ['reach']);
  assert.deepEqual(flagged([X({ flags: 'x' })], '2026-11-01'), []);
  assert.deepEqual(byPersona(lines, '2026-11-01').map(([a, xs]) => [a, xs.length]), [['kar', 1], ['reach', 2], ['auditor', 1], ['simon', 1]]);
  assert.deepEqual(byPersona(lines, '2026-10-31').map(([a]) => a), ['builder']);
});

test("auditOf: the auditor's latest verdict on that line", () => {
  const id = 'q'.padEnd(16, '0');
  const lines = [X({ agent: 'auditor', ref: id, verdict: 'FLAG' }), X({ agent: 'auditor', ref: id, verdict: 'PASS' }), X({ agent: 'kar', ref: id, verdict: 'FAIL' }), X({ agent: 'auditor', ref: 'other', verdict: 'FAIL' }), X({ agent: 'auditor', ref: id, verdict: 'approve' })];
  assert.equal(auditOf(lines, id), 'PASS');
  assert.equal(auditOf(lines, 'none'), null);
});

test('rollup: the section, in order', () => {
  const long = 'x'.repeat(239) + 'yz';
  const lines = [
    X({ id: 'n1', agent: 'money-time', kind: 'listing', what: 'kar-tally listing draft', needs_owner: true, link: 'https://e.example/d', flags: ['needs-owner-forced'], ts: '2026-11-01T06:05:00Z' }),
    X({ id: 'a1', agent: 'auditor', kind: 'receipt', what: 'checked', ref: 'n1'.padEnd(16, '0'), verdict: 'PASS', link: 'r', ts: '2026-11-01T06:30:00Z' }),
    X({ id: 'h1', agent: 'builder', kind: 'handoff', to: 'reach', what: long, ts: '2026-11-01T22:10:00Z' }),
    X({ id: 'o1', agent: 'reach', kind: 'post', what: 'old draft', needs_owner: true, ts: '2026-10-30T10:00:00Z' }),
  ];
  const out = rollup(lines, { date: '2026-11-01' });
  assert.equal(out, [
    "## Kar's rollup · 2026-11-01", '',
    '### NEEDS SIMON (2)', '',
    '- 06:05 **Money time** [listing] kar-tally listing draft · https://e.example/d · `n10000000000` · ⚑ needs-owner-forced · auditor: PASS',
    '- 10:00 **Reach** [post] old draft · `o10000000000` · auditor: not yet audited', '',
    '### Flagged (1)', '',
    '- 06:05 **Money time** [listing] kar-tally listing draft · https://e.example/d · `n10000000000` · ⚑ needs-owner-forced', '',
    '### Builder (1)', '',
    '- 22:10 **Builder** [handoff → Reach] ' + 'x'.repeat(239) + '… · `h10000000000`', '',
    '### Money time (1)', '', '- 06:05 **Money time** [listing] kar-tally listing draft · https://e.example/d · `n10000000000` · ⚑ needs-owner-forced', '',
    '### Auditor (1)', '', '- 06:30 **Auditor** [receipt] checked · r · `a10000000000`', '',
  ].join('\n'));
  assert.ok(out.indexOf('NEEDS SIMON') < out.indexOf('### Builder'));
  const fits = rollup([X({ id: 'f1', what: 'y'.repeat(240) })], { date: '2026-11-01' });
  assert.ok(fits.includes('[note] ' + 'y'.repeat(240) + ' · `f1'), 'a what of exactly 240 is not clipped');
  assert.ok(rollup([X({ id: 'u1', agent: 'ghost', kind: 'handoff', to: 'elf', needs_owner: true })], { date: '2026-11-01' }).includes('**ghost** [handoff → elf] w'));
  assert.equal(rollup([], { date: '2026-11-01' }), "## Kar's rollup · 2026-11-01\n\n### NEEDS SIMON (0)\n\n- nothing is waiting for you\n\n### Flagged (0)\n\n- nothing flagged\n");
  assert.ok(rollup([X({ ts: 'bad', needs_owner: true, id: 'b1' })], { date: '2026-11-01' }).includes('-  **Kar** [note] w · `b10000000000` · auditor: not yet audited'));
  assert.equal(rollup(lines, { date: ['2026-11-01'] }), '');
  assert.equal(rollup(lines, { date: '1 Nov' }), '');
  assert.equal(rollup(lines), '');
});

test('insert: above the first ## heading, same date replaced, the rest untouched', () => {
  const sec = "## Kar's rollup · 2026-11-01\n\nbody\n";
  const md = '# Agent feed\n\nintro\n\n## Synced 31 Oct\n\nsync body\n';
  assert.equal(insert(md, sec), "# Agent feed\n\nintro\n\n## Kar's rollup · 2026-11-01\n\nbody\n\n## Synced 31 Oct\n\nsync body\n");
  const twice = insert(insert(md, sec), "## Kar's rollup · 2026-11-01\n\nnew body");
  assert.equal(twice, "# Agent feed\n\nintro\n\n## Kar's rollup · 2026-11-01\n\nnew body\n\n## Synced 31 Oct\n\nsync body\n");
  const last = '# Agent feed\n\n## Synced 31 Oct\n\ns\n\n' + sec;
  assert.equal(insert(last, "## Kar's rollup · 2026-11-01\n\nB"), "# Agent feed\n\n## Synced 31 Oct\n\ns\n\n## Kar's rollup · 2026-11-01\n\nB\n\n");
  assert.equal(insert(sec + '## Synced\n', "## Kar's rollup · 2026-11-01\n\nC"), "## Kar's rollup · 2026-11-01\n\nC\n\n## Synced\n");
  assert.equal(insert('## Synced\nx\n', sec), "## Kar's rollup · 2026-11-01\n\nbody\n\n## Synced\nx\n");
  assert.equal(insert('# Agent feed\n', sec), "# Agent feed\n\n## Kar's rollup · 2026-11-01\n\nbody\n\n");
  assert.equal(insert('', sec), "## Kar's rollup · 2026-11-01\n\nbody\n\n");
  assert.equal(insert(md, '  '), md);
  assert.equal(insert(md, 5), md);
  assert.equal(insert(5, sec), "## Kar's rollup · 2026-11-01\n\nbody\n\n");
});
