// ops.test.mjs — proven before handed over, handed over only on approval, recorded once, added once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliver, addToLibrary } from '../src/ops.mjs';
import { hashOf } from '../src/journal.mjs';

const card = { id: 'c1', name: 'The pilot', claim: 'admitted 180,000', url: 'https://sjgant80-hub.github.io/break-it/', receipt: { repo: 'sjgant80-hub/break-it', commit: 'a'.repeat(40), path: 'r.json', sha256: 'b'.repeat(64) } };
const deal = { id: 'D1', handle: 'fixture_cy', offer: 'liveware-pilot' };
const yes = (it) => ({ by: 'rehearsal', textSha256: it.textSha256 });
const OK = { ok: true, why: [] };
const kinds = (r) => r.events.map((e) => e.kind);

test('addToLibrary adds once, by id', () => {
  const a = addToLibrary([], { id: 'x' });
  assert.deepEqual(a, [{ id: 'x' }]);
  assert.equal(addToLibrary(a, { id: 'x', other: 1 }), a);
  assert.deepEqual(addToLibrary(null, { id: 'y' }), [{ id: 'y' }]);
  assert.equal(addToLibrary(a, { id: '' }), a);
  assert.equal(addToLibrary(a, { id: 5 }), a);
  assert.equal(addToLibrary(a, null), a);
  assert.deepEqual(addToLibrary([null, { id: 'z' }], { id: 'q' }).length, 3);
});

test('a proven deliverable, approved, is handed over, recorded and added', () => {
  const lib = [{ id: 'old' }];
  const r = deliver(deal, { card, gate: OK, approve: yes, library: lib });
  assert.equal(r.stage, 'delivered');
  assert.deepEqual(kinds(r), ['build', 'deliverable', 'asked', 'approved', 'handed', 'recorded', 'library']);
  assert.deepEqual(r.library.map((e) => e.id), ['old', 'c1']);
  assert.deepEqual(lib, [{ id: 'old' }]);
  assert.deepEqual(r.library[1], { id: 'c1', name: 'The pilot', from: 'D1', receipt: card.receipt });
  const text = 'Hand-over to @fixture_cy: The pilot: admitted 180,000. https://sjgant80-hub.github.io/break-it/';
  assert.equal(r.events[2].data.textSha256, hashOf(text));
  assert.deepEqual(r.events[2].data.flags, ['outward']);
  assert.equal(r.events[0].data.lane === 'simon', false);
  assert.deepEqual(r.events[1].data.receipt, card.receipt);
  assert.equal(r.events[1].data.proven, true);
  assert.deepEqual(r.events.at(-1).data, { deal: 'D1', added: true, size: 2 });
  const again = deliver(deal, { card, gate: OK, approve: yes, library: r.library });
  assert.equal(again.library, r.library);
  assert.deepEqual(again.events.at(-1).data, { deal: 'D1', added: false, size: 2 });
});

test('an unproven deliverable is refused: nothing handed over, recorded or added', () => {
  const lib = [{ id: 'old' }];
  const r = deliver(deal, { card, gate: { ok: false, why: ['the number 0.896 is not a field of the receipt'] }, approve: yes, library: lib });
  assert.equal(r.stage, 'refused');
  assert.deepEqual(kinds(r), ['build', 'deliverable', 'refused']);
  assert.equal(r.library, lib);
  assert.deepEqual(r.events[1].data.why, ['the number 0.896 is not a field of the receipt']);
  assert.equal(deliver(deal, { card, gate: null, approve: yes }).stage, 'refused');
  assert.deepEqual(deliver(deal, { card, gate: { ok: 'yes' }, approve: yes }).events[1].data.why, ['no verdict']);
  assert.equal(deliver(deal, { card: { ...card, receipt: null }, gate: { ok: false, why: ['no receipt'] } }).events[1].data.receipt, null);
});

test('the hand-over waits for an approval of its exact words', () => {
  for (const approve of [undefined, () => null, () => 'yes', (it) => ({ by: 'rehearsal', textSha256: 'other' }), (it) => ({ by: 'someone', textSha256: it.textSha256 })]) {
    const r = deliver(deal, { card, gate: OK, approve, library: [] });
    assert.equal(r.stage, 'waiting');
    assert.deepEqual(kinds(r), ['build', 'deliverable', 'asked', 'waiting']);
    assert.deepEqual(r.library, []);
  }
  assert.equal(deliver(deal, { card, gate: OK, approve: (it) => ({ by: 'simon', textSha256: it.textSha256 }) }).stage, 'delivered');
});

test('a build worded so it would leave the company waits for Simon too', () => {
  const r = deliver({ ...deal, offer: 'the pilot, then send it to the client' }, { card, gate: OK, approve: yes });
  assert.equal(r.stage, 'waiting');
  assert.deepEqual(kinds(r), ['build', 'waiting']);
});

test('unreadable deals and options', () => {
  for (const d of [null, { ...deal, id: 1 }, { ...deal, handle: null }, { ...deal, offer: 3 }]) assert.equal(deliver(d, { card, gate: OK }).stage, 'unreadable');
  assert.equal(deliver(deal, { card: null, gate: OK }).stage, 'unreadable');
  assert.equal(deliver(deal, null).stage, 'unreadable');
  assert.deepEqual(deliver(deal, { card: 'x', library: 'y' }).library, []);
});
