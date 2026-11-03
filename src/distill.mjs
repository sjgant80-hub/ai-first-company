// src/distill.mjs — teacher distillation, everything AFTER the teacher speaks: read its rules, split the data, keep only
// the rules that hold up on the GATE split, score the grown rule-set on the FINAL split it never saw, and have the
// baseline agreement (src/baseline.mjs) sign the outcome. Extracted from the three sealed demo tools (tools/mint-demo.mjs,
// -v2, -v3) into one pure kernel, so the same logic runs in Node, in CI and in a visitor's browser; RUNS holds each
// sealed demo's parameters, and test/distill.test.mjs proves the kernel reproduces every committed run exactly.
// Pure, total, deterministic: garbage in gives an empty or refused result, never a throw. No model is called here.
import { agreement, outcome } from './baseline.mjs';
import { hashOf } from './journal.mjs';

const CAR = {
  names: ['buying', 'maint', 'doors', 'persons', 'lug_boot', 'safety'], classIndex: 6, classes: ['unacc', 'acc', 'good', 'vgood'],
  values: { buying: ['vhigh', 'high', 'med', 'low'], maint: ['vhigh', 'high', 'med', 'low'], doors: ['2', '3', '4', '5more'], persons: ['2', '4', 'more'], lug_boot: ['small', 'med', 'big'], safety: ['low', 'med', 'high'] },
  feature: '[a-z_]+', value: '[a-z0-9]+', dataset: 'data/mint-demo-car.data', sha256: 'b703a9ac69f11e64ce8c223c0a40de4d2e9d769f7fb20be5f8f2e8a619893d83',
  job: 'car acceptability', data: 'UCI Car Evaluation (public)',
};
const MUSHROOM = {
  names: ['cap-shape', 'cap-surface', 'cap-color', 'bruises', 'odor', 'gill-attachment', 'gill-spacing', 'gill-size', 'gill-color', 'stalk-shape', 'stalk-root', 'stalk-surface-above-ring', 'stalk-surface-below-ring', 'stalk-color-above-ring', 'stalk-color-below-ring', 'veil-type', 'veil-color', 'ring-number', 'ring-type', 'spore-print-color', 'population', 'habitat'],
  classIndex: 0, classes: ['e', 'p'], values: 'train',
  feature: '[a-z0-9-]+', value: '[a-z0-9?]+', dataset: 'data/mint-demo-mushroom.data', sha256: 'e65d082030501a3ebcbcd7c9f7c71aa9d28fdfff463bf4cf4716a3fe13ac360e',
  job: 'mushroom edibility', data: 'UCI Mushroom (public)',
};
// each sealed demo: its seal and run commits, its dataset, how many ANDed conditions a rule may carry, the gate's bar,
// and how its committed run file wrote a kept rule (v2 spaced its arrow)
export const RUNS = Object.freeze({
  v1: Object.freeze({ id: 'v1', seal: '364f29a', run: 'f1802f5', file: 'data/mint-demo-run.json', ...CAR, maxConds: 1, minFires: 15, minPrecision: 0.80, arrow: '=>' }),
  v2: Object.freeze({ id: 'v2', seal: '3620ff0', run: 'a45dd93', file: 'data/mint-demo-v2-run.json', ...CAR, maxConds: 3, minFires: 12, minPrecision: 0.80, arrow: ' => ' }),
  v3: Object.freeze({ id: 'v3', seal: '9ec04b0', run: '71b7d72', file: 'data/mint-demo-v3-run.json', ...MUSHROOM, maxConds: 1, minFires: 15, minPrecision: 0.80, arrow: '=>' }),
});
export const SPLIT_SEED = 20261103;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const round6 = (x) => Math.round(x * 1e6) / 1e6;

/** mulberry32, exactly as the demo tools seeded it */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** true when the text is the pinned dataset, byte for byte */
export const datasetOk = (text, spec) => typeof text === 'string' && isObj(spec) && hashOf(text) === spec.sha256;

/** the dataset's rows: { class, [feature]: value }; the class column sits at spec.classIndex, features fill the rest in order */
export function rowsOf(text, spec) {
  try {
    return text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean).map((line) => {
      const c = line.split(','), row = { class: c[spec.classIndex] };
      spec.names.forEach((k, i) => { row[k] = c[i < spec.classIndex ? i : i + 1]; });
      return row;
    });
  } catch { return []; }
}

/** the seeded shuffle, then 50% TRAIN / 25% GATE / 25% FINAL — the FINAL split never proposes or selects a rule */
export function splitOf(rows) {
  try {
    const r = rng(SPLIT_SEED), a = rows.map((x) => ({ x, k: r() })).sort((p, q) => p.k - q.k).map((o) => o.x);
    const n = a.length, t = Math.floor(n * 0.5), g = Math.floor(n * 0.75);
    return { train: a.slice(0, t), gate: a.slice(t, g), final: a.slice(g) };
  } catch { return { train: [], gate: [], final: [] }; }
}

/** the commonest class (the first seen wins a tie); none for no rows */
export function majorityOf(rows) {
  if (!Array.isArray(rows)) return null;
  try {
    const c = {};
    for (const x of rows) c[x.class] = (c[x.class] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  } catch { return null; }
}

/** the allowed values per feature: fixed by the run, or every value the TRAIN split holds (sorted) */
export function valuesOf(spec, train) {
  try {
    if (spec.values !== 'train') return isObj(spec.values) ? spec.values : {};
    const v = {};
    for (const f of spec.names) v[f] = [...new Set(train.map((x) => x[f]))].sort();
    return v;
  } catch { return {}; }
}

/** the teacher's reply, read line by line: 'F == v [AND F == v ...] => CLASS', every name, value and class checked */
export function parseRules(reply, spec, values) {
  try {
    const cond = new RegExp('^\\s*(' + spec.feature + ')\\s*==\\s*(' + spec.value + ')\\s*$', 'i');
    const out = [], seen = new Set();
    for (const line of reply.split('\n')) {
      const m = /^(.*?)=>\s*([a-z]+)\s*$/i.exec(line.trim());
      if (!m || !spec.classes.includes(m[2].toLowerCase())) continue;
      const conds = [];
      for (const part of m[1].split(/\s+AND\s+/i)) {
        const cm = cond.exec(part.trim());
        const f = cm ? cm[1].toLowerCase() : '', v = cm ? cm[2].toLowerCase() : '';
        if (!(spec.names.includes(f) && Array.isArray(values[f]) && values[f].includes(v))) { conds.length = 0; break; }
        conds.push({ f, v });
      }
      if (!conds.length || conds.length > spec.maxConds) continue;
      const rule = { conds, c: m[2].toLowerCase() };
      const key = conds.map((x) => x.f + '=' + x.v).join('&') + '>' + rule.c;
      if (!seen.has(key)) { seen.add(key); out.push(rule); }
    }
    return out;
  } catch { return []; }
}

const fires = (rule, row) => rule.conds.every((x) => row[x.f] === x.v);

/** keep a rule only if, on the GATE split, it fires often enough and is right often enough; best precision first */
export function gateRules(rules, gate, spec) {
  try {
    return rules.map((r) => {
      let n = 0, right = 0;
      for (const x of gate) if (fires(r, x)) { n++; if (x.class === r.c) right++; }
      return { ...r, fires: n, precision: n ? right / n : 0 };
    }).filter((r) => r.fires >= spec.minFires && r.precision >= spec.minPrecision).sort((a, b) => b.precision - a.precision || b.fires - a.fires);
  } catch { return []; }
}

/** the grown classifier: the first kept rule that fires, else the majority class. No model, no randomness */
export function classify(kept, majority, row) {
  try { for (const r of kept) if (fires(r, row)) return r.c; } catch { /* garbage rules or row: no rule fires */ }
  return majority;
}

/** a kept rule as its committed run file wrote it */
export function keptLine(r, spec) {
  try { return r.conds.map((x) => x.f + '==' + x.v).join(' AND ') + spec.arrow + r.c + ' (p=' + r.precision.toFixed(2) + ',fires=' + r.fires + ')'; } catch { return ''; }
}

/** an exam answer changed: the majority class becomes the first other class, any other class becomes the majority */
export function flipped(label, spec, majority) {
  try { return label === majority ? spec.classes.find((c) => c !== majority) : majority; } catch { return majority; }
}

const hitsOf = (rows, predict) => { let ok = 0; for (const x of rows) if (predict(x) === x.class) ok++; return { n: rows.length, hits: ok, acc: rows.length ? ok / rows.length : 0 }; };

/** score the grown rule-set against the majority baseline on the FINAL split, judged and signed by the baseline agreement */
export function score(spec, final, kept, majority) {
  if (!isObj(spec) || !Array.isArray(final)) return { ok: false, why: 'a run spec and a final split' };
  try {
    const base = hitsOf(final, () => majority), grown = hitsOf(final, (x) => classify(kept, majority, x));
    const intake = { job: spec.job, data: spec.data, currentTool: 'guess the majority class', client: 'public-demo', supplier: 'AI-Native Solutions', metric: 'accuracy', kind: 'rate', baseline: Math.round(base.acc * 1000) / 1000, direction: 'higher' };
    const a = agreement(intake, { minImprovement: 0.08, minSample: final.length, zCrit: 1.96, alpha: 0.05, price: null });
    if (!a.ok) return { ok: false, why: 'the agreement: ' + a.why };
    const o = outcome(a.agreement, { testId: a.agreement.test.id, control: { n: base.n, hits: base.hits }, variant: { n: grown.n, hits: grown.hits } });
    if (!o.ok) return { ok: false, why: 'the outcome: ' + o.why };
    return { ok: true, base: { n: base.n, hits: base.hits }, grown: { n: grown.n, hits: grown.hits }, baselineAccuracy: round6(base.acc), grownAccuracy: round6(grown.acc), improvement: round6(grown.acc - base.acc), decision: o.decision, charge: o.charge, receipt: o.receipt };
  } catch (e) { return { ok: false, why: 'refused: ' + String(e && e.message) }; }
}

/** one whole run after the teacher: parse its recorded reply, gate on GATE, score on FINAL, sign */
export function distil(spec, split, reply) {
  if (!isObj(spec)) return { ok: false, why: 'a run spec is an object' };
  if (!Array.isArray(spec.names) || !Array.isArray(spec.classes)) return { ok: false, why: 'a run spec names its features and classes' };
  if (!isObj(split) || !Array.isArray(split.train) || !Array.isArray(split.gate) || !Array.isArray(split.final)) return { ok: false, why: 'a split holds train, gate and final rows' };
  const majority = majorityOf(split.train);
  const rules = parseRules(reply, spec, valuesOf(spec, split.train));
  const kept = gateRules(rules, split.gate, spec);
  const s = score(spec, split.final, kept, majority);
  if (!s.ok) return s;
  return { ...s, splitSizes: { train: split.train.length, gate: split.gate.length, final: split.final.length }, trainMajority: majority, rulesParsed: rules.length, kept, rulesKept: kept.map((r) => keptLine(r, spec)) };
}

export default { RUNS, SPLIT_SEED, rng, datasetOk, rowsOf, splitOf, majorityOf, valuesOf, parseRules, gateRules, classify, keptLine, flipped, score, distil };
