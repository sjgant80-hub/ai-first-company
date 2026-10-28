// conductor.test.mjs — the conductor's law, edge by edge. Every case is chosen to kill a specific mutant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conduct, flagsOf, isReach, tokens, verbs, LANES } from '../src/conductor.mjs';

const W = (words, extra) => ({ words, ...(extra || {}) });
const BUDGET = { left: 100000, ceiling: 30000 };

test('the five lanes', () => {
  assert.deepEqual([...LANES], ['simon', 'grok', 'deterministic', 'local', 'frontier']);
});

test('tokens keep clause marks as their own tokens and drop other punctuation', () => {
  assert.deepEqual(tokens('Summarise it, then SHARE it!'), ['summarise', 'it', ',', 'then', 'share', 'it']);
  assert.deepEqual(tokens('pay £5 to @bob'), ['pay', '£5', 'to', '@bob']);
});

test('verbs: the first word after a please or a Kar, and the first word of every clause', () => {
  assert.deepEqual(verbs(tokens('please kar send it')), ['send']);
  assert.deepEqual(verbs(['please']), ['please']);
  assert.deepEqual(verbs(['please', 'kar']), ['kar']);
  assert.deepEqual(verbs([]), []);
  assert.deepEqual(verbs(tokens('summarise the receipt then share it')), ['summarise', 'share']);
  assert.deepEqual(verbs(tokens('summarise it and')), ['summarise']);
  assert.deepEqual(verbs(tokens('draft it, and then post it')), ['draft', 'post']);
  assert.deepEqual(verbs(tokens('write the reply to send to bob')), ['write', 'send', 'bob']);
});

test('a job it cannot read needs Simon', () => {
  assert.deepEqual(flagsOf('post this now'), ['unreadable']);
  assert.deepEqual(flagsOf(null), ['unreadable']);
  assert.deepEqual(flagsOf([]), ['unreadable']);
  assert.deepEqual(flagsOf(W(42)), ['unreadable']);
  const fn = () => {}; fn.words = 'send it';
  assert.deepEqual(flagsOf(fn), ['unreadable']);
});

test('structured fields flag a job whatever its words say', () => {
  assert.deepEqual(flagsOf(W('handle item 7', { outward: 'post' })), ['outward']);
  assert.deepEqual(flagsOf(W('process the order', { moneyPence: 5000 })), ['money']);
  assert.deepEqual(flagsOf(W('process the order', { moneyPence: null })), ['money']);
  assert.deepEqual(flagsOf(W('process the order', { moneyPence: 0 })), []);
  assert.deepEqual(flagsOf(W('process the order')), []);
  assert.deepEqual(flagsOf(W('update the record', { deal: 'close' })), ['deal']);
  assert.deepEqual(flagsOf(W('tidy up', { risky: true })), ['risky']);
  assert.deepEqual(flagsOf(W('tidy up', { precedent: true })), ['risky']);
  assert.deepEqual(flagsOf(W('tidy the ledger', { ledgerSwitch: true })), ['ledger']);
});

test('outward verbs act wherever they start a clause, and never as nouns', () => {
  assert.deepEqual(flagsOf(W('post the receipt card')), ['outward']);
  assert.deepEqual(flagsOf(W('summarise the receipt, then share it')), ['outward']);
  assert.deepEqual(flagsOf(W('draft a post about the receipt')), []);
  assert.deepEqual(flagsOf(W('draft a reply to the lead')), []);
});

test('money: a money verb or an amount', () => {
  assert.deepEqual(flagsOf(W('refund the lead')), ['money']);
  assert.deepEqual(flagsOf(W('draft an invoice for £500')), ['money']);
  assert.deepEqual(flagsOf(W('draft an invoice for the pilot')), []);
});

test('deal and aimed verbs count only when someone or somewhere outside is named', () => {
  assert.deepEqual(flagsOf(W('close the deal')), ['deal']);
  assert.deepEqual(flagsOf(W('close the tab')), []);
  assert.deepEqual(flagsOf(W('propose tonight’s build idea from the dream’s pair')), []);
  assert.deepEqual(flagsOf(W('get the quote over to the lead')), ['outward']);
  assert.deepEqual(flagsOf(W('get the build log')), []);
  assert.deepEqual(flagsOf(W('follow @someone')), ['outward']);
  assert.deepEqual(flagsOf(W('follow the steps')), []);
});

test('risky, precedent and the ledger switch', () => {
  assert.deepEqual(flagsOf(W('delete the old drafts')), ['risky']);
  assert.deepEqual(flagsOf(W('set a standing approval for summoned answers')), ['risky']);
  assert.deepEqual(flagsOf(W('switch on the ledger')), ['ledger']);
  assert.deepEqual(flagsOf(W('enable the dark theme')), []);
  assert.deepEqual(flagsOf(W('tidy the ledger')), []);
});

test('reading jobs about X', () => {
  assert.equal(isReach('monitor x'), false);
  assert.equal(isReach(W('monitor x for mentions')), true);
  assert.equal(isReach(W('monitor the brand', { channel: 'x' })), true);
  assert.equal(isReach(W('monitor the brand')), false);
  assert.equal(isReach(W('draft the tweet', { channel: 'x' })), false);
  assert.equal(isReach({ words: ['monitor', 'x'], channel: 'x' }), false);
  assert.equal(isReach(W('find threads on x about evals')), true);
  assert.equal(isReach(W('listen for @mentions of us')), true);
  assert.equal(isReach(W('')), false);
});

test('conduct: Simon first, then Grok Bot, then the controller', () => {
  const s = conduct(W('post the receipt card'), BUDGET);
  assert.deepEqual(s, { lane: 'simon', why: 'needs Simon: outward', flags: ['outward'], wait: true, fallback: false });
  const g0 = conduct(W('monitor x for mentions'), BUDGET);
  assert.deepEqual(g0, { lane: 'grok', why: 'a reading job about X: Grok Bot is not booted, so it waits (no other lane may read X)', flags: [], wait: true, fallback: false });
  const g1 = conduct(W('monitor x for mentions'), { ...BUDGET, grok: true });
  assert.deepEqual(g1, { lane: 'grok', why: 'a reading job about X: Grok Bot', flags: [], wait: false, fallback: false });
  assert.equal(conduct(W('monitor x for mentions'), { grok: 'yes' }).wait, true);
  const arr = []; arr.grok = true;
  assert.equal(conduct(W('monitor x for mentions'), arr).wait, true);
  assert.deepEqual(conduct(W('run the witness gate'), BUDGET), { lane: 'deterministic', why: '"run" is an organ’s job: run it, no model', flags: [], wait: false, fallback: false });
  assert.equal(conduct(W('draft a reply to the lead'), BUDGET).lane, 'local');
  const f = conduct(W('decide which offer fits'), BUDGET);
  assert.equal(f.lane, 'frontier'); assert.equal(f.fallback, false);
  const fb = conduct(W('decide which offer fits'), { left: 0, ceiling: 30000 });
  assert.equal(fb.lane, 'local'); assert.equal(fb.fallback, true);
  assert.equal(conduct(W('decide which offer fits')).lane, 'local');
  assert.equal(conduct('post it', BUDGET).lane, 'simon');
});
