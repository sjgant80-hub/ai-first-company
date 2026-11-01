// feed.test.mjs — the team's one feed: secrets out, a done needs a receipt, a signature per persona, the kill switch.
// Secret-shaped values are built at run time (a repeated character after a published prefix), so none is committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS, AGENTS, KINDS, isCard, redact, claimsDone, entry, signingText, idOf, read, append, appendOnly, pausedSet, mayAct, answered } from '../src/feed.mjs';

const rep = (p, n, c = 'a1') => p + c.repeat(Math.ceil(n / c.length)).slice(0, n);
const TS = '2026-11-01T21:30:00Z';
const L = (o) => ({ ts: TS, agent: 'kar', kind: 'note', what: 'reading the queue', ...o });
const ok = (o, lines) => { const r = entry(L(o), lines); assert.equal(r.ok, true, r.why); return r.line; };
const S = (o) => ({ ...ok(o), id: 'x', signed: o.signed === true });

test('the roster, the kinds', () => {
  assert.deepEqual(PERSONAS, ['kar', 'builder', 'money-time', 'reach', 'scout', 'client-lead', 'card-keeper', 'auditor']);
  assert.deepEqual(AGENTS.slice(-1), ['simon']);
  assert.equal(KINDS.length, 10);
});

test('isCard: Luhn and the card ranges', () => {
  for (const d of ['4111111111111111', '4222222222222', '4111111111111111110', '5105105105105100', '5555555555554444', '2221000000000009', '2720999999999996', '378282246310005', '341111111111111', '6011111111111117', '6011000000000000001', '6500000000000002', '6500000000000000003']) assert.equal(isCard(d), true, d);
  for (const d of ['4111111111111112', '411111111111116', '5005550000000008', '5600000000000003', '2220999999999991', '2721000000000004', '351111111111118', '601111111111116', '378282246310005002', '41111111111111113', 'abcd', '411111111117', '3411111111111110', '650000000000003', '222100000000000', '550000000000000004']) assert.equal(isCard(d), false, d);
});

test('redact: provider keys, tokens, emails, card numbers', () => {
  const cases = [
    ['key', 'use ' + rep('sk-', 30) + ' now'],
    ['key', 'use ' + rep('sk-ant-api03-', 40, 'b_-') + ' now'],
    ['key', 'use ' + rep('ghp_', 36) + ' now'],
    ['key', 'use ' + rep('gho_', 36) + ' now'],
    ['key', 'use ' + rep('github_pat_', 60, 'c_') + ' now'],
    ['key', 'use ' + rep('xai-', 30) + ' now'],
    ['key', 'use ' + rep('AKIA', 16, 'Z9') + ' now'],
    ['key', 'use ' + rep('ASIA', 16, 'Q7') + ' now'],
    ['key', 'use ' + rep('rk_live_', 20) + ' now'],
    ['key', 'use ' + rep('pk_test_', 12) + ' now'],
    ['key', 'use ' + rep('xoxp-', 20, '1-') + ' now'],
    ['key', 'use ' + rep('AIza', 35, 'k_') + ' now'],
    ['key', 'block -----BEGIN RSA PRIVATE KEY----- ' + rep('', 40, 'Mz') + ' -----END RSA PRIVATE KEY----- end'],
    ['key', 'cut -----BEGIN PRIVATE KEY----- ' + rep('', 40, 'Mz') + ' ' + rep('', 20, 'q/') + ' end'],
    ['token', 'hdr Authorization: Bearer ' + rep('', 24, 'tK.') + ' end'],
    ['token', 'hdr Proxy-Authorization: Basic ' + rep('', 24, 'dX=') + ' end'],
    ['token', 'hdr token ' + rep('', 20, 'Ab') + ' end'],
    ['token', 'jwt ' + rep('eyJ', 12, 'hb') + '.' + rep('eyJ', 12, 'zz') + '.' + rep('', 12, 'Q-') + ' end'],
    ['token', 'see https://host.example/a?x=1&access_token=' + rep('', 20) + '#top end'],
    ['token', 'see https://host.example/cb#sig=' + rep('', 20) + ' end'],
    ['token', 'use ' + rep('npm_', 36) + ' now'],
    ['token', 'use ' + rep('hf_', 34) + ' now'],
    ['token', 'use ' + rep('whsec_', 30) + ' now'],
    ['token', 'set client_secret = "' + rep('', 16) + '" now'],
    ['token', 'set PASSWORD:' + rep('', 9, 'Pw!') + ' now'],
    ['email', 'mail jane.doe+x@mail.example.co.uk now'],
    ['email', 'mail <ops@team.example> now'],
    ['email', 'mail mailto:a_b%c@ex-ample.io now'],
    ['card', 'card 4111 1111 1111 1111 now'],
    ['card', 'card 3782-822463-10005 now'],
    ['card', 'card 5555555555554444 now'],
  ];
  for (const [cls, text] of cases) {
    const r = redact(text);
    assert.deepEqual(r.hits, { [cls]: 1 }, text);
    assert.match(r.text, new RegExp('\\[redacted:' + cls + '\\]'), text);
    assert.ok(r.text.startsWith(text.slice(0, 3)) && r.text.endsWith(text.slice(-3)), 'only the secret goes: ' + r.text);
  }
});

test('redact: two of a kind are counted, a URL without a secret is kept', () => {
  assert.deepEqual(redact('a@b.co and c@d.co'), { text: '[redacted:email] and [redacted:email]', hits: { email: 2 } });
  const url = 'https://x.com/ainativesol/status/4111111111111111 and https://host.example/a?page=2&key=' + rep('', 12);
  assert.deepEqual(redact(url), { text: 'https://x.com/ainativesol/status/4111111111111111 and [redacted:token]', hits: { token: 1 } });
  assert.deepEqual(redact('see https://host.example/p 4111 1111 1111 1111'), { text: 'see https://host.example/p [redacted:card]', hits: { card: 1 } });
});

test('redact: what only looks like a secret is left alone', () => {
  for (const t of [
    'receipt ' + rep('', 64, 'f0'), 'commit ' + rep('', 40, '9a'), 'code 4JQK-D8XF-EE30-C6V4', 'card 4111111111111112 fails the check',
    'cloned git@github.com:org/repo.git', '@grok replied to @kar', 'installed @types/node', 'the token budget is at 80%', "Kar's key signs it",
    'password: hunter2', 'secret = short', 'Bearer of news', '2026-11-01T21:30:00Z', '1234 5678 9012 3456', '',
  ]) assert.deepEqual(redact(t), { text: t, hits: {} }, t);
  assert.deepEqual(redact(5), { text: '', hits: {} });
});

test('claimsDone: done words, negation just before, claim kinds', () => {
  for (const w of ['done', 'Shipped!', 'is live', 'fixed it', 'passed', 'forged']) assert.equal(claimsDone('note', 'the batch ' + w), true, w);
  for (const t of ['the batch is not done', 'never shipped', "isn't live", 'not yet fixed', 'has not been fully deployed', 'not live until Stripe', 'no build sealed', 'didn’t get passed', 'yet to be posted']) assert.equal(claimsDone('note', t), false, t);
  assert.equal(claimsDone('note', 'not here, the build is done'), true);
  assert.equal(claimsDone('note', 'started the batch'), false);
  assert.equal(claimsDone('build', 'started the batch'), true);
  assert.equal(claimsDone('receipt', ''), true);
  assert.equal(claimsDone('task', 5), false);
});

test('entry: refusals each carry the reason', () => {
  const R = (o, why) => assert.deepEqual(entry(o), { ok: false, why }, JSON.stringify(o));
  R(null, 'not a line'); R([], 'not a line'); R('x', 'not a line');
  R(L({ ts: 5 }), 'ts is not an ISO 8601 time');
  R(L({ ts: ['2026-11-01T21:30:00Z'] }), 'ts is not an ISO 8601 time');
  R(L({ ts: '2026-11-01' }), 'ts is not an ISO 8601 time');
  R(L({ ts: '2026-13-45T00:00Z' }), 'ts is not an ISO 8601 time');
  R(L({ agent: 'grok' }), 'unknown agent');
  R(L({ kind: 'tweet' }), 'unknown kind');
  R(L({ what: '   ' }), 'empty what'); R(L({ what: 5 }), 'empty what');
  R(L({ link: 5 }), 'link is not text');
  R(L({ needs_owner: 'yes' }), 'needs_owner is not true or false');
  R(L({ receipt_sha256: 'ABC' }), 'receipt_sha256 is not a SHA-256');
  R(L({ receipt_sha256: 'A'.repeat(64) }), 'receipt_sha256 is not a SHA-256');
  R(L({ kind: 'handoff' }), 'a handoff must name the next persona');
  R(L({ kind: 'handoff', to: 'simon' }), 'a handoff must name the next persona');
  R(L({ to: 'grok' }), 'to is not a persona');
  R(L({ ref: '' }), 'ref is not a line id or persona'); R(L({ ref: 'x'.repeat(201) }), 'ref is not a line id or persona'); R(L({ ref: 7 }), 'ref is not a line id or persona');
  R(L({ verdict: 'ok' }), 'unknown verdict');
  R(L({ quote: 1 }), 'quote is not text');
  R(L({ evidence: 'x' }), 'evidence is not a list of pointers'); R(L({ evidence: ['a', 2] }), 'evidence is not a list of pointers');
});

test('entry: the stored line, redacted and flagged by the writer', () => {
  assert.deepEqual(ok({ what: '  reading  ' }), { ts: TS, agent: 'kar', kind: 'note', what: 'reading', link: '', needs_owner: false, flags: [] });
  const full = ok({ kind: 'handoff', to: 'reach', what: 'built the draft, mail ops@x.io', link: ' https://e.example/r ', needs_owner: true, receipt_sha256: 'a'.repeat(64), ref: 'x'.repeat(200), verdict: 'PASS', quote: 'yes, ok@y.io', evidence: ['see b@c.io', 'line 4'], flags: ['forged-by-caller'], sig: 'zz', extra: 1 });
  assert.deepEqual(full, { ts: TS, agent: 'kar', kind: 'handoff', what: 'built the draft, mail [redacted:email]', link: 'https://e.example/r', needs_owner: true, receipt_sha256: 'a'.repeat(64), to: 'reach', ref: 'x'.repeat(200), verdict: 'PASS', quote: 'yes, [redacted:email]', evidence: ['see [redacted:email]', 'line 4'], flags: ['redacted:email'] });
  assert.deepEqual(ok({ what: 'key ' + rep('ghp_', 36) + ' and z@z.io' }).flags, ['redacted:key', 'redacted:email']);
  assert.deepEqual(ok({ what: 'shipped the fix' }).flags, ['no-receipt']);
  assert.deepEqual(ok({ what: 'shipped the fix', link: 'https://e.example/run/1' }).flags, []);
  assert.deepEqual(ok({ kind: 'build', what: 'step two' }).flags, ['no-receipt']);
  assert.deepEqual(ok({ kind: 'post', what: 'draft for 18:34' }), { ts: TS, agent: 'kar', kind: 'post', what: 'draft for 18:34', link: '', needs_owner: true, flags: ['needs-owner-forced'] });
  assert.deepEqual(ok({ kind: 'listing', what: 'draft', needs_owner: true }).flags, []);
  assert.deepEqual(ok({ kind: 'lead', what: 'a lead' }).needs_owner, false);
  assert.deepEqual(ok({ needs_owner: true }).needs_owner, true);
});

test('signing text and id: the line without sig, keys sorted', () => {
  const a = { ts: TS, agent: 'kar', kind: 'note', what: 'w', link: '', needs_owner: false, flags: [] };
  assert.equal(signingText(a), '{"agent":"kar","flags":[],"kind":"note","link":"","needs_owner":false,"ts":"2026-11-01T21:30:00Z","what":"w"}');
  assert.equal(signingText({ ...a, sig: 'abc' }), signingText(a));
  assert.equal(idOf({ ...a, sig: 'abc' }), idOf(a));
  assert.match(idOf(a), /^[0-9a-f]{64}$/);
  assert.notEqual(idOf(a), idOf({ ...a, what: 'v' }));
  assert.equal(signingText(null), '{}');
});

test('read, append, appendOnly', () => {
  const a = ok({ what: 'one' }), b = ok({ what: 'two', link: 'l' });
  const file = append(append('', a), b);
  assert.equal(file, JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n');
  assert.equal(append('x', a), 'x\n' + JSON.stringify(a) + '\n');
  assert.equal(append('x\n', a), 'x\n' + JSON.stringify(a) + '\n');
  assert.equal(append(5, a), JSON.stringify(a) + '\n');
  const r = read(file + 'not json\n' + JSON.stringify({ ...a, flags: 'x' }) + '\n' + JSON.stringify({ ...a, sig: 5 }) + '\n' + JSON.stringify({ ...a, link: undefined }) + '\n' + JSON.stringify({ ...a, needs_owner: 'n' }) + '\n' + JSON.stringify({ ...a, flags: [1] }) + '\n\r\n' + JSON.stringify({ ...b, sig: 's' }) + '\r\n', (x) => x.what === 'two');
  assert.equal(r.skipped, 6);
  assert.deepEqual(r.lines.map((x) => [x.what, x.signed, x.id]), [['one', false, idOf(a)], ['two', true, idOf(b)], ['two', true, idOf(b)]]);
  assert.deepEqual(read(file, () => 'yes').lines.map((x) => x.signed), [false, false]);
  assert.deepEqual(read(file, () => { throw new Error('bad key'); }).lines.map((x) => x.signed), [false, false]);
  assert.deepEqual(read(file).lines.map((x) => x.signed), [false, false]);
  assert.deepEqual(read(null), { lines: [], skipped: 0 });
  assert.equal(appendOnly('a\nb\n', 'a\nb\nc\n'), true);
  assert.equal(appendOnly('a\nb\n', 'a\nx\nb\nc\n'), true);
  assert.equal(appendOnly('a\nb\n', 'b\na\n'), false);
  assert.equal(appendOnly('a\nb\n', 'a\nB\n'), false);
  assert.equal(appendOnly('a\nb\n', 'a\n'), false);
  assert.equal(appendOnly('', 'a'), true);
  assert.equal(appendOnly('b\n', 'b\n'), true);
  assert.equal(appendOnly('a\n\nb', 'a\r\nb'), true);
});

test('the kill switch: anyone safe may pause, only signed Simon resumes', () => {
  const P = (agent, verdict, ref, signed) => S({ agent, kind: 'decision', verdict, ref, what: verdict + ' ' + ref, signed });
  assert.equal(mayAct([], 'reach'), true);
  const one = [P('kar', 'pause', 'reach')];
  assert.equal(mayAct(one, 'reach'), false);
  assert.equal(mayAct(one, 'scout'), true);
  assert.equal(mayAct([P('auditor', 'pause', 'scout')], 'scout'), false);
  assert.equal(mayAct([P('simon', 'pause', 'scout', true)], 'scout'), false);
  assert.equal(mayAct([P('simon', 'pause', 'scout', false)], 'scout'), true);
  assert.equal(mayAct([P('builder', 'pause', 'scout')], 'scout'), true);
  assert.equal(mayAct([{ ...P('kar', 'pause', 'scout'), kind: 'note' }], 'scout'), true);
  assert.equal(mayAct([P('kar', 'pause', 'nobody')], 'scout'), true);
  assert.equal(mayAct(one.concat([P('kar', 'unpause', 'reach')]), 'reach'), false);
  assert.equal(mayAct(one.concat([P('simon', 'unpause', 'reach', false)]), 'reach'), false);
  assert.equal(mayAct(one.concat([P('simon', 'unpause', 'reach', true)]), 'reach'), true);
  const team = [P('kar', 'pause', 'team')];
  for (const p of PERSONAS) assert.equal(mayAct(team, p), false, p);
  assert.equal(mayAct(team, 'simon'), true);
  assert.equal(mayAct(team.concat([P('simon', 'unpause', 'team', true)]), 'kar'), true);
  assert.deepEqual([...pausedSet(one.concat(team))], ['reach', 'team']);
  assert.deepEqual([...pausedSet('x')], []);
  assert.deepEqual([...pausedSet([null, 5])], []);
  assert.deepEqual(ok({ agent: 'reach', what: 'still drafting' }, one).flags, ['while-paused']);
  assert.deepEqual(ok({ agent: 'scout', what: 'reading' }, one).flags, []);
  assert.deepEqual(ok({ agent: 'simon', what: 'reading' }, team).flags, []);
});

test("answered: Simon's latest signed approve or deny, per line", () => {
  const D = (agent, verdict, ref, signed, ts = TS, quote) => S({ agent, kind: 'decision', verdict, ref, what: 'd', signed, ts, ...(quote ? { quote } : {}) });
  const lines = [
    D('simon', 'approve', 'L1', true, '2026-11-01T07:00:00Z', 'yes'), D('simon', 'deny', 'L1', true, '2026-11-01T07:05:00Z'),
    D('simon', 'approve', 'L2', false), D('kar', 'approve', 'L3', true), D('simon', 'pause', 'L4', true),
    { ...D('simon', 'approve', 'L5', true), kind: 'note' }, D('simon', 'approve', 'L6', true, TS, 'go ahead'),
  ];
  assert.deepEqual(answered(lines), { L1: { verdict: 'deny', ts: '2026-11-01T07:05:00Z', quote: '' }, L6: { verdict: 'approve', ts: TS, quote: 'go ahead' } });
  assert.deepEqual(answered([{ agent: 'simon', signed: true, kind: 'decision', verdict: 'approve', ref: 5 }]), {});
  assert.deepEqual(answered('x'), {});
});
