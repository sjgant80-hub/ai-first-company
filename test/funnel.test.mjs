// funnel.test.mjs — the offer is the person's own words; every outward step is asked; nothing goes without approval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFERS, pickOffer, replyText, offerText, wordsOk, runLead } from '../src/funnel.mjs';
import { hashOf } from '../src/journal.mjs';

const yes = (it) => ({ by: 'rehearsal', textSha256: it.textSha256 });
const L = (text, then, eligible = true) => ({ signal: { id: 's', handle: 'fixture_ada', text, eligible }, then });
const kinds = (r) => r.events.map((e) => e.kind);

test('pickOffer: one offer the words call for, else none', () => {
  assert.deepEqual(OFFERS.map((o) => o.id), ['liveware-pilot', 'grow-a-brain', 'digi']);
  assert.equal(pickOffer('we parse untrusted files').id, 'liveware-pilot');
  assert.equal(pickOffer('my own model from my spreadsheets').id, 'grow-a-brain');
  assert.equal(pickOffer('collectible cards').id, 'digi');
  assert.equal(pickOffer('hello'), null);
  assert.equal(pickOffer('my own model could collect cards'), null);
  assert.equal(pickOffer('own model, collect cards, csv'), OFFERS[1]);
  assert.equal(pickOffer('see https://x.com/cards/files'), null);
  assert.equal(pickOffer(42), null);
});

test('drafts: plain words and the offer’s own page', () => {
  assert.equal(replyText('ada', OFFERS[2]), '@ada Thanks for asking. That is DIGI cards: https://sjgant80-hub.github.io/digi-card/\nEvery claim on that page links to a receipt you can re-run yourself.');
  assert.equal(offerText('ada', OFFERS[0]), '@ada Here is how the liveware pilot starts: https://sjgant80-hub.github.io/break-it/\nSay go ahead here when you are ready, and we will set it up with you.');
});

test('wordsOk: the claim gate’s words, and estate links only', () => {
  assert.deepEqual(wordsOk(replyText('ada', OFFERS[0])), { ok: true, why: [] });
  assert.deepEqual(wordsOk('the best pilot'), { ok: false, why: ['hype'] });
  assert.deepEqual(wordsOk('from £49'), { ok: false, why: ['a price'] });
  assert.deepEqual(wordsOk('earn KCC'), { ok: false, why: ['an economy term'] });
  assert.deepEqual(wordsOk('κ'), { ok: false, why: ['estate jargon'] });
  assert.deepEqual(wordsOk('see https://example.com/x and https://github.com/sjgant80-hub/witness'), { ok: false, why: ['a link off the estate: https://example.com/x'] });
});

test('a conversion: three asks, each step sent only after its approval', () => {
  const r = runLead(L('@example_co we parse untrusted files', ['@example_co yes, how do we start?', '@example_co go ahead']), { us: 'example_co', approve: yes });
  assert.equal(r.stage, 'converted'); assert.equal(r.offer, 'liveware-pilot');
  assert.deepEqual(kinds(r), ['signal', 'qualified', 'drafted', 'asked', 'approved', 'sent', 'signal', 'engaged', 'drafted', 'asked', 'approved', 'sent', 'signal', 'drafted', 'asked', 'approved', 'sent', 'converted']);
  const asked = r.events.filter((e) => e.kind === 'asked');
  assert.deepEqual(asked.map((e) => e.data.item), ['reply', 'offer', 'close']);
  assert.deepEqual(asked.map((e) => e.data.flags), [['outward'], ['outward'], ['deal']]);
  const d = r.events.find((e) => e.kind === 'drafted');
  assert.equal(d.data.textSha256, hashOf(d.data.text));
  assert.equal(r.events.find((e) => e.kind === 'approved').by, 'rehearsal');
  assert.deepEqual(r.events.at(-1).data, { handle: 'fixture_ada', offer: 'liveware-pilot' });
  assert.deepEqual(r.events[0].data, { id: 's', handle: 'fixture_ada', text: '@example_co we parse untrusted files', eligible: true });
});

test('a draft the word rules refuse is never asked or sent', () => {
  const r = runLead({ signal: { id: 's', handle: 'best', text: '@example_co we parse untrusted files', eligible: true }, then: ['@example_co yes'] }, { us: 'example_co', approve: yes });
  assert.equal(r.stage, 'qualified');
  assert.deepEqual(kinds(r), ['signal', 'qualified', 'drafted']);
  assert.equal(r.events[2].data.wordsOk, false);
});

test('it stops where the person stops, or where approval is missing', () => {
  const us = 'example_co';
  assert.equal(runLead(L('@example_co we parse untrusted files', []), { us, approve: yes }).stage, 'replied');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['yes how do we start']), { us, approve: yes }).stage, 'replied');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_cox yes']), { us, approve: yes }).stage, 'replied');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes']), { us, approve: yes }).stage, 'offered');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes', 'ok go']), { us, approve: yes }).stage, 'offered');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes', 5]), { us, approve: yes }).stage, 'offered');
  const none = runLead(L('@example_co we parse untrusted files', ['@example_co yes']), { us });
  assert.equal(none.stage, 'qualified');
  assert.deepEqual(kinds(none).slice(-3), ['drafted', 'asked', 'waiting']);
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes']), { us, approve: (it) => ({ by: 'rehearsal', textSha256: 'other' }) }).stage, 'qualified');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes']), { us, approve: (it) => ({ by: 'someone', textSha256: it.textSha256 }) }).stage, 'qualified');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes']), { us, approve: () => 'yes' }).stage, 'qualified');
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes']), { us, approve: (it) => ({ by: 'simon', textSha256: it.textSha256 }) }).stage, 'offered');
  let n = 0;
  const twice = (it) => (++n <= 1 ? yes(it) : null);
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes', '@example_co go']), { us, approve: twice }).stage, 'engaged');
  n = 0;
  const thrice = (it) => (++n <= 2 ? yes(it) : null);
  assert.equal(runLead(L('@example_co we parse untrusted files', ['@example_co yes', '@example_co go']), { us, approve: thrice }).stage, 'accepted');
});

test('no cold contact, no unasked-for pitch, nothing unreadable', () => {
  const m = runLead(L('we parse untrusted files', ['@example_co yes'], false), { us: 'example_co', approve: yes });
  assert.deepEqual([m.stage, m.offer, kinds(m)], ['market', null, ['signal', 'market']]);
  assert.equal(runLead(L('@example_co hi', [], 'yes'), { us: 'example_co', approve: yes }).stage, 'market');
  const n = runLead(L('@example_co hello', []), { us: 'example_co', approve: yes });
  assert.deepEqual([n.stage, kinds(n)], ['no-offer', ['signal', 'no-offer']]);
  assert.equal(runLead(null, { us: 'example_co' }).stage, 'unreadable');
  assert.equal(runLead({ signal: null }, { us: 'example_co' }).stage, 'unreadable');
  assert.equal(runLead({ signal: { text: 5, handle: 'a' } }, { us: 'example_co' }).stage, 'unreadable');
  assert.equal(runLead({ signal: { text: 'a', handle: 5 } }, { us: 'example_co' }).stage, 'unreadable');
  assert.equal(runLead(L('@x a', []), { us: '@bad' }).stage, 'unreadable');
  assert.equal(runLead(L('@x a', []), { us: 7 }).stage, 'unreadable');
  assert.equal(runLead(L('@x a', []), null).stage, 'unreadable');
  assert.deepEqual(runLead(L('@x a', []), null).events, []);
});
