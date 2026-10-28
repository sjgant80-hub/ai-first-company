// journal.test.mjs — the hash chain: canonical form, append, and verify catching every kind of tamper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, hashOf, append, verify, GENESIS, BY } from '../src/journal.mjs';

test('canonical sorts keys at every depth and maps undefined to null', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"c":null,"d":3}],"b":1}');
  assert.equal(canonical('x'), '"x"');
  assert.equal(canonical(undefined), 'null');
  assert.equal(canonical(null), 'null');
});

test('hashOf is SHA-256 of the UTF-8 text', () => {
  assert.equal(hashOf('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hashOf(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(GENESIS.length, 64);
  assert.deepEqual([...BY], ['kar', 'grok', 'simon', 'rehearsal']);
});

const E = (k, extra) => ({ at: '2026-10-28T12:00:00Z', kind: k, by: 'kar', data: { k }, ...(extra || {}) });

test('append makes a new chain and refuses what it does not take', () => {
  const c0 = [];
  const c1 = append(c0, E('a'));
  assert.equal(c0.length, 0);
  assert.equal(c1.length, 1);
  assert.equal(c1[0].n, 0);
  assert.equal(c1[0].prev, GENESIS);
  const c2 = append(c1, E('b', { data: undefined }));
  assert.equal(c2[1].prev, c1[0].hash);
  assert.equal(c2[1].data, null);
  assert.equal(append(null, E('a')), null);
  assert.equal(append([], null), null);
  assert.equal(append([], []), null);
  assert.equal(append([], E('a', { at: '' })), null);
  assert.equal(append([], E('a', { at: 5 })), null);
  assert.equal(append([], E('')), null);
  assert.equal(append([], E('a', { kind: 7 })), null);
  assert.equal(append([], E('a', { by: 'someone' })), null);
  assert.equal(append([], E('a', { by: 'simon' }))[0].by, 'simon');
});

test('verify holds an honest chain and names the first entry that does not', () => {
  let c = [];
  for (const k of ['a', 'b', 'c', 'd']) c = append(c, E(k));
  assert.deepEqual(verify(c), { ok: true, n: 4 });
  assert.deepEqual(verify([]), { ok: true, n: 0 });
  assert.deepEqual(verify('x'), { ok: false, at: 0, why: 'not a journal' });
  for (let i = 0; i < c.length; i++) {
    const t = JSON.parse(JSON.stringify(c));
    t[i].data = { k: t[i].data.k + 'x' };
    assert.deepEqual(verify(t), { ok: false, at: i, why: 'changed after it was written' });
  }
  const swapped = [c[0], c[2], c[1], c[3]];
  assert.deepEqual(verify(swapped), { ok: false, at: 1, why: 'out of order' });
  const relinked = JSON.parse(JSON.stringify(c)); relinked[2].prev = relinked[0].hash;
  assert.deepEqual(verify(relinked), { ok: false, at: 2, why: 'does not follow the entry before it' });
  assert.deepEqual(verify([c[0], null]), { ok: false, at: 1, why: 'not an entry' });
  assert.deepEqual(verify([[]]), { ok: false, at: 0, why: 'not an entry' });
});
