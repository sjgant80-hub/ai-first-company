import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUNS, SPLIT_SEED, rng, datasetOk, rowsOf, splitOf, majorityOf, valuesOf, parseRules, gateRules, classify, keptLine, flipped, score, distil } from '../src/distill.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const IDS = ['v1', 'v2', 'v3'];
const DATA = { v1: read(RUNS.v1.dataset), v2: read(RUNS.v2.dataset), v3: read(RUNS.v3.dataset) };
const RUN = Object.fromEntries(IDS.map((id) => [id, JSON.parse(read(RUNS[id].file))]));
const SPLIT = Object.fromEntries(IDS.map((id) => [id, splitOf(rowsOf(DATA[id], RUNS[id]))]));
const FIELDS = ['splitSizes', 'trainMajority', 'rulesParsed', 'rulesKept', 'baselineAccuracy', 'grownAccuracy', 'improvement', 'decision', 'charge', 'receipt'];
const CARV = RUNS.v1.values;
const rule = (f, v, c) => ({ conds: [{ f, v }], c });

// ── D1 · the kernel IS the three sealed demos: every committed number and signed receipt re-derives exactly ──────────
for (const id of IDS) {
  test(`D1 · ${id} re-derives its committed run exactly from the recorded teacher reply`, () => {
    const d = distil(RUNS[id], SPLIT[id], RUN[id].teacherReply);
    assert.equal(d.ok, true);
    for (const k of FIELDS) assert.deepEqual(d[k], RUN[id][k], k);
    assert.equal(RUN[id].seal, RUNS[id].seal);
    assert.equal(RUN[id].dataset.sha256, RUNS[id].sha256);
    assert.equal(d.kept.length, RUN[id].rulesKept.length);
  });
}

test('D1 · the two car nulls are waived and share one receipt; the mushroom run beats the baseline and is due', () => {
  const [a, b, c] = IDS.map((id) => distil(RUNS[id], SPLIT[id], RUN[id].teacherReply));
  assert.equal(a.charge, 'waived'); assert.equal(b.charge, 'waived'); assert.equal(c.charge, 'due');
  assert.equal(a.receipt, b.receipt);
  assert.notEqual(a.receipt, c.receipt);
  assert.deepEqual([a.base, a.grown], [{ n: 432, hits: 304 }, { n: 432, hits: 304 }]);
  assert.deepEqual([c.base, c.grown], [{ n: 2031, hits: 1045 }, { n: 2031, hits: 1897 }]);
  assert.equal(c.decision, 'PROMOTE');
});

test('D1 · the RUNS table carries each sealed demo\'s parameters', () => {
  assert.equal(Object.isFrozen(RUNS), true);
  assert.deepEqual(IDS.map((id) => [RUNS[id].seal, RUNS[id].run]), [['364f29a', 'f1802f5'], ['3620ff0', 'a45dd93'], ['9ec04b0', '71b7d72']]);
  assert.deepEqual(IDS.map((id) => [RUNS[id].maxConds, RUNS[id].minFires, RUNS[id].minPrecision]), [[1, 15, 0.8], [3, 12, 0.8], [1, 15, 0.8]]);
  assert.equal(SPLIT_SEED, 20261103);
});

// ── D2 · the final exam never chooses a rule ──────────────────────────────────────────────────────────────────
test('D2 · changing EVERY final-split answer leaves the kept rules exactly the same (all three runs)', () => {
  for (const id of IDS) {
    const s = RUNS[id], sp = SPLIT[id], before = distil(s, sp, RUN[id].teacherReply);
    const exam = sp.final.map((r) => ({ ...r, class: flipped(r.class, s, before.trainMajority) }));
    const after = distil(s, { ...sp, final: exam }, RUN[id].teacherReply);
    assert.deepEqual(after.rulesKept, before.rulesKept, id);
    assert.notEqual(after.receipt, before.receipt, id);
  }
});

// ── the pinned data ───────────────────────────────────────────────────────────────────────────────────────────
test('datasetOk · the pinned bytes pass; anything else fails', () => {
  assert.equal(datasetOk(DATA.v1, RUNS.v1), true);
  assert.equal(datasetOk(DATA.v3, RUNS.v3), true);
  assert.equal(datasetOk(DATA.v3 + 'x', RUNS.v3), false);
  assert.equal(datasetOk(DATA.v1, RUNS.v3), false);
  assert.equal(datasetOk('x', null), false);
  assert.equal(datasetOk(5, RUNS.v3), false);
  assert.equal(datasetOk(DATA.v3, null), false);
});

test('rng · mulberry32: one seed, one sequence, always in [0, 1)', () => {
  const a = rng(SPLIT_SEED), b = rng(SPLIT_SEED), xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs, Array.from({ length: 1000 }, b));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, rng(7)));
});

test('rowsOf · the class column at classIndex, the features in order around it', () => {
  assert.deepEqual(rowsOf('vhigh,med,2,4,small,low,unacc\n', RUNS.v1), [{ class: 'unacc', buying: 'vhigh', maint: 'med', doors: '2', persons: '4', lug_boot: 'small', safety: 'low' }]);
  const m = rowsOf('p,x,s,n,t,p,f,c,n,k,e,e,s,s,w,w,p,w,o,p,k,s,u', RUNS.v3)[0];
  assert.equal(m.class, 'p'); assert.equal(m['cap-shape'], 'x'); assert.equal(m.odor, 'p'); assert.equal(m.habitat, 'u');
  assert.equal(Object.keys(m).length, 23);
  assert.deepEqual(rowsOf('a,b,c,d,e,f,g\r\nh,i,j,k,l,m,n\r\n', RUNS.v1).map((r) => [r.class, r.buying]), [['g', 'a'], ['n', 'h']]);
  assert.equal(rowsOf('\n\na,b,c,d,e,f,g\n\n', RUNS.v1).length, 1);
  assert.equal(rowsOf(DATA.v1, RUNS.v1).length, 1728);
  assert.equal(rowsOf(DATA.v3, RUNS.v3).length, 8124);
});

test('rowsOf · garbage gives no rows, never a throw', () => {
  for (const [t, s] of [[5, RUNS.v1], ['x', null], [null, null], ['a,b', { names: 'n' }], [[], RUNS.v1]]) assert.deepEqual(rowsOf(t, s), []);
});

test('splitOf · a seeded 50/25/25 partition, the same every time', () => {
  assert.deepEqual(SPLIT.v1.train.length + '/' + SPLIT.v1.gate.length + '/' + SPLIT.v1.final.length, '864/432/432');
  assert.deepEqual(SPLIT.v3.train.length + '/' + SPLIT.v3.gate.length + '/' + SPLIT.v3.final.length, '4062/2031/2031');
  const rows = rowsOf(DATA.v3, RUNS.v3), s = splitOf(rows), all = [...s.train, ...s.gate, ...s.final];
  assert.equal(new Set(all).size, rows.length);
  assert.ok(rows.every((r) => all.includes(r)));
  const again = splitOf(rowsOf(DATA.v3, RUNS.v3));
  assert.deepEqual(again.final.map((r) => r.odor + r.class), s.final.map((r) => r.odor + r.class));
  const four = splitOf([1, 2, 3, 4]);
  assert.deepEqual([four.train.length, four.gate.length, four.final.length], [2, 1, 1]);
  for (const g of [null, 'x', {}, 5]) assert.deepEqual(splitOf(g), { train: [], gate: [], final: [] });
});

test('majorityOf · the commonest class, the first seen on a tie, none for no rows', () => {
  assert.equal(majorityOf([{ class: 'a' }, { class: 'b' }, { class: 'b' }]), 'b');
  assert.equal(majorityOf([{ class: 'a' }, { class: 'b' }]), 'a');
  assert.equal(majorityOf(SPLIT.v1.train), 'unacc');
  assert.equal(majorityOf(SPLIT.v3.train), 'e');
  for (const g of [[], null, 'ab', [null], 5]) assert.equal(majorityOf(g), null);
});

test('valuesOf · the run\'s fixed values, or the sorted values the TRAIN split holds', () => {
  assert.equal(valuesOf(RUNS.v1, []), CARV);
  assert.deepEqual(valuesOf(RUNS.v3, [{ odor: 'n' }, { odor: 'a' }, { odor: 'n' }]).odor, ['a', 'n']);
  assert.ok(valuesOf(RUNS.v3, SPLIT.v3.train)['stalk-root'].includes('?'));
  assert.deepEqual(valuesOf(null, []), {});
  assert.deepEqual(valuesOf({ values: 5 }, []), {});
  assert.deepEqual(valuesOf({ values: 'train', names: ['x'] }, 'x'), {});
});

// ── reading the teacher ───────────────────────────────────────────────────────────────────────────────────────
test('parseRules · a rule per line, names / values / classes checked, prose skipped', () => {
  assert.deepEqual(parseRules('safety == low => unacc', RUNS.v1, CARV), [rule('safety', 'low', 'unacc')]);
  assert.deepEqual(parseRules('SAFETY == LOW => UNACC', RUNS.v1, CARV), [rule('safety', 'low', 'unacc')]);
  assert.deepEqual(parseRules('  lug_boot==big=>acc  ', RUNS.v1, CARV), [rule('lug_boot', 'big', 'acc')]);
  assert.deepEqual(parseRules('Here are the rules:\nsafety == low => unacc\n\nHope this helps.', RUNS.v1, CARV), [rule('safety', 'low', 'unacc')]);
  assert.deepEqual(parseRules('colour == low => unacc\nsafety == low => unacc', RUNS.v1, CARV), [rule('safety', 'low', 'unacc')]);
  assert.deepEqual(parseRules('safety == extreme => unacc\nsafety == low => unacc', RUNS.v1, CARV), [rule('safety', 'low', 'unacc')]);
  assert.deepEqual(parseRules('safety == low => maybe\nsafety == low => unacc', RUNS.v1, CARV), [rule('safety', 'low', 'unacc')]);
  assert.deepEqual(parseRules('buying == low, maint == high => acc', RUNS.v1, CARV), []);
});

test('parseRules · duplicates dropped; the same condition with another class kept', () => {
  assert.equal(parseRules('safety == low => unacc\nsafety == low => unacc\nSafety == Low => unacc', RUNS.v1, CARV).length, 1);
  assert.equal(parseRules('safety == low => unacc\nsafety == low => acc', RUNS.v1, CARV).length, 2);
});

test('parseRules · ANDed conditions up to the run\'s limit; one bad part refuses the whole rule', () => {
  const two = 'persons == 4 AND safety == high => acc', three = 'buying == low AND persons == 4 AND safety == high => vgood';
  const four = 'buying == low AND maint == low AND persons == 4 AND safety == high => vgood';
  assert.deepEqual(parseRules(two, RUNS.v2, CARV), [{ conds: [{ f: 'persons', v: '4' }, { f: 'safety', v: 'high' }], c: 'acc' }]);
  assert.equal(parseRules(three, RUNS.v2, CARV)[0].conds.length, 3);
  assert.deepEqual(parseRules(four, RUNS.v2, CARV), []);
  assert.deepEqual(parseRules(two, RUNS.v1, CARV), []);
  assert.deepEqual(parseRules('persons == 4 AND colour == red => acc\n' + two, RUNS.v2, CARV).length, 1);
  assert.deepEqual(parseRules('persons == 4 and safety == high => acc', RUNS.v2, CARV)[0].conds.length, 2);
});

test('parseRules · the mushroom spec reads hyphenated names and the ? value; garbage reads nothing', () => {
  const v = valuesOf(RUNS.v3, SPLIT.v3.train);
  assert.deepEqual(parseRules('stalk-root == ? => p\nspore-print-color == h => p', RUNS.v3, v), [rule('stalk-root', '?', 'p'), rule('spore-print-color', 'h', 'p')]);
  assert.deepEqual(parseRules('odor == n => edible', RUNS.v3, v), []);
  for (const [r, s, vals] of [[5, RUNS.v1, CARV], ['x', null, CARV], ['safety == low => unacc', RUNS.v1, null], ['safety == low => unacc', { ...RUNS.v1, feature: '[' }, CARV]]) assert.deepEqual(parseRules(r, s, vals), []);
});

// ── the gate ──────────────────────────────────────────────────────────────────────────────────────────────────
const SPEC = { ...RUNS.v1, minFires: 5, minPrecision: 0.8 };
const rows = (n, f, v, right, c, other) => Array.from({ length: n }, (_, i) => ({ [f]: v, class: i < right ? c : other }));
const GATE = [
  ...rows(5, 'safety', 'low', 4, 'unacc', 'acc'),      // A: fires 5, precision 0.80 — exactly at both bars: kept
  ...rows(4, 'safety', 'med', 4, 'unacc', 'acc'),      // B: fires 4 — one short: dropped
  ...rows(10, 'safety', 'high', 7, 'unacc', 'acc'),    // C: fires 10, precision 0.70 — fires enough, not right enough: dropped
  ...rows(6, 'persons', '2', 6, 'unacc', 'acc'),       // D: precision 1.00, fires 6
  ...rows(7, 'doors', '2', 7, 'unacc', 'acc'),         // F: precision 1.00, fires 7
  ...rows(30, 'maint', 'low', 27, 'unacc', 'acc'),     // G: precision 0.90, fires 30
];
const CANDIDATES = [rule('safety', 'low', 'unacc'), rule('safety', 'med', 'unacc'), rule('safety', 'high', 'unacc'), rule('persons', '2', 'unacc'), rule('doors', '2', 'unacc'), rule('maint', 'low', 'unacc'), rule('lug_boot', 'big', 'acc')];

test('gateRules · kept only at or above BOTH bars; best precision first, then most fires', () => {
  const kept = gateRules(CANDIDATES, GATE, SPEC);
  assert.deepEqual(kept.map((r) => [r.conds[0].f + '=' + r.conds[0].v, r.fires, r.precision]), [['doors=2', 7, 1], ['persons=2', 6, 1], ['maint=low', 30, 0.9], ['safety=low', 5, 0.8]]);
});

test('gateRules · a conjunction fires only where every condition matches', () => {
  const both = { conds: [{ f: 'buying', v: 'low' }, { f: 'maint', v: 'low' }], c: 'acc' };
  const gate = [...rows(6, 'buying', 'low', 6, 'acc', 'acc'), ...Array.from({ length: 6 }, () => ({ buying: 'low', maint: 'low', class: 'acc' }))];
  assert.deepEqual(gateRules([both], gate, SPEC).map((r) => r.fires), [6]);
});

test('gateRules · garbage keeps nothing, never a throw', () => {
  for (const [r, g, s] of [['x', GATE, SPEC], [[CANDIDATES[0]], GATE, null], [[{}], GATE, SPEC], [[CANDIDATES[0]], 'x', SPEC], [null, null, null]]) assert.deepEqual(gateRules(r, g, s), []);
});

test('classify · the first kept rule that fires, else the majority; no row or rule garbage throws', () => {
  const kept = [rule('doors', '2', 'unacc'), rule('safety', 'high', 'acc'), { conds: [{ f: 'buying', v: 'low' }, { f: 'maint', v: 'low' }], c: 'vgood' }];
  assert.equal(classify(kept, 'good', { doors: '2', safety: 'high' }), 'unacc');
  assert.equal(classify(kept, 'good', { safety: 'high' }), 'acc');
  assert.equal(classify(kept, 'good', { buying: 'low', maint: 'low' }), 'vgood');
  assert.equal(classify(kept, 'good', { buying: 'low', maint: 'high' }), 'good');
  assert.equal(classify(kept, 'good', {}), 'good');
  for (const [k, row] of [[null, {}], [[{}], {}], [kept, null], ['x', {}]]) assert.equal(classify(k, 'm', row), 'm');
});

test('keptLine · as each committed run file wrote it', () => {
  assert.equal(keptLine({ ...rule('gill-color', 'b', 'p'), fires: 426, precision: 1 }, RUNS.v3), 'gill-color==b=>p (p=1.00,fires=426)');
  assert.equal(keptLine({ conds: [{ f: 'persons', v: '4' }, { f: 'safety', v: 'high' }], c: 'acc', fires: 20, precision: 0.85 }, RUNS.v2), 'persons==4 AND safety==high => acc (p=0.85,fires=20)');
  assert.equal(keptLine(null, RUNS.v3), '');
  assert.equal(keptLine({ conds: [] }, null), '');
});

test('flipped · the majority becomes the first other class; any other class becomes the majority', () => {
  assert.equal(flipped('e', RUNS.v3, 'e'), 'p');
  assert.equal(flipped('p', RUNS.v3, 'e'), 'e');
  assert.equal(flipped('unacc', RUNS.v1, 'unacc'), 'acc');
  assert.equal(flipped('good', RUNS.v1, 'unacc'), 'unacc');
  assert.equal(flipped('acc', RUNS.v1, 'acc'), 'unacc');
  assert.equal(flipped('e', null, 'e'), 'e');
  assert.equal(flipped('x', null, 'e'), 'e');
});

// ── scoring and signing ───────────────────────────────────────────────────────────────────────────────────────
test('score · refused with a reason when it cannot judge', () => {
  assert.deepEqual(score(null, [], [], 'e'), { ok: false, why: 'a run spec and a final split' });
  assert.deepEqual(score(RUNS.v3, 'x', [], 'e'), { ok: false, why: 'a run spec and a final split' });
  assert.deepEqual(score(RUNS.v3, [], [], 'e'), { ok: false, why: 'the agreement: the sealed test: minSample is an integer >= 2 per arm' });
  let msg = ''; try { null.class; } catch (e) { msg = e.message; }       // the engine's own wording, not a guess at it
  assert.deepEqual(score(RUNS.v3, [null, null], [], 'e'), { ok: false, why: 'refused: ' + msg });
});

test('score · changing any one exam answer changes the signed receipt (spot-checked across the mushroom exam)', () => {
  const d = distil(RUNS.v3, SPLIT.v3, RUN.v3.teacherReply);
  for (let i = 0; i < SPLIT.v3.final.length; i += 97) {
    const exam = SPLIT.v3.final.slice();
    exam[i] = { ...exam[i], class: flipped(exam[i].class, RUNS.v3, d.trainMajority) };
    const s = score(RUNS.v3, exam, d.kept, d.trainMajority);
    assert.equal(s.ok, true);
    assert.notEqual(s.receipt, d.receipt, 'row ' + i);
    assert.equal(Math.abs(s.base.hits - d.base.hits), 1);
  }
});

// ── whole runs ────────────────────────────────────────────────────────────────────────────────────────────────
test('distil · refuses what is not a run, each with its reason', () => {
  for (const s of [null, 's', [], 5]) assert.deepEqual(distil(s, SPLIT.v3, ''), { ok: false, why: 'a run spec is an object' });
  for (const s of [{ ...RUNS.v3, names: 'x' }, { ...RUNS.v3, classes: 5 }]) assert.deepEqual(distil(s, SPLIT.v3, ''), { ok: false, why: 'a run spec names its features and classes' });
  for (const sp of [null, [], { ...SPLIT.v3, train: 'x' }, { ...SPLIT.v3, gate: 'x' }, { ...SPLIT.v3, final: 'x' }]) assert.deepEqual(distil(RUNS.v3, sp, ''), { ok: false, why: 'a split holds train, gate and final rows' });
});

test('distil · a reply with no usable rule grows nothing: the baseline itself, charge waived', () => {
  const d = distil(RUNS.v3, SPLIT.v3, 'I cannot help with that.');
  assert.equal(d.ok, true);
  assert.deepEqual([d.rulesParsed, d.rulesKept, d.improvement, d.charge], [0, [], 0, 'waived']);
});

test('totality · no function throws on garbage', () => {
  const G = [undefined, null, 0, -1, NaN, Infinity, '', 'x', '\u0000=>', [], [null], [{}], {}, { conds: null }, { names: [], classes: [] }, true, () => 1, new Date(0)];
  const fns = [rng, datasetOk, rowsOf, splitOf, majorityOf, valuesOf, parseRules, gateRules, classify, keptLine, flipped];
  for (const f of fns) for (const a of G) for (const b of G) assert.doesNotThrow(() => f(a, b, a));
  for (const a of G) for (const b of G) { assert.doesNotThrow(() => score(a, b, a, b)); assert.doesNotThrow(() => distil(a, b, a)); }
  for (const a of G) assert.doesNotThrow(() => rng(a)());
});
