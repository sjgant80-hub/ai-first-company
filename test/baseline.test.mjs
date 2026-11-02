import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement, signable, outcome, MONEY_BACK } from '../src/baseline.mjs';
import { verdict, receiptOf } from '../src/experiment.mjs';

const intake = (o = {}) => ({ job: 'invoice triage', data: '6 months of invoices', currentTool: 'a VA + a spreadsheet', client: 'Acme', supplier: 'AI-Native Solutions', metric: 'auto-sorted rate', kind: 'rate', baseline: 0.60, direction: 'higher', ...o });
const design = (o = {}) => ({ minImprovement: 0.10, minSample: 500, zCrit: 1.96, price: 'set-by-simon', ...o });
const AGR = () => agreement(intake(), design()).agreement;
const win = (id) => ({ testId: id, control: { n: 1000, hits: 600 }, variant: { n: 1000, hits: 760 } });   // +0.16, significant
const lose = (id) => ({ testId: id, control: { n: 1000, hits: 600 }, variant: { n: 1000, hits: 620 } });  // +0.02 < 0.10
const short = (id) => ({ testId: id, control: { n: 100, hits: 60 }, variant: { n: 100, hits: 90 } });      // under 500 per arm

test('B1 · a complete intake+design builds a valid sealed agreement; signable carries no delivery', () => {
  const a = agreement(intake(), design());
  assert.equal(a.ok, true);
  assert.equal(a.agreement.test.id, 'mint:invoice triage');
  assert.equal(a.agreement.test.channel, 'client:Acme');
  assert.equal(a.agreement.moneyBack, MONEY_BACK);
  const s = signable(a.agreement);
  assert.match(s, /invoice triage/);
  assert.doesNotMatch(s, /control|variant|hits/);   // the signed bytes commit to the baseline, never a result
});

test('B1 · malformed intake/design each refused with a reason', () => {
  assert.deepEqual(agreement(null, design()), { ok: false, why: 'an intake is an object' });
  assert.deepEqual(agreement(intake(), null), { ok: false, why: 'a design is an object' });
  assert.deepEqual(agreement(intake({ job: '' }), design()), { ok: false, why: 'intake.job' });
  assert.deepEqual(agreement(intake({ client: 5 }), design()), { ok: false, why: 'intake.client' });
  assert.deepEqual(agreement(intake({ supplier: null }), design()), { ok: false, why: 'intake.supplier' });
  // the test fields fall through to normalizeTest, prefixed
  assert.equal(agreement(intake({ metric: '' }), design()).why, 'the sealed test: metric');
  assert.equal(agreement(intake({ kind: 'ratio' }), design()).why, "the sealed test: kind is 'rate' or 'mean'");
  assert.equal(agreement(intake({ baseline: 1.4 }), design()).why, 'the sealed test: a rate baseline is 0..1');
  assert.equal(agreement(intake({ direction: 'up' }), design()).why, "the sealed test: direction is 'higher' or 'lower'");
  assert.equal(agreement(intake(), design({ minImprovement: 0 })).why, 'the sealed test: minImprovement is a positive number');
  assert.equal(agreement(intake(), design({ minSample: 1 })).why, 'the sealed test: minSample is an integer >= 2 per arm');
  assert.equal(agreement(intake(), design({ zCrit: 0 })).why, 'the sealed test: zCrit is the positive critical value the organ sealed');
});

test('B1 · defaults: alpha falls to 0.05, price and data/currentTool default to null when omitted', () => {
  const a = agreement(intake({ data: undefined, currentTool: undefined }), { minImprovement: 0.1, minSample: 500, zCrit: 1.96 });
  assert.equal(a.agreement.test.alpha, 0.05);          // alpha omitted → 0.05
  assert.equal(a.agreement.price, null);               // price omitted → null
  assert.equal(a.agreement.data, null);
  assert.equal(a.agreement.currentTool, null);
  assert.equal(agreement(intake(), design({ alpha: 0.01 })).agreement.test.alpha, 0.01);  // alpha given → kept
});

test('B2 · the goalpost cannot move: the delivery is judged against the agreement test only', () => {
  const a = AGR(), id = a.test.id;
  const clean = outcome(a, win(id));
  // inject a different metric/baseline/target into the delivery → the outcome is unchanged
  const injected = outcome(a, { ...win(id), metric: 'something easier', baseline: 0.0, minImprovement: 0, zCrit: 0.1 });
  assert.equal(injected.charge, clean.charge);
  assert.equal(injected.beatsBaseline, clean.beatsBaseline);
  assert.equal(injected.receipt, clean.receipt);
  // the same arms under a laxer agreement (lower bar) can decide differently — the agreement's test is what rules
  const strictLose = outcome(agreement(intake(), design({ minImprovement: 0.5 })).agreement, lose('mint:invoice triage'));
  assert.equal(strictLose.charge, 'waived');
});

test('B3 · money-back is exact: due only when the delivery beats the signed baseline', () => {
  const a = AGR(), id = a.test.id;
  const w = outcome(a, win(id));
  assert.equal(w.beatsBaseline, true); assert.equal(w.decision, 'PROMOTE'); assert.equal(w.charge, 'due');
  const l = outcome(a, lose(id));
  assert.equal(l.beatsBaseline, false); assert.equal(l.decision, 'DROP'); assert.equal(l.charge, 'waived');
  const s = outcome(a, short(id));
  assert.equal(s.decision, 'INSUFFICIENT'); assert.equal(s.charge, 'waived');   // can't conclude → no charge
});

test('B4 · the outcome receipt re-derives from (agreement test, delivery, verdict)', () => {
  const a = AGR(), id = a.test.id, d = win(id);
  const o = outcome(a, d);
  assert.equal(o.receipt, receiptOf(a.test, d, verdict(a.test, d)));
});

test('B6 · price never touches the decision', () => {
  const id = 'mint:invoice triage', d = win(id);
  const ref = outcome(AGR(), d);
  for (const price of [null, 0, 2500, '£5k', { amount: 9 }, undefined]) {
    const a = agreement(intake(), design({ price })).agreement;
    const o = outcome(a, d);
    assert.equal(o.charge, ref.charge);
    assert.equal(o.beatsBaseline, ref.beatsBaseline);
    assert.equal(o.receipt, ref.receipt);              // the receipt is price-free
  }
});

test('B5 · total on garbage: agreement, signable and outcome never throw', () => {
  const junk = [null, undefined, 0, 7, true, '', 'x', [], {}, NaN, Infinity, intake(), { test: {} }, AGR()];
  let throws = 0, handled = 0, calls = 0;
  for (const a of junk) for (const b of junk) {
    calls += 3;
    try { const g = agreement(a, b); if (g && 'ok' in g) handled++; } catch { throws++; }
    try { const s = signable(a); if (typeof s === 'string') handled++; } catch { throws++; }
    try { const o = outcome(a, b); if (o && 'ok' in o) handled++; } catch { throws++; }
  }
  assert.equal(throws, 0);
  assert.equal(handled, calls);
  // signable of a non-agreement is the empty string; outcome of a non-agreement is refused
  assert.equal(signable(42), '');
  assert.deepEqual(outcome(null, win('x')), { ok: false, why: 'an agreement with a sealed test' });
  assert.deepEqual(outcome({ test: null }, win('x')), { ok: false, why: 'an agreement with a sealed test' });
  assert.equal(outcome(AGR(), { testId: 'wrong' }).ok, false);   // a delivery that names another test is refused
});

test('deterministic: the same agreement + delivery give the same outcome', () => {
  const a = AGR(), d = win(a.test.id);
  assert.deepEqual(outcome(a, d), outcome(a, d));
});
