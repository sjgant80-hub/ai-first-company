import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTest, verdict, promote, receiptOf, PROMOTE, DROP, INSUFFICIENT } from '../src/experiment.mjs';

const rateTest = (o = {}) => ({ id: 't1', channel: 'youtube', technique: 'number-led title', metric: 'ctr', kind: 'rate', baseline: 0.10, direction: 'higher', minImprovement: 0.03, minSample: 1000, alpha: 0.05, zCrit: 1.96, ...o });
const meanTest = (o = {}) => ({ id: 'm1', channel: 'youtube', technique: 'cold open', metric: 'avg view seconds', kind: 'mean', baseline: 30, direction: 'higher', minImprovement: 5, minSample: 10, alpha: 0.05, zCrit: 1.96, ...o });
const seq = (n, v, j = 0) => Array.from({ length: n }, (_, i) => v + (i % 2 ? j : -j));

test('a sealed test must be whole: each missing or malformed field is refused, a minimal one accepted', () => {
  assert.equal(normalizeTest(rateTest()).ok, true);
  assert.equal(normalizeTest(rateTest({ minSample: 2 })).ok, true);  // boundary: 2 per arm is allowed
  for (const bad of [
    {}, null, [], 'x',
    rateTest({ id: '' }), rateTest({ channel: 5 }), rateTest({ technique: '' }), rateTest({ metric: null }),
    rateTest({ kind: 'ratio' }), rateTest({ baseline: 'x' }), rateTest({ baseline: 1.4 }),
    rateTest({ direction: 'up' }), rateTest({ minImprovement: 0 }), rateTest({ minImprovement: -0.1 }),
    rateTest({ minSample: 1 }), rateTest({ minSample: 10.5 }), rateTest({ alpha: 0 }), rateTest({ alpha: 1 }),
    rateTest({ zCrit: 0 }), rateTest({ zCrit: -1 }), rateTest({ zCrit: 'x' }),
  ]) assert.equal(normalizeTest(bad).ok, false, JSON.stringify(bad));
});

test('arm boundaries: n>=1 and 0<=hits<=n exactly, else refused', () => {
  assert.notEqual(verdict(rateTest({ minSample: 2 }), { testId: 't1', control: { n: 1, hits: 0 }, variant: { n: 1, hits: 1 } }).ok, false); // n=1, hits=0 and hits==n are valid
  assert.equal(verdict(rateTest(), { testId: 't1', control: { n: 0, hits: 0 }, variant: { n: 10, hits: 2 } }).ok, false);  // n=0 refused
  assert.equal(verdict(rateTest(), { testId: 't1', control: { n: 10, hits: 11 }, variant: { n: 10, hits: 2 } }).ok, false); // hits>n refused
  assert.equal(verdict(rateTest(), { testId: 'other', control: { n: 10, hits: 1 }, variant: { n: 10, hits: 2 } }).ok, false); // testId mismatch
});

test('E2 · the sample gate: below minSample is INSUFFICIENT however large the lift', () => {
  assert.equal(verdict(rateTest(), { testId: 't1', control: { n: 200, hits: 20 }, variant: { n: 200, hits: 80 } }).decision, INSUFFICIENT);
});

test('E2 boundary: exactly minSample per arm is concluded; one short is not', () => {
  const sig = (n) => ({ testId: 't1', control: { n, hits: Math.round(n * 0.10) }, variant: { n, hits: Math.round(n * 0.16) } });
  assert.equal(verdict(rateTest(), sig(1000)).decision, PROMOTE);
  assert.equal(verdict(rateTest(), sig(999)).decision, INSUFFICIENT);
});

test('E3 · the margin gate: a significant lift below the sealed margin is DROP', () => {
  const r = verdict(rateTest({ minImprovement: 0.05 }), { testId: 't1', control: { n: 20000, hits: 2000 }, variant: { n: 20000, hits: 2900 } });
  assert.equal(r.decision, DROP);   // lift 0.045 < 0.05, highly significant
});

test('E3 boundary: lift exactly the margin promotes; a hair under drops (>= not >)', () => {
  const at = verdict(rateTest({ minImprovement: 0.05 }), { testId: 't1', control: { n: 10000, hits: 1000 }, variant: { n: 10000, hits: 1500 } });
  const under = verdict(rateTest({ minImprovement: 0.05 }), { testId: 't1', control: { n: 10000, hits: 1000 }, variant: { n: 10000, hits: 1499 } });
  assert.equal(at.decision, PROMOTE);
  assert.equal(under.decision, DROP);
});

test('E4 · the significance gate: a big lift whose stat does not reach zCrit is DROP', () => {
  const r = verdict(rateTest({ minSample: 50 }), { testId: 't1', control: { n: 60, hits: 6 }, variant: { n: 60, hits: 11 } });
  assert.equal(r.decision, DROP);
  assert.ok(r.stat < 1.96, 'stat=' + r.stat);
});

test('E4 boundary: stat exactly zCrit promotes; zCrit a hair higher drops (>= not >)', () => {
  const arms = { testId: 't1', control: { n: 60, hits: 6 }, variant: { n: 60, hits: 11 } };
  const z = verdict(rateTest({ minSample: 50 }), arms).stat;            // ~1.308933, lift 0.0833 >= margin
  assert.equal(verdict(rateTest({ minSample: 50, zCrit: z }), arms).decision, PROMOTE);          // stat == zCrit
  assert.equal(verdict(rateTest({ minSample: 50, zCrit: z + 1e-6 }), arms).decision, DROP);      // stat < zCrit
});

test('E5 · direction: a move against the sealed direction is DROP; "lower" is better when the metric should fall', () => {
  const worse = verdict(rateTest(), { testId: 't1', control: { n: 5000, hits: 750 }, variant: { n: 5000, hits: 500 } });
  assert.equal(worse.decision, DROP);
  assert.ok(worse.improvement < 0 && worse.stat < 0);
  const lower = verdict(rateTest({ id: 't2', direction: 'lower', metric: 'unsub' }), { testId: 't2', control: { n: 5000, hits: 750 }, variant: { n: 5000, hits: 500 } });
  assert.equal(lower.decision, PROMOTE);
});

test('E6 · PROMOTE only when sample AND margin AND stat>=zCrit all hold (a clear win)', () => {
  const r = verdict(rateTest(), { testId: 't1', control: { n: 5000, hits: 500 }, variant: { n: 5000, hits: 750 } });
  assert.equal(r.decision, PROMOTE);
  assert.ok(r.improvement >= 0.03 && r.stat >= 1.96);
});

test('mean (Welch): a tight significant lift promotes; the same lift with huge spread does not', () => {
  const tight = verdict(meanTest(), { testId: 'm1', control: { values: seq(50, 30, 1) }, variant: { values: seq(50, 42, 1) } });
  assert.equal(tight.decision, PROMOTE);
  const noisy = verdict(meanTest(), { testId: 'm1', control: { values: seq(8, 30, 40) }, variant: { values: seq(8, 42, 40) } });
  assert.notEqual(noisy.decision, PROMOTE);
});

test('pins the standardized effect so se / variance mutants die (rate z and Welch t)', () => {
  const win = verdict(rateTest(), { testId: 't1', control: { n: 5000, hits: 500 }, variant: { n: 5000, hits: 750 } });
  assert.ok(Math.abs(win.stat - 7.559289) < 1e-4, 'rate z=' + win.stat);
  const small = verdict(rateTest({ minSample: 50 }), { testId: 't1', control: { n: 60, hits: 6 }, variant: { n: 60, hits: 11 } });
  assert.ok(Math.abs(small.stat - 1.308933) < 1e-4, 'z=' + small.stat);
  const tight = verdict(meanTest(), { testId: 'm1', control: { values: seq(50, 30, 1) }, variant: { values: seq(50, 42, 1) } });
  assert.ok(Math.abs(tight.stat - 59.39697) < 1e-3, 't=' + tight.stat);
  const C = [28, 30, 32, 30, 29, 31, 30, 31], V = [30, 33, 31, 34, 30, 33, 31, 33];
  const mid = verdict(meanTest({ minImprovement: 3, minSample: 4 }), { testId: 'm1', control: { values: C }, variant: { values: V } });
  assert.ok(Math.abs(mid.stat - 2.485997) < 1e-4, 't=' + mid.stat);
});

test('E7 · promote() adds a versioned skill ONLY on PROMOTE, with the test id, data and a receipt', () => {
  const t = rateTest(), win = { testId: 't1', control: { n: 5000, hits: 500 }, variant: { n: 5000, hits: 750 } };
  const pb1 = promote({ skills: [], log: [] }, t, win);
  assert.equal(pb1.skills.length, 1);
  assert.equal(pb1.skills[0].testId, 't1');
  assert.equal(pb1.skills[0].version, 1);
  assert.equal(pb1.skills[0].receipt, receiptOf(t, win, verdict(t, win)));
  assert.equal(pb1.log.length, 0);
  const pb2 = promote(pb1, t, win);
  assert.equal(pb2.skills.length, 2);
  assert.equal(pb2.skills[1].version, 2);
});

test('E7 · a DROP leaves the skills untouched and is kept on the log; a malformed result never becomes a skill', () => {
  const t = rateTest(), lose = { testId: 't1', control: { n: 5000, hits: 750 }, variant: { n: 5000, hits: 500 } };
  const pb = promote({ skills: [], log: [] }, t, lose);
  assert.equal(pb.skills.length, 0);
  assert.equal(pb.log[0].decision, DROP);
  assert.ok(pb.log[0].receipt);
  assert.equal(promote({ skills: [], log: [] }, t, { testId: 'nope' }).log[0].decision, 'REFUSED');
});

test('E9 · the Analyst judges from the data, not the proposer', () => {
  const t = rateTest(), base = { testId: 't1', control: { n: 5000, hits: 500 }, variant: { n: 5000, hits: 750 } };
  const a = verdict(t, { ...base, proposer: 'reach' }), b = verdict(t, { ...base, proposer: 'simon' }), c = verdict(t, base);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.equal(receiptOf(t, { ...base, proposer: 'reach' }, a), receiptOf(t, { ...base, proposer: 'simon' }, b));
});

test('guard battery · each field refused with its own reason, boundaries accepted (kills && / || and range mutants)', () => {
  const eq = (spec, why) => assert.deepEqual(normalizeTest(spec), { ok: false, why }, JSON.stringify(spec));
  // the object guard: null / array / primitive all give the same one reason (not a thrown catch)
  eq(null, 'a test is an object'); eq([], 'a test is an object'); eq('x', 'a test is an object'); eq(7, 'a test is an object');
  // each field its own reason
  eq(rateTest({ id: '' }), 'id'); eq(rateTest({ channel: 5 }), 'channel'); eq(rateTest({ technique: null }), 'technique'); eq(rateTest({ metric: '' }), 'metric');
  eq(rateTest({ kind: 'ratio' }), "kind is 'rate' or 'mean'");
  eq(rateTest({ baseline: 'x' }), 'baseline is a number'); eq(rateTest({ baseline: NaN }), 'baseline is a number'); eq(rateTest({ baseline: Infinity }), 'baseline is a number');
  eq(rateTest({ baseline: -0.0001 }), 'a rate baseline is 0..1'); eq(rateTest({ baseline: 1.0001 }), 'a rate baseline is 0..1');
  eq(rateTest({ direction: 'up' }), "direction is 'higher' or 'lower'");
  eq(rateTest({ minImprovement: 0 }), 'minImprovement is a positive number'); eq(rateTest({ minImprovement: Infinity }), 'minImprovement is a positive number'); eq(rateTest({ minImprovement: -1 }), 'minImprovement is a positive number');
  eq(rateTest({ minSample: 1 }), 'minSample is an integer >= 2 per arm'); eq(rateTest({ minSample: 2.5 }), 'minSample is an integer >= 2 per arm');
  eq(rateTest({ alpha: 0 }), 'alpha is between 0 and 1'); eq(rateTest({ alpha: 1 }), 'alpha is between 0 and 1'); eq(rateTest({ alpha: NaN }), 'alpha is between 0 and 1');
  eq(rateTest({ zCrit: 0 }), 'zCrit is the positive critical value the organ sealed'); eq(rateTest({ zCrit: NaN }), 'zCrit is the positive critical value the organ sealed');
  // boundaries accepted: a rate baseline of exactly 0 and 1, minSample exactly 2
  assert.equal(normalizeTest(rateTest({ baseline: 0 })).ok, true);
  assert.equal(normalizeTest(rateTest({ baseline: 1 })).ok, true);
  assert.equal(normalizeTest(rateTest({ minSample: 2 })).ok, true);
  // a mean baseline outside 0..1 is fine (only rates are bounded)
  assert.equal(normalizeTest(meanTest({ baseline: 42 })).ok, true);
});

test('result + arm guards · exact reasons, including the thrown-and-caught path', () => {
  const t = rateTest();
  assert.deepEqual(verdict(t, null), { ok: false, why: 'a result is an object' });
  assert.deepEqual(verdict(t, []), { ok: false, why: 'a result is an object' });
  assert.deepEqual(verdict(t, 'x'), { ok: false, why: 'a result is an object' });
  assert.deepEqual(verdict(t, { testId: 'nope', control: { n: 10, hits: 1 }, variant: { n: 10, hits: 2 } }), { ok: false, why: 'result.testId does not name this test' });
  assert.deepEqual(verdict(t, { testId: 't1', control: { n: 0, hits: 0 }, variant: { n: 10, hits: 2 } }), { ok: false, why: 'each arm is { n >= 1, 0 <= hits <= n }' });
  assert.deepEqual(verdict(t, { testId: 't1', control: { n: 10, hits: 11 }, variant: { n: 10, hits: 2 } }), { ok: false, why: 'each arm is { n >= 1, 0 <= hits <= n }' });
  assert.deepEqual(verdict(meanTest(), { testId: 'm1', control: { values: [] }, variant: { values: [1, 2] } }), { ok: false, why: 'each arm is { values: [numbers] }' });
  assert.deepEqual(verdict(meanTest(), { testId: 'm1', control: { values: ['x', 2] }, variant: { values: [1, 2] } }), { ok: false, why: 'each arm is { values: [numbers] }' });
  assert.equal(receiptOf(t, null, { decision: DROP }).length, 64);   // receiptOf is total on a null result
});

test('se==0 and n<2 give stat 0 (kills se>0 and n<2 mutants); the n==2 variance path is exercised', () => {
  const zeroRate = verdict(rateTest({ minSample: 50 }), { testId: 't1', control: { n: 100, hits: 0 }, variant: { n: 100, hits: 0 } });
  assert.equal(zeroRate.stat, 0); assert.equal(zeroRate.decision, DROP);
  const zeroMean = verdict(meanTest({ minImprovement: 1, minSample: 2 }), { testId: 'm1', control: { values: [5, 5, 5, 5] }, variant: { values: [7, 7, 7, 7] } });
  assert.equal(zeroMean.stat, 0); assert.equal(zeroMean.decision, DROP);
  const oneArm = verdict(meanTest({ minSample: 2 }), { testId: 'm1', control: { values: [10] }, variant: { values: [20, 20] } });
  assert.equal(oneArm.stat, 0);     // nC < 2 → no variance → stat 0
  const twoArm = verdict(meanTest({ minImprovement: 1, minSample: 2 }), { testId: 'm1', control: { values: [9, 11] }, variant: { values: [19, 21] } });
  assert.ok(Math.abs(twoArm.stat - 7.071068) < 1e-4, 't(n=2)=' + twoArm.stat);  // n==2 computes variance (n-1=1)
});

test('the DROP reason distinguishes margin from significance at the margin boundary (kills the why mutant)', () => {
  // improvement exactly the margin, but stat below zCrit → DROP for lack of significance, not lack of lift
  const r = verdict(rateTest({ minSample: 50 }), { testId: 't1', control: { n: 100, hits: 10 }, variant: { n: 100, hits: 13 } });
  assert.equal(r.decision, DROP);
  assert.equal(r.improvement, 0.03);
  assert.match(r.why, /does not reach the sealed critical value/);
});

test('promote is total on a malformed playbook (starts fresh, still records the skill)', () => {
  const t = rateTest(), win = { testId: 't1', control: { n: 5000, hits: 500 }, variant: { n: 5000, hits: 750 } };
  for (const junkPb of [null, undefined, 'x', 42, [], { skills: 'x' }, { log: [] }, {}]) {
    const pb = promote(junkPb, t, win);
    assert.equal(pb.skills.length, 1);
    assert.deepEqual(pb.log, []);
  }
});

test('the sample gate fires when EITHER arm is short, not only when both are (kills || → &&)', () => {
  assert.equal(verdict(rateTest(), { testId: 't1', control: { n: 2000, hits: 200 }, variant: { n: 50, hits: 8 } }).decision, INSUFFICIENT);
  assert.equal(verdict(rateTest(), { testId: 't1', control: { n: 50, hits: 5 }, variant: { n: 2000, hits: 320 } }).decision, INSUFFICIENT);
});

test('version counts prior skills of the SAME technique AND channel (kills && → ||)', () => {
  const win = { control: { n: 5000, hits: 500 }, variant: { n: 5000, hits: 750 } };
  const tX = rateTest({ id: 'tx', technique: 'bold hook', channel: 'x' });
  const tY = rateTest({ id: 'ty', technique: 'bold hook', channel: 'youtube' });  // same technique, different channel
  let pb = promote({ skills: [], log: [] }, tX, { testId: 'tx', ...win });
  pb = promote(pb, tY, { testId: 'ty', ...win });
  assert.equal(pb.skills.find((s) => s.channel === 'youtube').version, 1);  // no prior for this technique on THIS channel → 1 (|| would say 2)
});

test('both thresholds at their boundary at once → PROMOTE (kills each >= on the decision line)', () => {
  const arms = { testId: 't1', control: { n: 60, hits: 6 }, variant: { n: 60, hits: 11 } };
  const probe = verdict(rateTest({ minSample: 50 }), arms);                 // improvement 0.083333, stat 1.308933
  const t = rateTest({ minSample: 50, minImprovement: probe.improvement, zCrit: probe.stat });
  assert.equal(verdict(t, arms).decision, PROMOTE);                                                  // improvement==margin AND stat==zCrit
  assert.equal(verdict({ ...t, minImprovement: probe.improvement + 1e-6 }, arms).decision, DROP);    // just above the margin
  assert.equal(verdict({ ...t, zCrit: probe.stat + 1e-6 }, arms).decision, DROP);                    // just above zCrit
});

test('E8 · deterministic and total on garbage', () => {
  const t = meanTest(), r = { testId: 'm1', control: { values: seq(40, 30, 2) }, variant: { values: seq(40, 41, 2) } };
  assert.deepEqual(verdict(t, r), verdict(t, r));
  const junk = [null, undefined, 0, 7, true, '', 'x', [], {}, NaN, Infinity,
    { testId: 't1' }, { testId: 't1', control: { n: NaN, hits: 1 }, variant: { n: 10, hits: 2 } },
    { testId: 't1', control: { n: 10, hits: -1 }, variant: { n: 10, hits: 2 } },
    { testId: 't1', control: { n: 1e9, hits: 1e10 }, variant: { n: 10, hits: 2 } }];
  const tests = [rateTest(), meanTest(), null, {}, rateTest({ zCrit: 0 })];
  let throws = 0, handled = 0;
  for (const tt of tests) for (const r2 of junk) { try { const v = verdict(tt, r2); if (v && (v.ok === false || typeof v.decision === 'string')) handled++; } catch { throws++; } }
  assert.equal(throws, 0);
  assert.equal(handled, tests.length * junk.length);
  for (const b of [null, undefined, 0, 'x', [], NaN, { kind: 'rate' }]) assert.equal(normalizeTest(b).ok, false);
});
