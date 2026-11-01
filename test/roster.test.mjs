// roster.test.mjs — the roles as a fence: a whole roster, every refusal named, the tool a feed line used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSES, CONDITIONS, problems, may, toolOf } from '../src/roster.mjs';

const REAL = JSON.parse(readFileSync(new URL('../data/roster.json', import.meta.url), 'utf8'));
const IDS = ['kar', 'builder', 'money-time', 'reach', 'scout', 'client-lead', 'card-keeper', 'auditor'];
const base = () => ({
  tools: { 'feed.read': { class: 'read', what: 'r' }, 'feed.write': { class: 'write', what: 'w' }, 'card.sign': { class: 'gated', what: 'g' }, 'post.publish': { class: 'outward', what: 'o' }, 'verdict.write': { class: 'write', what: 'v' }, 'money.spend': { class: 'outward', what: 'm' } },
  personas: IDS.map((id) => ({ id, name: id, role: 'r', runs_on: 'x', runtime: { model: id === 'auditor' ? 'small' : 'big', config: id }, tools: ['feed.read'], forbidden: ['money.spend'], owns: ['out-' + id] })),
});
const P = (r, id) => r.personas.find((p) => p.id === id);

test('classes and conditions', () => {
  assert.deepEqual(CLASSES, ['read', 'write', 'gated', 'outward']);
  assert.deepEqual(CONDITIONS, ['auditor-pass', 'simon-go']);
});

test('problems: the real roster and the minimal one are whole', () => {
  assert.deepEqual(problems(REAL), []);
  assert.deepEqual(problems(base()), []);
  const r = base(); P(r, 'reach').content = ['plain-language']; P(r, 'auditor').tools.push('verdict.write');
  P(r, 'builder').tools.push({ tool: 'post.publish', when: ['auditor-pass', 'simon-go'] }); P(r, 'kar').tools.push({ tool: 'card.sign', when: ['auditor-pass'] });
  assert.deepEqual(problems(r), []);
});

test('problems: each fault named', () => {
  const one = (edit, want) => { const r = base(); edit(r); assert.deepEqual(problems(r), want); };
  assert.deepEqual(problems(null), ['not a roster']);
  assert.deepEqual(problems([]), ['not a roster']);
  assert.deepEqual(problems({ personas: [] }), ['no tool vocabulary']);
  assert.deepEqual(problems({ tools: [] }), ['no tool vocabulary']);
  one((r) => { r.tools.x = { class: 'loud', what: 'w' }; }, ['tool x: needs a class and plain words']);
  one((r) => { r.tools.x = { class: 'read', what: ' ' }; }, ['tool x: needs a class and plain words']);
  one((r) => { r.tools.x = 'read'; }, ['tool x: needs a class and plain words']);
  one((r) => { r.personas.push(5); }, ['a persona is not an object']);
  one((r) => { r.personas.push({ ...P(r, 'kar'), owns: ['k2'] }); }, ["the personas are not the feed's eight"]);
  one((r) => { P(r, 'scout').id = 'spy'; }, ["the personas are not the feed's eight"]);
  one((r) => { r.personas.pop(); }, ["the personas are not the feed's eight"]);
  one((r) => { delete r.personas; }, ['a persona is not an object', "the personas are not the feed's eight"]);
  one((r) => { P(r, 'kar').name = ''; }, ['persona kar: no name']);
  one((r) => { P(r, 'kar').role = 4; }, ['persona kar: no role']);
  one((r) => { delete P(r, 'kar').runs_on; }, ['persona kar: no runs_on']);
  one((r) => { delete P(r, 'kar').runtime; }, ['persona kar: no runtime model and config']);
  one((r) => { P(r, 'kar').runtime = { model: 'big' }; }, ['persona kar: no runtime model and config']);
  one((r) => { P(r, 'kar').runtime = { config: 'k' }; }, ['persona kar: no runtime model and config']);
  one((r) => { P(r, 'kar').tools = []; }, ['persona kar: no tools']);
  one((r) => { P(r, 'kar').tools = 'feed.read'; }, ['persona kar: no tools']);
  one((r) => { P(r, 'kar').forbidden = []; }, ['persona kar: no forbidden actions']);
  one((r) => { P(r, 'kar').forbidden = ['']; }, ['persona kar: no forbidden actions', 'persona kar: unknown forbidden tool ']);
  one((r) => { P(r, 'kar').owns = []; }, ['persona kar: owns nothing']);
  one((r) => { P(r, 'kar').owns = 'x'; }, ['persona kar: owns nothing']);
  one((r) => { P(r, 'kar').content = 'plain'; }, ['persona kar: content rules are not words']);
  one((r) => { P(r, 'kar').content = ['ok', '']; }, ['persona kar: content rules are not words']);
  one((r) => { P(r, 'kar').tools.push('nope'); }, ['persona kar: unknown tool nope']);
  one((r) => { P(r, 'kar').tools.push({ tool: 'feed.write' }); }, ['persona kar: feed.write has a condition that is not one of auditor-pass, simon-go']);
  one((r) => { P(r, 'kar').tools.push({ tool: 'feed.write', when: ['maybe'] }); }, ['persona kar: feed.write has a condition that is not one of auditor-pass, simon-go']);
  one((r) => { P(r, 'kar').tools.push({ tool: 'feed.write', when: ['simon-go', 'maybe'] }); }, ['persona kar: feed.write has a condition that is not one of auditor-pass, simon-go']);
  one((r) => { P(r, 'kar').tools.push({ tool: 'feed.write', when: 'simon-go' }); }, ['persona kar: feed.write has a condition that is not one of auditor-pass, simon-go']);
  one((r) => { P(r, 'kar').tools.push('money.spend'); }, ['persona kar: money.spend is both allowed and forbidden', "persona kar: outward money.spend without Simon's go"]);
  one((r) => { P(r, 'kar').tools.push({ tool: 'post.publish', when: ['auditor-pass'] }); }, ["persona kar: outward post.publish without Simon's go"]);
  one((r) => { P(r, 'kar').tools.push('card.sign'); }, ["persona kar: gated card.sign without the auditor's PASS"]);
  one((r) => { P(r, 'kar').tools.push({ tool: 'card.sign', when: ['simon-go'] }); }, ["persona kar: gated card.sign without the auditor's PASS"]);
  one((r) => { P(r, 'builder').tools.push('verdict.write'); }, ['persona builder: only the auditor writes verdicts']);
  one((r) => { P(r, 'kar').forbidden.push('ghost'); }, ['persona kar: unknown forbidden tool ghost']);
  one((r) => { P(r, 'reach').owns.push('out-kar'); }, ['out-kar: owned by kar and reach']);
  one((r) => { P(r, 'auditor').runtime.model = 'big'; }, ["the auditor runs on builder's model or config", "the auditor runs on kar's model or config"]);
  one((r) => { P(r, 'auditor').runtime.config = 'kar'; }, ["the auditor runs on kar's model or config"]);
  one((r) => { P(r, 'auditor').runtime.config = 'builder'; }, ["the auditor runs on builder's model or config"]);
  one((r) => { P(r, 'auditor').runtime = 5; P(r, 'auditor').runtime = undefined; }, ['persona auditor: no runtime model and config']);
  one((r) => { P(r, 'builder').runtime = null; P(r, 'auditor').runtime.config = 'builder'; }, ['persona builder: no runtime model and config']);
  one((r) => { r.personas = r.personas.filter((p) => p.id !== 'auditor').concat([{ id: 'auditor', name: 'a', role: 'r', runs_on: 'x', runtime: { model: 'small', config: 'auditor' }, tools: ['feed.read'], forbidden: ['money.spend'], owns: ['v'] }]); }, []);
});

test('may: every refusal named, conditions met in full', () => {
  const r = REAL;
  assert.deepEqual(may(r, 'ghost', 'feed.read'), { ok: false, why: 'unknown persona' });
  assert.deepEqual(may(r, 'kar', 'teleport'), { ok: false, why: 'unknown tool' });
  assert.deepEqual(may(r, 'kar', 'constructor'), { ok: false, why: 'unknown tool' });
  assert.deepEqual(may(r, 'kar', 'post.publish', { simonGo: true, auditorPass: true }), { ok: false, why: 'forbidden' });
  assert.deepEqual(may(r, 'scout', 'card.forge', { simonGo: true, auditorPass: true }), { ok: false, why: 'off-list' });
  assert.deepEqual(may(r, 'scout', 'x.read'), { ok: true });
  assert.deepEqual(may(r, 'builder', 'main.merge', {}), { ok: false, why: "needs the auditor's PASS" });
  assert.deepEqual(may(r, 'builder', 'main.merge', { simonGo: true }), { ok: false, why: "needs the auditor's PASS" });
  assert.deepEqual(may(r, 'builder', 'main.merge', { auditorPass: true }), { ok: false, why: "needs Simon's go" });
  assert.deepEqual(may(r, 'builder', 'main.merge', { auditorPass: true, simonGo: true }), { ok: true });
  assert.deepEqual(may(r, 'builder', 'main.merge', { auditorPass: 'yes', simonGo: true }), { ok: false, why: "needs the auditor's PASS" });
  assert.deepEqual(may(r, 'reach', 'post.publish', { simonGo: 1 }), { ok: false, why: "needs Simon's go" });
  assert.deepEqual(may(r, 'reach', 'post.publish', { simonGo: true }), { ok: true });
  assert.deepEqual(may(r, 'card-keeper', 'card.sign', 'x'), { ok: false, why: "needs the auditor's PASS" });
  assert.deepEqual(may(r, 'card-keeper', 'card.sign', { auditorPass: true }), { ok: true });
  // whatever a roster says, outward needs Simon and gated needs the auditor
  const loose = base(); P(loose, 'kar').tools.push('post.publish', 'card.sign');
  assert.deepEqual(may(loose, 'kar', 'post.publish', { auditorPass: true }), { ok: false, why: "needs Simon's go" });
  assert.deepEqual(may(loose, 'kar', 'post.publish', { simonGo: true }), { ok: true });
  assert.deepEqual(may(loose, 'kar', 'card.sign', { simonGo: true }), { ok: false, why: "needs the auditor's PASS" });
  const odd = base(); P(odd, 'kar').forbidden = 'money.spend'; P(odd, 'kar').tools = 'feed.read';
  assert.deepEqual(may(odd, 'kar', 'money.spend'), { ok: false, why: 'off-list' });
  assert.deepEqual(may(null, 'kar', 'feed.read'), { ok: false, why: 'unknown persona' });
  assert.deepEqual(may({ personas: [{ id: 'kar' }] }, 'kar', 'feed.read'), { ok: false, why: 'unknown tool' });
  assert.deepEqual(may({ personas: [{ id: 'kar' }], tools: { 'feed.read': 'read' } }, 'kar', 'feed.read'), { ok: false, why: 'unknown tool' });
  assert.deepEqual(may({ personas: [{ id: 'kar', tools: [{ tool: 'feed.read' }] }], tools: { 'feed.read': { class: 'read' } } }, 'kar', 'feed.read'), { ok: true });
  assert.deepEqual(may({ personas: 'kar', tools: {} }, 'kar', 'feed.read'), { ok: false, why: 'unknown persona' });
});

test('toolOf: the tool each feed line used', () => {
  const L = (o) => ({ kind: 'note', ...o });
  assert.equal(toolOf(L({ kind: 'receipt', verdict: 'PASS' })), 'verdict.write');
  assert.equal(toolOf(L({ verdict: 'FLAG' })), 'verdict.write');
  assert.equal(toolOf(L({ kind: 'decision', verdict: 'FAIL' })), 'verdict.write');
  assert.equal(toolOf(L({ kind: 'decision', verdict: 'pause' })), 'pause.write');
  assert.equal(toolOf(L({ kind: 'decision', verdict: 'unpause' })), 'pause.write');
  assert.equal(toolOf(L({ kind: 'decision', verdict: 'approve' })), 'decision.approve');
  assert.equal(toolOf(L({ kind: 'decision', verdict: 'deny' })), 'decision.approve');
  assert.equal(toolOf(L({ kind: 'decision' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'note', verdict: 'approve' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'note', verdict: 'pause' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'task', to: 'reach' })), 'task.assign');
  assert.equal(toolOf(L({ kind: 'task', to: ' ' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'handoff', to: 'reach' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'task' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'post' })), 'post.draft');
  assert.equal(toolOf(L({ kind: 'listing' })), 'listing.draft');
  assert.equal(toolOf(L({ kind: 'lead' })), 'lead.log');
  assert.equal(toolOf(L({ kind: 'build' })), 'branch.write');
  assert.equal(toolOf(L({ kind: 'blocker' })), 'feed.write');
  assert.equal(toolOf(L({ kind: 'tweet' })), null);
  assert.equal(toolOf(L({ kind: 'constructor' })), null);
  assert.equal(toolOf(null), null);
  assert.equal(toolOf([]), null);
});
