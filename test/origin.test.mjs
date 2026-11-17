// origin.test.mjs — the Origination Engine's gate (data/origin-prereg.json): a gap is not a market; the test is sealed
// before it runs; the market decides; a test nobody saw is never a kill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOREST, KINDS, TEST_KINDS, METRICS, dayOf, attest, normalizeTest, judge, stageOf, funnel } from '../src/origin.mjs';

const AS = '2026-11-17';
const E = (kind, url, date = '2026-10-01', said = 'a short line of what it says') => ({ kind, url, date, said });
const gap = (o) => ({ id: 'g', forest: ['mcp-agent-tooling'], evidence: [], ...o });
const T = (o) => ({ kind: 'post', channel: 'x', metric: 'clicks', bar: 10, exposure: { metric: 'impressions', min: 500 }, opens: '2026-11-18', closes: '2026-11-25', sealed: '2026-11-17', cost: 0, ...o });

test('the vocabulary', () => {
  assert.deepEqual(FOREST, ['sovereign-ai', 'mcp-agent-tooling', 'verification', 'slm-niche', 'trust-layer']);
  assert.deepEqual(KINDS, ['looking', 'paying', 'complaining']);
  assert.deepEqual(TEST_KINDS, ['post', 'issue', 'listing', 'landing', 'waitlist']);
  assert.ok(METRICS.includes('impressions') && METRICS.includes('preorders'));
});

test('dayOf: real calendar dates only', () => {
  assert.equal(dayOf('2026-11-17'), Date.UTC(2026, 10, 17));
  for (const bad of ['2026-02-30', '2026-13-01', '17/11/2026', '2026-1-1', '', null, 5]) assert.ok(Number.isNaN(dayOf(bad)), String(bad));
  assert.equal(dayOf(' 2026-11-17 '), Date.UTC(2026, 10, 17));
});

// ── the sealed fixtures F1 to F8 ─────────────────────────────────────────────────────────────────────────────────
test('F1 to F6 are refused, each for its own reason', () => {
  const F1 = attest(gap({}), AS);
  assert.equal(F1.ok, false); assert.match(F1.why.join(';'), /fewer than 3 usable evidence items \(0\)/);
  const F2 = attest(gap({ evidence: [E('looking', 'https://reddit.com/a'), E('paying', 'https://reddit.com/b'), E('complaining', 'https://www.reddit.com/c')] }), AS);
  assert.equal(F2.ok, false); assert.deepEqual(F2.why, ['evidence from fewer than 2 sources (1)'], 'www. is the same host');
  const F3 = attest(gap({ evidence: [E('complaining', 'https://a.com/1'), E('complaining', 'https://b.com/1'), E('complaining', 'https://c.com/1')] }), AS);
  assert.deepEqual(F3.why, ['one kind of evidence and nobody paying']);
  const F4 = attest(gap({ evidence: [E('looking', 'https://a.com/1', '2025-11-16'), E('paying', 'https://b.com/1'), E('complaining', 'https://c.com/1')] }), AS);
  assert.deepEqual(F4.why, ['fewer than 3 usable evidence items (2)'], 'older than 365 days does not count');
  const F5 = attest(gap({ forest: ['dropshipping'], evidence: [E('looking', 'https://a.com/1'), E('paying', 'https://b.com/1'), E('complaining', 'https://c.com/1')] }), AS);
  assert.deepEqual(F5.why, ['outside the forest: someone else\'s gap']);
  const F6 = attest(gap({ evidence: [E('looking', 'https://a.com/1'), E('paying', 'https://a.com/1'), E('complaining', 'https://a.com/1')] }), AS);
  assert.equal(F6.ok, false); assert.equal(F6.counted.items, 1, 'the same URL counts once');
});
test('F7 and F8 are accepted', () => {
  const F7 = attest(gap({ evidence: [E('looking', 'https://a.com/1'), E('complaining', 'https://b.com/1'), E('complaining', 'https://c.com/1')] }), AS);
  assert.deepEqual(F7, { ok: true, why: [], counted: { items: 3, hosts: 3, kinds: 2, paying: 0 } });
  const F8 = attest(gap({ evidence: [E('paying', 'https://a.com/1'), E('paying', 'https://a.com/2'), E('paying', 'https://b.com/1')] }), AS);
  assert.deepEqual(F8, { ok: true, why: [], counted: { items: 3, hosts: 2, kinds: 1, paying: 3 } });
});

test('attest: what an evidence item must be, and the edges of its dates', () => {
  const ok3 = (x) => attest(gap({ evidence: [E('looking', 'https://a.com/1'), E('complaining', 'https://b.com/1'), x] }), AS);
  assert.equal(ok3(E('paying', 'https://c.com/1')).ok, true);
  assert.equal(ok3(E('paying', 'http://c.com/1')).ok, false, 'https only');
  assert.equal(ok3(E('wishing', 'https://c.com/1')).ok, false, 'a known kind');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2026-11-18')).ok, false, 'not from the future');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2026-11-17')).ok, true, 'today counts');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2025-11-17')).ok, true, 'exactly 365 days counts');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2025-11-16')).ok, false, '366 does not');
  assert.equal(ok3(E('paying', 'https://c.com/1', 'last week')).ok, false, 'a real date');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2026-10-01', '')).ok, false, 'it says something');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2026-10-01', 'w '.repeat(25).trim())).ok, true, '25 words is short enough');
  assert.equal(ok3(E('paying', 'https://c.com/1', '2026-10-01', 'w '.repeat(26).trim())).ok, false, '26 is a copied page, not a line');
  assert.equal(ok3(null).ok, false);
  assert.equal(attest(gap({ forest: 'mcp-agent-tooling' }), AS).why[0], 'outside the forest: someone else\'s gap', 'the forest is a list');
  assert.deepEqual(attest(gap({}), 'tomorrow'), { ok: false, why: ['no scan date'], counted: { items: 0, hosts: 0, kinds: 0, paying: 0 } });
  assert.equal(attest(null, AS).ok, false);
  assert.equal(attest(gap({ evidence: 'lots' }), AS).counted.items, 0);
  const two = attest(gap({ evidence: [E('looking', 'https://a.com/1'), E('complaining', 'https://b.com/1'), E('paying', 'https://b.com/2')] }), AS);
  assert.deepEqual(two.counted, { items: 3, hosts: 2, kinds: 3, paying: 1 });
  const onePay = attest(gap({ evidence: [E('looking', 'https://a.com/1'), E('looking', 'https://b.com/1'), E('paying', 'https://b.com/2')] }), AS);
  assert.equal(onePay.ok, true, 'two kinds');
  assert.deepEqual(attest(gap({ evidence: [E('paying', 'https://a.com/1')] }), AS).why, ['fewer than 3 usable evidence items (1)', 'evidence from fewer than 2 sources (1)'], 'one paying item is thin, not "nobody paying"');
  const oneKindPaying = attest(gap({ evidence: [E('paying', 'https://a.com/1'), E('paying', 'https://b.com/1'), E('paying', 'https://b.com/9')] }), AS);
  assert.equal(oneKindPaying.ok, true, 'one kind is enough when it is paying');
});

// ── the demand test ─────────────────────────────────────────────────────────────────────────────────────────────
test('normalizeTest: whole, sealed before it opens, within 30 days, priced in pounds', () => {
  const n = normalizeTest(T({ channel: ' x ' }));
  assert.deepEqual(n, { ok: true, test: { kind: 'post', channel: 'x', metric: 'clicks', bar: 10, exposure: { metric: 'impressions', min: 500 }, opens: '2026-11-18', closes: '2026-11-25', sealed: '2026-11-17', cost: 0, simonApproved: null } });
  const why = (o) => normalizeTest(T(o)).why;
  assert.match(why({ kind: 'tweet' }), /^kind must be one of/);
  assert.equal(why({ channel: ' ' }), 'no channel');
  assert.match(why({ metric: 'vibes' }), /^metric must be one of/);
  for (const bar of [0, 1.5, '10', -1]) assert.equal(why({ bar }), 'the bar must be a whole number of at least 1', String(bar));
  assert.equal(normalizeTest(T({ bar: 1 })).ok, true);
  for (const exposure of [null, { metric: 'eyes', min: 5 }, { metric: 'views', min: -1 }, { metric: 'views', min: 2.5 }]) assert.match(why({ exposure }), /exposure/);
  assert.equal(normalizeTest(T({ exposure: { metric: 'views', min: 0 } })).ok, true, 'a minimum of 0 is allowed');
  assert.equal(why({ opens: 'soon' }), 'opens and closes must be dates');
  assert.equal(why({ closes: 'never' }), 'opens and closes must be dates');
  assert.match(why({ closes: '2026-11-17' }), /^the window must close on or after it opens/);
  assert.equal(normalizeTest(T({ closes: '2026-11-18' })).ok, true, 'a one-day window');
  assert.equal(normalizeTest(T({ closes: '2026-12-18' })).ok, true, '30 days exactly');
  assert.match(why({ closes: '2026-12-19' }), /within 30 days/);
  assert.equal(why({ sealed: '2026-11-19' }), 'it must be sealed on or before the day it opens');
  assert.equal(normalizeTest(T({ sealed: '2026-11-18' })).ok, true, 'sealed the day it opens');
  assert.equal(why({ sealed: undefined }), 'it must be sealed on or before the day it opens');
  for (const cost of [-1, '0', NaN, Infinity]) assert.equal(why({ cost }), 'the cost must be a number of pounds, 0 or more', String(cost));
  assert.equal(normalizeTest(null).ok, false);
});
test('normalizeTest: money, a price or personal data needs Simon\'s recorded approval', () => {
  const simon = /needs Simon's approval, recorded/;
  assert.match(normalizeTest(T({ kind: 'waitlist' })).why, simon);
  assert.match(normalizeTest(T({ metric: 'preorders' })).why, simon);
  assert.match(normalizeTest(T({ metric: 'signups' })).why, simon);
  assert.match(normalizeTest(T({ takesMoney: true })).why, simon);
  assert.match(normalizeTest(T({ setsPrice: true })).why, simon);
  assert.match(normalizeTest(T({ kind: 'waitlist', simonApproved: '  ' })).why, simon);
  assert.equal(normalizeTest(T({ kind: 'waitlist', simonApproved: 'Simon, 2026-11-17: yes to a waitlist' })).test.simonApproved, 'Simon, 2026-11-17: yes to a waitlist');
  assert.equal(normalizeTest(T({ takesMoney: 'yes' })).ok, true, 'only true means it takes money');
  assert.equal(normalizeTest(T({ simonApproved: 'not needed' })).test.simonApproved, null, 'an approval is kept only where one is needed');
});

test('judge: OPEN until it closes, then UNRUN, BUILD or KILL from the sealed numbers alone', () => {
  assert.deepEqual(judge(T(), { clicks: 50, impressions: 9000 }, '2026-11-25'), { decision: 'OPEN', why: 'it closes 2026-11-25' });
  assert.deepEqual(judge(T(), { clicks: 50, impressions: 400 }, '2026-11-26'), { decision: 'UNRUN', why: 'impressions 400 is under the sealed 500: too few saw it to judge (not a kill)' });
  assert.deepEqual(judge(T(), { clicks: 0, impressions: 499 }, '2026-11-26').decision, 'UNRUN');
  assert.deepEqual(judge(T(), { clicks: 10, impressions: 500 }, '2026-11-26'), { decision: 'BUILD', why: 'clicks 10 reached the sealed bar 10' });
  assert.deepEqual(judge(T(), { clicks: 9, impressions: 500 }, '2026-11-26'), { decision: 'KILL', why: 'clicks 9 is under the sealed bar 10' });
  assert.deepEqual(judge(T({ exposure: { metric: 'clicks', min: 0 } }), { clicks: 0 }, '2026-11-26').decision, 'KILL', 'the same metric for both');
  assert.match(judge(T(), { clicks: '9', impressions: 500 }, '2026-11-26').why, /whole counts of clicks and impressions/);
  assert.match(judge(T(), { clicks: 9, impressions: -1 }, '2026-11-26').why, /whole counts/);
  assert.match(judge(T(), { clicks: 9.5, impressions: 500 }, '2026-11-26').why, /whole counts/);
  assert.match(judge(T(), null, '2026-11-26').why, /whole counts/);
  assert.match(judge(T({ bar: 0 }), { clicks: 1, impressions: 999 }, '2026-11-26').why, /^the test cannot be judged: the bar/);
  assert.match(judge(T({ sealed: '2026-11-20' }), { clicks: 99, impressions: 999 }, '2026-11-26').why, /cannot be judged: it must be sealed/);
  assert.deepEqual(judge(T(), {}, 'later'), { ok: false, why: 'no date to judge on' });
});

// ── the ledger ──────────────────────────────────────────────────────────────────────────────────────────────────
const good = [E('looking', 'https://a.com/1'), E('complaining', 'https://b.com/1'), E('paying', 'https://c.com/1')];
test('stageOf and funnel: every idea at its stage; only tests that ran are spent; what the kills cost', () => {
  const ideas = [
    gap({ id: 'dream' }),
    gap({ id: 'att', evidence: good, scanned: AS }),
    gap({ id: 'bad-test', evidence: good, test: T({ bar: 0 }) }),
    gap({ id: 'open', evidence: good, test: T({ cost: 3 }) }),
    gap({ id: 'win', evidence: good, test: T({ cost: 2 }), result: { clicks: 40, impressions: 900 } }),
    gap({ id: 'dead', evidence: good, test: T({ cost: 5 }), result: { clicks: 1, impressions: 900 } }),
    gap({ id: 'dead2', evidence: good, test: T({ cost: 0 }), result: { clicks: 1, impressions: 900 } }),
    gap({ id: 'quiet', evidence: good, test: T({ cost: 1 }), result: { clicks: 1, impressions: 10 } }),
    gap({ id: 'old', scanned: '2027-12-01', evidence: good }),
    null,
  ];
  const at = (d) => ideas.filter(Boolean).map((i) => [i.id, stageOf(i, d)]);
  assert.deepEqual(at('2026-11-20'), [['dream', 'daydream'], ['att', 'attested'], ['bad-test', 'attested'], ['open', 'testing'], ['win', 'testing'], ['dead', 'testing'], ['dead2', 'testing'], ['quiet', 'testing'], ['old', 'daydream']]);
  assert.deepEqual(at('2026-11-26'), [['dream', 'daydream'], ['att', 'attested'], ['bad-test', 'attested'], ['open', 'testing'], ['win', 'build'], ['dead', 'kill'], ['dead2', 'kill'], ['quiet', 'unrun'], ['old', 'daydream']]);
  assert.deepEqual(funnel(ideas, '2026-11-26'), { scanned: 9, daydream: 2, attested: 2, testing: 1, build: 1, kill: 2, unrun: 1, spent: 11, killCost: 5 });
  assert.deepEqual(funnel(ideas, '2026-11-20').testing, 5);
  assert.equal(funnel(ideas, '2026-11-20').spent, 11, 'a running test is spent');
  assert.equal(funnel([gap({ evidence: good, test: { ...T(), cost: 'free' } })], '2026-11-20').spent, 0);
  assert.equal(funnel([gap({ evidence: good, test: T({ bar: 0, cost: 7 }) }), gap({ test: T({ cost: 9 }) })], '2026-11-20').spent, 0, 'a test that could not be judged, or a daydream\'s, spent nothing');
  assert.equal(funnel([gap({ evidence: good, test: { ...T(), cost: -4 } })], '2026-11-26').killCost, 0);
  assert.deepEqual(funnel('x', AS), { scanned: 0, daydream: 0, attested: 0, testing: 0, build: 0, kill: 0, unrun: 0, spent: 0, killCost: 0 });
  assert.equal(stageOf(null, AS), 'daydream');
});

// ── the first real scan (data/origin-ledger.json, O3): its verdicts re-derive from the gate ─────────────────────────
import { readFileSync } from 'node:fs';
test('the ledger: every item linked, dated and short; the gate gives the stages the scan reported', () => {
  const L = JSON.parse(readFileSync(new URL('../data/origin-ledger.json', import.meta.url), 'utf8'));
  for (const i of L.ideas) for (const e of i.evidence) {
    assert.match(e.url, /^https:\/\//); assert.ok(!Number.isNaN(dayOf(e.date)), e.url);
    assert.ok(e.said.split(/\s+/).length <= 25, 'a short line, never copied text: ' + e.url);
  }
  assert.deepEqual(L.ideas.map((i) => [i.id, stageOf(i, '2026-11-17')]), [['ai-test-theatre', 'testing'], ['agent-spend-caps', 'testing'], ['agent-audit-trail', 'testing'], ['hallucinated-citations', 'daydream']]);
  for (const i of L.ideas.filter((x) => x.test)) assert.equal(normalizeTest(i.test).ok, true, i.id + ' has a sealed, whole test');
  for (const i of L.ideas.filter((x) => !attest(x, x.scanned).ok)) assert.ok(typeof i.why === 'string' && i.why.length > 20, i.id + ' says why it is a daydream');
});
