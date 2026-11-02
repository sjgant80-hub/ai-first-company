// experiment.mjs — the growth team's gate: the Analyst's verdict engine. A technique becomes a skill ONLY when it beats
// the organ's sealed baseline on the sealed metric, by at least the sealed margin, at or above the sealed sample size,
// and its standardized effect reaches the sealed critical value in the sealed direction — judged from the data alone,
// never from who proposed it — and every dropped technique is kept on the record. Pure, total, deterministic.
// Only sqrt and arithmetic: no p-value tail, so the measure re-computes every number and no numerical internal can hide
// an untestable mutant. (Simon's growth-organs spec 2026-11-01, §2 the gate, §6 G1. Sealed: data/growth1-experiment-prereg.json.)
//
//   normalizeTest(spec)              → { ok, test } | { ok: false, why } — a sealed test, written before it runs
//   verdict(test, result)            → { decision: PROMOTE|DROP|INSUFFICIENT, improvement, stat, why }
//                                       | { ok: false, why } when the test or result cannot be read
//   promote(playbook, test, result)  → a NEW playbook: a versioned skill entry on PROMOTE (carrying the test, the data
//                                       and a receipt), else the skills unchanged and the failure appended to .log
//   receiptOf(test, result, v)       → the SHA-256 of the canonical (test, measurement, verdict): the id tying a skill to its data
//
// The statistic is the standardized effect in the sealed direction: a rate is a two-proportion z, a mean is Welch's.
// The sealed test carries zCrit — the critical value for the organ's chosen alpha, method and sample (e.g. 1.645 one-sided
// 0.05, 1.96 two-sided, 2.326 one-sided 0.01, or a t value for small df). "Significant" is stat >= zCrit.
import { canonical, hashOf } from './journal.mjs';

export const PROMOTE = 'PROMOTE', DROP = 'DROP', INSUFFICIENT = 'INSUFFICIENT';
export const KINDS = Object.freeze(['rate', 'mean']);
export const DIRECTIONS = Object.freeze(['higher', 'lower']);

const num = (n) => typeof n === 'number' && Number.isFinite(n);
const int = (n) => num(n) && Number.isInteger(n);
const str = (s) => typeof s === 'string' && s.length > 0;
const round6 = (x) => (num(x) ? Math.round(x * 1e6) / 1e6 : x);

// ── the sealed test: whole and written before the run, or refused with a reason ───────────────────────────────────
export function normalizeTest(spec) {
  try {
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return { ok: false, why: 'a test is an object' };
    const { id, channel, technique, metric, kind, baseline, direction, minImprovement, minSample, alpha, zCrit } = spec;
    if (!str(id)) return { ok: false, why: 'id' };
    if (!str(channel)) return { ok: false, why: 'channel' };
    if (!str(technique)) return { ok: false, why: 'technique' };
    if (!str(metric)) return { ok: false, why: 'metric' };
    if (!KINDS.includes(kind)) return { ok: false, why: "kind is 'rate' or 'mean'" };
    if (!num(baseline)) return { ok: false, why: 'baseline is a number' };
    if (kind === 'rate' && (baseline < 0 || baseline > 1)) return { ok: false, why: 'a rate baseline is 0..1' };
    if (!DIRECTIONS.includes(direction)) return { ok: false, why: "direction is 'higher' or 'lower'" };
    if (!num(minImprovement) || minImprovement <= 0) return { ok: false, why: 'minImprovement is a positive number' };
    if (!int(minSample) || minSample < 2) return { ok: false, why: 'minSample is an integer >= 2 per arm' };
    if (!num(alpha) || alpha <= 0 || alpha >= 1) return { ok: false, why: 'alpha is between 0 and 1' };
    if (!num(zCrit) || zCrit <= 0) return { ok: false, why: 'zCrit is the positive critical value the organ sealed' };
    return { ok: true, test: { id, channel, technique, metric, kind, baseline, direction, minImprovement, minSample, alpha, zCrit } };
  } catch { return { ok: false, why: 'the test could not be read' }; }
}

// ── the standardized effect (only sqrt and arithmetic; the measure recomputes it from the same arms) ──────────────
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const variance = (a, m) => a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
function armRate(a) { return a !== null && typeof a === 'object' && int(a.n) && a.n >= 1 && int(a.hits) && a.hits >= 0 && a.hits <= a.n; }
function armMean(a) { return a !== null && typeof a === 'object' && Array.isArray(a.values) && a.values.length >= 1 && a.values.every(num); }

export function verdict(test, result) {
  try {
    const t = normalizeTest(test); if (!t.ok) return { ok: false, why: 'test: ' + t.why };
    const T = t.test;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) return { ok: false, why: 'a result is an object' };
    if (result.testId !== T.id) return { ok: false, why: 'result.testId does not name this test' };
    const sign = T.direction === 'higher' ? 1 : -1;
    let improvement, stat, nC, nV;

    if (T.kind === 'rate') {
      const { control, variant } = result;
      if (!armRate(control) || !armRate(variant)) return { ok: false, why: 'each arm is { n >= 1, 0 <= hits <= n }' };
      nC = control.n; nV = variant.n;
      improvement = sign * (variant.hits / nV - control.hits / nC);
      const pPool = (control.hits + variant.hits) / (nC + nV);
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / nC + 1 / nV));
      stat = se > 0 ? improvement / se : 0;
    } else {
      const { control, variant } = result;
      if (!armMean(control) || !armMean(variant)) return { ok: false, why: 'each arm is { values: [numbers] }' };
      nC = control.values.length; nV = variant.values.length;
      improvement = sign * (mean(variant.values) - mean(control.values));
      // one point per arm has no variance (n-1 = 0 → NaN), which the se > 0 guard turns into stat 0 — cannot conclude
      const se = Math.sqrt(variance(control.values, mean(control.values)) / nC + variance(variant.values, mean(variant.values)) / nV);
      stat = se > 0 ? improvement / se : 0;
    }

    improvement = round6(improvement); stat = round6(stat);
    let decision, why;
    if (nC < T.minSample || nV < T.minSample) { decision = INSUFFICIENT; why = `only ${Math.min(nC, nV)} of the sealed ${T.minSample} per arm — cannot conclude`; }
    else if (improvement >= T.minImprovement && stat >= T.zCrit) { decision = PROMOTE; why = `+${improvement} on ${T.metric} (sealed margin ${T.minImprovement}), stat ${stat} reaches zCrit ${T.zCrit}, n at least ${T.minSample}`; }
    else { decision = DROP; why = improvement < T.minImprovement ? `lift ${improvement} below the sealed margin ${T.minImprovement}` : `stat ${stat} does not reach the sealed critical value ${T.zCrit}`; }
    return { decision, improvement, stat, why };
  } catch { return { ok: false, why: 'the result could not be read' }; }
}

// ── the playbook: a skill exists only with a passed experiment and its data (G1) ──────────────────────────────────
const emptyPlaybook = () => ({ skills: [], log: [] });
export function promote(playbook, test, result) {
  const pb = (playbook !== null && typeof playbook === 'object' && Array.isArray(playbook.skills) && Array.isArray(playbook.log))
    ? { skills: playbook.skills.slice(), log: playbook.log.slice() } : emptyPlaybook();
  const v = verdict(test, result);
  if (v.ok === false) { pb.log.push({ at: null, decision: 'REFUSED', why: v.why }); return pb; }
  const T = normalizeTest(test).test;
  const data = T.kind === 'rate'
    ? { control: result.control, variant: result.variant, improvement: v.improvement, stat: v.stat }
    : { nControl: result.control.values.length, nVariant: result.variant.values.length, improvement: v.improvement, stat: v.stat };
  const receipt = receiptOf(test, result, v);
  if (v.decision === PROMOTE) {
    const prior = pb.skills.filter((s) => s.technique === T.technique && s.channel === T.channel).length;
    pb.skills.push({ technique: T.technique, channel: T.channel, metric: T.metric, version: prior + 1, testId: T.id, data, receipt });
  } else {
    pb.log.push({ technique: T.technique, channel: T.channel, decision: v.decision, data, receipt });
  }
  return pb;
}

export function receiptOf(test, result, v) {
  const nt = normalizeTest(test);
  // only the measurement binds the receipt — never the proposer or any other metadata the Analyst ignores
  const r = (result !== null && typeof result === 'object') ? { testId: result.testId, control: result.control, variant: result.variant } : result;
  return hashOf(canonical({ test: nt.ok ? nt.test : null, result: r, verdict: v }));
}
