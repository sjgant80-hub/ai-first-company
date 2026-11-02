// growth1-measure.mjs — the growth experiment gate, step 1: the sealed claims (data/growth1-experiment-prereg.json,
// sealed 0b341b0), measured once and kept. The receipt carries only decisions and counts — no floats — so a clean
// machine re-measures it byte for byte. Sample, margin, direction AND the standardized effect are all re-computed
// INDEPENDENTLY from the raw arms here (only sqrt and arithmetic), so E6 leans on nothing the kernel returns.
//   node tools/growth1-measure.mjs --check     the seal is unchanged since 0b341b0
//   node tools/growth1-measure.mjs --run        every claim → data/growth1-experiment-run.json
//   node tools/growth1-measure.mjs --verify     re-measure; must equal the committed receipt
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalizeTest, verdict, promote, receiptOf, PROMOTE, DROP, INSUFFICIENT } from '../src/experiment.mjs';
import { corpus } from './growth1-corpus.mjs';

const SEAL = '0b341b0';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const PREREG = 'data/growth1-experiment-prereg.json', RUN = 'data/growth1-experiment-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const lf = (t) => t.replace(/\r\n/g, '\n');

// ── independent of the kernel: the directional lift, the sample, and the standardized effect, from the raw arms ──
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const round6 = (x) => Math.round(x * 1e6) / 1e6;
const nMin = (r) => r.control.values ? Math.min(r.control.values.length, r.variant.values.length) : Math.min(r.control.n, r.variant.n);
function liftStat(t, r) {
  const sgn = t.direction === 'higher' ? 1 : -1;
  if (r.control.values) {
    const C = r.control.values, V = r.variant.values, nc = C.length, nv = V.length, mc = mean(C), mv = mean(V);
    const imp = sgn * (mv - mc);
    if (nc < 2 || nv < 2) return { lift: round6(imp), stat: 0 };
    const vc = C.reduce((s, x) => s + (x - mc) * (x - mc), 0) / (nc - 1), vv = V.reduce((s, x) => s + (x - mv) * (x - mv), 0) / (nv - 1);
    const se = Math.sqrt(vc / nc + vv / nv);
    return { lift: round6(imp), stat: round6(se > 0 ? imp / se : 0) };
  }
  const pc = r.control.hits / r.control.n, pv = r.variant.hits / r.variant.n, imp = sgn * (pv - pc);
  const pp = (r.control.hits + r.variant.hits) / (r.control.n + r.variant.n);
  const se = Math.sqrt(pp * (1 - pp) * (1 / r.control.n + 1 / r.variant.n));
  return { lift: round6(imp), stat: round6(se > 0 ? imp / se : 0) };
}

function measure() {
  const { cases, counts } = corpus();
  const base = { id: 'b', channel: 'x', technique: 't', metric: 'ctr', kind: 'rate', baseline: 0.1, direction: 'higher', minImprovement: 0.03, minSample: 100, alpha: 0.05, zCrit: 1.645 };

  // E1 — a whole test and a matching result are needed
  const tMut = [
    (t) => { delete t.id; }, (t) => t.id = '', (t) => t.channel = 5, (t) => t.technique = '', (t) => t.metric = null,
    (t) => t.kind = 'ratio', (t) => t.baseline = 'x', (t) => t.baseline = 1.4, (t) => t.direction = 'up',
    (t) => t.minImprovement = 0, (t) => t.minImprovement = -1, (t) => t.minSample = 1, (t) => t.minSample = 10.5, (t) => t.alpha = 0, (t) => t.zCrit = 0,
  ];
  let badTests = 0, nTests = 0;
  for (let i = 0; i < 8; i++) for (const m of tMut) { const t = { ...base, id: 'b' + i }; m(t); nTests++; if (normalizeTest(t).ok === false) badTests++; }
  const rMut = [
    (r) => r.testId = 'nope', (r) => { delete r.control; }, (r) => r.control = { n: 10, hits: 11 }, (r) => r.control = { n: -5, hits: 0 },
    (r) => r.control = null, (r) => r.variant = { n: 0, hits: 0 }, (r) => r.control = { n: 10, hits: -1 }, (r) => r.variant = 'x',
  ];
  let badResults = 0, nResults = 0;
  for (let i = 0; i < 15; i++) for (const m of rMut) { const r = { testId: 'b', control: { n: 100, hits: 10 }, variant: { n: 100, hits: 16 } }; m(r); nResults++; if (verdict({ ...base }, r).ok === false) badResults++; }
  const whole = cases.slice(0, 60).filter((c) => { const v = verdict(c.test, c.result); return v.ok !== false && typeof v.decision === 'string'; }).length;
  const E1 = { pass: badTests === nTests && badResults === nResults && whole === 60, measured: `${badTests}/${nTests} malformed tests refused, ${badResults}/${nResults} malformed results refused, ${whole}/60 whole pairs accepted` };

  // per-case: the kernel's decision vs the fully independent sample / margin / significance
  const rows = cases.map((c) => {
    const v = verdict(c.test, c.result);
    const { lift, stat } = liftStat(c.test, c.result);
    const sampleOk = nMin(c.result) >= c.test.minSample;
    const marginOk = lift >= c.test.minImprovement;
    const sig = stat >= c.test.zCrit;
    const expect = !sampleOk ? INSUFFICIENT : (marginOk && sig ? PROMOTE : DROP);
    return { c, v, lift, stat, sampleOk, marginOk, sig, expect };
  });
  const promotes = rows.filter((x) => x.v.decision === PROMOTE);

  const under = rows.filter((x) => !x.sampleOk);
  const E2 = { pass: under.length > 0 && under.every((x) => x.v.decision === INSUFFICIENT), measured: `${under.length} under-sampled cases, ${under.filter((x) => x.v.decision === INSUFFICIENT).length} INSUFFICIENT, ${under.filter((x) => x.v.decision === PROMOTE).length} PROMOTE` };

  const belowM = rows.filter((x) => x.sampleOk && x.sig && !x.marginOk);
  const E3 = { pass: belowM.length > 0 && belowM.every((x) => x.v.decision === DROP), measured: `${belowM.length} significant below-margin cases, ${belowM.filter((x) => x.v.decision === DROP).length} DROP, ${belowM.filter((x) => x.v.decision === PROMOTE).length} PROMOTE` };

  const notSig = rows.filter((x) => x.sampleOk && x.marginOk && !x.sig);
  const E4 = { pass: notSig.length > 0 && notSig.every((x) => x.v.decision === DROP), measured: `${notSig.length} above-margin cases whose stat does not reach zCrit, ${notSig.filter((x) => x.v.decision === DROP).length} DROP, ${notSig.filter((x) => x.v.decision === PROMOTE).length} PROMOTE` };

  const wrong = rows.filter((x) => x.sampleOk && x.lift <= 0);
  const E5 = { pass: wrong.length > 0 && wrong.every((x) => x.v.decision === DROP), measured: `${wrong.length} wrong-direction/tie cases, ${wrong.filter((x) => x.v.decision === DROP).length} DROP, ${wrong.filter((x) => x.v.decision === PROMOTE).length} PROMOTE` };

  const bothWays = rows.every((x) => (x.v.decision === PROMOTE) === (x.sampleOk && x.marginOk && x.sig) && x.v.decision === x.expect && x.v.decision === x.c.expect);
  const E6 = { pass: bothWays, measured: `${rows.length} cases: the kernel's PROMOTE set equals the independently-recomputed sample&margin&stat>=zCrit set, both ways; ${promotes.length} PROMOTE, ${rows.filter((x) => x.v.decision === DROP).length} DROP, ${under.length} INSUFFICIENT` };

  let pb = { skills: [], log: [] };
  for (const { c } of rows) pb = promote(pb, c.test, c.result);
  const receiptsOk = promotes.every((x) => { const want = receiptOf(x.c.test, x.c.result, x.v); return pb.skills.some((s) => s.receipt === want && s.testId === x.c.test.id); });
  const allHaveData = pb.skills.every((s) => s.testId && s.data && s.receipt);
  const E7 = { pass: pb.skills.length === promotes.length && receiptsOk && allHaveData && pb.log.length === rows.length - promotes.length, measured: `${pb.skills.length} skills == ${promotes.length} PROMOTEs; every receipt re-derives: ${receiptsOk}; every entry carries test+data+receipt: ${allHaveData}; ${pb.log.length} non-PROMOTEs on the log` };

  const r = (() => { let a = 909 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const junk = () => { const bag = [null, undefined, 0, 7, true, '', 'x', [], {}, NaN, Infinity, -1, { n: 1e9, hits: 1e10 }, { values: [] }, { values: ['x'] }, base, { ...base, zCrit: 0 }]; return bag[Math.floor(r() * bag.length)]; };
  let throws = 0, handled = 0, calls = 0;
  for (let i = 0; i < 1000; i++) for (const fn of [() => verdict(junk(), junk()), () => normalizeTest(junk()), () => promote(junk(), junk(), junk())]) { calls++; try { const o = fn(); if (o !== undefined) handled++; } catch { throws++; } }
  const det = rows.slice(0, 80).every((x) => JSON.stringify(verdict(x.c.test, x.c.result)) === JSON.stringify(verdict(x.c.test, x.c.result)));
  const E8 = { pass: throws === 0 && handled === calls && calls === 3000 && det, measured: `${calls} fuzzed calls: ${throws} threw, ${handled} handled; 80 repeats all identical: ${det}` };

  const personas = ['reach', 'money-time', 'scout', 'simon', undefined];
  const indep = rows.every((x) => { const want = JSON.stringify(x.v); const wr = receiptOf(x.c.test, x.c.result, x.v); return personas.every((p) => { const res = p === undefined ? x.c.result : { ...x.c.result, proposer: p }; return JSON.stringify(verdict(x.c.test, res)) === want && receiptOf(x.c.test, res, x.v) === wr; }); });
  const E9 = { pass: indep, measured: `${rows.length} cases × ${personas.length} proposers: decision, stat and receipt identical whoever proposed: ${indep}` };

  const claims = { E1, E2, E3, E4, E5, E6, E7, E8, E9 };
  return { kind: 'ai-first-company-growth1-experiment-run', seal: SEAL, corpus: counts, claims, held: Object.values(claims).filter((x) => x.pass).length, of: 9 };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (lf(git('show', `${SEAL}:${PREREG}`)).trim() !== lf(readFileSync(file(PREREG), 'utf8')).trim()) { console.error('✗ the growth step 1 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ growth step 1 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = measure(), out = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), out); console.error(`✓ ${result.held} of 9 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (lf(readFileSync(file(RUN), 'utf8')) !== out) { console.error('✗ growth step 1 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ growth step 1 re-measured: ${result.held} of 9 held, identical to the committed receipt`); }
} else { console.error('growth1-measure — --check | --run | --verify'); process.exit(2); }
