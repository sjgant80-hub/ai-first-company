// growth1-corpus.mjs — the sealed battery for the growth experiment gate (data/growth1-experiment-prereg.json).
// Seed 20261101. 200 rate + 200 mean cases spanning the decision surface: clear wins, significant-but-below-margin,
// above-margin-but-not-significant (stat below the sealed critical value), wrong-direction, under-sampled and ties.
// Every emitted case is kept only when it is clear of the critical-value and margin boundaries; each case stores
// integer/finite arms and the sealed test — no derived floats — so the receipt re-measures byte for byte.
import { verdict } from '../src/experiment.mjs';

export const SEED = 20261101;
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BUCKETS = ['win', 'belowMargin', 'notSig', 'wrong', 'under', 'tie'];
const LEVELS = [[0.05, 1.645], [0.05, 1.96], [0.01, 2.326]];  // [alpha, zCrit] the organ could seal

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const liftRate = (t, r) => (t.direction === 'higher' ? 1 : -1) * (r.variant.hits / r.variant.n - r.control.hits / r.control.n);
const liftMean = (t, r) => (t.direction === 'higher' ? 1 : -1) * (mean(r.variant.values) - mean(r.control.values));
const nMin = (r) => r.control.values ? Math.min(r.control.values.length, r.variant.values.length) : Math.min(r.control.n, r.variant.n);

function clear(t, r, lift) {
  const v = verdict(t, r);
  if (v.ok === false) return null;
  const nmin = nMin(r);
  if (nmin < t.minSample) return nmin <= t.minSample - 1 ? 'INSUFFICIENT' : null;
  const marginClear = Math.abs(lift - t.minImprovement) > t.minImprovement * 0.2 || lift <= 0;
  const statClear = Math.abs(v.stat - t.zCrit) > 0.15;     // clear of the critical-value boundary
  if (!marginClear || !statClear) return null;
  return (lift >= t.minImprovement && v.stat >= t.zCrit) ? 'PROMOTE' : 'DROP';
}

function rateCase(r) {
  const minImprovement = [0.02, 0.03, 0.05][Math.floor(r() * 3)];
  const [alpha, zCrit] = LEVELS[Math.floor(r() * LEVELS.length)];
  const minSample = [200, 500, 1000][Math.floor(r() * 3)];
  const direction = r() < 0.5 ? 'higher' : 'lower';
  const p0 = 0.08 + r() * 0.17;
  const bucket = BUCKETS[Math.floor(r() * BUCKETS.length)];
  let n, lift;
  if (bucket === 'win') { n = Math.max(minSample, [3000, 5000, 8000][Math.floor(r() * 3)]); lift = minImprovement * (1.6 + r() * 1.4); }
  else if (bucket === 'belowMargin') { n = [16000, 20000, 25000][Math.floor(r() * 3)]; lift = minImprovement * (0.3 + r() * 0.35); }
  else if (bucket === 'notSig') { n = [40, 55, 70][Math.floor(r() * 3)]; lift = minImprovement * (1.6 + r() * 1.4); }
  else if (bucket === 'wrong') { n = [4000, 6000][Math.floor(r() * 2)]; lift = -minImprovement * (1.5 + r()); }
  else if (bucket === 'under') { n = Math.max(2, minSample - 1 - Math.floor(r() * (minSample / 3))); lift = minImprovement * 2; }
  else { n = [4000, 6000][Math.floor(r() * 2)]; lift = 0; }
  const rateC = p0;
  let rateV = direction === 'higher' ? p0 + lift : p0 - lift;
  if (rateV < 0.01) rateV = 0.01; if (rateV > 0.99) rateV = 0.99;
  const test = { id: 'r' + Math.floor(r() * 1e9).toString(36), channel: 'x', technique: 'tactic', metric: 'ctr', kind: 'rate', baseline: Math.round(p0 * 1000) / 1000, direction, minImprovement, minSample, alpha, zCrit };
  const result = { testId: test.id, control: { n, hits: Math.round(rateC * n) }, variant: { n, hits: Math.round(rateV * n) } };
  return { test, result, lift: liftRate(test, result) };
}

function meanCase(r) {
  const minImprovement = [2, 5, 8][Math.floor(r() * 3)];
  const [alpha, zCrit] = LEVELS[Math.floor(r() * LEVELS.length)];
  const minSample = [10, 20, 30][Math.floor(r() * 3)];
  const direction = r() < 0.5 ? 'higher' : 'lower';
  const base = 20 + r() * 40;
  const bucket = BUCKETS[Math.floor(r() * BUCKETS.length)];
  let n, lift, spread;
  if (bucket === 'win') { n = Math.max(minSample, [40, 60, 90][Math.floor(r() * 3)]); lift = minImprovement * (1.8 + r() * 1.5); spread = minImprovement * 0.6; }
  else if (bucket === 'belowMargin') { n = [120, 160, 220][Math.floor(r() * 3)]; lift = minImprovement * (0.3 + r() * 0.35); spread = minImprovement * 0.5; }
  else if (bucket === 'notSig') { n = Math.max(minSample, [12, 16, 20][Math.floor(r() * 3)]); lift = minImprovement * (1.8 + r() * 1.5); spread = minImprovement * 12; }
  else if (bucket === 'wrong') { n = [60, 90][Math.floor(r() * 2)]; lift = -minImprovement * (1.6 + r()); spread = minImprovement * 0.6; }
  else if (bucket === 'under') { n = Math.max(2, minSample - 1 - Math.floor(r() * (minSample / 3))); lift = minImprovement * 2; spread = minImprovement * 0.6; }
  else { n = [60, 90][Math.floor(r() * 2)]; lift = 0; spread = minImprovement * 0.6; }
  const scatter = (b, k) => Array.from({ length: k }, (_, i) => b + spread * (((i * 2654435761) % 1000) / 1000 - 0.5));
  const mV = direction === 'higher' ? base + lift : base - lift;
  const test = { id: 'm' + Math.floor(r() * 1e9).toString(36), channel: 'youtube', technique: 'tactic', metric: 'seconds', kind: 'mean', baseline: Math.round(base * 100) / 100, direction, minImprovement, minSample, alpha, zCrit };
  const result = { testId: test.id, control: { values: scatter(base, n) }, variant: { values: scatter(mV, n) } };
  return { test, result, lift: liftMean(test, result) };
}

export function corpus() {
  const r = rng(SEED);
  const cases = [];
  const want = { rate: 200, mean: 200 };
  const got = { rate: 0, mean: 0 };
  let draws = 0;
  while ((got.rate < want.rate || got.mean < want.mean) && draws < 200000) {
    draws++;
    const kind = got.rate < want.rate && (got.mean >= want.mean || r() < 0.5) ? 'rate' : 'mean';
    const c = kind === 'rate' ? rateCase(r) : meanCase(r);
    const expect = clear(c.test, c.result, c.lift);
    if (!expect) continue;
    cases.push({ test: c.test, result: c.result, expect });
    got[kind]++;
  }
  return { cases, counts: got, draws };
}
