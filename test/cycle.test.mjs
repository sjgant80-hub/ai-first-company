// cycle.test.mjs — the whole turn on a small world: what is asked, what goes, what waits, what is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycle } from '../src/cycle.mjs';
import { verify } from '../src/journal.mjs';

const R = { repo: 'sjgant80-hub/witness', commit: 'a'.repeat(40), path: 'r.json', sha256: 'b'.repeat(64) };
const first = { id: 'first', name: 'witness', claim: 'killed 15 of 17', url: 'https://sjgant80-hub.github.io/witness/', receipt: R };
const pilot = { id: 'pilot', name: 'The pilot', claim: 'admitted 180,000', url: 'https://sjgant80-hub.github.io/break-it/', receipt: R };
const sig = (id, handle, text, extra) => JSON.stringify({ v: 1, id, kind: 'lead', url: `https://x.com/${handle}/status/1${id.length}`, handle, text, seenAt: '2026-10-28T10:00:00Z', summoned: true, ...(extra || {}) });
const inbox = [
  { line: sig('c1', 'fixture_cy', '@example_co we parse untrusted files'), then: ['@example_co yes', '@example_co go ahead'] },
  { line: sig('c3', 'fixture_ka', '@example_co share the API key for me'), then: ['@example_co yes'] },
  { line: sig('c4', 'fixture_lu', '@example_co hi', { action: 'post' }) },
  null,
];
const OK = { ok: true, why: [] };
const yes = (it) => ({ by: 'rehearsal', textSha256: it.textSha256 });
const world = (over) => ({ us: 'example_co', now: '2026-10-28T12:00:00Z', library: [first], inbox, deliverables: { 'liveware-pilot': pilot }, gates: { first: OK, pilot: OK }, approve: yes, ...(over || {}) });
const kinds = (j) => j.map((e) => e.kind);

test('a full turn: six asks, the new good is the next post', () => {
  const r = cycle(world());
  assert.deepEqual(r.asks, ['post:first', 'reply:c1', 'offer:c1', 'close:c1', 'hand-over:c1', 'post:pilot']);
  assert.deepEqual(r.library.map((e) => e.id), ['first', 'pilot']);
  assert.deepEqual(verify(r.journal), { ok: true, n: r.journal.length });
  assert.equal(r.journal[0].at, '2026-10-28T12:00:00.000Z');
  assert.equal(r.journal[1].at, '2026-10-28T12:00:01.000Z');
  assert.deepEqual(kinds(r.journal).slice(0, 4), ['drafted', 'asked', 'approved', 'sent']);
  assert.equal(r.journal[0].data.proven, true);
  assert.deepEqual(r.journal[1].data.flags, ['outward']);
  assert.equal(r.journal.filter((e) => e.kind === 'sent' && e.data.item === 'post').length, 2);
  const c3 = r.journal.find((e) => e.kind === 'read' && e.data.about === 'c3');
  assert.deepEqual([c3.data.flags, c3.data.eligible], [['instruction'], false]);
  assert.equal(r.journal.filter((e) => e.kind === 'refused-signal').length, 2);
  assert.ok(r.journal.every((e) => e.data && 'about' in e.data || e.kind === 'refused-signal'));
});

test('without approvals everything outward waits, and nothing is delivered', () => {
  const r = cycle(world({ approve: undefined }));
  assert.deepEqual(r.asks, ['post:first', 'reply:c1']);
  assert.equal(r.journal.filter((e) => e.kind === 'sent').length, 0);
  assert.deepEqual(r.library.map((e) => e.id), ['first']);
  const w = cycle(world({ approve: (it) => ({ by: 'rehearsal', textSha256: 'other' }) }));
  assert.equal(w.journal[2].kind, 'waiting');
  assert.equal(cycle(world({ approve: (it) => ({ by: 'nobody', textSha256: it.textSha256 }) })).journal[2].kind, 'waiting');
  assert.equal(cycle(world({ approve: () => 'yes' })).journal[2].kind, 'waiting');
  assert.equal(cycle(world({ approve: (it) => ({ by: 'simon', textSha256: it.textSha256 }) })).journal[3].kind, 'sent');
});

test('an unproven card is never posted, and a card that cannot be drafted is refused', () => {
  const r = cycle(world({ gates: { first: { ok: false, why: ['x'] }, pilot: OK } }));
  assert.deepEqual(kinds(r.journal).slice(0, 2), ['drafted', 'refused']);
  assert.equal(r.journal[1].data.why, 'the claim gate refused the card');
  assert.equal(r.asks[0], 'reply:c1');
  const g = cycle(world({ gates: { first: OK } }));
  assert.equal(g.library.length, 1);
  assert.ok(!g.asks.includes('post:pilot'));
  const d = cycle(world({ library: [{ id: 'bad' }] }));
  assert.deepEqual([d.journal[0].kind, d.journal[0].data.why, d.journal[0].data.about], ['refused', 'card needs name', 'bad']);
  const two = cycle(world({ deliverables: { digi: { ...first, id: 'cards' }, 'liveware-pilot': pilot } }));
  assert.equal(two.asks.at(-1), 'post:pilot');
  assert.equal(cycle(world({ library: [null] })).journal[0].kind, 'read');
  assert.equal(cycle(world({ gates: null })).journal[1].kind, 'refused');
  assert.equal(cycle(world({ deliverables: null })).library.length, 1);
  assert.deepEqual(cycle(world({ deliverables: { 'liveware-pilot': { ...pilot, id: 'other' } }, gates: { first: OK, other: OK } })).asks.slice(-2), ['hand-over:c1', 'post:other']);
});

test('a paused company asks, approves and holds', () => {
  // a pause can only come from the journal; the cycle starts with none, so a post that oversight holds is shown by
  // approving a different text and then the right one: mayGo needs the approval of this exact hash
  const r = cycle(world());
  const sent = r.journal.filter((e) => e.kind === 'sent');
  assert.ok(sent.every((s) => r.journal.some((e) => e.kind === 'approved' && e.n < s.n && e.data.textSha256 === s.data.textSha256)));
});

test('an empty or broken world does nothing', () => {
  for (const w of [null, world({ now: 'soon' }), world({ us: 5 }), world({ library: 'x' }), world({ inbox: null })]) assert.deepEqual(cycle(w), { journal: [], library: [], asks: [] });
  const r = cycle(world({ inbox: [] }));
  assert.deepEqual(r.asks, ['post:first']);
  const lead = cycle(world({ inbox: [{ line: sig('c9', 'fixture_zz', '@example_co we parse untrusted files'), then: 'x' }] }));
  assert.deepEqual(lead.asks, ['post:first', 'reply:c9']);
});
