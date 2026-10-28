// page.test.mjs — the page's view re-derives and re-verifies; every journal entry reads as a plain sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { viewOf, lineOf } from '../src/page.mjs';

const RUN = JSON.parse(readFileSync(new URL('../data/cycle-run.json', import.meta.url), 'utf8'));
const L = (kind, data, by = 'kar') => lineOf({ kind, by, data });

test('the view of the measured cycle: re-verified, re-derived, matching the receipt', () => {
  const v = viewOf(RUN);
  assert.equal(v.ok, true); assert.equal(v.verified, true); assert.equal(v.matches, true);
  assert.equal(v.entries, RUN.journal.length);
  assert.deepEqual(v.tiles.map((t) => t.n), [5, 1, 1, 4, 6, 1, 1, 6]);
  assert.deepEqual(v.funnel.map((f) => f.n), [5, 3, 1, 1]);
  assert.deepEqual(v.waiting, [{ item: 'post', about: 'pilot-180k' }]);
  assert.equal(v.trace.length, RUN.journal.length);
  assert.equal(v.tiles[5].l, 'waiting for Simon now');
  assert.equal(v.funnel[1].l, 'Eligible to answer');
});

test('a tampered or altered receipt shows as such', () => {
  const t = JSON.parse(JSON.stringify(RUN));
  t.journal[3].data.dryRun = false;
  assert.equal(viewOf(t).verified, false);
  const d = JSON.parse(JSON.stringify(RUN));
  d.dashboard.leads.converted = 9;
  assert.equal(viewOf(d).matches, false);
  assert.deepEqual(viewOf(null), { ok: false, why: 'no cycle receipt' });
  assert.deepEqual(viewOf({ journal: 'x' }), { ok: false, why: 'no cycle receipt' });
  assert.deepEqual(viewOf([]), { ok: false, why: 'no cycle receipt' });
});

test('every kind of entry reads as one plain sentence', () => {
  assert.equal(L('drafted', { item: 'post', about: 'w', proven: true }), 'Kar drafted the post (w); the claim gate proved every number against its receipt.');
  assert.equal(L('drafted', { item: 'post', about: 'w', proven: false }), 'Kar drafted the post (w); the claim gate refused it.');
  assert.equal(L('drafted', { item: 'reply', about: 'c1' }), 'Kar drafted the reply (c1).');
  assert.equal(L('asked', { item: 'close', about: 'c1', flags: ['deal'] }), 'Kar asked Simon to approve the close (c1): deal.');
  assert.equal(L('asked', { item: 'nope' }), 'Kar asked Simon to approve the item: outward.');
  assert.equal(L('asked', { item: 'reply', flags: 'x' }), 'Kar asked Simon to approve the reply: outward.');
  assert.equal(L('approved', { item: 'offer', about: 'c1' }, 'simon'), 'Simon approved the offer (c1), bound to its exact words.');
  assert.equal(L('approved', { item: 'offer' }, 'rehearsal'), 'The rehearsal approver approved the offer, bound to its exact words.');
  assert.equal(L('approved', { item: 'offer' }, 'nobody'), 'Someone approved the offer, bound to its exact words.');
  assert.equal(L('waiting', { item: 'post', about: 'p' }), 'The post (p) is waiting for Simon.');
  assert.equal(L('sent', { item: 'reply', about: 'c1' }), 'The reply (c1) went out (a dry run: nothing reaches X).');
  assert.equal(L('sent', { item: 'close', about: 'c1' }), 'The close (c1) was committed (a dry run).');
  assert.equal(L('held', { item: 'post' }), 'The post was held: oversight says not now.');
  assert.equal(L('refused', { item: 'post', why: 'no' }), 'Kar refused the post: no.');
  assert.equal(L('refused-signal', { why: 'unknown field: action' }), 'A line from Grok Bot was refused at the door: unknown field: action.');
  assert.equal(L('read', { about: 'c3', flags: ['instruction'], eligible: false }), 'Kar checked a line from Grok Bot (c3) at the door, flagged instruction: a market signal only.');
  assert.equal(L('read', { about: 'c1', flags: [], eligible: true }), 'Kar checked a line from Grok Bot (c1) at the door: eligible for an answer.');
  assert.equal(L('read', { about: 'c1', flags: 'x', eligible: true }), 'Kar checked a line from Grok Bot (c1) at the door: eligible for an answer.');
  assert.equal(L('signal', { about: 'c1' }), 'The post (c1) entered the funnel.');
  assert.equal(L('market', { about: 'c2' }), 'Recorded as a market signal (c2): no one is contacted.');
  assert.equal(L('no-offer', { about: 'c5' }), 'No offer fits (c5): nothing is pitched.');
  assert.equal(L('qualified', { about: 'c1', offer: 'digi' }), 'Qualified (c1): digi.');
  assert.equal(L('engaged', { about: 'c1' }), 'The person answered (c1): they want to start.');
  assert.equal(L('converted', { about: 'c1', offer: 'digi' }), 'Converted (c1): digi.');
  assert.equal(L('build', { about: 'c1', offer: 'digi' }), 'Kar built the deliverable for digi (c1).');
  assert.equal(L('deliverable', { about: 'c1', proven: true }), 'The deliverable (c1) passed the claim gate at its pinned receipt.');
  assert.equal(L('deliverable', { proven: false }), 'The deliverable failed the claim gate at its pinned receipt.');
  assert.equal(L('handed', { about: 'c1' }), 'Handed over (c1) (a dry run).');
  assert.equal(L('recorded', { about: 'c1', card: 'pilot' }), 'Recorded (c1) in the journal: pilot, by its receipt pin.');
  assert.equal(L('library', { about: 'c1', added: true, size: 6 }), 'The library grew (c1): 6 goods.');
  assert.equal(L('library', { added: false, size: 6 }), 'The library already had it: 6 goods.');
  assert.equal(L('steer', { about: 5 }, 'simon'), 'Simon: steer.');
  assert.equal(lineOf(null), '');
  assert.equal(lineOf({ kind: 'x', data: null }), '');
});
