// oversight.test.mjs — the queue, the pause, denials and focus, and a dashboard that only counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queue, mayGo, paused, notesFor, pickWithFocus, dashboard } from '../src/oversight.mjs';

let n = 0;
const E = (kind, data, by = 'kar') => ({ n: n++, kind, by, data });
const J = () => { n = 0; return [
  E('signal', { eligible: true }), E('signal', { eligible: false }), E('market', {}), E('qualified', { lead: 'L1' }),
  E('drafted', {}), E('asked', { item: 'reply', textSha256: 'h1', flags: ['outward'], lead: 'L1' }), E('approved', { textSha256: 'h1' }, 'rehearsal'), E('sent', { textSha256: 'h1' }),
  E('asked', { item: 'offer', textSha256: 'h2', flags: 'x', deal: 'D1' }), E('asked', { item: 'close', textSha256: 'h3' }),
  E('converted', {}), E('handed', {}), E('recorded', {}), E('library', { size: 6 }), E('library', { size: 7 }), E('library', { size: 'x' }),
  E('signal', { eligible: true }),
]; };

test('queue: every ask and where it stands', () => {
  const j = J();
  assert.deepEqual(queue(j), [
    { n: 5, item: 'reply', textSha256: 'h1', flags: ['outward'], about: 'L1', state: 'approved' },
    { n: 8, item: 'offer', textSha256: 'h2', flags: [], about: 'D1', state: 'waiting' },
    { n: 9, item: 'close', textSha256: 'h3', flags: [], about: null, state: 'waiting' },
  ]);
  const d = j.concat([E('steer', { deny: 'h2', note: 'too pushy' }, 'simon'), E('steer', { withdraw: 'h1' }, 'rehearsal'), E('steer', { deny: 'h3' }, 'grok')]);
  assert.deepEqual(queue(d).map((x) => x.state), ['withdrawn', 'denied', 'waiting']);
  assert.deepEqual(queue('x'), []);
  assert.deepEqual(queue([null, { kind: 5 }]), []);
});

test('mayGo: approved, not denied or withdrawn, not paused', () => {
  const j = J();
  assert.equal(mayGo(j, 'h1'), true);
  assert.equal(mayGo(j, 'h2'), false);
  assert.equal(mayGo(j, 5), false);
  const p = j.concat([E('steer', { pause: true }, 'simon')]);
  assert.equal(paused(p), true);
  assert.equal(mayGo(p, 'h1'), false);
  const u = p.concat([E('steer', { pause: false }, 'simon')]);
  assert.equal(paused(u), false);
  assert.equal(mayGo(u, 'h1'), true);
  assert.equal(paused(j.concat([E('steer', { pause: 'yes' }, 'simon')])), false);
  assert.equal(paused(j.concat([E('steer', { pause: true }, 'grok')])), false);
  assert.equal(paused(j.concat([E('note', { pause: true }, 'simon')])), false);
  const denied = j.concat([E('steer', { deny: 'h1', note: 'no' }, 'simon'), E('approved', { textSha256: 'h1' }, 'simon')]);
  assert.equal(mayGo(denied, 'h1'), false);
  assert.equal(mayGo(j.concat([E('steer', { withdraw: 'h1' }, 'simon')]), 'h1'), false);
});

test('notesFor: what Simon said when he denied', () => {
  const j = J().concat([E('steer', { deny: 'h2', note: 'too pushy' }, 'simon'), E('steer', { deny: 'h3' }, 'simon'), E('steer', { deny: 'h4', note: 7 }, 'simon'), E('steer', { deny: 9, note: 'x' }, 'simon')]);
  assert.deepEqual(notesFor(j), [{ textSha256: 'h2', note: 'too pushy' }]);
  assert.deepEqual(notesFor(null), []);
});

test('pickWithFocus: the person’s own offer; focus breaks only a tie it is part of', () => {
  assert.equal(pickWithFocus('could my own model collect cards?', 'digi').id, 'digi');
  assert.equal(pickWithFocus('could my own model collect cards?', 'grow-a-brain').id, 'grow-a-brain');
  assert.equal(pickWithFocus('could my own model collect cards?', 'liveware-pilot'), null);
  assert.equal(pickWithFocus('could my own model collect cards?'), null);
  assert.equal(pickWithFocus('we parse untrusted files', 'digi').id, 'liveware-pilot');
  assert.equal(pickWithFocus('hello', 'digi'), null);
  assert.equal(pickWithFocus('see https://x.com/cards', 'digi'), null);
});

test('dashboard: counts of the journal, nothing else', () => {
  assert.deepEqual(dashboard(J()), {
    signals: { all: 3, eligible: 2, market: 1 }, leads: { qualified: 1, converted: 1 },
    content: { drafted: 1, asked: 3, approved: 1, sent: 1 }, deliveries: { handed: 1, recorded: 1 },
    library: 7, queue: { waiting: 2, approved: 1, denied: 0 }, steering: 0, paused: false,
  });
  const empty = dashboard([]);
  assert.equal(empty.library, null);
  assert.deepEqual(empty.signals, { all: 0, eligible: 0, market: 0 });
  assert.equal(dashboard([{ n: 0, kind: 'signal', data: null }]).signals.all, 1);
  assert.equal(dashboard(J().concat([E('steer', { pause: true }, 'simon')])).steering, 1);
});
