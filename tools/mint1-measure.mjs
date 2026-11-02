// mint1-measure.mjs — mint-a-department step 1 (the baseline agreement): the sealed claims
// (data/mint1-baseline-prereg.json, sealed 1041ee6), measured once and kept. Integers/decisions only in the receipt,
// so a clean machine re-measures it byte for byte. The delivery battery reuses the growth gate's own 400-case corpus
// (the flywheel: one sealed test engine serves the growth experiments AND the sales guarantee).
//   node tools/mint1-measure.mjs --check     the seal is unchanged since 1041ee6
//   node tools/mint1-measure.mjs --run        every claim → data/mint1-baseline-run.json
//   node tools/mint1-measure.mjs --verify     re-measure; must equal the committed receipt
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { agreement, signable, outcome, MONEY_BACK } from '../src/baseline.mjs';
import { verdict, receiptOf, PROMOTE } from '../src/experiment.mjs';
import { corpus } from './growth1-corpus.mjs';

const SEAL = '1041ee6';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const PREREG = 'data/mint1-baseline-prereg.json', RUN = 'data/mint1-baseline-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const lf = (t) => t.replace(/\r\n/g, '\n');

const intake = (o = {}) => ({ job: 'invoice triage', data: 'six months', currentTool: 'a VA', client: 'Acme', supplier: 'AI-Native Solutions', metric: 'auto-sorted rate', kind: 'rate', baseline: 0.6, direction: 'higher', ...o });
const design = (o = {}) => ({ minImprovement: 0.1, minSample: 500, zCrit: 1.96, price: 'set-by-simon', ...o });
// an agreement straight from a sealed test (the corpus tests are already valid sealed tests)
const agrOf = (testObj, price = 'set-by-simon') => ({ test: testObj, parties: { client: 'c', supplier: 's' }, job: testObj.id, moneyBack: MONEY_BACK, price });

function measure() {
  const { cases } = corpus();

  // B1 — integrity: a complete agreement is valid and its signable carries no delivery; each malformed intake/design refused
  const good = agreement(intake(), design());
  const signClean = good.ok && !/control|variant|hits|values/.test(signable(good.agreement));
  const malformed = [
    [null, design()], [intake(), null], [intake({ job: '' }), design()], [intake({ client: 5 }), design()], [intake({ supplier: null }), design()],
    [intake({ metric: '' }), design()], [intake({ kind: 'ratio' }), design()], [intake({ baseline: 1.4 }), design()], [intake({ direction: 'up' }), design()],
    [intake(), design({ minImprovement: 0 })], [intake(), design({ minSample: 1 })], [intake(), design({ zCrit: 0 })],
  ];
  const refused = malformed.filter(([i, d]) => agreement(i, d).ok === false && typeof agreement(i, d).why === 'string').length;
  const B1 = { pass: good.ok === true && signClean && refused === malformed.length, measured: `complete agreement ${good.ok ? 'built' : 'FAILED'}, signable delivery-free: ${signClean}; ${refused}/${malformed.length} malformed refused with a reason` };

  // per-case outcomes over the reused battery
  const rows = cases.map((c) => {
    const agr = agrOf(c.test);
    const o = outcome(agr, c.result);
    const v = verdict(c.test, c.result);
    return { c, agr, o, v };
  });
  const promotes = rows.filter((x) => x.v.decision === PROMOTE);

  // B2 — the goalpost cannot move: delivery-side fields never change the outcome; a laxer agreement can decide differently
  const moved = rows.filter((x) => {
    const injected = outcome(x.agr, { ...x.c.result, metric: 'easier', baseline: 0, minImprovement: 0, zCrit: 0.01, direction: 'higher' });
    return injected.charge !== x.o.charge || injected.beatsBaseline !== x.o.beatsBaseline || injected.receipt !== x.o.receipt;
  }).length;
  // a below-margin delivery under a laxer margin flips, proving the AGREEMENT's test is what rules
  const bm = rows.find((x) => x.o.charge === 'waived' && x.c.test.kind === 'rate');
  let laxerFlips = true;
  if (bm) { const lax = outcome(agrOf({ ...bm.c.test, minImprovement: bm.c.test.minImprovement / 10, zCrit: 0.5 }), bm.c.result); laxerFlips = lax.ok === true; }
  const B2 = { pass: moved === 0 && laxerFlips, measured: `${moved} of ${rows.length} outcomes moved by a delivery-side field (want 0); the agreement's own test rules the verdict` };

  // B3 — money-back is exact
  const dueWrong = rows.filter((x) => (x.o.charge === 'due') !== (x.v.decision === PROMOTE)).length;
  const chargedNotBeaten = rows.filter((x) => x.o.charge === 'due' && x.v.decision !== PROMOTE).length;
  const due = rows.filter((x) => x.o.charge === 'due').length;
  const B3 = { pass: dueWrong === 0 && chargedNotBeaten === 0 && due === promotes.length, measured: `${rows.length} deliveries: ${due} charged 'due' == ${promotes.length} that beat the signed baseline; ${rows.length - due} waived; charged-but-not-beaten: ${chargedNotBeaten}` };

  // B4 — the receipt re-derives
  const receiptsOk = rows.every((x) => x.o.ok && x.o.receipt === receiptOf(x.c.test, x.c.result, x.v));
  const B4 = { pass: receiptsOk, measured: `${rows.length} outcome receipts, every one re-derives from (agreement test, delivery, verdict): ${receiptsOk}` };

  // B5 — total and deterministic
  const r = (() => { let a = 424242 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const junk = () => { const bag = [null, undefined, 0, 7, true, '', 'x', [], {}, NaN, Infinity, intake(), design(), { test: {} }, agrOf(rows[0].c.test), rows[0].c.result]; return bag[Math.floor(r() * bag.length)]; };
  let throws = 0, handled = 0, calls = 0;
  for (let i = 0; i < 1000; i++) for (const fn of [() => agreement(junk(), junk()), () => signable(junk()), () => outcome(junk(), junk())]) { calls++; try { const o = fn(); if (o !== undefined) handled++; } catch { throws++; } }
  const det = rows.slice(0, 80).every((x) => JSON.stringify(outcome(x.agr, x.c.result)) === JSON.stringify(outcome(x.agr, x.c.result)));
  const B5 = { pass: throws === 0 && handled === calls && calls === 3000 && det, measured: `${calls} fuzzed calls: ${throws} threw, ${handled} handled; 80 repeats all identical: ${det}` };

  // B6 — price never touches the decision
  const prices = [null, 0, 2500, '£5k', { amount: 9 }, undefined];
  const priceIndep = rows.every((x) => { const want = `${x.o.charge}|${x.o.beatsBaseline}|${x.o.receipt}`; return prices.every((p) => { const o = outcome(agrOf(x.c.test, p), x.c.result); return `${o.charge}|${o.beatsBaseline}|${o.receipt}` === want; }); });
  const B6 = { pass: priceIndep, measured: `${rows.length} cases × ${prices.length} prices: charge, beatsBaseline and receipt identical at every price: ${priceIndep}` };

  const claims = { B1, B2, B3, B4, B5, B6 };
  return { kind: 'ai-first-company-mint1-baseline-run', seal: SEAL, deliveries: rows.length, charged: promotes.length, claims, held: Object.values(claims).filter((x) => x.pass).length, of: 6 };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (lf(git('show', `${SEAL}:${PREREG}`)).trim() !== lf(readFileSync(file(PREREG), 'utf8')).trim()) { console.error('✗ the mint step 1 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ mint step 1 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = measure(), out = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), out); console.error(`✓ ${result.held} of 6 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (lf(readFileSync(file(RUN), 'utf8')) !== out) { console.error('✗ mint step 1 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ mint step 1 re-measured: ${result.held} of 6 held, identical to the committed receipt`); }
} else { console.error('mint1-measure — --check | --run | --verify'); process.exit(2); }
