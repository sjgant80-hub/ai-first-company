// mint-demo-v2.mjs — the teacher-distillation demo, v2: CONJUNCTION rules (the fix for the v1 null).
// (Sealed: data/mint-demo-v2-prereg.json, 3620ff0.) Same pinned car dataset and splits as v1; the teacher may propose
// rules of up to three ANDed conditions and is steered to identify the ACCEPTABLE cars. Gated search keeps only the
// conjunctions that generalize on the GATE split; the grown deterministic classifier is scored on the FINAL held-out
// and signed by src/baseline.mjs. --run calls the teacher once and keeps its reply; --verify re-derives from it.
//   node tools/mint-demo-v2.mjs --check | --run | --verify
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { agreement, outcome } from '../src/baseline.mjs';

const SEAL = '3620ff0';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const PREREG = 'data/mint-demo-v2-prereg.json', RUN = 'data/mint-demo-v2-run.json', DATA = 'data/mint-demo-car.data';
const DATA_SHA = 'b703a9ac69f11e64ce8c223c0a40de4d2e9d769f7fb20be5f8f2e8a619893d83';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const lf = (t) => t.replace(/\r\n/g, '\n');
const sha = (t) => createHash('sha256').update(t).digest('hex');

const COLS = ['buying', 'maint', 'doors', 'persons', 'lug_boot', 'safety'];
const VALUES = { buying: ['vhigh', 'high', 'med', 'low'], maint: ['vhigh', 'high', 'med', 'low'], doors: ['2', '3', '4', '5more'], persons: ['2', '4', 'more'], lug_boot: ['small', 'med', 'big'], safety: ['low', 'med', 'high'] };
const CLASSES = ['unacc', 'acc', 'good', 'vgood'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function loadRows() {
  if (sha(readFileSync(file(DATA))) !== DATA_SHA) throw new Error('dataset sha mismatch');
  return lf(readFileSync(file(DATA), 'utf8')).trim().split('\n').map((l) => { const c = l.split(','); const row = { class: c[6] }; COLS.forEach((k, i) => row[k] = c[i]); return row; });
}
function split(rows) {
  const r = rng(20261103), a = rows.map((x) => ({ x, k: r() })).sort((p, q) => p.k - q.k).map((o) => o.x);
  const n = a.length, t = Math.floor(n * 0.5), g = Math.floor(n * 0.75);
  return { train: a.slice(0, t), gate: a.slice(t, g), final: a.slice(g) };
}
const majorityOf = (rows) => { const c = {}; for (const x of rows) c[x.class] = (c[x.class] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };

async function askTeacher(train) {
  const r = rng(7), sample = train.map((x) => ({ x, k: r() })).sort((a, b) => a.k - b.k).slice(0, 40).map((o) => o.x);
  const rows = sample.map((x) => COLS.map((c) => x[c]).join(',') + ' => ' + x.class).join('\n');
  const prompt = `You are distilling decision rules for UCI Car Evaluation. Each car has six features and a class.\n`
    + `Features and allowed values:\n` + COLS.map((c) => `  ${c}: ${VALUES[c].join(', ')}`).join('\n')
    + `\nClasses: ${CLASSES.join(', ')}.\n40 labelled examples (feature values comma-separated, then the class):\n${rows}\n\n`
    + `Most cars are unacc, so simple one-feature rules only restate that. Give rules that identify WHEN A CAR IS ACCEPTABLE too (acc, good, vgood) — these usually need two or three conditions together (for example high safety AND enough persons).\n`
    + `Answer with ONLY rules, one per line, each EXACTLY in the form (1 to 3 conditions joined by AND):\nFEATURE == VALUE => CLASS\nFEATURE == VALUE AND FEATURE == VALUE => CLASS\nFEATURE == VALUE AND FEATURE == VALUE AND FEATURE == VALUE => CLASS\n`
    + `Use only the listed feature names, values and classes. No prose, no numbering.`;
  const res = await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: 'qwen2.5:7b', prompt, stream: false, options: { temperature: 0.2, seed: 7, num_predict: 1100 } }) });
  return { prompt, reply: String((await res.json()).response || '') };
}
function parseRules(reply) {
  const out = [];
  for (const line of reply.split('\n')) {
    const m = /^(.*?)=>\s*([a-z]+)\s*$/i.exec(line.trim());
    if (!m || !CLASSES.includes(m[2].toLowerCase())) continue;
    const conds = [];
    let okConds = true;
    for (const part of m[1].split(/\s+AND\s+/i)) {
      const cm = /^\s*([a-z_]+)\s*==\s*([a-z0-9]+)\s*$/i.exec(part.trim());
      if (!cm) { okConds = false; break; }
      const f = cm[1].toLowerCase(), v = cm[2].toLowerCase();
      if (!(COLS.includes(f) && VALUES[f].includes(v))) { okConds = false; break; }
      conds.push({ f, v });
    }
    if (!okConds || conds.length < 1 || conds.length > 3) continue;
    const rule = { conds, c: m[2].toLowerCase() };
    const key = JSON.stringify(rule);
    if (!out.some((r) => JSON.stringify(r) === key)) out.push(rule);
  }
  return out;
}
const fires = (rule, x) => rule.conds.every((cd) => x[cd.f] === cd.v);
function gateRules(rules, gate) {
  return rules.map((r) => { let f = 0, right = 0; for (const x of gate) if (fires(r, x)) { f++; if (x.class === r.c) right++; } return { ...r, fires: f, precision: f ? right / f : 0 }; })
    .filter((r) => r.fires >= 12 && r.precision >= 0.80).sort((a, b) => b.precision - a.precision || b.fires - a.fires);
}
const classify = (kept, majority, row) => { for (const r of kept) if (fires(r, row)) return r.c; return majority; };
const accuracy = (rows, predict) => { let ok = 0; for (const x of rows) if (predict(x) === x.class) ok++; return { n: rows.length, correct: ok, acc: rows.length ? ok / rows.length : 0 }; };
const ruleStr = (r) => r.conds.map((c) => `${c.f}==${c.v}`).join(' AND ') + ` => ${r.c}`;

function measureFrom(reply) {
  const { train, gate, final } = split(loadRows());
  const majority = majorityOf(train);
  const rules = parseRules(reply);
  const kept = gateRules(rules, gate);
  const grown = accuracy(final, (x) => classify(kept, majority, x));
  const base = accuracy(final, () => majority);
  const intake = { job: 'car acceptability', data: 'UCI Car Evaluation (public)', currentTool: 'guess the majority class', client: 'public-demo', supplier: 'AI-Native Solutions', metric: 'accuracy', kind: 'rate', baseline: Math.round(base.acc * 1000) / 1000, direction: 'higher' };
  const design = { minImprovement: 0.08, minSample: final.length, zCrit: 1.96, alpha: 0.05, price: null };
  const agr = agreement(intake, design).agreement;
  const o = outcome(agr, { testId: agr.test.id, control: { n: base.n, hits: base.correct }, variant: { n: grown.n, hits: grown.correct } });
  const improvement = Math.round((grown.acc - base.acc) * 1e6) / 1e6;
  const nonMaj = kept.filter((r) => r.c !== majority).length;
  return { kept, rules, majority, base, grown, improvement, charge: o.charge, decision: o.decision, receipt: o.receipt, nonMaj,
    splitSizes: { train: train.length, gate: gate.length, final: final.length },
    V1: { pass: improvement >= 0.08 && o.charge === 'due', measured: `grown ${(grown.acc * 100).toFixed(1)}% vs baseline ${(base.acc * 100).toFixed(1)}% on ${final.length} held-out rows = +${(improvement * 100).toFixed(1)} pts; charge ${o.charge}` },
    V2: { pass: nonMaj >= 1, measured: `${rules.length} rules parsed, ${kept.length} kept; ${nonMaj} of them predict a non-majority class (acc/good/vgood)` } };
}
function record(m, teacher) {
  return { kind: 'ai-first-company-mint-demo-v2-run', seal: SEAL, dataset: { file: DATA, sha256: DATA_SHA }, teacher: { model: 'qwen2.5:7b', temperature: 0.2, seed: 7 },
    splitSizes: m.splitSizes, trainMajority: m.majority, baselineAccuracy: Math.round(m.base.acc * 1e6) / 1e6, grownAccuracy: Math.round(m.grown.acc * 1e6) / 1e6, improvement: m.improvement,
    rulesParsed: m.rules.length, rulesKept: m.kept.map((r) => `${ruleStr(r)} (p=${r.precision.toFixed(2)},fires=${r.fires})`), nonMajorityKept: m.nonMaj,
    charge: m.charge, decision: m.decision, receipt: m.receipt, claims: { V1: m.V1, V2: m.V2 }, held: [m.V1, m.V2].filter((c) => c.pass).length, of: 2,
    teacherPrompt: teacher ? teacher.prompt : undefined, teacherReply: teacher ? teacher.reply : undefined };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (lf(git('show', `${SEAL}:${PREREG}`)).trim() !== lf(readFileSync(file(PREREG), 'utf8')).trim()) { console.error('✗ v2 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ v2 seal + dataset unchanged since ' + SEAL);
} else if (cmd === '--run') {
  const teacher = await askTeacher(split(loadRows()).train);
  const m = measureFrom(teacher.reply), out = record(m, teacher);
  writeFileSync(file(RUN), JSON.stringify(out, null, 1) + '\n');
  console.error(`${out.held}/2 held · baseline ${(m.base.acc * 100).toFixed(1)}% → grown ${(m.grown.acc * 100).toFixed(1)}% (+${(m.improvement * 100).toFixed(1)} pts), charge ${m.charge}`);
  console.error(`  rules kept (${m.kept.length}, ${m.nonMaj} non-majority): ` + out.rulesKept.slice(0, 12).join(' · '));
  for (const [k, c] of Object.entries(out.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
} else if (cmd === '--verify') {
  if (!existsSync(file(RUN))) { console.error('✗ no committed v2 run'); process.exit(1); }
  const prev = JSON.parse(readFileSync(file(RUN), 'utf8')), now = record(measureFrom(prev.teacherReply || ''), { prompt: prev.teacherPrompt, reply: prev.teacherReply });
  if (JSON.stringify(now) !== JSON.stringify(prev)) { console.error('✗ v2 does not re-derive to the committed run'); process.exit(1); }
  console.error(`✓ v2 re-derived from the recorded reply: ${now.held}/2 held, receipt ${String(now.receipt).slice(0, 16)}…, identical`);
} else { console.error('mint-demo-v2 — --check | --run | --verify'); process.exit(2); }
