// auditor.test.mjs — the separate judge: receipts re-hashed and read, the seal before the code, re-runs, the fence,
// the words of anything going out, and only PASSed items put to Simon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESULTS, pinOf, fractions, backed, verdicts, auditable, audit, forApproval, heldBack } from '../src/auditor.mjs';

const roster = JSON.parse(readFileSync(new URL('../data/roster.json', import.meta.url), 'utf8'));
const C = 'a'.repeat(40), H = 'b'.repeat(64), LINK = `https://github.com/sjgant80-hub/r/blob/${C}/data/x-run.json`;
const RECEIPT = JSON.stringify({ held: 9, of: 10, claims: { F1: { measured: '240 of 240 gone' } }, gate: [{ killed: 72, total: 72 }] });
const L = (o) => ({ ts: '2026-11-01T22:00:00Z', agent: 'builder', kind: 'note', what: 'reading', link: '', needs_owner: false, flags: [], id: 'L' + JSON.stringify(o).length, ...o });
const ctx = (lines = []) => ({ roster, lines, consent: { partners: [{ name: 'Gary W. Floyd', consent: false }, { name: 'Acme Ltd', consent: true }, { name: '' }] } });
const found = { receipt: { found: true, sha256: H, text: RECEIPT }, seal: { named: 'abc1234', ancestor: true } };
const why = (r) => r.checks.filter((c) => c.result !== 'ok').map((c) => c.result + ' ' + c.check + ': ' + c.evidence);

test('results', () => { assert.deepEqual(RESULTS, ['PASS', 'FLAG', 'FAIL']); });

test('pinOf, fractions, backed', () => {
  assert.deepEqual(pinOf(LINK), { repo: 'sjgant80-hub/r', commit: C, path: 'data/x-run.json' });
  for (const bad of ['https://github.com/o/r/blob/main/x.json', 'https://github.com/o/r/blob/' + 'A'.repeat(40) + '/x', 'RULES.md', '', 5]) assert.equal(pinOf(bad), null, String(bad));
  assert.deepEqual(fractions('9 of 10 held, witness 137/137, 3,000 of 3,000 calls; 0.5/10 and v1.2 of 3 and 1,5 of 9'), [['9', '10'], ['137', '137'], ['3000', '3000']]);
  assert.deepEqual(fractions(7), []);
  assert.equal(backed(RECEIPT, '240', '240'), true);
  assert.equal(backed(RECEIPT, '9', '10'), true);
  assert.equal(backed(RECEIPT, '72', '72'), true);
  assert.equal(backed(RECEIPT, '10', '10'), false);
  assert.equal(backed(RECEIPT, '9', '9'), false);
  assert.equal(backed(JSON.stringify({ held: 3, other: 4 }), '3', '4'), false);
  assert.equal(backed(JSON.stringify({ x: 3, of: 4 }), '3', '4'), false);
  assert.equal(backed(JSON.stringify({ passed: 3, total: 4 }), '3', '4'), true);
  assert.equal(backed('1240 of 2400', '240', '240'), false);
  assert.equal(backed('2.5 of 3', '5', '3'), false);
  assert.equal(backed('not json, 5/6', '5', '6'), true);
  assert.equal(backed('not json', '5', '6'), false);
  assert.equal(backed(null, '5', '6'), false);
});

test('receipt: re-hashed, found, pinned, and its numbers shown', () => {
  const ok = audit(L({ kind: 'build', what: 'step measured: 9 of 10 held, 240 of 240', link: LINK, receipt_sha256: H }), found, ctx());
  assert.equal(ok.verdict, 'PASS');
  assert.deepEqual(ok.checks.map((c) => c.check + ' ' + c.result), ['receipt ok', 'seal ok', 'tools ok']);
  assert.equal(ok.checks[0].evidence, 're-hashed bbbbbbbbbbbb at aaaaaaa:data/x-run.json');
  const R = (o, f = found) => why(audit(L({ kind: 'build', what: 'built: 9 of 10 held', link: LINK, receipt_sha256: H, ...o }), f, ctx()));
  assert.deepEqual(R({ link: '' }), ['FLAG receipt: a done with no receipt link']);
  assert.deepEqual(R({ link: 'RULES.md' }), ['FLAG receipt: the receipt link is not pinned to a commit: RULES.md']);
  assert.deepEqual(R({ receipt_sha256: undefined }), ['FLAG receipt: no receipt_sha256 to re-hash at aaaaaaa:data/x-run.json']);
  assert.deepEqual(R({}, { receipt: { found: false } }), ['FAIL receipt: receipt not found at aaaaaaa:data/x-run.json']);
  assert.deepEqual(R({}, {}), ['FAIL receipt: receipt not found at aaaaaaa:data/x-run.json']);
  assert.deepEqual(R({}, { ...found, receipt: { found: true, sha256: 'c'.repeat(64), text: RECEIPT } }), ['FAIL receipt: receipt hash differs at aaaaaaa:data/x-run.json: the line says bbbbbbbbbbbb, it re-hashes to cccccccccccc']);
  assert.deepEqual(R({}, { ...found, receipt: { found: true, text: RECEIPT } }), ['FAIL receipt: receipt hash differs at aaaaaaa:data/x-run.json: the line says bbbbbbbbbbbb, it re-hashes to ']);
  assert.deepEqual(R({ what: 'built: 10 of 10 held and 5/6' }), ['FLAG receipt: the line says 10 of 10; the receipt does not show it', 'FLAG receipt: the line says 5 of 6; the receipt does not show it']);
  assert.deepEqual(R({ what: 'built, clean' }, { ...found, receipt: { found: true, sha256: H, text: '{"clean": false}' } }), ['FAIL receipt: the line says clean; the receipt says clean false']);
  assert.deepEqual(R({ what: 'built, clean' }), []);
  assert.deepEqual(R({ what: 'built', receipt_sha256: H }, { ...found, receipt: { found: true, sha256: H, text: '{"clean": false}' } }), []);
  // no done claim and no hash: no receipt check; a hash alone brings one
  assert.deepEqual(audit(L({ what: 'reading the queue' }), {}, ctx()).checks.map((c) => c.check), ['tools']);
  assert.deepEqual(audit(L({ what: 'reading the queue', link: LINK, receipt_sha256: H }), found, ctx()).checks.map((c) => c.check + ' ' + c.result), ['receipt ok', 'tools ok']);
});

test('seal and re-run', () => {
  const B = (f) => why(audit(L({ kind: 'build', what: 'built', link: LINK, receipt_sha256: H }), { receipt: found.receipt, ...f }, ctx()));
  assert.deepEqual(B({}), ['FLAG seal: the seal was not checked']);
  assert.deepEqual(B({ seal: { named: '' } }), ['FAIL seal: the receipt names no seal']);
  assert.deepEqual(B({ seal: { named: 'abc1234', ancestor: false } }), ['FAIL seal: seal abc1234 is not before the code']);
  assert.deepEqual(B({ seal: { named: 'abc1234', ancestor: 'yes' } }), ['FAIL seal: seal abc1234 is not before the code']);
  assert.deepEqual(B({ seal: found.seal }), []);
  assert.deepEqual(audit(L({ kind: 'receipt', what: 'done', link: LINK, receipt_sha256: H }), { receipt: found.receipt }, ctx()).checks.map((c) => c.check), ['receipt', 'tools']);
  assert.deepEqual(why(audit(L({ kind: 'build', what: 'built', link: LINK, receipt_sha256: H }), { receipt: { found: false } }, ctx())), ['FAIL receipt: receipt not found at aaaaaaa:data/x-run.json']);
  const run = (rerun) => audit(L({ kind: 'build', what: 'built', link: LINK, receipt_sha256: H }), { ...found, rerun }, ctx());
  assert.deepEqual(run({ ran: true, exit: 0, cmd: 'node t --verify' }).checks.map((c) => c.check + ' ' + c.result + ' ' + c.evidence)[2], 'rerun ok re-ran: node t --verify');
  assert.deepEqual(why(run({ ran: true, exit: 1, cmd: 'node t --verify' })), ['FAIL rerun: re-ran node t --verify: exit 1']);
  assert.deepEqual(why(run({ ran: false, exit: 1 })), []);
  assert.deepEqual(why(run(5)), []);
});

test('the fence: off-list, forbidden, conditions met only by signed lines', () => {
  const T = (o, lines = []) => why(audit(L(o), {}, ctx(lines)));
  assert.deepEqual(T({ agent: 'scout', evidence: ['tool:x.read', 'tool:x.read', 'note'] }), []);
  assert.deepEqual(T({ agent: 'scout', evidence: ['see line 4 of the log', 7, 'tool:x.read'] }), []);
  assert.deepEqual(audit(L({ agent: 'scout', evidence: ['tool:x.read'] }), {}, ctx()).checks, [{ check: 'tools', result: 'ok', evidence: 'on the list: feed.write, x.read' }]);
  assert.deepEqual(T({ agent: 'scout', evidence: ['tool:seal.write'] }), ['FLAG tools: seal.write: off-list']);
  assert.deepEqual(T({ agent: 'scout', evidence: ['tool:teleport'] }), ['FLAG tools: teleport: unknown tool']);
  assert.deepEqual(T({ agent: 'scout', evidence: ['tool:dm.send'] }), ['FAIL tools: dm.send: forbidden']);
  assert.deepEqual(T({ agent: 'scout', kind: 'post', what: 'hi' }), ['FLAG tools: post.draft: off-list']);
  assert.deepEqual(T({ agent: 'reach', ref: 'D1', evidence: ['tool:post.publish'] }), ["FAIL tools: post.publish: needs Simon's go"]);
  const go = (signed, verdict = 'approve', ref = 'D1') => ({ agent: 'simon', kind: 'decision', verdict, ref, signed, id: 's' + signed + verdict + ref });
  assert.deepEqual(T({ agent: 'reach', ref: 'D1', evidence: ['tool:post.publish'] }, [go(true)]), []);
  assert.deepEqual(T({ agent: 'reach', ref: 'D1', evidence: ['tool:post.publish'] }, [go(false)]), ["FAIL tools: post.publish: needs Simon's go"]);
  assert.deepEqual(T({ agent: 'reach', ref: 'D1', evidence: ['tool:post.publish'] }, [go(true, 'deny')]), ["FAIL tools: post.publish: needs Simon's go"]);
  assert.deepEqual(T({ agent: 'reach', ref: 'D2', evidence: ['tool:post.publish'] }, [go(true)]), ["FAIL tools: post.publish: needs Simon's go"]);
  assert.deepEqual(T({ agent: 'reach', id: 'D1', evidence: ['tool:post.publish'] }, [go(true)]), []);
  const pass = (signed, verdict = 'PASS') => ({ agent: 'auditor', kind: 'receipt', verdict, ref: 'D1', signed, id: 'a' + signed + verdict });
  assert.deepEqual(T({ agent: 'card-keeper', ref: 'D1', evidence: ['tool:card.sign'] }, [pass(true)]), []);
  assert.deepEqual(T({ agent: 'card-keeper', ref: 'D1', evidence: ['tool:card.sign'] }, [pass(false)]), ["FAIL tools: card.sign: needs the auditor's PASS"]);
  assert.deepEqual(T({ agent: 'card-keeper', ref: 'D1', evidence: ['tool:card.sign'] }, [pass(true), pass(true, 'FLAG')]), ["FAIL tools: card.sign: needs the auditor's PASS"]);
  assert.deepEqual(T({ agent: 'builder', ref: 'D1', evidence: ['tool:main.merge'] }, [pass(true), go(true)]), []);
  assert.deepEqual(T({ agent: 'builder', ref: 'D1', evidence: ['tool:main.merge'] }, [go(true)]), ["FAIL tools: main.merge: needs the auditor's PASS"]);
  assert.deepEqual(audit(L({ agent: 'ghost' }), {}, ctx()).checks, [{ check: 'tools', result: 'FAIL', evidence: 'feed.write: unknown persona' }]);
  assert.deepEqual(audit(L({ evidence: 'tool:x' }), {}, ctx()).checks.length, 1);
});

test('the words of anything going out', () => {
  const W = (what, o = {}) => why(audit(L({ agent: 'reach', kind: 'post', what, needs_owner: true, ...o }), {}, ctx()));
  assert.deepEqual(W('Our checker reads your JSON against its schema and says what is wrong.'), []);
  assert.deepEqual(W('Save £500 a month with this tool.'), ['FAIL words: an earnings or savings claim: "Save £500"', 'FLAG words: a money amount: "£500" (prices are Simon\'s)']);
  assert.deepEqual(W('Cut your costs by 40% this year.'), ['FAIL words: an earnings or savings claim: "Cut your costs by 40%"', 'FLAG words: a number with no receipt: "40%"']);
  assert.deepEqual(W('Earn passive income while you sleep.'), ['FAIL words: an earnings or savings claim: "passive income"']);
  assert.deepEqual(W('It will triple your revenue.'), ['FAIL words: an earnings or savings claim: "triple your revenue"']);
  assert.deepEqual(W('Join the token presale.'), ['FAIL words: crypto wording: "token presale"']);
  assert.deepEqual(W('Guaranteed results.'), ['FLAG words: a guarantee or superlative: "Guaranteed"']);
  assert.deepEqual(W('We are #1 for checks.'), ['FLAG words: a guarantee or superlative: "#1"']);
  assert.deepEqual(W('Checked 40 of 40 claims.'), ['FLAG words: a number with no receipt: "40 of 40"']);
  assert.deepEqual(W('Checked 40 of 40 claims.', { link: 'https://e.example/r' }), []);
  assert.deepEqual(W('Made with Gary W. Floyd and Acme Ltd.'), ['FLAG words: names Gary W. Floyd without recorded consent']);
  assert.deepEqual(W('Grown from the estate.'), ['FLAG words: in-house jargon: "the estate"']);
  assert.deepEqual(W('Thanks κ.'), ['FLAG words: in-house jargon: "κ"']);
  const J = (what, jargon) => why(audit(L({ agent: 'reach', kind: 'post', what, needs_owner: true }), {}, { roster, lines: [], jargon }));
  assert.deepEqual(J('Built on Zorbo.', ['', 'zorbo']), ['FLAG receipt: a done with no receipt link', 'FLAG words: in-house jargon: "zorbo"']);
  assert.deepEqual(J('Made on Zorbo from the estate.', ['zorbo']), ['FLAG words: in-house jargon: "the estate"']);
  assert.deepEqual(J('Plain words.', ['', 5]), []);
  assert.deepEqual(J('Plain words.', 'plain'), []);
  const forty = Array(40).fill('word').join(' ') + '.', fortyOne = Array(41).fill('word').join(' ') + '.';
  assert.deepEqual(W(forty + ' Short.'), []);
  assert.deepEqual(W(fortyOne + ' Short.'), ['FLAG words: a sentence over 40 words']);
  assert.deepEqual(why(audit(L({ agent: 'money-time', kind: 'listing', what: 'Make money with crypto.' }), {}, ctx())), ['FAIL words: an earnings or savings claim: "Make money"', 'FAIL words: crypto wording: "crypto"']);
  assert.deepEqual(why(audit(L({ agent: 'kar', kind: 'note', what: 'Make money with crypto.', needs_owner: true }), {}, ctx())), ['FLAG words: an earnings or savings claim: "Make money"', 'FLAG words: crypto wording: "crypto"']);
  assert.deepEqual(why(audit(L({ agent: 'kar', kind: 'note', what: 'Make money with crypto.' }), {}, ctx())), []);
  assert.deepEqual(why(audit(L({ agent: 'kar', kind: 'note', what: 'fine', quote: 'save $5 now', needs_owner: true }), {}, ctx())), ['FLAG words: an earnings or savings claim: "save $5"', 'FLAG words: a money amount: "$5" (prices are Simon\'s)']);
  assert.deepEqual(why(audit(L({ agent: 'reach', kind: 'post', what: 'x', needs_owner: true }), {}, { roster, lines: [], consent: { partners: 'x' } })), []);
  assert.deepEqual(why(audit(L({ agent: 'reach', kind: 'post', what: 'x', needs_owner: true }), {}, { roster })), []);
});

test("the judge's flags: posts and listings only, never more than a FLAG", () => {
  const judge = [{ label: 'ASSUMPTION', quote: 'every team has a schema' }, { label: '', quote: 'dropped' }, null];
  const r = audit(L({ agent: 'reach', kind: 'post', what: 'A plain post.', needs_owner: true }), { judge }, ctx());
  assert.deepEqual(why(r), ['FLAG judge: the local model: ASSUMPTION: "every team has a schema"']);
  assert.equal(r.verdict, 'FLAG');
  assert.deepEqual(why(audit(L({ agent: 'money-time', kind: 'listing', what: 'A listing.' }), { judge: [{ label: 'JARGON' }] }, ctx())), ['FLAG judge: the local model: JARGON: ""']);
  assert.deepEqual(why(audit(L({ agent: 'kar', kind: 'note', what: 'n', needs_owner: true }), { judge }, ctx())), []);
});

test('audit: the verdict is the worst check; nonsense is a FAIL, never a throw', () => {
  assert.equal(audit(L({ agent: 'reach', kind: 'post', what: 'Guaranteed.', needs_owner: true, evidence: ['tool:dm.send'] }), {}, ctx()).verdict, 'FAIL');
  assert.equal(audit(L({ agent: 'reach', kind: 'post', what: 'Guaranteed.', needs_owner: true }), {}, ctx()).verdict, 'FLAG');
  assert.equal(audit(L({ agent: 'reach', kind: 'post', what: 'Plain.', needs_owner: true }), {}, ctx()).verdict, 'PASS');
  assert.deepEqual(audit(null, {}, ctx()), { verdict: 'FAIL', checks: [{ check: 'line', result: 'FAIL', evidence: 'not a line' }] });
  assert.equal(audit(L({ agent: 'reach', kind: 'post', what: 'Plain.' }), 5, 5).verdict, 'FAIL');
});

test('auditable: what gets a verdict', () => {
  const A = (o) => auditable(L(o), ctx());
  for (const kind of ['build', 'receipt', 'listing', 'post']) assert.equal(A({ kind, agent: kind === 'post' ? 'reach' : kind === 'listing' ? 'money-time' : 'builder' }), true, kind);
  assert.equal(A({ needs_owner: true }), true);
  assert.equal(A({ what: 'shipped it' }), true);
  assert.equal(A({ evidence: ['tool:feed.read'] }), true);
  assert.equal(A({ evidence: ['feed.read', 5] }), false);
  assert.equal(A({ evidence: 'tool:x' }), false);
  assert.equal(A({ agent: 'builder', kind: 'task', to: 'reach' }), true);
  assert.equal(A({ agent: 'kar', kind: 'task', to: 'reach' }), false);
  assert.equal(A({ what: 'reading' }), false);
  assert.equal(A({ agent: 'simon', kind: 'build' }), false);
  assert.equal(A({ agent: 'auditor', kind: 'receipt', verdict: 'PASS' }), false);
  assert.equal(auditable(null, ctx()), false);
  assert.equal(auditable(L({ what: 'reading' }), null), true);
});

test('verdicts, forApproval, heldBack: only signed PASSes reach Simon', () => {
  const N = (id, o = {}) => ({ id, agent: 'money-time', kind: 'listing', needs_owner: true, ...o });
  const V = (ref, verdict, signed = true, agent = 'auditor') => ({ id: 'v' + ref + verdict + signed + agent, agent, kind: 'receipt', verdict, ref, signed });
  const lines = [N('a'), N('b'), N('c'), N('d'), N('e'), N('f'), N('g', { needs_owner: false }), N('h', { agent: 'simon' }), { agent: 'reach', needs_owner: true, id: 5 },
    V('a', 'PASS'), V('b', 'PASS'), V('b', 'FLAG'), V('c', 'PASS', false), V('d', 'PASS', true, 'kar'), V('e', 'FAIL'), V('f', 'PASS'), V('g', 'PASS'), V('', 'PASS'),
    { id: 'sf', agent: 'simon', kind: 'decision', verdict: 'approve', ref: 'f', signed: true }];
  assert.deepEqual(verdicts(lines), { a: 'PASS', b: 'FLAG', e: 'FAIL', f: 'PASS', g: 'PASS' });
  assert.deepEqual(forApproval(lines).map((x) => x.id), ['a']);
  assert.deepEqual(heldBack(lines).map((x) => [x.line.id, x.verdict]), [['b', 'FLAG'], ['c', 'not yet audited'], ['d', 'not yet audited'], ['e', 'FAIL']]);
  assert.deepEqual(verdicts([V('x', 'maybe'), null]), {});
  assert.deepEqual(forApproval('x'), []);
  assert.deepEqual(heldBack(null), []);
});
